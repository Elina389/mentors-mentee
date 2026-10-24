/**
 * Staff console: everything is built from the saved survey responses and matches.
 *
 * Reads (never changes) students.json, mentors.json, matches.json and decisions.json
 * through store.js and matching-service.js. The console's own data (orientation
 * page, attendance, homework, lesson cadence, email date) lives in console-store.js.
 *
 * "Today" is the computer's date. To preview a later stage of the program, start
 * the server with MENTOR_MATCH_TODAY=2026-11-25 (YYYY-MM-DD).
 */

const store = require('./store.js');
const matchingService = require('./matching-service.js');
const cstore = require('./console-store.js');

// Program calendar. Change these dates here when the program changes.
const PROGRAM = {
    appsOpen: '2026-10-01',
    appsClose: '2026-10-30',
    reviewOpen: '2026-11-01',
    reviewClose: '2026-11-15',
    lessonStart: '2026-11-22',
    programEnd: '2026-12-15'
};

const AUDIENCES = ['all', 'mentee', 'mentor'];
const LIMITS = { title: 120, subtitle: 200, sectionTitle: 150, body: 4000, sections: 30 };

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// ---------- dates (plain YYYY-MM-DD strings, so time zones and DST never matter) ----------

const pad = n => String(n).padStart(2, '0');
const isIsoDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

function today() {
    const override = process.env.MENTOR_MATCH_TODAY;
    if (isIsoDate(override)) return override;
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(iso, days) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The computer's local calendar date of a saved timestamp. */
function localDate(timestamp) {
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------- program state ----------

function readProgram() {
    const saved = cstore.read('program', { cadence: 7, emailsSentAt: null });
    return {
        cadence: saved.cadence === 14 ? 14 : 7,
        emailsSentAt: isIsoDate(saved.emailsSentAt) ? saved.emailsSentAt : null
    };
}

/** Lessons start Nov 22 and repeat every 7 or 14 days until the program ends. */
function lessonDates(cadence) {
    const lessons = [];
    for (let date = PROGRAM.lessonStart, n = 1; date <= PROGRAM.programEnd; date = addDays(date, cadence), n++) {
        lessons.push({ n, date });
    }
    return lessons;
}

/** Prework is due the day before each lesson, postwork 3 days after. */
function assignmentsFor(lessons) {
    return lessons.flatMap(l => [
        { key: `${l.date}:pre`, lesson: l.n, label: `L${l.n} pre`, due: addDays(l.date, -1) },
        { key: `${l.date}:post`, lesson: l.n, label: `L${l.n} post`, due: addDays(l.date, 3) }
    ]);
}

// ---------- people and matches, built from the saved forms ----------

function loadPeople() {
    const fallbackDay = today();
    const jobLine = m => [m.title, m.company].filter(Boolean).join(' at ') ||
        (m.expertise || []).slice(0, 2).join(', ') || 'Not given';

    return [
        ...store.read('students').map(s => ({
            id: s.id, name: s.name, email: s.email, role: 'mentee',
            field: s.major || 'Not given', joined: localDate(s.submittedAt) || fallbackDay
        })),
        ...store.read('mentors').map(m => ({
            id: m.id, name: m.name, email: m.email, role: 'mentor',
            field: jobLine(m), joined: localDate(m.submittedAt) || fallbackDay
        }))
    ];
}

/** personId -> their final match, from both sides. */
function matchLookup(matches) {
    const byPerson = new Map();
    for (const m of matches) {
        byPerson.set(m.studentId, { partner: m.mentorName, percentage: m.percentage, method: m.method });
        byPerson.set(m.mentorId, { partner: m.studentName, percentage: m.percentage, method: m.method });
    }
    return byPerson;
}

// ---------- shared pieces ----------

function snapshot() {
    const t = today();
    const program = readProgram();
    const lessons = lessonDates(program.cadence).map(l => ({ ...l, held: l.date <= t }));
    const people = loadPeople();
    const matches = store.read('matches');
    const matched = matchLookup(matches);
    const attendance = cstore.read('attendance', {});
    const homework = cstore.read('homework', {});
    return { t, program, lessons, people, matches, matched, attendance, homework };
}

/** Who attended a lesson, counting only people who are matched. */
const attendedOn = (snap, date) => (snap.attendance[date] || []).filter(id => snap.matched.has(id));

function homeworkFor(snap, studentId) {
    const assignments = assignmentsFor(snap.lessons);
    const due = assignments.filter(a => a.due <= snap.t);
    const turnedIn = new Set(snap.homework[studentId] || []);
    return { due: due.length, done: due.filter(a => turnedIn.has(a.key)).length };
}

// ---------- summary (timeline + numbers at the top of every staff page) ----------

function getSummary() {
    const snap = snapshot();
    const { t, program, lessons, people, matches } = snap;
    const sent = program.emailsSentAt;
    const lastLesson = lessons.length ? lessons[lessons.length - 1].date : PROGRAM.programEnd;

    const stages = {
        apps: t < PROGRAM.reviewOpen ? (t >= PROGRAM.appsOpen ? 'now' : 'next') : 'done',
        review: sent || t > PROGRAM.reviewClose ? 'done' : t >= PROGRAM.reviewOpen ? 'now' : 'next',
        emails: sent ? 'done' : t > PROGRAM.reviewClose ? 'now' : 'next',
        lessons: t > PROGRAM.programEnd ? 'done' : t >= PROGRAM.lessonStart ? 'now' : 'next',
        end: t > PROGRAM.programEnd ? 'done' : 'next'
    };

    const held = lessons.filter(l => l.held);
    const checkIns = held.reduce((sum, l) => sum + attendedOn(snap, l.date).length, 0);
    const matchedPeople = snap.matched.size;

    const review = matchingService.getReviewState(new Set());
    const awaitingReview = review.unmatched.filter(u =>
        u.reason === 'Waiting for staff review' || u.reason === 'Waiting for automatic matching').length;

    const students = people.filter(p => p.role === 'mentee').length;
    return {
        today: t,
        program: PROGRAM,
        cadence: program.cadence,
        emailsSentAt: sent,
        lastLesson,
        lessonCount: lessons.length,
        stages,
        counts: {
            people: people.length,
            students,
            mentors: people.length - students,
            joinedThisWeek: people.filter(p => p.joined > addDays(t, -7) && p.joined <= t).length,
            applicationsClosed: t > PROGRAM.appsClose,
            matches: matches.length,
            awaitingReview,
            lessonsHeld: held.length,
            checkIns,
            attendanceRate: held.length && matchedPeople ? Math.round(checkIns / (held.length * matchedPeople) * 100) : null
        }
    };
}

// ---------- participants ----------

function getParticipants() {
    const snap = snapshot();
    const review = matchingService.getReviewState(new Set());
    const reasonByEmail = new Map(review.unmatched.map(u => [u.email, u.reason]));

    return {
        today: snap.t,
        lessons: snap.lessons,
        people: snap.people.map(p => {
            const match = snap.matched.get(p.id) || null;
            let status = 'no-match';
            if (match) status = 'matched';
            else if (p.role === 'mentee') {
                const reason = reasonByEmail.get(p.email);
                if (reason === 'Waiting for staff review' || reason === 'Waiting for automatic matching') status = 'in-review';
            }
            return {
                id: p.id, name: p.name, role: p.role, field: p.field, joined: p.joined,
                status,
                match,
                attendedDates: match ? snap.lessons.filter(l => attendedOn(snap, l.date).includes(p.id)).map(l => l.date) : [],
                homework: match && p.role === 'mentee' ? homeworkFor(snap, p.id) : null
            };
        })
    };
}

// ---------- lessons and attendance ----------

function getLessons() {
    const snap = snapshot();
    return {
        today: snap.t,
        cadence: snap.program.cadence,
        people: snap.people.filter(p => snap.matched.has(p.id)).map(p => ({ id: p.id, name: p.name, role: p.role })),
        lessons: snap.lessons.map(l => ({ ...l, attended: attendedOn(snap, l.date) }))
    };
}

function setCadence({ days }) {
    if (days !== 7 && days !== 14) throw new HttpError(400, 'days must be 7 or 14');
    const program = readProgram();
    cstore.write('program', { ...program, cadence: days });
    return getLessons();
}

function setAttendance({ date, personId, attended }) {
    const snap = snapshot();
    const lesson = snap.lessons.find(l => l.date === date);
    if (!lesson) throw new HttpError(400, 'That is not a lesson date');
    if (!lesson.held) throw new HttpError(400, 'That lesson has not happened yet');
    if (typeof personId !== 'string' || !snap.matched.has(personId)) throw new HttpError(404, 'That person is not matched');
    if (typeof attended !== 'boolean') throw new HttpError(400, 'attended must be true or false');

    const onDate = new Set(snap.attendance[date] || []);
    if (attended) onDate.add(personId); else onDate.delete(personId);
    cstore.write('attendance', { ...snap.attendance, [date]: [...onDate] });
    return getLessons();
}

// ---------- homework ----------

function getHomework() {
    const snap = snapshot();
    return {
        today: snap.t,
        assignments: assignmentsFor(snap.lessons),
        mentees: snap.people
            .filter(p => p.role === 'mentee' && snap.matched.has(p.id))
            .map(p => ({ id: p.id, name: p.name, turnedIn: snap.homework[p.id] || [] }))
    };
}

function setHomework({ studentId, key, submitted }) {
    const snap = snapshot();
    const assignment = assignmentsFor(snap.lessons).find(a => a.key === key);
    if (!assignment) throw new HttpError(400, 'Unknown assignment');
    if (assignment.due > snap.t) throw new HttpError(400, 'That work is not due yet');
    const student = snap.people.find(p => p.id === studentId);
    if (!student || student.role !== 'mentee' || !snap.matched.has(studentId)) throw new HttpError(404, 'That student is not matched');
    if (typeof submitted !== 'boolean') throw new HttpError(400, 'submitted must be true or false');

    const turnedIn = new Set(snap.homework[studentId] || []);
    if (submitted) turnedIn.add(key); else turnedIn.delete(key);
    cstore.write('homework', { ...snap.homework, [studentId]: [...turnedIn] });
    return getHomework();
}

// ---------- analytics ----------

function getAnalytics() {
    const snap = snapshot();
    const { t, people, lessons } = snap;

    // Cumulative sign-ups per day, from the day applications open
    const joinedDates = people.map(p => p.joined).sort();
    let start = joinedDates[0] && joinedDates[0] < PROGRAM.appsOpen ? joinedDates[0] : PROGRAM.appsOpen;
    let end = joinedDates.length && joinedDates[joinedDates.length - 1] > PROGRAM.appsClose
        ? joinedDates[joinedDates.length - 1] : PROGRAM.appsClose;
    if (start < addDays(end, -365)) start = addDays(end, -365);

    const days = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
        days.push({
            date: d,
            mentees: people.filter(p => p.role === 'mentee' && p.joined <= d).length,
            mentors: people.filter(p => p.role === 'mentor' && p.joined <= d).length,
            shown: d <= t
        });
    }

    const mentees = people.filter(p => p.role === 'mentee');
    const matchedMentees = mentees.filter(p => snap.matched.has(p.id));
    const heldLessons = lessons.filter(l => l.held);
    const attendedAny = matchedMentees.filter(p => heldLessons.some(l => attendedOn(snap, l.date).includes(p.id)));
    const emailed = snap.program.emailsSentAt ? matchedMentees.length : 0;

    return {
        today: t,
        program: PROGRAM,
        days,
        expected: snap.matched.size,
        lessons: lessons.map(l => ({ ...l, attendedCount: attendedOn(snap, l.date).length })),
        funnel: [
            { label: 'Applied', value: mentees.length },
            { label: 'Matched with a mentor', value: matchedMentees.length },
            { label: 'Emailed their match', value: emailed },
            { label: 'Attended a lesson', value: attendedAny.length }
        ]
    };
}

// ---------- orientation page ----------

const DEFAULT_ORIENTATION = {
    title: 'Welcome to Mentor Match',
    subtitle: '',
    // Nothing is visible to mentors or mentees until staff turn it on
    showOn: { mentee: false, mentor: false, staff: true },
    edited: null,
    sections: []
};

function getOrientation() {
    return cstore.read('orientation', DEFAULT_ORIENTATION);
}

const isText = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max;

function saveOrientation(doc) {
    const errors = [];
    if (!isText(doc.title, 1, LIMITS.title)) errors.push(`title is required (max ${LIMITS.title} characters)`);
    if (typeof doc.subtitle !== 'string' || doc.subtitle.length > LIMITS.subtitle) errors.push(`subtitle is too long (max ${LIMITS.subtitle})`);

    const show = doc.showOn;
    if (!show || ['mentee', 'mentor', 'staff'].some(k => typeof show[k] !== 'boolean')) errors.push('showOn needs true or false for mentee, mentor and staff');

    const sections = doc.sections;
    if (!Array.isArray(sections) || sections.length > LIMITS.sections) errors.push(`sections must be a list of at most ${LIMITS.sections}`);
    else {
        const ids = new Set();
        sections.forEach((s, i) => {
            const label = `section ${i + 1}`;
            if (!s || typeof s !== 'object') { errors.push(`${label} is invalid`); return; }
            if (typeof s.id !== 'string' || !/^[\w-]{1,40}$/.test(s.id) || ids.has(s.id)) errors.push(`${label} has a bad id`);
            ids.add(s.id);
            if (!AUDIENCES.includes(s.aud)) errors.push(`${label} has an invalid audience`);
            if (!isText(s.title, 1, LIMITS.sectionTitle)) errors.push(`${label} needs a title (max ${LIMITS.sectionTitle})`);
            if (typeof s.body !== 'string' || s.body.length > LIMITS.body) errors.push(`${label} text is too long (max ${LIMITS.body})`);
        });
    }
    if (errors.length) throw Object.assign(new HttpError(400, 'Please check the orientation page'), { details: errors });

    const saved = {
        title: doc.title.trim(),
        subtitle: doc.subtitle.trim(),
        showOn: { mentee: show.mentee, mentor: show.mentor, staff: show.staff },
        edited: `${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} by staff`,
        sections: sections.map(s => ({ id: s.id, aud: s.aud, title: s.title.trim(), body: s.body }))
    };
    cstore.write('orientation', saved);
    return saved;
}

/** What mentors and mentees can read without signing in. Only what staff turned on. */
function publicOrientation(audience) {
    if (audience !== 'mentee' && audience !== 'mentor') throw new HttpError(400, 'for must be mentee or mentor');
    const doc = getOrientation();
    if (!doc.showOn[audience]) return { visible: false };
    return {
        visible: true,
        title: doc.title,
        subtitle: doc.subtitle,
        sections: doc.sections.filter(s => s.aud === 'all' || s.aud === audience).map(s => ({ title: s.title, body: s.body }))
    };
}

// ---------- match emails ----------
// This app does not send email. Staff send the introductions themselves
// (the CSV has everything they need) and then record that it's done.

function setEmailsSent({ sent }) {
    if (typeof sent !== 'boolean') throw new HttpError(400, 'sent must be true or false');
    if (sent && store.read('matches').length === 0) throw new HttpError(400, 'There are no matches to send yet');
    const program = readProgram();
    cstore.write('program', { ...program, emailsSentAt: sent ? today() : null });
    return getSummary();
}

/** A spreadsheet runs text starting with = + - @ as a formula, so defuse those. */
function csvCell(value) {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

function matchesCsv() {
    const header = ['Student', 'Student email', 'Mentor', 'Mentor email', 'Match %', 'How', 'Matched on'];
    const rows = store.read('matches').map(m => [
        m.studentName, m.studentEmail, m.mentorName, m.mentorEmail, m.percentage,
        m.method === 'auto' ? 'Automatic' : 'Staff', localDate(m.matchedAt) || ''
    ]);
    return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

module.exports = {
    HttpError, PROGRAM,
    getSummary, getParticipants, getLessons, setCadence, setAttendance,
    getHomework, setHomework, getAnalytics,
    getOrientation, saveOrientation, publicOrientation,
    setEmailsSent, matchesCsv
};

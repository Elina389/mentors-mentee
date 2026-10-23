/**
 * Application Controller
 * Handles UI interactions and form management
 */

// Initialize matching system
const matchingSystem = new MatchingSystem();
matchingSystem.initializeSampleData();

// Show student survey
function showStudentSurvey() {
    document.getElementById('roleSelection').style.display = 'none';
    document.getElementById('studentForm').classList.add('active');
}

// Show mentor survey
function showMentorSurvey() {
    document.getElementById('roleSelection').style.display = 'none';
    document.getElementById('mentorForm').classList.add('active');
}

// Go back to role selection
function goBack() {
    document.getElementById('roleSelection').style.display = 'block';
    document.getElementById('studentForm').classList.remove('active');
    document.getElementById('mentorForm').classList.remove('active');
    document.getElementById('studentSuccess').classList.add('hidden');
    document.getElementById('mentorSuccess').classList.add('hidden');
    document.getElementById('matchesContainer').style.display = 'none';
    document.getElementById('studentForm').reset();
    document.getElementById('mentorForm').reset();
    
    // Reset rating selections
    document.querySelectorAll('.rating-label').forEach(label => {
        label.classList.remove('selected');
    });
}

// Handle rating selection UI
document.querySelectorAll('.rating-label').forEach(label => {
    label.addEventListener('click', function() {
        const group = this.parentElement;
        group.querySelectorAll('.rating-label').forEach(l => l.classList.remove('selected'));
        this.classList.add('selected');
    });
});

// Collect form data as object
function getFormData(formId) {
    const form = document.getElementById(formId);
    const formData = new FormData(form);
    const data = {};
    
    for (let [key, value] of formData.entries()) {
        // Handle checkboxes (multiple values)
        if (data[key]) {
            if (Array.isArray(data[key])) {
                data[key].push(value);
            } else {
                data[key] = [data[key], value];
            }
        } else {
            data[key] = value;
        }
    }
    
    // Handle checkboxes separately for better control
    data.passions = Array.from(document.querySelectorAll('input[name="passion"]:checked')).map(cb => cb.value);
    data.industries = Array.from(document.querySelectorAll('input[name="industry"]:checked')).map(cb => cb.value);
    data.skillsToDevelop = Array.from(document.querySelectorAll('input[name="skillsDevelop"]:checked')).map(cb => cb.value);
    data.mentorNeeds = Array.from(document.querySelectorAll('input[name="mentorNeed"]:checked')).map(cb => cb.value);
    
    return data;
}

// Student form submission
document.getElementById('studentForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const student = {
        name: document.getElementById('studentName').value,
        email: document.getElementById('studentEmail').value,
        major: document.getElementById('studentMajor').value,
        year: document.getElementById('studentYear').value,
        passion: document.getElementById('studentPassion').value,
        mentorStyle: document.getElementById('mentorStyle').value,
        meetingPreference: document.getElementById('meetingPreference').value,
        availableDays: Array.from(document.querySelectorAll('input[name="availableDays"]:checked')).map(cb => cb.value),
        challenges: document.getElementById('studentChallenges').value,
        goals: document.getElementById('studentGoals').value
    };

    matchingSystem.saveStudent(student);
    
    document.getElementById('studentForm').classList.remove('active');
    document.getElementById('studentSuccess').classList.remove('hidden');
});

// Mentor form submission
document.getElementById('mentorForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const mentor = {
        name: document.getElementById('mentorName').value,
        email: document.getElementById('mentorEmail').value,
        title: document.getElementById('mentorTitle').value,
        company: document.getElementById('mentorCompany').value,
        field: document.getElementById('mentorField').value,
        yearsExperience: document.getElementById('yearsExperience').value,
        expertise: Array.from(document.querySelectorAll('input[name="expertise"]:checked')).map(cb => cb.value),
        bio: document.getElementById('mentorBio').value,
        degree: document.getElementById('mentorDegree').value,
        almaMater: document.getElementById('mentorAlmaMater').value,
        sjsuAlumnus: document.querySelector('input[name="sjsuAlumnus"]:checked')?.value || '',
        canHelpWith: Array.from(document.querySelectorAll('input[name="helpWith"]:checked')).map(cb => cb.value),
        menteeCapacity: document.getElementById('menteeCount').value,
        availability: document.getElementById('meetingAvailability').value,
        availableDays: Array.from(document.querySelectorAll('input[name="availableDays"]:checked')).map(cb => cb.value),
        mentorshipStyle: document.getElementById('mentorshipStyle').value,
        preferredMajors: Array.from(document.querySelectorAll('input[name="preferredMajor"]:checked')).map(cb => cb.value),
        motivation: document.getElementById('mentorMotivation').value,
        achievements: document.getElementById('mentorAchievements').value,
        additional: document.getElementById('mentorAdditional').value
    };

    matchingSystem.saveMentor(mentor);
    
    document.getElementById('mentorForm').classList.remove('active');
    document.getElementById('mentorSuccess').classList.remove('hidden');
});

// Show mentor matches
function showMatches() {
    document.getElementById('studentSuccess').classList.add('hidden');
    document.getElementById('matchesContainer').style.display = 'block';

    const matchesList = document.getElementById('matchesList');
    matchesList.innerHTML = '';

    const mentors = matchingSystem.getAllMentors();
    
    if (mentors.length === 0) {
        matchesList.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No mentors available yet. Please check back later!</p>';
        return;
    }

    // Get top matches
    const matches = matchingSystem.findMatches(matchingSystem.currentUser, 5);
    
    matches.forEach(match => {
        const card = document.createElement('div');
        card.className = 'match-card';
        card.innerHTML = `
            <div class="match-header">
                <span class="match-name">${match.mentor.name}</span>
                <span class="match-score">${match.match.percentage}% Match</span>
            </div>
            <div class="match-details">
                <p><strong>Title:</strong> ${match.mentor.title} at ${match.mentor.company}</p>
                <p><strong>Experience:</strong> ${match.mentor.yearsExperience}</p>
                <p><strong>Expertise:</strong> ${match.mentor.expertise.join(', ')}</p>
                <p><strong>Can help with:</strong> ${match.mentor.canHelpWith.join(', ')}</p>
                ${match.mentor.bio ? `<p><strong>Bio:</strong> ${match.mentor.bio}</p>` : ''}
                <p><strong>Why matched:</strong> ${match.match.details.join(' • ')}</p>
                ${match.mentor.sjsuAlumnus === 'Yes' ? '<p style="color: #0055A2;"><strong>🎓 SJSU Alumnus</strong></p>' : ''}
            </div>
        `;
        matchesList.appendChild(card);
    });
}

// Back to success message
function backToSuccess() {
    document.getElementById('matchesContainer').style.display = 'none';
    document.getElementById('studentSuccess').classList.remove('hidden');
}

// View all mentors
function viewAllMentors() {
    document.getElementById('mentorSuccess').classList.add('hidden');
    document.getElementById('matchesContainer').style.display = 'block';

    const matchesList = document.getElementById('matchesList');
    matchesList.innerHTML = '<h3 style="margin-bottom: 20px;">All Registered Mentors</h3>';

    const mentors = matchingSystem.getAllMentors();
    
    if (mentors.length === 0) {
        matchesList.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No mentors registered yet.</p>';
        return;
    }

    mentors.forEach(mentor => {
        const card = document.createElement('div');
        card.className = 'match-card';
        card.innerHTML = `
            <div class="match-header">
                <span class="match-name">${mentor.name}</span>
            </div>
            <div class="match-details">
                <p><strong>Title:</strong> ${mentor.title} at ${mentor.company}</p>
                <p><strong>Experience:</strong> ${mentor.yearsExperience}</p>
                <p><strong>Expertise:</strong> ${mentor.expertise.join(', ')}</p>
                <p><strong>Can help with:</strong> ${mentor.canHelpWith.join(', ')}</p>
                ${mentor.bio ? `<p><strong>Bio:</strong> ${mentor.bio}</p>` : ''}
                ${mentor.sjsuAlumnus === 'Yes' ? '<p style="color: #0055A2;"><strong>🎓 SJSU Alumnus</strong></p>' : ''}
            </div>
        `;
        matchesList.appendChild(card);
    });
}

// Contact mentors (placeholder for future implementation)
function contactMentors() {
    alert('In a production system, this would send emails to your selected mentors. For now, you can reach out to them directly using their provided information.');
}

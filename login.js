/**
 * login.js - Authentication Logic
 */

const API_URL = 'http://localhost:3000/api';
let currentRole = 'student'; // default

document.addEventListener('DOMContentLoaded', () => {
    // If already logged in, redirect to LMS
    if (localStorage.getItem('lms_user')) {
        window.location.href = 'lms.html';
    }

    document.getElementById('login-form').addEventListener('submit', handleLogin);
});

// Toast Notification
function showToast(message, isSuccess = true) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + (isSuccess ? 'success' : 'error');
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
}

// Toggle between Student and Admin tabs
function selectRole(role) {
    currentRole = role;

    // UI Updates
    document.getElementById('btn-student').classList.remove('active');
    document.getElementById('btn-admin').classList.remove('active');
    document.getElementById(`btn-${role}`).classList.add('active');

    const label = document.getElementById('label-username');
    const input = document.getElementById('login-username');
    const hint = document.getElementById('hint-text');

    if (role === 'admin') {
        label.textContent = 'Admin Username';
        input.placeholder = 'admin';
        hint.textContent = 'Demo Admin: admin | pass: admin123';
        input.value = 'admin'; // auto-fill for demo convenience
        document.getElementById('login-password').value = 'admin123';
    } else {
        label.textContent = 'Email Address';
        input.placeholder = 'name@university.edu';
        hint.textContent = 'Demo Student: chaitanya@university.edu | pass: student123';
        input.value = 'chaitanya@university.edu';
        document.getElementById('login-password').value = 'student123';
    }
}

// Form Submission
async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const btn = e.target.querySelector('button');

    if (!username || !password) {
        showToast('Please fill in all fields', false);
        return;
    }

    btn.textContent = 'Signing in...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role: currentRole })
        });

        const result = await res.json();

        if (!result.success) throw new Error(result.message);

        // Save session data to localStorage
        localStorage.setItem('lms_user', JSON.stringify(result.user));

        showToast('Login Successful!', true);

        // Redirect to main App
        setTimeout(() => {
            window.location.href = 'lms.html';
        }, 500);

    } catch (error) {
        showToast(error.message, false);
        btn.textContent = 'Sign In';
        btn.disabled = false;
    }
}

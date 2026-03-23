/**
 * login.js - Authentication Logic
 */

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker: Registered'))
            .catch(err => console.log(`Service Worker: Error: ${err}`));
    });
}

const APP_VERSION = '1.0.4';
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname.includes('10.242.'))
    ? `http://${window.location.hostname}:3000/api`
    : 'https://l-b-s.onrender.com/api'; // Use relative path for production (Render)
let currentRole = 'student'; // default

document.addEventListener('DOMContentLoaded', () => {
    // Add version tag for debugging
    const verTag = document.createElement('div');
    verTag.style.cssText = 'position:fixed; bottom:10px; right:10px; font-size:10px; color:gray;';
    verTag.textContent = 'v' + APP_VERSION;
    document.body.appendChild(verTag);

    // If already logged in, redirect to LMS
    if (localStorage.getItem('lms_user')) {
        window.location.href = 'lms.html';
    }

    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
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
        
        // Hide registration link for Admins
        document.getElementById('toggle-form-link').style.display = 'none';
        if (isShowingRegister) toggleForm(); // Force back to login view if admin
    } else {
        label.textContent = 'Email Address';
        input.placeholder = 'name@university.edu';
        hint.textContent = 'Demo Student: chaitanya@university.edu | pass: student123';
        input.value = 'chaitanya@university.edu';
        document.getElementById('login-password').value = 'student123';
        
        // Show registration link for Students
        document.getElementById('toggle-form-link').style.display = 'inline';
    }
}

let isShowingRegister = false;

// Toggle Login / Register UI
function toggleForm() {
    isShowingRegister = !isShowingRegister;
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    const toggleLink = document.getElementById('toggle-form-link');
    const roleSelector = document.querySelector('.role-selector');
    const demoHints = document.getElementById('demo-hints');
    const headerTitle = document.querySelector('.login-header h2');

    if (isShowingRegister) {
        loginForm.style.display = 'none';
        regForm.style.display = 'block';
        roleSelector.style.display = 'none';
        demoHints.style.display = 'none';
        toggleLink.textContent = 'Already have an account? Sign In';
        headerTitle.textContent = 'Create an Account';
    } else {
        loginForm.style.display = 'block';
        regForm.style.display = 'none';
        roleSelector.style.display = 'flex';
        demoHints.style.display = 'block';
        toggleLink.textContent = 'Create an account';
        headerTitle.textContent = 'Welcome Back';
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

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`Login Error (${res.status}):`, errorText);
            throw new Error(`Server Error (${res.status}). Please check database connectivity.`);
        }

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
        console.error('Login Process Error:', error);
        showToast(error.message, false);
        btn.textContent = 'Sign In';
        btn.disabled = false;
    }
}

// Registration Form Submission
async function handleRegister(e) {
    e.preventDefault();

    const payload = {
        first_name: document.getElementById('reg-fname').value.trim(),
        last_name: document.getElementById('reg-lname').value.trim(),
        university_id: document.getElementById('reg-id').value.trim(),
        email: document.getElementById('reg-email').value.trim(),
        department: document.getElementById('reg-department').value,
        password: document.getElementById('reg-password').value.trim()
    };
    
    const btn = e.target.querySelector('button');

    if (!payload.first_name || !payload.university_id || !payload.email || !payload.password) {
        showToast('Please fill in all required fields', false);
        return;
    }

    btn.textContent = 'Creating account...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (!result.success) throw new Error(result.message);

        showToast('Account created successfully! Please log in.', true);
        
        // Auto fill email on login page
        document.getElementById('login-username').value = payload.email;
        document.getElementById('login-password').value = '';

        // Switch back to login form
        setTimeout(() => {
            toggleForm();
            e.target.reset();
            btn.textContent = 'Register Now';
            btn.disabled = false;
        }, 1500);

    } catch (error) {
        showToast(error.message, false);
        btn.textContent = 'Register Now';
        btn.disabled = false;
    }
}

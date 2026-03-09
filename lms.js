/**
 * lms.js - Library Management System Logic
 */

const API_URL = 'http://localhost:3000/api';

// Authentication & Role Checking
const userSession = localStorage.getItem('lms_user');
if (!userSession) {
    window.location.href = 'login.html'; // Redirect to login if not authenticated
}
const currentUser = JSON.parse(userSession);

// Logout functionalitiy
window.logout = function () {
    localStorage.removeItem('lms_user');
    window.location.href = 'login.html';
}

// ============================================================================
// Navigation & UI Logic
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Setup User Interface based on Role
    document.getElementById('user-name-display').innerText = currentUser.name;

    if (currentUser.role === 'student') {
        document.getElementById('user-avatar').innerHTML = '&#x1F393;'; // Student emoji

        // Hide all admin-only elements
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = 'none';
        });

        // Hide Member column from Borrowings table for students
        const borrowMemberCol = document.getElementById('borrow-member-col');
        if (borrowMemberCol) borrowMemberCol.style.display = 'none';

        // Set default view to Book Catalog for students
        document.getElementById('view-dashboard').classList.remove('active');
        document.getElementById('nav-dashboard').classList.remove('active');
        document.getElementById('view-books').classList.add('active');
        document.getElementById('nav-books').classList.add('active');
        document.getElementById('page-title').innerText = 'Book Catalog';
    }

    // 2. Determine today's date for 'Due Date' default (14 days from now)
    const issueDateInput = document.getElementById('issue-due-date');
    if (issueDateInput) {
        const date = new Date();
        date.setDate(date.getDate() + 14);
        issueDateInput.value = date.toISOString().split('T')[0];
    }

    // 3. Initialize initial views
    if (currentUser.role === 'admin') {
        loadDashboardStats();
    }
    loadBooks();

    // 4. Navigation logic
    const navItems = document.querySelectorAll('.nav-item');
    const viewSections = document.querySelectorAll('.view-section');
    const pageTitle = document.getElementById('page-title');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Check if clicking a hidden item somehow
            if (item.style.display === 'none') return;

            // Update Active State
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // Switch View
            const targetId = item.getAttribute('data-target');
            viewSections.forEach(v => v.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');

            // Update Title & Fetch Data
            pageTitle.innerText = item.innerText.trim().replace(/[0-9]/g, ''); // Removes badge number from title

            if (targetId === 'view-books') loadBooks();
            if (targetId === 'view-members' && currentUser.role === 'admin') loadMembers();
            if (targetId === 'view-borrowings') loadBorrowings();
            if (targetId === 'view-requests' && currentUser.role === 'admin') loadRequests();
            if (targetId === 'view-dashboard' && currentUser.role === 'admin') loadDashboardStats();
        });
    });

    // Form Event Listeners (Only bind if admin or forms exist)
    const formAdd = document.getElementById('form-add-book');
    const formIssue = document.getElementById('form-issue-book');
    const formReturn = document.getElementById('form-return-book');

    if (formAdd) formAdd.addEventListener('submit', handleAddBook);
    if (formIssue) formIssue.addEventListener('submit', handleIssueBook);
    if (formReturn) formReturn.addEventListener('submit', handleReturnBook);
});

// Modal Controls
function openModal(id) {
    document.getElementById(id).classList.add('show');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

// Toast Notification
function showToast(message, isSuccess = true) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + (isSuccess ? 'success' : 'error');
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
}

// ============================================================================
// Data Fetching & Rendering
// ============================================================================

// Fetch and load Dashboard Stats (Admin Only)
async function loadDashboardStats() {
    if (currentUser.role !== 'admin') return;
    try {
        const [booksRes, membersRes, borrowRes, reqRes] = await Promise.all([
            fetch(`${API_URL}/books`),
            fetch(`${API_URL}/members`),
            fetch(`${API_URL}/borrowings`),
            fetch(`${API_URL}/requests`)
        ]);

        const booksData = await booksRes.json();
        const membersData = await membersRes.json();
        const borrowData = await borrowRes.json();
        const reqData = await reqRes.json();

        if (booksData.success) document.getElementById('stat-books').innerText = booksData.data.length;
        if (membersData.success) document.getElementById('stat-members').innerText = membersData.data.length;
        if (borrowData.success) document.getElementById('stat-borrowed').innerText = borrowData.data.length;

        // Update Pending Requests Badge
        if (reqData.success) {
            const badge = document.getElementById('request-badge');
            if (reqData.data.length > 0) {
                badge.style.display = 'inline';
                badge.innerText = reqData.data.length;
            } else {
                badge.style.display = 'none';
            }
        }

    } catch (error) {
        console.error("Dashboard Stats Fetch Error", error);
    }
}

// Fetch and render Books Catalog
async function loadBooks() {
    try {
        const res = await fetch(`${API_URL}/books`);
        const result = await res.json();

        if (!result.success) throw new Error(result.message);

        const tbody = document.querySelector('#table-books tbody');

        // Add Action column header dynamically if student
        const theadTr = document.querySelector('#table-books thead tr');
        if (currentUser.role === 'student' && !document.getElementById('th-action')) {
            theadTr.innerHTML += `<th id="th-action" style="text-align:right;">Action</th>`;
        }

        tbody.innerHTML = '';

        result.data.forEach(book => {
            const author = (book.author_first && book.author_last) ? `${book.author_first} ${book.author_last}` : 'N/A';
            const category = book.category_name || 'N/A';
            const stockColor = book.available_copies > 0 ? 'var(--success)' : 'var(--danger)';
            const stockHtml = `<span style="color: ${stockColor}; font-weight: 600;">${book.available_copies}</span> / ${book.total_copies}`;

            let rowHtml = `
                <tr>
                    <td>#${book.book_id}</td>
                    <td style="font-weight: 500;">${book.title}<br><small style="color:var(--text-muted)">ISBN: ${book.isbn}</small></td>
                    <td>${author}</td>
                    <td>${category}</td>
                    <td>${stockHtml}</td>
            `;

            // Add Request Button for students
            if (currentUser.role === 'student') {
                if (book.available_copies > 0) {
                    rowHtml += `<td style="text-align:right;"><button class="btn btn-secondary" style="padding: 0.4rem 0.8rem;" onclick="requestBook(${book.book_id})">Request</button></td>`;
                } else {
                    rowHtml += `<td style="text-align:right;"><span style="color:var(--danger); font-size:0.85rem;">Out of Stock</span></td>`;
                }
            }

            rowHtml += `</tr>`;
            tbody.innerHTML += rowHtml;
        });
    } catch (error) {
        showToast("Error loading books: " + error.message, false);
    }
}

// Fetch and render Members (Admin Only)
async function loadMembers() {
    if (currentUser.role !== 'admin') return;
    try {
        const res = await fetch(`${API_URL}/members`);
        const result = await res.json();

        if (!result.success) throw new Error(result.message);

        const tbody = document.querySelector('#table-members tbody');
        tbody.innerHTML = '';

        result.data.forEach(mem => {
            tbody.innerHTML += `
                <tr>
                    <td>#${mem.member_id}</td>
                    <td>${mem.university_id}</td>
                    <td style="font-weight: 500;">${mem.first_name} ${mem.last_name}</td>
                    <td>${mem.email}</td>
                    <td><span style="background:#e5e7eb; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; color:#111;">${mem.member_type}</span></td>
                </tr>
            `;
        });
    } catch (error) {
        showToast("Error loading members", false);
    }
}

// Fetch and render Active Borrowings
async function loadBorrowings() {
    try {
        // For admins, get all. For students, get only their borrowings.
        const endpoint = currentUser.role === 'admin'
            ? `${API_URL}/borrowings`
            : `${API_URL}/student-borrowings/${currentUser.id}`;

        const res = await fetch(endpoint);
        const result = await res.json();

        if (!result.success) throw new Error(result.message);

        const tbody = document.querySelector('#table-borrowings tbody');
        tbody.innerHTML = '';

        if (result.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem;">No active borrowings found.</td></tr>`;
            return;
        }

        result.data.forEach(rec => {
            const dueColor = rec.days_left < 0 ? 'var(--danger)' : (rec.days_left <= 3 ? 'var(--warning)' : 'inherit');

            let rowHtml = `<tr><td><b>#${rec.record_id}</b></td>`;

            // Only add Member column for admin
            if (currentUser.role === 'admin') {
                rowHtml += `<td>${rec.member_first_name} ${rec.member_last_name} <small>(${rec.university_id})</small></td>`;
            }

            rowHtml += `
                <td style="font-weight: 500;">${rec.book_title}</td>
                <td>${new Date(rec.borrow_date).toLocaleDateString()}</td>
                <td>${new Date(rec.due_date).toLocaleDateString()}</td>
                <td style="color: ${dueColor}; font-weight: 600;">${rec.days_left < 0 ? Math.abs(rec.days_left) + ' days overdue' : rec.days_left + ' days left'}</td>
            </tr>`;

            tbody.innerHTML += rowHtml;
        });
    } catch (error) {
        showToast("Error loading active borrowings", false);
    }
}

// Fetch and render Pending Requests (Admin Only)
async function loadRequests() {
    if (currentUser.role !== 'admin') return;
    try {
        const res = await fetch(`${API_URL}/requests`);
        const result = await res.json();

        if (!result.success) throw new Error(result.message);

        const tbody = document.querySelector('#table-requests tbody');
        tbody.innerHTML = '';

        if (result.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem;">No pending requests.</td></tr>`;
            return;
        }

        result.data.forEach(req => {
            tbody.innerHTML += `
                <tr>
                    <td><b>#${req.record_id}</b></td>
                    <td>${req.member_first_name} ${req.member_last_name} <small>(${req.university_id})</small></td>
                    <td style="font-weight: 500;">${req.book_title}</td>
                    <td>${new Date(req.borrow_date).toLocaleDateString()}</td>
                    <td>
                        <button class="btn btn-primary" style="padding: 0.3rem 0.6rem; font-size:0.8rem; margin-right:5px;" onclick="approveRequest(${req.record_id})">Approve</button>
                        <button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size:0.8rem; border-color:var(--danger); color:var(--danger)" onclick="rejectRequest(${req.record_id})">Reject</button>
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        showToast("Error loading requests", false);
    }
}

// ============================================================================
// Form Submissions & Actions
// ============================================================================

// Student clicks Request Book
window.requestBook = async function (book_id) {
    if (!confirm('Are you sure you want to request this book?')) return;

    try {
        const res = await fetch(`${API_URL}/request-book`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ book_id, member_id: currentUser.id })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message);

        showToast(result.message, true);
        loadBooks();
    } catch (error) {
        showToast(error.message, false);
    }
}

// Admin clicks Approve Request
window.approveRequest = async function (record_id) {
    try {
        const res = await fetch(`${API_URL}/approve-request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ record_id })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message);

        showToast(result.message, true);
        loadRequests();
        loadDashboardStats();
    } catch (error) {
        showToast(error.message, false);
    }
}

// Admin clicks Reject Request
window.rejectRequest = async function (record_id) {
    if (!confirm('Are you sure you want to reject this request?')) return;
    try {
        const res = await fetch(`${API_URL}/reject-request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ record_id })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message);

        showToast(result.message, true);
        loadRequests();
        loadDashboardStats();
    } catch (error) {
        showToast(error.message, false);
    }
}

// Handle Adding a Book
async function handleAddBook(e) {
    e.preventDefault();
    if (currentUser.role !== 'admin') return;

    const payload = {
        title: document.getElementById('add-title').value,
        isbn: document.getElementById('add-isbn').value,
        publication_year: document.getElementById('add-year').value,
        category_id: document.getElementById('add-category').value,
        author_id: document.getElementById('add-author').value,
        total_copies: document.getElementById('add-copies').value
    };

    try {
        const res = await fetch(`${API_URL}/books`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (!result.success) throw new Error(result.message);

        showToast(result.message, true);
        document.getElementById('form-add-book').reset();
        closeModal('modal-add-book');
        loadBooks(); // refresh list
        loadDashboardStats();

    } catch (error) {
        showToast(error.message, false);
    }
}

// Handle Issuing a Book
async function handleIssueBook(e) {
    e.preventDefault();
    if (currentUser.role !== 'admin') return;

    const payload = {
        book_id: document.getElementById('issue-book-id').value,
        member_id: document.getElementById('issue-member-id').value,
        due_date: document.getElementById('issue-due-date').value
    };

    try {
        const res = await fetch(`${API_URL}/borrow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (!result.success) throw new Error(result.message);

        showToast(result.message, true);
        document.getElementById('form-issue-book').reset();
        closeModal('modal-issue-book');

        // Refresh appropriate views depending on what was active
        loadDashboardStats();
        if (document.getElementById('view-books').classList.contains('active')) loadBooks();
        if (document.getElementById('view-borrowings').classList.contains('active')) loadBorrowings();

    } catch (error) {
        showToast(error.message, false);
    }
}

// Handle Returning a Book
async function handleReturnBook(e) {
    e.preventDefault();
    if (currentUser.role !== 'admin') return;

    const payload = {
        record_id: document.getElementById('return-record-id').value
    };

    try {
        const res = await fetch(`${API_URL}/return`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (!result.success) throw new Error(result.message);

        showToast(result.message, true);
        document.getElementById('form-return-book').reset();
        closeModal('modal-return-book');

        // Refresh appropriate views depending on what was active
        loadDashboardStats();
        if (document.getElementById('view-books').classList.contains('active')) loadBooks();
        if (document.getElementById('view-borrowings').classList.contains('active')) loadBorrowings();

    } catch (error) {
        showToast(error.message, false);
    }
}

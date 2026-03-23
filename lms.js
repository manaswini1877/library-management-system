/**
 * lms.js - Library Management System Logic
 */

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker: Registered'))
            .catch(err => console.log(`Service Worker: Error: ${err}`));
    });
}

const API_URL = (window.location.hostname === 'localhost' || window.location.hostname.includes('10.242.'))
    ? `http://${window.location.hostname}:3000/api`
    : '/api'; // Use relative path for production (Render)

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
    if (currentUser.role === 'student') {
        loadRecommendations();
        loadReminders();
    }

    // 3b. Setup Mobile-Specific Navigation
    setupMobileNav();

    // 4. Navigation logic
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (item.style.display === 'none') return;
            const targetId = item.getAttribute('data-target');
            switchView(targetId, item);
        });
    });

    // Global View Switcher
    window.switchView = function(targetId, navElement = null) {
        const viewSections = document.querySelectorAll('.view-section');
        const pageTitle = document.getElementById('page-title');
        const allNavs = document.querySelectorAll('.nav-item, .mobile-nav-item');

        // Update Active States across ALL navigation elements (Desktop + Mobile)
        allNavs.forEach(n => {
            if (n.getAttribute('data-target') === targetId) {
                n.classList.add('active');
            } else {
                n.classList.remove('active');
            }
        });

        // Switch View Section
        viewSections.forEach(v => v.classList.remove('active'));
        const targetView = document.getElementById(targetId);
        if (targetView) targetView.classList.add('active');

        // Update Title & Fetch Data
        if (navElement) {
            pageTitle.innerText = navElement.innerText.trim().replace(/[0-9]/g, '');
        } else {
            // Fallback for direct calls
            const labelMap = {
                'view-dashboard': 'Dashboard',
                'view-books': 'Book Catalog',
                'view-borrowings': 'Active Borrowings',
                'view-requests': 'Pending Requests',
                'view-members': 'Members'
            };
            pageTitle.innerText = labelMap[targetId] || 'Library System';
        }

        if (targetId === 'view-books') loadBooks();
        if (targetId === 'view-members' && currentUser.role === 'admin') loadMembers();
        if (targetId === 'view-borrowings') loadBorrowings();
        if (targetId === 'view-requests' && currentUser.role === 'admin') loadRequests();
        if (targetId === 'view-dashboard' && currentUser.role === 'admin') loadDashboardStats();
        
        // Scroll to top on mobile view switch
        if (window.innerWidth <= 768) {
            document.querySelector('.content-wrapper').scrollTo(0, 0);
        }
    }

    // Initialize Mobile Nav Items
    function setupMobileNav() {
        const mobileNav = document.getElementById('mobile-nav');
        if (!mobileNav) return;

        const studentItems = [
            { id: 'view-books', label: 'Catalog', icon: '🔍' },
            { id: 'view-borrowings', label: 'My Books', icon: '📚' },
            { id: 'view-dashboard', label: 'Profile', icon: '👤' }
        ];

        const adminItems = [
            { id: 'view-dashboard', label: 'Stats', icon: '📈' },
            { id: 'view-books', label: 'Books', icon: '📖' },
            { id: 'view-requests', label: 'Requests', icon: '📩' },
            { id: 'view-borrowings', label: 'Issuance', icon: '📄' }
        ];

        const activeItems = currentUser.role === 'admin' ? adminItems : studentItems;

        mobileNav.innerHTML = activeItems.map(item => `
            <div class="mobile-nav-item ${document.getElementById(item.id).classList.contains('active') ? 'active' : ''}" 
                 data-target="${item.id}" onclick="switchView('${item.id}', this)">
                <span class="icon">${item.icon}</span>
                <span>${item.label}</span>
            </div>
        `).join('');
    }

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
                    <td data-label="ID">#${book.book_id}</td>
                    <td style="font-weight: 500;" data-label="Book Information">${book.title}<br><small style="color:var(--text-muted)">ISBN: ${book.isbn}</small></td>
                    <td data-label="Author">${author}</td>
                    <td data-label="Category">${category}</td>
                    <td data-label="Stock">${stockHtml}</td>
            `;

            // Add Request/Reserve Button for students
            if (currentUser.role === 'student') {
                if (book.available_copies > 0) {
                    rowHtml += `<td style="text-align:right;"><button class="btn btn-secondary" style="padding: 0.4rem 0.8rem;" onclick="requestBook(${book.book_id})">Request</button></td>`;
                } else {
                    let outOfStockText = '';
                    if (book.expected_available_date) {
                        const expectedDate = new Date(book.expected_available_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
                        const daysText = book.days_left < 0 ? 'Overdue!' : `in ${book.days_left} days`;
                        outOfStockText = `
                            <div style="font-size: 0.8rem; color: var(--text-muted); text-align: right; margin-bottom: 5px; line-height: 1.4;">
                                <span style="display:block; color:var(--warning); font-weight:600;">Available ${daysText}</span>
                                <span style="display:block;">Issued to: ${book.issued_to_id || 'Unknown'}</span>
                                <span style="display:block;">Due date: ${expectedDate}</span>
                            </div>
                        `;
                    } else {
                        outOfStockText = `<small style="color:var(--danger);">Out of Stock</small><br>`;
                    }
                    rowHtml += `<td style="text-align:right;">
                                    ${outOfStockText}
                                    <button class="btn btn-secondary" style="padding: 0.4rem 0.8rem; margin-top: 4px; border-color:var(--warning); color:var(--warning);" onclick="requestBook(${book.book_id})">Reserve (Hold)</button>
                                </td>`;
                }
            }

            rowHtml += `</tr>`;
            tbody.innerHTML += rowHtml;
        });
    } catch (error) {
        showToast("Error loading books: " + error.message, false);
    }
}

// Live filter for books catalog
function filterBooks() {
    const query = document.getElementById('book-search').value.toLowerCase();
    const rows = document.querySelectorAll('#table-books tbody tr');

    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
    });
}

// Fetch and render Smart Recommendations (Student Only)
async function loadRecommendations() {
    if (currentUser.role !== 'student') return;
    
    try {
        const res = await fetch(`${API_URL}/recommendations/${currentUser.id}`);
        const result = await res.json();

        if (!result.success) throw new Error(result.message);

        const recSection = document.getElementById('recommendations-section');
        const recContainer = document.getElementById('recommendations-container');
        
        if (result.data.length === 0) {
            recSection.style.display = 'none';
            return;
        }

        recSection.style.display = 'block';
        recContainer.innerHTML = '';

        result.data.forEach(book => {
            const author = (book.author_first && book.author_last) ? `${book.author_first} ${book.author_last}` : 'Unknown Author';
            const stockColor = book.available_copies > 0 ? 'var(--success)' : 'var(--danger)';
            
            let btnHtml = '';
            if (book.available_copies > 0) {
                btnHtml = `<button class="btn btn-primary" style="width:100%; padding:0.5rem;" onclick="requestBook(${book.book_id})">Request Book</button>`;
            } else {
                btnHtml = `<button class="btn btn-secondary" style="width:100%; padding:0.5rem;" disabled>Out of Stock</button>`;
            }

            const card = document.createElement('div');
            card.style.cssText = 'background: rgba(255,255,255,0.05); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-light);';
            card.innerHTML = `
                <div style="font-size: 0.8rem; color: var(--primary); font-weight: 600; margin-bottom: 0.5rem;">${book.category_name || 'General'}</div>
                <h4 style="margin-bottom: 0.5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${book.title}">${book.title}</h4>
                <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem;">${author}</p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; font-size: 0.85rem;">
                    <span><span style="color:${stockColor}; font-weight:bold;">${book.available_copies}</span>/${book.total_copies} Left</span>
                    <span>⭐ ${book.popularity || 0} borrows</span>
                </div>
                ${btnHtml}
            `;
            recContainer.appendChild(card);
        });

    } catch (error) {
        console.error("Error loading recommendations:", error);
    }
}

// Fetch and render Due Date Reminders (Student Only)
async function loadReminders() {
    if (currentUser.role !== 'student') return;

    try {
        const res = await fetch(`${API_URL}/reminders/${currentUser.id}`);
        const result = await res.json();

        if (!result.success) throw new Error(result.message);

        const bell = document.getElementById('notification-bell');
        const badge = document.getElementById('reminder-badge');
        const list = document.getElementById('reminders-list');

        if (result.data.length > 0) {
            bell.style.display = 'block';
            badge.style.display = 'block';
            badge.innerText = result.data.length;

            list.innerHTML = '';
            result.data.forEach(rem => {
                const urgencyColor = rem.days_left < 0 ? 'var(--danger)' : 'var(--warning)';
                const urgencyText = rem.days_left < 0 ? `${Math.abs(rem.days_left)} Days Overdue!` : `Due in ${rem.days_left} Days`;
                
                list.innerHTML += `
                    <div style="background: rgba(255,255,255,0.05); border-left: 4px solid ${urgencyColor}; padding: 1rem; border-radius: 4px;">
                        <div style="font-weight: 600; font-size: 1.1rem; margin-bottom: 5px;">${rem.title}</div>
                        <div style="font-size: 0.9rem; color: var(--text-muted);">
                            Due Date: <span style="color: white;">${new Date(rem.due_date).toLocaleDateString()}</span>
                        </div>
                        <div style="color: ${urgencyColor}; font-weight: bold; margin-top: 5px; font-size: 0.9rem;">
                            ⚠️ ${urgencyText}
                        </div>
                    </div>
                `;
            });

            // Auto-open modal on first load if they have reminders
            if (!sessionStorage.getItem('reminders_shown')) {
                openModal('modal-reminders');
                sessionStorage.setItem('reminders_shown', 'true');
            }
        } else {
            bell.style.display = 'none';
        }

    } catch (error) {
        console.error("Error loading reminders:", error);
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
                    <td data-label="ID">#${mem.member_id}</td>
                    <td data-label="Univ ID">${mem.university_id}</td>
                    <td style="font-weight: 500;" data-label="Name">${mem.first_name} ${mem.last_name}</td>
                    <td data-label="Email">${mem.email}</td>
                    <td data-label="Type"><span style="background:#e5e7eb; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; color:#111;">${mem.member_type}</span></td>
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
        const theadTr = document.querySelector('#table-borrowings thead tr');

        // Add Action column header dynamically if student
        if (currentUser.role === 'student' && !document.getElementById('th-borrow-action')) {
            theadTr.innerHTML += `<th id="th-borrow-action" style="text-align:right;">Action</th>`;
        }

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
                <td style="font-weight: 500;" data-label="Book Information">${rec.book_title}</td>
                <td data-label="Issue Date">${new Date(rec.borrow_date).toLocaleDateString()}</td>
                <td data-label="Due Date">${new Date(rec.due_date).toLocaleDateString()}</td>
                <td style="color: ${dueColor}; font-weight: 600;" data-label="Status">${rec.days_left < 0 ? Math.abs(rec.days_left) + ' days overdue' : rec.days_left + ' days left'}</td>
            `;

            if (currentUser.role === 'student') {
                if (rec.status === 'Borrowed') {
                    rowHtml += `<td style="text-align:right;"><button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size:0.8rem; border-color:var(--success); color:var(--success)" onclick="returnBook(${rec.record_id})">Return Book</button></td>`;
                } else {
                    rowHtml += `<td style="text-align:right;"><span style="font-size:0.8rem; color:var(--text-muted)">${rec.status}</span></td>`;
                }
            }

            rowHtml += `</tr>`;

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
                    <td data-label="ID"><b>#${req.record_id}</b></td>
                    <td data-label="Member">${req.member_first_name} ${req.member_last_name} <small>(${req.university_id})</small></td>
                    <td style="font-weight: 500;" data-label="Book">${req.book_title}</td>
                    <td data-label="Requested On">${new Date(req.borrow_date).toLocaleDateString()}</td>
                    <td data-label="Actions">
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

// Student-specific return function
async function returnBook(record_id) {
    if (!confirm("Are you sure you want to return this book?")) return;

    try {
        const res = await fetch(`${API_URL}/return`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ record_id })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message);

        showToast(result.message, true);
        loadBorrowings(); // Refresh the list
        loadBooks(); // Refresh stock in catalog
        loadDashboardStats();
    } catch (error) {
        showToast(error.message, false);
    }
}

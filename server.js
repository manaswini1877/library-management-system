const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Database configuration
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '', // Ensure this matches your Workbench password!
    database: 'University_ERP_DB',
    multipleStatements: true
};

// Create a connection pool
const pool = mysql.createPool(dbConfig);

// Test the database connection on startup
pool.getConnection()
    .then(connection => {
        console.log('Successfully connected to the MySQL Database (University_ERP_DB).');
        connection.release();
    })
    .catch(err => {
        console.error('Failed to connect to MySQL Database. Is it running? Error:', err.message);
    });

// ----------------------------------------------------------------------------
// ENDPOINT 1: GET /schema
// Dynamically fetches the database structure: Tables and their Columns
// ----------------------------------------------------------------------------
app.get('/schema', async (req, res) => {
    try {
        const [tablesResult] = await pool.query('SHOW TABLES');
        let schema = {};

        if (tablesResult.length > 0) {
            const tableKey = Object.keys(tablesResult[0])[0];
            for (const row of tablesResult) {
                const tableName = row[tableKey];
                const [describeResult] = await pool.query(`DESCRIBE \`${tableName}\``);
                schema[tableName] = describeResult;
            }
        }
        res.json({ success: true, schema });
    } catch (error) {
        console.error('Schema Fetch Error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ----------------------------------------------------------------------------
// ENDPOINT 2: POST /execute
// Executes raw SQL queries and returns the dynamic results
// ----------------------------------------------------------------------------
app.post('/execute', async (req, res) => {
    const { query } = req.body;

    if (!query || query.trim() === '') {
        return res.status(400).json({ success: false, message: 'SQL query cannot be empty.' });
    }

    try {
        const [results, fields] = await pool.query(query);

        if (!Array.isArray(results)) {
            return res.json({
                success: true,
                results: [{ affectedRows: results.affectedRows, changedRows: results.changedRows, insertId: results.insertId }]
            });
        }
        res.json({ success: true, results, fields });
    } catch (error) {
        console.error('SQL Execution Error:', error.message);
        res.status(400).json({ success: false, message: error.message });
    }
});

// ============================================================================
// LMS SPECIFIC REST API ENDPOINTS
// ============================================================================

// --- AUTHENTICATION ---

// POST /api/login: Validate user and return role/session info
app.post('/api/login', async (req, res) => {
    const { username, password, role } = req.body;

    try {
        if (role === 'admin') {
            const [rows] = await pool.query('SELECT * FROM Admins WHERE username = ? AND password = ?', [username, password]);
            if (rows.length > 0) {
                return res.json({ success: true, user: { id: rows[0].admin_id, name: rows[0].username, role: 'admin' } });
            }
        } else if (role === 'student') {
            // Using email as the username for students
            const [rows] = await pool.query('SELECT * FROM Members WHERE email = ? AND password = ?', [username, password]);
            if (rows.length > 0) {
                return res.json({ success: true, user: { id: rows[0].member_id, name: rows[0].first_name, role: 'student' } });
            }
        }
        res.status(401).json({ success: false, message: 'Invalid credentials. Please try again.' });
    } catch (error) {
        console.error('Login Error:', error.message);
        res.status(500).json({ success: false, message: 'Server error during authentication.' });
    }
});

// --- BOOKS ---

// GET /api/books: Fetch all books
app.get('/api/books', async (req, res) => {
    try {
        const query = `
            SELECT b.book_id, b.title, b.isbn, b.publication_year, 
                   c.category_name, a.first_name AS author_first, a.last_name AS author_last, 
                   b.total_copies, b.available_copies
            FROM Books b
            LEFT JOIN Categories c ON b.category_id = c.category_id
            LEFT JOIN Authors a ON b.author_id = a.author_id
            ORDER BY b.title ASC
        `;
        const [results] = await pool.query(query);
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Fetch Books Error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/books: Add a new book
app.post('/api/books', async (req, res) => {
    const { title, isbn, publication_year, category_id, author_id, total_copies } = req.body;
    try {
        const query = `
            INSERT INTO Books (title, isbn, publication_year, category_id, author_id, total_copies, available_copies)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [title, isbn, publication_year, category_id, author_id, total_copies, total_copies];
        const [result] = await pool.query(query, values);
        res.json({ success: true, message: 'Book added successfully!', book_id: result.insertId });
    } catch (error) {
        console.error('Add Book Error:', error.message);
        res.status(400).json({ success: false, message: error.message });
    }
});

// --- MEMBERS ---

// GET /api/members: Fetch all registered members
app.get('/api/members', async (req, res) => {
    try {
        const [results] = await pool.query('SELECT * FROM Members ORDER BY last_name ASC');
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Fetch Members Error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- TRANSACTIONS ---

// GET /api/borrowings: Fetch active borrowings (ALL)
app.get('/api/borrowings', async (req, res) => {
    try {
        const [results] = await pool.query("SELECT * FROM Active_Borrowings_View WHERE status = 'Borrowed' ORDER BY days_left ASC");
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Fetch Borrowings Error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/requests: Fetch pending book requests (Admin Only)
app.get('/api/requests', async (req, res) => {
    try {
        const [results] = await pool.query("SELECT * FROM Active_Borrowings_View WHERE status = 'Requested' ORDER BY borrow_date ASC");
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Fetch Requests Error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/student-borrowings/:member_id - Fetch borrowings AND requests for student
app.get('/api/student-borrowings/:member_id', async (req, res) => {
    const { member_id } = req.params;
    try {
        const query = `
            SELECT br.record_id, b.title AS book_title, br.borrow_date, br.due_date, 
                   br.status, DATEDIFF(br.due_date, CURDATE()) AS days_left
            FROM Borrow_Records br
            JOIN Books b ON br.book_id = b.book_id
            WHERE br.member_id = ? AND br.status IN ('Borrowed', 'Requested')
            ORDER BY br.status DESC, days_left ASC
        `;
        const [results] = await pool.query(query, [member_id]);
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Fetch Student Borrowings Error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/request-book: Student requests a book
app.post('/api/request-book', async (req, res) => {
    const { book_id, member_id } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Check if book exists and has copies
        const [bookCheck] = await connection.query('SELECT available_copies FROM Books WHERE book_id = ? FOR UPDATE', [book_id]);
        if (bookCheck.length === 0 || bookCheck[0].available_copies <= 0) {
            throw new Error('Book is currently unavailable.');
        }

        // 2. Check if student already requested or borrowed this exact book
        const [existing] = await connection.query("SELECT * FROM Borrow_Records WHERE book_id = ? AND member_id = ? AND status IN ('Requested', 'Borrowed')", [book_id, member_id]);
        if (existing.length > 0) {
            throw new Error('You already have a pending request or active borrowing for this book.');
        }

        // 3. Insert Request Record (14 days default due date from whenever it gets approved)
        // We set due_date relative to borrow_date in the database, but since borrow_date is CURDATE() for requests,
        // we'll update it later on approval.
        const insertQuery = `
            INSERT INTO Borrow_Records (book_id, member_id, borrow_date, due_date, status)
            VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 14 DAY), 'Requested')
        `;
        await connection.query(insertQuery, [book_id, member_id]);

        await connection.commit();
        res.json({ success: true, message: 'Book requested successfully. Waiting for Admin approval.' });
    } catch (error) {
        await connection.rollback();
        console.error('Request Book Error:', error.message);
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

// POST /api/approve-request: Admin approves a book
app.post('/api/approve-request', async (req, res) => {
    const { record_id } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [recordCheck] = await connection.query("SELECT book_id, status FROM Borrow_Records WHERE record_id = ? FOR UPDATE", [record_id]);
        if (recordCheck.length === 0) throw new Error('Request not found.');
        if (recordCheck[0].status !== 'Requested') throw new Error('Record is not in Requested state.');

        const book_id = recordCheck[0].book_id;

        // Check stock again before approving
        const [bookCheck] = await connection.query('SELECT available_copies FROM Books WHERE book_id = ? FOR UPDATE', [book_id]);
        if (bookCheck.length === 0 || bookCheck[0].available_copies <= 0) {
            throw new Error('Sorry, the book ran out of stock before this request could be approved.');
        }

        // We must update the borrow_date to TODAY and due_date to 14 days from TODAY, since it might have been requested days ago
        await connection.query("UPDATE Borrow_Records SET status = 'Borrowed', borrow_date = CURDATE(), due_date = DATE_ADD(CURDATE(), INTERVAL 14 DAY) WHERE record_id = ?", [record_id]);

        // Manual stock update (Because trigger might not fire on UPDATE depending on our SQL setup for 'Update_Stock_Trigger' which is set to AFTER INSERT in our case)
        await connection.query('UPDATE Books SET available_copies = available_copies - 1 WHERE book_id = ?', [book_id]);

        await connection.commit();
        res.json({ success: true, message: 'Request Approved. Book issued successfully.' });
    } catch (error) {
        await connection.rollback();
        console.error('Approve Request Error:', error.message);
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

// POST /api/reject-request: Admin rejects a book
app.post('/api/reject-request', async (req, res) => {
    const { record_id } = req.body;
    try {
        const [result] = await pool.query("UPDATE Borrow_Records SET status = 'Rejected' WHERE record_id = ? AND status = 'Requested'", [record_id]);
        if (result.affectedRows === 0) throw new Error('Request not found or already processed.');
        res.json({ success: true, message: 'Request has been rejected.' });
    } catch (error) {
        console.error('Reject Request Error:', error.message);
        res.status(400).json({ success: false, message: error.message });
    }
});

// POST /api/borrow: Issue a book to a member (Direct Admin Issue)
app.post('/api/borrow', async (req, res) => {
    const { book_id, member_id, due_date } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [bookCheck] = await connection.query('SELECT available_copies FROM Books WHERE book_id = ? FOR UPDATE', [book_id]);
        if (bookCheck.length === 0 || bookCheck[0].available_copies <= 0) {
            throw new Error('Book is currently unavailable.');
        }

        const insertQuery = `
            INSERT INTO Borrow_Records (book_id, member_id, borrow_date, due_date, status)
            VALUES (?, ?, CURDATE(), ?, 'Borrowed')
        `;
        await connection.query(insertQuery, [book_id, member_id, due_date]);

        await connection.commit();
        res.json({ success: true, message: 'Book issued successfully.' });
    } catch (error) {
        await connection.rollback();
        console.error('Borrow Book Error:', error.message);
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

// POST /api/return: Mark a book as returned
app.post('/api/return', async (req, res) => {
    const { record_id } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [recordCheck] = await connection.query('SELECT book_id, status FROM Borrow_Records WHERE record_id = ? FOR UPDATE', [record_id]);
        if (recordCheck.length === 0) throw new Error('Record not found.');
        if (recordCheck[0].status === 'Returned') throw new Error('Book is already marked as returned.');

        const book_id = recordCheck[0].book_id;

        await connection.query("UPDATE Borrow_Records SET status = 'Returned', return_date = CURDATE() WHERE record_id = ?", [record_id]);
        await connection.query('UPDATE Books SET available_copies = available_copies + 1 WHERE book_id = ?', [book_id]);

        await connection.commit();
        res.json({ success: true, message: 'Book returned successfully.' });
    } catch (error) {
        await connection.rollback();
        console.error('Return Book Error:', error.message);
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Backend Server is running elegantly at http://localhost:${port}`);
});

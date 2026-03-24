const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();

// Log every request to help debug Render deployment
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

const port = process.env.PORT || 3000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static(__dirname)); // Serve frontend files (HTML/CSS/JS) automatically 

// Health check to verify the server is actually responding
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', version: '1.0.7', database: !!pool });
});

// Database configuration
let dbConfig;
if (process.env.DATABASE_URL) {
    dbConfig = process.env.DATABASE_URL;
    console.log('[Startup] Using DATABASE_URL for connection...');
} else {
    dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'University_ERP_DB',
        port: process.env.DB_PORT || 3306,
        ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : false,
        multipleStatements: true,
        waitForConnections: true,
        connectionLimit: 10
    };
    console.log(`[Startup] Using individual variables for ${dbConfig.host}...`);
}

// Create a connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection immediately
pool.getConnection()
    .then(conn => {
        console.log('[Startup] ✅ Database connection successful!');
        conn.release();
    })
    .catch(err => {
        console.error('[Startup] ❌ Database connection failed:', err.message);
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

// POST /api/register: Register a new student member
app.post('/api/register', async (req, res) => {
    const { first_name, last_name, university_id, email, department, password } = req.body;

    try {
        if (!first_name || !university_id || !email || !password || !department) {
            return res.status(400).json({ success: false, message: 'Please provide all required fields.' });
        }

        const query = `
            INSERT INTO Members (first_name, last_name, university_id, email, department, password, member_type, join_date)
            VALUES (?, ?, ?, ?, ?, ?, 'Student', CURDATE())
        `;
        
        await pool.query(query, [first_name, last_name, university_id, email, department, password]);
        
        res.json({ success: true, message: 'Registration successful.' });
    } catch (error) {
        console.error('Registration Error:', error.message);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'An account with this Email or University ID already exists.' });
        }
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});

// --- BOOKS ---

// GET /api/books: Fetch all books
app.get('/api/books', async (req, res) => {
    try {
        const query = `
            SELECT b.book_id, b.title, b.isbn, b.publication_year, 
                   c.category_name, a.first_name AS author_first, a.last_name AS author_last, 
                   b.total_copies, b.available_copies,
                   (SELECT due_date FROM Borrow_Records br WHERE br.book_id = b.book_id AND br.status = 'Borrowed' ORDER BY due_date ASC LIMIT 1) AS expected_available_date,
                   (SELECT DATEDIFF(due_date, CURDATE()) FROM Borrow_Records br WHERE br.book_id = b.book_id AND br.status = 'Borrowed' ORDER BY due_date ASC LIMIT 1) AS days_left,
                   (SELECT m.university_id FROM Borrow_Records br JOIN Members m ON br.member_id = m.member_id WHERE br.book_id = b.book_id AND br.status = 'Borrowed' ORDER BY br.due_date ASC LIMIT 1) AS issued_to_id
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

// GET /api/recommendations/:member_id
app.get('/api/recommendations/:member_id', async (req, res) => {
    const { member_id } = req.params;
    try {
        const recQuery = `
            SELECT b.book_id, b.title, b.isbn, b.publication_year, 
                   c.category_name, a.first_name AS author_first, a.last_name AS author_last, 
                   b.total_copies, b.available_copies,
                   COUNT(br_all.record_id) AS popularity
            FROM Books b
            LEFT JOIN Categories c ON b.category_id = c.category_id
            LEFT JOIN Authors a ON b.author_id = a.author_id
            LEFT JOIN Borrow_Records br_all ON b.book_id = br_all.book_id
            WHERE b.book_id NOT IN (
                SELECT book_id FROM Borrow_Records WHERE member_id = ?
            )
            AND (
                b.category_id IN (
                    SELECT DISTINCT b_hist.category_id 
                    FROM Borrow_Records br_hist
                    JOIN Books b_hist ON br_hist.book_id = b_hist.book_id
                    WHERE br_hist.member_id = ?
                )
                OR c.category_name = (SELECT department FROM Members WHERE member_id = ?)
                OR NOT EXISTS (
                    SELECT 1 FROM Borrow_Records WHERE member_id = ?
                )
            )
            GROUP BY b.book_id
            ORDER BY popularity DESC, b.title ASC
            LIMIT 4
        `;
        const [results] = await pool.query(recQuery, [member_id, member_id, member_id, member_id]);
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Fetch Recommendations Error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/reminders/:member_id
app.get('/api/reminders/:member_id', async (req, res) => {
    const { member_id } = req.params;
    try {
        const query = `
            SELECT br.record_id, b.title, br.due_date, br.status, DATEDIFF(br.due_date, CURDATE()) AS days_left
            FROM Borrow_Records br
            JOIN Books b ON br.book_id = b.book_id
            WHERE br.member_id = ? AND br.status IN ('Borrowed', 'Overdue')
            AND DATEDIFF(br.due_date, CURDATE()) <= 3
            ORDER BY days_left ASC
        `;
        const [results] = await pool.query(query, [member_id]);
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Fetch Reminders Error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- MEMBERS ---
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
app.get('/api/borrowings', async (req, res) => {
    try {
        const [results] = await pool.query("SELECT * FROM Active_Borrowings_View WHERE status = 'Borrowed' ORDER BY days_left ASC");
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Fetch Borrowings Error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/requests', async (req, res) => {
    try {
        const [results] = await pool.query("SELECT * FROM Active_Borrowings_View WHERE status = 'Requested' ORDER BY borrow_date ASC");
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Fetch Requests Error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

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

app.post('/api/request-book', async (req, res) => {
    const { book_id, member_id } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [bookCheck] = await connection.query('SELECT available_copies FROM Books WHERE book_id = ? FOR UPDATE', [book_id]);
        if (bookCheck.length === 0) throw new Error('Book not found.');
        const isWaitlisted = bookCheck[0].available_copies <= 0;
        const [existing] = await connection.query("SELECT * FROM Borrow_Records WHERE book_id = ? AND member_id = ? AND status IN ('Requested', 'Borrowed', 'Waitlisted')", [book_id, member_id]);
        if (existing.length > 0) throw new Error('Already have an active request/borrowing.');
        const statusToInsert = isWaitlisted ? 'Waitlisted' : 'Requested';
        await connection.query('INSERT INTO Borrow_Records (book_id, member_id, borrow_date, due_date, status) VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 14 DAY), ?)', [book_id, member_id, statusToInsert]);
        await connection.commit();
        res.json({ success: true, message: isWaitlisted ? 'Reserved (Waitlist)' : 'Requested' });
    } catch (error) {
        await connection.rollback();
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

app.post('/api/approve-request', async (req, res) => {
    const { record_id } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [recordCheck] = await connection.query("SELECT book_id, status FROM Borrow_Records WHERE record_id = ? FOR UPDATE", [record_id]);
        if (recordCheck.length === 0 || recordCheck[0].status !== 'Requested') throw new Error('Invalid request.');
        const book_id = recordCheck[0].book_id;
        const [bookCheck] = await connection.query('SELECT available_copies FROM Books WHERE book_id = ? FOR UPDATE', [book_id]);
        if (bookCheck[0].available_copies <= 0) throw new Error('No stock.');
        await connection.query("UPDATE Borrow_Records SET status = 'Borrowed', borrow_date = CURDATE(), due_date = DATE_ADD(CURDATE(), INTERVAL 14 DAY) WHERE record_id = ?", [record_id]);
        await connection.query('UPDATE Books SET available_copies = available_copies - 1 WHERE book_id = ?', [book_id]);
        await connection.commit();
        res.json({ success: true, message: 'Approved' });
    } catch (error) {
        await connection.rollback();
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

app.post('/api/reject-request', async (req, res) => {
    const { record_id } = req.body;
    try {
        await pool.query("UPDATE Borrow_Records SET status = 'Rejected' WHERE record_id = ? AND status = 'Requested'", [record_id]);
        res.json({ success: true, message: 'Rejected' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.post('/api/return', async (req, res) => {
    const { record_id } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [recordCheck] = await connection.query('SELECT book_id, status FROM Borrow_Records WHERE record_id = ? FOR UPDATE', [record_id]);
        if (recordCheck.length === 0 || recordCheck[0].status === 'Returned') throw new Error('Invalid record.');
        const book_id = recordCheck[0].book_id;
        await connection.query("UPDATE Borrow_Records SET status = 'Returned', return_date = CURDATE() WHERE record_id = ?", [record_id]);
        const [waitlistCheck] = await connection.query("SELECT record_id FROM Borrow_Records WHERE book_id = ? AND status = 'Waitlisted' ORDER BY record_id ASC LIMIT 1 FOR UPDATE", [book_id]);
        if (waitlistCheck.length > 0) {
            await connection.query("UPDATE Borrow_Records SET status = 'Requested', borrow_date = CURDATE() WHERE record_id = ?", [waitlistCheck[0].record_id]);
        }
        await connection.query('UPDATE Books SET available_copies = available_copies + 1 WHERE book_id = ?', [book_id]);
        await connection.commit();
        res.json({ success: true, message: 'Returned' });
    } catch (error) {
        await connection.rollback();
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

// Start the server
app.listen(port, '0.0.0.0', () => {
    console.log('==============================================');
    console.log(`🚀 LMS SERVER LIVE AT PORT ${port}`);
    console.log('==============================================');
});

# Library Management System

A comprehensive Library Management System (LMS) designed for universities to manage books, members (students and faculty), and borrowing records efficiently. The system includes an intuitive interface for both users and administrators, powered by a robust backend and a relational database.

## Features

*   **Role-Based Access Control:** Distinct interfaces and permissions for Students, Faculty, and Administrators (Librarians).
*   **Book Management:** Categorize books, manage authors, and track stock/available copies automatically via database triggers.
*   **Borrowing System:** Seamlessly handle book requests, borrowing, and returns, while tracking due dates and overdue statuses.
*   **Dashboard & Views:** Active borrowings view and dashboard analytics.
*   **RESTful API:** Node.js and Express backend handling secure communication between the frontend and the MySQL database.

## Tech Stack

*   **Frontend:** HTML5, CSS3, JavaScript
*   **Backend:** Node.js, Express.js
*   **Database:** MySQL Server (managed via `mysql2` package)
*   **Other Tools:** CORS for cross-origin requests

## Prerequisites

*   **Node.js** (v14 or higher recommended)
*   **MySQL Server** (Running locally or on a server)

## Setup & Installation

1.  **Clone the Repository** (If applicable):
    ```bash
    git clone <repository-url>
    cd "Library Management system"
    ```

2.  **Install Dependencies:**
    Navigate to the project directory and run:
    ```bash
    npm install
    ```

3.  **Database Configuration:**
    *   Open your MySQL environment.
    *   Run the provided `database.sql` script to create the `University_ERP_DB` database, tables, views, triggers, and insert dummy data.
    *   Update the database connection settings (host, user, password, database) in `server.js` matching your MySQL environment.

4.  **Start the Server:**
    ```bash
    npm start
    ```
    (This runs `node server.js`)

5.  **Access the Application:**
    Open your web browser and navigate to the application (e.g., `index.html` or `http://localhost:3000` depending on the server configuration).

## Database Schema Highlights

The application relies on the `University_ERP_DB` database with the following core tables:
*   `Books`: Stores book details including title, ISBN, associated category, author, and available copies.
*   `Members`: Stores student and faculty details.
*   `Categories` & `Authors`: Relational metadata for books.
*   `Borrow_Records`: Tracks the lifecycle of a borrow request (Requested, Borrowed, Returned, Overdue).
*   `Admins`: Stores librarian credentials.

Database triggers are included to automatically update available book copies when a book is borrowed.

## License

ISC License

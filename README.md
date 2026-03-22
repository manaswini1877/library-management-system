# 📚 Advanced Library Management System (LMS)

A state-of-the-art Library Management System built with a focus on user experience, smart automation, and fair book allocation. Designed for a modern university environment using a high-performance Node.js backend and a sleek Glassmorphism UI.

## 🌟 Key Features

### 👤 Role-Based Access Control
- **Two Unique Dashboards**: Seamlessly switch between **Admin (Librarian)** and **Student/Faculty** interfaces with protected routes and custom features.
- **Smart Registration**: New users can register with department selection (CS, Physics, Math, etc.) to power personalized content from day one.

### 🔍 Interactive Book Catalog
- **Live Search**: Instant filtering by **Title**, **Author**, or **ISBN**, allowing students to find books in milliseconds.
- **Detailed Availability**: Shows real-time stock levels, and if out of stock, it displays **who** has the book, **when** it's due, and exactly **how many days** are left.

### 🧠 Smart Recommendation System
- Finds your next great read by analyzing:
  - **Your Borrowing History**: Personalized to your past interests.
  - **Your Department**: Specifically suggests books related to your major.
  - **Global Popularity**: Dynamically ranks books based on overall library borrowing trends.

### 📅 Advanced Reservation & Waitlist
- **Fair Allocation**: Students can "Reserve (Hold)" out-of-stock books to join a waiting list.
- **Automation**: When a copy is returned, the system automatically promotes the next person in line to "Requested" status for admin approval.

### 🔔 Due Date Reminders
- **Notification Bell**: A live badge count in the student dashboard for urgent items.
- **Auto-Popups**: Action Required modals automatically appear on login if you have books due within 3 days or already overdue.

### ⚙️ Admin & Management Tools
- **Full Control**: Add/Edit/Delete books and categories directly from the UI.
- **Workflow Management**: A central "Pending Requests" queue for processing check-outs.
- **Member Overview**: View and manage all registered library members.
- **Self-Service**: Students can return their own books instantly from their dashboard.

## 🛠️ Tech Stack
- **Frontend**: HTML5, Vanilla CSS3 (Custom Glassmorphism Design), JavaScript (ES6+)
- **Backend**: Node.js & Express.js
- **Database**: MySQL Server (Managed via `mysql2/promise`)
- **API**: RESTful architecture

## 🚀 Setup & Installation

1.  **Clone the Repository**:
    ```bash
    git clone <repository-url>
    cd "Library Management system"
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Database Configuration**:
    - Import the provided `database.sql` into your MySQL Server.
    - Update the database credentials in `server.js`.

4.  **Start the Server**:
    ```bash
    node server.js
    ```

5.  **Access the Application**:
    Open [http://localhost:3000/login.html](http://localhost:3000/login.html) in your browser.

---
**License**: ISC License

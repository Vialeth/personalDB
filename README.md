# Personal Media Database

> Developed with **Google DeepMind's Antigravity** and **Gemini 3 Pro**.

This project is a self-hosted, minimalist database system designed to track personal film and book consumption. It was built to solve the limitations of commercial platforms (like Letterboxd or Goodreads) by offering full data ownership, offline capability, and specialized tracking features tailored to personal needs.

## Philosophy

The core goal is data sovereignty. Unlike cloud-based services, this application runs locally (or on a Raspberry Pi), ensuring that your reading and watching history remains private and accessible without an internet connection. It prioritizes speed, simplicity, and specific user-defined features over social networking functions.

## Features

*   **TMDB Integration:** Automatically fetches metadata (poster, director, year, rating) for films using the TMDB API.
*   **Custom Filtering:** Advanced filtering by director, genre, year, and watching status.
*   **Re-watch History:** Tracks multiple viewing dates for the same film, displaying a total count and a detailed history log.
*   **Cinema Mode:** Differentiates between films watched at home and films watched in a cinema theater.
*   **CSV Import (Notion):** Import your existing library exported from Notion or other CSV sources.
*   **Bulk Auto-Fetch:** A tool to verify and automatically populate missing metadata for imported libraries.
*   **Book Tracking:** (In Development) A dedicated section for tracking reading progress and library management.

## 📸 Screenshots

### 🎥 Films
| Showcase |
|:---:|
| ![Home Page](screenshots/home.png) |

| Archive (Filter & Search) | Analytics |
|:---:|:---:|
| ![Archive](screenshots/archive.png) | ![Stats](screenshots/stats.png) |

### 📚 Books
| Library & Tracking |
|:---:|
| ![Books Library](screenshots/books_lib.png) |

## Tech Stack

*   **Runtime:** Node.js
*   **Framework:** Express.js
*   **Database:** SQLite (via `better-sqlite3`) for a reliable, file-based database.
*   **Frontend:** Vanilla JavaScript and CSS (No heavy frameworks).

## Installation & Usage

This project is designed to be easily deployed on any system with Node.js support (local machine or Raspberry Pi).

### Prerequisites
*   Node.js (v18 or higher recommended)
*   npm (Node Package Manager)

### Setup Steps

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/yourusername/personal-db.git
    cd personal-db
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Initialize Database:**
    The project excludes the database file for privacy. You need to run the setup script to create a fresh, empty database schema.
    ```bash
    node setup_db.js
    ```

4.  **Start the Server:**
    ```bash
    npm start
    ```
    The application will be accessible at `http://localhost:3001`.

### Data Privacy Note
This repository contains only the application logic. The database files (`database/*.db`) and uploaded media (`public/uploads/`) are ignored by Git. When you run the project, it creates a local database that stays on your machine.

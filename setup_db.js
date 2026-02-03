const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, 'database');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir);
}

// Films Database
const filmsDb = new Database(path.join(dbDir, 'films.db'));
filmsDb.exec(`
    CREATE TABLE IF NOT EXISTS films (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        director TEXT,
        year INTEGER,
        rating REAL,
        description TEXT,
        imageUrl TEXT
    )
`);
console.log('Films database initialized');

// Books Database - NEW SCHEMA
const booksDbPath = path.join(dbDir, 'books.db');
// We effectively want to recreate it if it exists to apply the new schema cleanly for this overhaul.
// In a real prod env we would migrate, but for this personal project resetting is acceptable as per plan.
if (fs.existsSync(booksDbPath)) {
    // console.log('Backing up existing books.db to books.db.bak');
    // fs.renameSync(booksDbPath, path.join(dbDir, 'books.db.bak')); 
    // Actually, let's just alter table or create if not exists with new columns is safer if we want to keep data.
    // However, the user didn't mention keeping data and the schema is widely different.
    // Let's try to be non-destructive regarding the file, but strict on schema.
}

const booksDb = new Database(booksDbPath);

// Create table with new extended schema
booksDb.exec(`
    CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author TEXT,
        pageCount INTEGER,
        rating REAL,
        isbn TEXT,
        startDate TEXT,
        endDate TEXT,
        status TEXT, -- 'reading', 'read', 'dropped'
        genres TEXT, -- JSON string or CSV
        description TEXT,
        imageUrl TEXT,
        year INTEGER -- Keep year for publication year if needed, or derived from endDate for reading year
    )
`);

// Check if columns exist (simple migration for existing dev DB)
try {
    const columns = booksDb.prepare('PRAGMA table_info(books)').all();
    const columnNames = columns.map(c => c.name);

    if (!columnNames.includes('isbn')) booksDb.exec('ALTER TABLE books ADD COLUMN isbn TEXT');
    if (!columnNames.includes('startDate')) booksDb.exec('ALTER TABLE books ADD COLUMN startDate TEXT');
    if (!columnNames.includes('endDate')) booksDb.exec('ALTER TABLE books ADD COLUMN endDate TEXT');
    if (!columnNames.includes('status')) booksDb.exec('ALTER TABLE books ADD COLUMN status TEXT');
    if (!columnNames.includes('genres')) booksDb.exec('ALTER TABLE books ADD COLUMN genres TEXT');
    if (!columnNames.includes('pageCount')) booksDb.exec('ALTER TABLE books ADD COLUMN pageCount INTEGER');
    // comment is description.
} catch (e) {
    console.error('Migration error:', e);
}

console.log('Books database initialized with Extended Schema');

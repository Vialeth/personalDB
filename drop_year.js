const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database/books.db');
const db = new Database(dbPath);

try {
    console.log('Attempting to drop "year" column...');
    db.prepare('ALTER TABLE books DROP COLUMN year').run();
    console.log('Success: "year" column dropped.');
} catch (error) {
    if (error.message.includes('no such column')) {
        console.log('Column "year" does not exist (already removed?).');
    } else {
        console.error('Error dropping column:', error.message);
        // Fallback for older SQLite versions if needed (create new table, copy, drop old, rename)
        // But better-sqlite3 usually bundles a recent enough version.
    }
}

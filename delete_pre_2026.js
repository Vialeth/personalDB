const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'database/films.db'));

try {
    // Delete films with watchDate before 2026-01-01
    // Assuming format YYYY-MM-DD
    const result = db.prepare("DELETE FROM films WHERE watchDate < '2026-01-01'").run();
    console.log(`Deleted ${result.changes} films watched before 2026.`);
} catch (error) {
    console.error("Deletion failed:", error);
}

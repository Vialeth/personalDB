const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'database/films.db'));

try {
    db.prepare("ALTER TABLE films ADD COLUMN title_tr TEXT").run();
    console.log("Migration successful: title_tr column added.");
} catch (error) {
    if (error.message.includes("duplicate column name")) {
        console.log("Column title_tr already exists.");
    } else {
        console.error("Migration failed:", error);
    }
}

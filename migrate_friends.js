const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'films.db');
const db = new Database(dbPath);

console.log('Migrating database for Friend Mode...');

try {
    // Create Friends Table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();
    console.log('✅ Created "friends" table.');

    // Create Recommendations Table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS recommendations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filmTitle TEXT NOT NULL,
            tmdbId INTEGER,
            senderName TEXT NOT NULL,
            senderNote TEXT,
            status TEXT DEFAULT 'pending', -- pending, accepted, rejected, watched
            receivedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();
    console.log('✅ Created "recommendations" table.');

} catch (error) {
    console.error('❌ Migration Failed:', error.message);
}

console.log('Migration complete.');

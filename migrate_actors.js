const Database = require('better-sqlite3');
const path = require('path');

const dbVal = new Database(path.join(__dirname, 'database/films.db'));

console.log('Creating actors table...');

dbVal.exec(`
    CREATE TABLE IF NOT EXISTS actors (
        name TEXT PRIMARY KEY,
        imageUrl TEXT,
        bio TEXT,
        birthDate TEXT,
        placeOfBirth TEXT,
        tmdbId INTEGER,
        lastUpdated TEXT
    )
`);

console.log('Actors table created successfully.');

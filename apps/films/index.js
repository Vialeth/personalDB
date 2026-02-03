const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../../database/films.db'));

// Helper for layout
const renderPage = (content, title = 'Film Database') => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="/style.css">
    <body class="film-theme">
        <div class="container">
            <nav>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <a href="/" style="font-size: 1.5rem; text-decoration: none;">🏠</a>
                    <a href="/films" style="font-size: 1.5rem; font-weight: bold; text-decoration: none;">🎬 Films</a>
                </div>
                <div>
                     <a href="/films/add" class="btn btn-primary">Add Film</a>
                </div>
            </nav>
            ${content}
        </div>
    </body>
</html>
`;

// GET / - List all films
router.get('/', (req, res) => {
    const films = db.prepare('SELECT * FROM films ORDER BY id DESC').all();

    const filmsHtml = films.map(film => `
        <div class="card item-card">
            ${film.imageUrl ? `<img src="${film.imageUrl}" alt="${film.title}">` : '<div style="height: 300px; background: #334155; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center; margin-bottom: 1rem;">No Image</div>'}
            <div class="item-title">${film.title}</div>
            <div class="item-meta">
                <span>${film.year || 'Unknown Year'}</span> • 
                <span>${film.director || 'Unknown Director'}</span> • 
                <span style="color: #fbbf24">★ ${film.rating || 'N/A'}</span>
            </div>
            <div class="item-actions">
                <form action="/films/delete/${film.id}" method="POST" onsubmit="return confirm('Are you sure?');" style="margin:0">
                    <button type="submit" class="btn btn-sm btn-danger">Delete</button>
                </form>
            </div>
        </div>
    `).join('');

    res.send(renderPage(`
        <div class="grid">
            ${filmsHtml}
        </div>
    `));
});

// GET /add - Show add form
router.get('/add', (req, res) => {
    res.send(renderPage(`
        <div class="card" style="max-width: 600px; margin: 0 auto;">
            <h2>Add New Film</h2>
            <form action="/films/add" method="POST">
                <label>Title</label>
                <input type="text" name="title" required>
                
                <label>Director</label>
                <input type="text" name="director">
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div>
                        <label>Year</label>
                        <input type="number" name="year">
                    </div>
                    <div>
                        <label>Rating (0-10)</label>
                        <input type="number" name="rating" step="0.1" max="10">
                    </div>
                </div>

                <label>Image URL (Poster)</label>
                <input type="url" name="imageUrl">

                <label>Description</label>
                <textarea name="description" rows="4"></textarea>

                <button type="submit" class="btn btn-primary" style="width: 100%">Save Film</button>
            </form>
        </div>
    `, 'Add Film'));
});

// POST /add - Handle adding
router.post('/add', (req, res) => {
    const { title, director, year, rating, description, imageUrl } = req.body;
    const insert = db.prepare('INSERT INTO films (title, director, year, rating, description, imageUrl) VALUES (?, ?, ?, ?, ?, ?)');
    insert.run(title, director, year, rating, description, imageUrl);
    res.redirect('/films');
});

// POST /delete/:id
router.post('/delete/:id', (req, res) => {
    const deleteParams = db.prepare('DELETE FROM films WHERE id = ?');
    deleteParams.run(req.params.id);
    res.redirect('/films');
});

module.exports = router;

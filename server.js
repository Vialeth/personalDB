const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Template engine setup (simple placeholder replacement for now, or just sendFile)
// For this simple project, we can just use simple string replacement or separate HTML files.
// Let's keep it simple and serve static HTMLs for the landing and use routers for the apps.

// Routers
const filmsRouter = require('./apps/films');
const booksRouter = require('./apps/books');

// App Mounts
app.use('/films', filmsRouter);
app.use('/books', booksRouter);

// Landing Page
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Personal Database</title>
        <link rel="stylesheet" href="/style.css">
    </head>
    <body>
        <div class="landing-hero">
            <h1 class="landing-title">Personal Database</h1>
            <div class="choice-container">
                <a href="/films" class="choice-card card" style="border-top: 4px solid var(--accent-film)">
                    <span>🎬 Films</span>
                </a>
                <a href="/books" class="choice-card card" style="border-top: 4px solid var(--accent-book)">
                    <span>📚 Books</span>
                </a>
            </div>
        </div>
    </body>
    </html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
});

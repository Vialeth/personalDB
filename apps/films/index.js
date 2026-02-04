const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const db = new Database(path.join(__dirname, '../../database/films.db'));

// Multer Setup for Image Uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, '../../public/uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        // film-timestamp-random.ext
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'poster-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Helper: Get Unique Filter Data
const getFilterData = () => {
    const allFilms = db.prepare('SELECT director, genres, watchDate FROM films').all();

    // Directors
    const directors = [...new Set(allFilms.map(f => f.director).filter(d => d))].sort();

    // Genres
    const genreSet = new Set();
    allFilms.forEach(f => {
        if (f.genres) {
            try { JSON.parse(f.genres).forEach(g => genreSet.add(g)); } catch (e) { }
        }
    });
    const genres = [...genreSet].sort();

    // Years
    const years = [...new Set(allFilms.map(f => f.watchDate ? f.watchDate.substring(0, 4) : null).filter(y => y))].sort().reverse();

    return { directors, genres, years };
};

// Helper: Common Layout with Cinema Hall Theme
const renderPage = (content, title = 'Film Veritabanı', req = null) => {
    const editMode = req && req.query.edit === 'true';
    // Ensure we use the full path including mount point (/films)
    const currentPath = req ? (req.baseUrl + req.path) : '/films';

    // Construct toggle link preserving other query params
    let toggleUrl = currentPath;
    if (req) {
        const query = { ...req.query };
        if (editMode) {
            delete query.edit; // Turn off
        } else {
            query.edit = 'true'; // Turn on
        }

        const queryString = new URLSearchParams(query).toString();
        toggleUrl = queryString ? `${currentPath}?${queryString}` : currentPath;
    }

    return `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="/films.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&family=Oswald:wght@400;500;700&display=swap" rel="stylesheet">
</head>
<body class="film-theme">
    <div class="container">
        <header class="glass-header">
            <a href="/films" class="nav-brand">SİNEMA<span>SALONU</span></a>
            
            <nav class="glass-nav">
                <a href="/films" class="nav-item ${currentPath === '/films' ? 'active' : ''}">VİTRİN</a>
                <a href="/films/archive" class="nav-item ${currentPath === '/films/archive' ? 'active' : ''}">ARŞİV</a>
                <a href="/films/add" class="nav-item ${currentPath === '/films/add' ? 'active' : ''}">FİLM EKLE</a>
            </nav>

            <div class="header-controls">
                <a href="${toggleUrl}" class="control-btn ${editMode ? 'active' : ''}" title="${editMode ? 'Düzenlemeyi Kapat' : 'Düzenleme Modu'}">
                    ${editMode ? '🔒' : '✏️'}
                </a>
                <a href="/" class="control-btn exit-btn" title="Çıkış">⏏</a>
            </div>
        </header>

        <main class="content-wrapper">
            ${content}
        </main>
    </div>
</body>
</html>
`;
};

// Helper: Render Film Grid
const renderFilmGrid = (films, editMode = false) => {
    return films.map(film => {
        const isCinema = film.isCinema === 1;
        // Parse genres safely
        let genreList = [];
        try {
            if (film.genres && film.genres.trim().startsWith('[')) {
                genreList = JSON.parse(film.genres);
            } else if (film.genres) {
                // Handle legacy format or single string
                genreList = [film.genres];
            }
        } catch (e) { genreList = []; }

        const genreHtml = genreList.slice(0, 3).map(g => `<span class="mini-tag">${g}</span>`).join('');

        const dateDisplay = film.watchDate ? new Date(film.watchDate).toLocaleDateString('tr-TR', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
        const editActions = editMode ? `
            <div class="btn-actions">
                <a href="/films/edit/${film.id}" style="color:var(--ch-neon-cyan); font-size:0.8rem; text-decoration:none;">Düzenle</a>
                <form action="/films/delete/${film.id}" method="POST" style="margin:0;">
                    <button type="button" onclick="if(this.innerText.includes('Sil')) { this.innerText = 'Emin misin?'; this.style.color = '#ef4444'; } else { this.parentElement.submit(); }" style="background:none; border:none; color:#555; font-size:0.8rem; cursor:pointer; text-decoration:underline;">Sil</button>
                </form>
            </div>
        ` : '';

        return `
        <div class="film-card">
            <div class="poster-frame">
                ${film.imageUrl ? `<img src="${film.imageUrl}" alt="${film.title}" class="poster-img">` : '<div style="width:100%; height:100%; background:#222; display:flex; align-items:center; justify-content:center; color:#555;">AFİŞ YOK</div>'}
                ${isCinema ? `<div class="cinema-badge">SİNEMA</div>` : ''}
            </div>
            <div class="film-info">
                <div class="info-header">
                    <div class="film-title-group">
                        <div class="film-title" title="${film.title}">${film.title}</div>
                        <div class="film-director">${film.director || 'Yönetmen Yok'}</div>
                    </div>
                    <div class="film-rating-badge">
                        <span class="rating-value" style="font-size:1.4rem;">${film.rating || '-'}</span>
                    </div>
                </div>
                
                ${film.description ? `<div class="film-description" title="Okumak için tıklayın" onclick="this.classList.toggle('expanded')">${film.description}</div>` : ''}
                
                <div class="info-footer">
                    <div class="genre-list">${genreHtml}</div>
                    <div class="watch-date">${dateDisplay}</div>
                </div>
                ${editActions}
            </div>
        </div>
        `;
    }).join('');
};

// Helper: Render Form (Shared for Add & Edit)
const renderForm = (film = null) => {
    const isEdit = !!film;
    const action = isEdit ? `/films/edit/${film.id}` : '/films/add';
    const title = isEdit ? 'BİLETİ DÜZENLE' : 'YENİ GİRİŞ';
    const btnText = isEdit ? 'GÜNCELLE' : 'BİLETİ BAS';

    // Safety checks for values
    const val = (key) => film ? (film[key] || '') : '';
    const genres = film && film.genres ? JSON.parse(film.genres) : [];
    const isSelected = (g) => genres.includes(g) ? 'selected' : '';
    const isCinemaChecked = film && film.isCinema ? 'checked' : '';

    return `
        <div class="form-container">
            <h2 style="font-family:var(--ch-font-display); color:var(--ch-neon-red); margin-top:0;">${title}</h2>
            <form action="${action}" method="POST" enctype="multipart/form-data">
                <div class="form-group">
                    <label class="cinema-label">FİLM ADI</label>
                    <input type="text" name="title" class="cinema-input" value="${val('title')}" required>
                </div>
                
                <div class="form-group" style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
                    <div>
                        <label class="cinema-label">YÖNETMEN</label>
                        <input type="text" name="director" class="cinema-input" value="${val('director')}">
                    </div>
                    <div>
                        <label class="cinema-label">YIL</label>
                        <input type="number" name="year" class="cinema-input" value="${val('year')}">
                    </div>
                </div>

                <div class="form-group">
                    <label class="cinema-label">TÜRLER (Yazıp Enter'a basın)</label>
                    
                    <div class="genre-input-container" onclick="document.getElementById('genre-input').focus()">
                        <div id="genre-tags" style="display:contents;">
                            <!-- Tags will be dynamically added here -->
                        </div>
                        <input type="text" id="genre-input" class="genre-type-input" placeholder="Tür ekle..." list="genre-list" autocomplete="off">
                    </div>

                    <input type="hidden" name="genres" id="genres-hidden" value='${JSON.stringify(genres)}'>
                    
                    <datalist id="genre-list">
                        ${['Bilim-Kurgu', 'Dram', 'Aksiyon', 'Gerilim', 'Korku', 'Komedi', 'Macera', 'Gizem', 'Romantik', 'Animasyon', 'Suç', 'Fantastik', 'Biyografi', 'Aile', 'Müzikal', 'Müzik'].map(g => `<option value="${g}">`).join('')}
                    </datalist>

                    <script>
                        (function() {
                            const input = document.getElementById('genre-input');
                            const hiddenInput = document.getElementById('genres-hidden');
                            const tagsContainer = document.getElementById('genre-tags');
                            
                            // Initialize tags from hidden input
                            let currentGenres = [];
                            try {
                                currentGenres = JSON.parse(hiddenInput.value);
                            } catch(e) { currentGenres = []; }

                            function renderTags() {
                                tagsContainer.innerHTML = currentGenres.map(g => \`
                                    <div class="genre-tag">
                                        \${g}
                                        <span class="remove" onclick="removeGenre('\${g}')">&times;</span>
                                    </div>
                                \`).join('');
                                hiddenInput.value = JSON.stringify(currentGenres);
                            }

                            window.removeGenre = function(g) {
                                currentGenres = currentGenres.filter(item => item !== g);
                                renderTags();
                            };

                            input.addEventListener('keydown', function(e) {
                                if (e.key === 'Enter' || e.key === ',') {
                                    e.preventDefault();
                                    const val = this.value.trim();
                                    if (val && !currentGenres.includes(val)) {
                                        currentGenres.push(val);
                                        renderTags();
                                    }
                                    this.value = '';
                                }
                                if (e.key === 'Backspace' && this.value === '' && currentGenres.length > 0) {
                                    currentGenres.pop();
                                    renderTags();
                                }
                            });
                            
                            // Datalist selection event hack (input event)
                            input.addEventListener('input', function(e) {
                                const val = this.value;
                                const options = Array.from(document.getElementById('genre-list').options).map(o => o.value);
                                if (options.includes(val) && !currentGenres.includes(val)) {
                                    currentGenres.push(val);
                                    renderTags();
                                    this.value = '';
                                }
                            });

                            renderTags();
                        })();
                    </script>
                </div>

                <div class="form-group" style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
                    <div>
                         <label class="cinema-label">İZLENME TARİHİ</label>
                         <input type="date" name="watchDate" class="cinema-input" value="${val('watchDate')}">
                    </div>
                    <div>
                         <label class="cinema-label">PUAN (0-10)</label>
                         <input type="number" name="rating" step="0.1" max="10" class="cinema-input" value="${val('rating')}">
                    </div>
                </div>

                <div class="form-group">
                    <label class="cinema-label">AFİŞ GÖRSELİ ${isEdit ? '(Boş bırakılırsa değişmez)' : ''}</label>
                    <input type="file" name="image" class="cinema-input" accept="image/*">
                    ${isEdit && film.imageUrl ? `<small style="color:#666;">Mevcut: <a href="${film.imageUrl}" target="_blank" style="color:#888;">Görüntüle</a></small>` : ''}
                </div>

                <div class="form-group">
                     <label class="checkbox-wrapper">
                        <input type="checkbox" name="isCinema" value="1" ${isCinemaChecked}>
                        <span>SİNEMADA İZLENDİ <span style="color:var(--ch-neon-cyan);">(SALON)</span></span>
                     </label>
                </div>

                <div class="form-group">
                    <label class="cinema-label">NOTLAR / İNCELEME</label>
                    <textarea name="description" rows="3" class="cinema-input">${val('description')}</textarea>
                </div>

                <button type="submit" class="btn-cinema" style="width:100%; padding:1rem; font-size:1.1rem; background:rgba(0, 242, 255, 0.1);">${btnText}</button>
            </form>
        </div>
    `;
};

// GET / - Homepage (Current Year Only)
router.get('/', (req, res) => {
    const editMode = req.query.edit === 'true';
    const currentYear = new Date().getFullYear();

    // Only films watched in current year or later
    const films = db.prepare("SELECT * FROM films WHERE watchDate >= ? ORDER BY watchDate DESC, id DESC").all(`${currentYear}-01-01`);

    const stats = {
        total: films.length,
        cinema: films.filter(f => f.isCinema).length,
        avg: (films.reduce((a, b) => a + (b.rating || 0), 0) / (films.length || 1)).toFixed(1)
    };

    res.send(renderPage(`
        <div class="section-header">
            <h2 class="page-title">VİTRİN ${currentYear}</h2>
            <div class="cinema-stats">
                <div class="stat-item"><strong>${stats.total}</strong> FİLM</div>
                <div class="stat-item"><strong>${stats.cinema}</strong> SİNEMA</div>
                <div class="stat-item"><strong>${stats.avg}</strong> ORT.</div>
            </div>
        </div>
        <div class="film-grid">
            ${renderFilmGrid(films, editMode)}
        </div>
    `, 'Vizyon | Film Veritabanı', req));
});

// GET /archive - All Films with Filters
router.get('/archive', (req, res) => {
    const editMode = req.query.edit === 'true';
    const { director, genre, year, sort } = req.query;
    const filters = getFilterData();

    let query = "SELECT * FROM films WHERE 1=1";
    const params = [];

    if (director) { query += " AND director = ?"; params.push(director); }
    if (year) { query += " AND strftime('%Y', watchDate) = ?"; params.push(year); }
    if (genre) { query += " AND genres LIKE ?"; params.push(`%${genre}%`); }

    if (sort === 'rating_desc') query += " ORDER BY rating DESC";
    else if (sort === 'rating_asc') query += " ORDER BY rating ASC";
    else query += " ORDER BY watchDate DESC";

    const films = db.prepare(query).all(...params);

    const filterHtml = `
        <div class="filter-panel" style="margin-bottom: 2rem; padding: 1rem; background: rgba(0,0,0,0.3); border: 1px solid var(--ch-border);">
            <form action="/films/archive" method="GET" class="filter-form">
                ${editMode ? '<input type="hidden" name="edit" value="true">' : ''}
                <select name="director" class="cinema-input-sm" onchange="this.form.submit()">
                    <option value="">Tüm Yönetmenler</option>
                    ${filters.directors.map(d => `<option value="${d}" ${director === d ? 'selected' : ''}>${d}</option>`).join('')}
                </select>
                <select name="year" class="cinema-input-sm" onchange="this.form.submit()">
                    <option value="">Tüm Yıllar</option>
                    ${filters.years.map(y => `<option value="${y}" ${year === y ? 'selected' : ''}>${y}</option>`).join('')}
                </select>
                <select name="genre" class="cinema-input-sm" onchange="this.form.submit()">
                    <option value="">Tüm Türler</option>
                    ${filters.genres.map(g => `<option value="${g}" ${genre === g ? 'selected' : ''}>${g}</option>`).join('')}
                </select>
                <select name="sort" class="cinema-input-sm" onchange="this.form.submit()">
                    <option value="date_desc" ${sort === 'date_desc' ? 'selected' : ''}>Tarih (Yeni > Eski)</option>
                    <option value="rating_desc" ${sort === 'rating_desc' ? 'selected' : ''}>Puan (Yüksek > Düşük)</option>
                    <option value="rating_asc" ${sort === 'rating_asc' ? 'selected' : ''}>Puan (Düşük > Yüksek)</option>
                </select>
                <a href="/films/archive${editMode ? '?edit=true' : ''}" class="btn-cinema-sm" style="text-decoration:none; display:inline-block; text-align:center;">TEMİZLE</a>
            </form>
        </div>
    `;

    res.send(renderPage(`
        <div class="section-header">
            <h2 style="color:var(--ch-neon-gold);">FİLM ARŞİVİ (${films.length})</h2>
        </div>
        ${filterHtml}
        <div class="film-grid">
            ${renderFilmGrid(films, editMode)}
        </div>
    `, 'Arşiv | Film Veritabanı', req));
});

// GET /add - New Ticket Form
router.get('/add', (req, res) => {
    const importForm = `
        <!-- CSV Import Section -->
        <div class="form-container" style="margin-top: 2rem; border-top-color: #ffd700;">
            <h2 style="font-family:var(--ch-font-display); color:#ffd700; margin-top:0;">ARŞİV YÜKLE (CSV)</h2>
            <form action="/films/import" method="POST" enctype="multipart/form-data">
                <div class="form-group">
                    <label class="cinema-label">CSV DOSYASI YÜKLE</label>
                    <input type="file" name="csvFile" class="cinema-input" accept=".csv" required>
                    <small style="color:#666; display:block; margin-top:0.5rem;">Beklenen format: Film Adı, Sinemada İzlendi (Yes/No), Yönetmen, Tür, İzlenme Tarihi, Puan</small>
                </div>
                <button type="submit" class="btn-cinema" style="width:100%; border-color:#ffd700; color:#ffd700;">VERİLERİ İÇERİ AKTAR</button>
            </form>
        </div>
    `;
    res.send(renderPage(renderForm() + importForm, 'Film Ekle'));
});

// GET /edit/:id
router.get('/edit/:id', (req, res) => {
    const film = db.prepare('SELECT * FROM films WHERE id = ?').get(req.params.id);
    if (!film) return res.redirect('/films');
    res.send(renderPage(renderForm(film), 'Film Düzenle'));
});

// POST /add
router.post('/add', upload.single('image'), (req, res) => {
    let { title, director, year, rating, description, watchDate, isCinema, genres } = req.body;

    // Handle Genres
    if (genres) {
        // If it comes from the tag input, it's already a JSON string like '["a","b"]'
        if (typeof genres === 'string' && genres.trim().startsWith('[')) {
            // Already JSON, keep it
        } else {
            // Old way or single value
            if (!Array.isArray(genres)) genres = [genres];
            genres = JSON.stringify(genres);
        }
    } else {
        genres = '[]';
    }

    // Handle Image
    let imageUrl = '';
    if (req.file) {
        imageUrl = '/uploads/' + req.file.filename;
    } else if (req.body.imageUrl) {
        imageUrl = req.body.imageUrl;
    }

    // Handle Checkbox
    isCinema = isCinema ? 1 : 0;

    const insert = db.prepare(`
        INSERT INTO films (title, director, year, rating, description, imageUrl, genres, watchDate, isCinema) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(title, director, year, rating, description, imageUrl, genres, watchDate, isCinema);
    res.redirect('/films');
});

// POST /edit/:id
router.post('/edit/:id', upload.single('image'), (req, res) => {
    let { title, director, year, rating, description, watchDate, isCinema, genres } = req.body;
    const id = req.params.id;

    // Handle Genres
    if (genres) {
        // If it comes from the tag input, it's already a JSON string
        if (typeof genres === 'string' && genres.trim().startsWith('[')) {
            // Already JSON, keep it
        } else {
            if (!Array.isArray(genres)) genres = [genres];
            genres = JSON.stringify(genres);
        }
    } else {
        genres = '[]';
    }

    // Calculate IsCinema
    isCinema = isCinema ? 1 : 0;

    // Handle Image (Only update if new file uploaded)
    let imageSql = "";
    const params = [title, director, year, rating, description, genres, watchDate, isCinema];

    if (req.file) {
        imageSql = ", imageUrl = ?";
        params.push('/uploads/' + req.file.filename);
    }

    params.push(id);

    const update = db.prepare(`
        UPDATE films SET 
        title = ?, director = ?, year = ?, rating = ?, description = ?, genres = ?, watchDate = ?, isCinema = ?
        ${imageSql}
        WHERE id = ?
    `);

    update.run(...params);
    res.redirect('/films');
});

// POST /import - CSV Import
router.post('/import', upload.single('csvFile'), (req, res) => {
    if (!req.file) return res.redirect('/films/add');

    const results = [];
    const csv = require('csv-parser');

    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
            const insert = db.prepare(`
                INSERT INTO films (title, director, year, rating, description, genres, watchDate, isCinema) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            // Transaction for bulk insert
            const insertMany = db.transaction((rows) => {
                // Determine keys from the first row (Fuzzy Match)
                if (rows.length === 0) return;
                const firstRow = rows[0];
                const keys = Object.keys(firstRow);

                const findKey = (search) => keys.find(k => k.trim().replace(/^\ufeff/, '').includes(search));

                const kTitle = findKey('Film Adı') || findKey('Name');
                const kDirector = findKey('Yönetmen') || findKey('Director');
                const kCinema = findKey('Sinemada İzlendi') || findKey('Cinema');
                const kGenre = findKey('Tür') || findKey('Genre');
                const kDate = findKey('İzlenme Tarihi') || findKey('Date');
                const kScore = findKey('Puan') || findKey('Score');

                for (const row of rows) {
                    const title = (kTitle && row[kTitle]) || 'Unknown Title';
                    const director = (kDirector && row[kDirector]) || '';

                    // Parse 'Sinemada İzlendi'
                    let isCinema = 0;
                    if (kCinema && row[kCinema] && row[kCinema].toLowerCase() === 'yes') isCinema = 1;

                    // Parse Genres
                    let genres = '[]';
                    if (kGenre && row[kGenre]) {
                        const gList = row[kGenre].split(',').map(g => g.trim());
                        genres = JSON.stringify(gList);
                    }

                    // Parse Date
                    let watchDate = '';
                    if (kDate && row[kDate]) {
                        const parts = row[kDate].split('/');
                        if (parts.length === 3) {
                            watchDate = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
                        }
                    }

                    // Parse Rating
                    let rating = null;
                    if (kScore && row[kScore]) {
                        let rStr = row[kScore].split('/')[0];
                        rStr = rStr.replace(',', '.');
                        rating = parseFloat(rStr);
                    }

                    // Year
                    let year = null;
                    if (watchDate) {
                        year = parseInt(watchDate.substring(0, 4));
                    }

                    insert.run(title, director, year, rating, '', genres, watchDate, isCinema);
                }
            });

            try {
                insertMany(results);
                console.log(`Imported ${results.length} films from CSV.`);
                fs.unlinkSync(req.file.path);
            } catch (err) {
                console.error('Import Error:', err);
            }

            res.redirect('/films');
        });
});

// POST /delete/:id
router.post('/delete/:id', (req, res) => {
    const deleteParams = db.prepare('DELETE FROM films WHERE id = ?');
    deleteParams.run(req.params.id);
    res.redirect('/films');
});

module.exports = router;

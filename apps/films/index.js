const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const https = require('https');

// TMDB Configuration
const TMDB_API_KEY = '15d2ea6d0dc1d476efbca3eba2b9bbfb'; // Using a provided key for demo, normally this should be secret
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

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

// Helper: Get Watcher Stats (Count & Dates per Title)
const getWatcherStats = () => {
    // Group by title, collect dates and counts
    const rows = db.prepare("SELECT title, watchDate FROM films WHERE status = 'watched' ORDER BY watchDate DESC").all();
    const stats = {};
    rows.forEach(r => {
        if (!stats[r.title]) stats[r.title] = { count: 0, dates: [] };
        stats[r.title].count++;
        if (r.watchDate) stats[r.title].dates.push(r.watchDate);
    });
    return stats;
};

// Helper: Common Layout with Cinema Hall Theme
const renderPage = (content, title = 'Film Veritabanı', req = null) => {
    const editMode = req && req.query.edit === 'true';
    // Ensure we use the full path including mount point (/films)
    let currentPath = req ? (req.baseUrl + req.path) : '/films';
    if (currentPath.endsWith('/') && currentPath.length > 1) currentPath = currentPath.slice(0, -1);

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
                <a href="/films/watchlist" class="nav-item ${currentPath === '/films/watchlist' ? 'active' : ''}">İZLENECEKLER</a>
                <a href="/films/stats" class="nav-item ${currentPath === '/films/stats' ? 'active' : ''}">İSTATİSTİK</a>
                <a href="/films/hall-of-fame" class="nav-item ${currentPath === '/films/hall-of-fame' ? 'active' : ''}" style="color:#ffd700;">BAŞYAPITLAR</a>
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
        
        <!-- MARK WATCHED MODAL -->
        <dialog id="markWatchedModal" style="background:var(--ch-bg-card); border:1px solid var(--ch-neon-cyan); color:#fff; padding:2rem; border-radius:8px; backdrop-filter:blur(10px);">
            <form id="markWatchedForm" method="POST" action="">
                <h3 style="margin-top:0; font-family:var(--ch-font-display);">İZLEME TARİHİ</h3>
                <p style="color:#aaa; font-size:0.9rem;">Bu filmi ne zaman izlediniz?</p>
                <input type="date" name="watchDate" required style="background:rgba(0,0,0,0.3); border:1px solid #444; color:#fff; padding:0.5rem; width:100%; border-radius:4px; margin-bottom:1rem;">
                <div style="display:flex; justify-content:flex-end; gap:1rem;">
                    <button type="button" onclick="document.getElementById('markWatchedModal').close()" style="background:transparent; border:1px solid #555; color:#aaa; padding:0.5rem 1rem; cursor:pointer;">İPTAL</button>
                    <button type="submit" style="background:var(--ch-neon-cyan); border:none; color:#000; padding:0.5rem 1rem; font-weight:bold; cursor:pointer;">KAYDET</button>
                </div>
            </form>
        </dialog>
        
        <script>
            function markAsWatched(id) {
                const modal = document.getElementById('markWatchedModal');
                const form = document.getElementById('markWatchedForm');
                const dateInput = form.querySelector('input[name="watchDate"]');
                
                // Set default date to today
                dateInput.valueAsDate = new Date();
                
                form.action = '/films/mark-watched/' + id;
                modal.showModal();
            }
        </script>
    </div>
</body>
</html>
`;
};

// Helper: Render Film Grid
const renderFilmGrid = (films, editMode = false, stats = {}) => {
    return films.map(film => {
        const isCinema = film.isCinema === 1;
        // Watch Stats
        const filmStats = stats[film.title] || { count: 1, dates: [film.watchDate] };
        const isRewatched = filmStats.count > 1;
        const watchCountBadge = isRewatched ? `
            <div title="Bu film toplam ${filmStats.count} kez izlendi" 
                 style="position:absolute; top:10px; right:10px; background:rgba(0,0,0,0.8); color:var(--ch-neon-gold); 
                        border:1px solid var(--ch-neon-gold); padding:2px 8px; border-radius:12px; font-size:0.75rem; 
                        font-weight:bold; box-shadow:0 0 5px rgba(255,215,0,0.3); z-index:5; display:flex; align-items:center; gap:4px;">
                 <span>👁️</span> ${filmStats.count}
            </div>` : '';

        // Format dates for tooltip
        const dateListTooltip = isRewatched ?
            filmStats.dates.map(d => new Date(d).toLocaleDateString('tr-TR', { year: 'numeric', month: 'short', day: 'numeric' })).join('\n')
            : '';

        // Parse genres safely
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

        // SPECIAL ACTION: Mark Watched (for Watchlist items only)
        const watchlistAction = film.status === 'watchlist' ? `
            <div class="btn-actions" style="justify-content:center; border-top-color:var(--ch-neon-cyan);">
                <button type="button" onclick="markAsWatched(${film.id})" style="background:var(--ch-neon-cyan); color:#000; border:none; padding:0.5rem 1rem; border-radius:4px; font-weight:bold; cursor:pointer; width:100%;">
                    ✅ İZLENDİ
                </button>
            </div>
        ` : '';

        return `
        <div class="film-card">
            <div class="poster-frame">
                ${film.imageUrl ? `<img src="${film.imageUrl}" alt="${film.title}" class="poster-img">` : '<div style="width:100%; height:100%; background:#222; display:flex; align-items:center; justify-content:center; color:#555;">AFİŞ YOK</div>'}
                ${isCinema ? `<div class="cinema-badge">SİNEMA</div>` : ''}
                ${watchCountBadge}
            </div>
            <div class="film-info">
                <div class="info-header">
                    <div class="film-title-group">
                        <div class="film-title" title="${film.title}">${film.title}</div>
                        <div class="film-director">${film.director || 'Yönetmen Yok'}</div>
                    </div>
                    <div class="film-rating-badge" style="
                        box-shadow: 0 0 ${film.rating ? Math.max(0, (film.rating - 4) * 3) : 0}px rgba(255, 215, 0, ${(film.rating ? (film.rating / 15) : 0)});
                        border-color: rgba(255, 215, 0, ${(film.rating ? (film.rating / 12) : 0.1)});
                    ">
                        <span class="rating-value" style="
                            font-size:1.4rem; 
                            text-shadow: 0 0 ${film.rating ? Math.max(0, (film.rating - 5) * 3) : 0}px rgba(255, 215, 0, 0.6);
                            color: ${film.rating && film.rating < 5 ? '#888' : 'var(--ch-neon-gold)'};
                        ">${film.rating || '-'}</span>
                    </div>
                </div>
                
                ${film.description ? `<div class="film-description" title="Okumak için tıklayın" onclick="this.classList.toggle('expanded')">${film.description}</div>` : ''}
                
                <div class="info-footer">
                        <div class="genre-list">${genreHtml}</div>
                    <div class="watch-date" title="${isRewatched ? 'İzleme Geçmişi:\n' + dateListTooltip : ''}" style="${isRewatched ? 'border-bottom:1px dashed #666; cursor:help;' : ''}">
                        ${dateDisplay} ${isRewatched ? '<span style="font-size:0.7em; color:var(--ch-neon-gold);">(+Geçmiş)</span>' : ''}
                    </div>
                </div>
                ${watchlistAction}
                ${editActions}
            </div>
        </div>
        `;
    }).join('');
};

// Helper: Render Form (Shared for Add & Edit)
const renderForm = (film = null, returnUrl = '') => {
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
                <input type="hidden" name="returnUrl" value="${returnUrl}">
                <div class="form-group">
                    <label class="cinema-label">FİLM ADI</label>
                    <div style="display:flex; gap:10px;">
                        <input type="text" id="titleInput" name="title" class="cinema-input" value="${val('title')}" required style="flex:1;">
                        <button type="button" onclick="openSearchModal()" class="btn-search">
                            🔍 BUL
                        </button>
                    </div>
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

                            // Listen for external updates (Auto-Fill)
                            window.addEventListener('update-genres', function(e) {
                                currentGenres = e.detail;
                                renderTags();
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



                <div class="form-group" style="margin-bottom:0.5rem;">
                    <label class="cinema-label">LİSTE DURUMU</label>
                    <select name="status" class="cinema-input">
                        <option value="watched" ${val('status') === 'watched' || !val('status') ? 'selected' : ''}>✅ İZLENDİ (ARŞİV)</option>
                        <option value="watchlist" ${val('status') === 'watchlist' ? 'selected' : ''}>⏳ İZLENECEK (LİSTE)</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="cinema-label">AFİŞ GÖRSELİ ${isEdit ? '(Boş bırakılırsa değişmez)' : ''}</label>
                    <input type="file" name="image" class="cinema-input" accept="image/*">
                    <input type="hidden" name="imageUrl" value="${val('imageUrl')}">
                    ${isEdit && film.imageUrl ? `<small style="color:#666;">Mevcut: <a href="${film.imageUrl}" target="_blank" style="color:#888;">Görüntüle</a></small>` : ''}
                </div>

                <div class="form-group" style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
                     <label class="checkbox-wrapper">
                        <input type="checkbox" name="isCinema" value="1" ${isCinemaChecked}>
                        <span>SİNEMADA İZLENDİ <span style="color:var(--ch-neon-cyan);">(SALON)</span></span>
                     </label>
                     
                     <label class="checkbox-wrapper" style="border-color:#ffd700;">
                        <input type="checkbox" name="isHallOfFame" value="1" ${film && film.isHallOfFame ? 'checked' : ''}>
                        <span style="color:#ffd700;">BAŞYAPIT (KOLEKSİYON) ⚜️</span>
                     </label>
                </div>

                <div class="form-group">
                    <label class="cinema-label">NOTLAR / İNCELEME</label>
                    <textarea name="description" rows="3" class="cinema-input">${val('description')}</textarea>
                </div>

                <button type="submit" class="btn-cinema" style="width:100%; padding:1rem; font-size:1.1rem; background:rgba(0, 242, 255, 0.1);">${btnText}</button>
            </form>
        </div>
        
        <!-- TMDB SEARCH MODAL -->
        <dialog id="tmdbModal" style="width:90%; max-width:800px; background:var(--ch-bg-card); border:1px solid var(--ch-neon-gold); color:#fff; padding:0; border-radius:8px; backdrop-filter:blur(10px); height:80vh;">
            <div style="padding:1rem; border-bottom:1px solid #333; display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0; font-family:var(--ch-font-display); color:var(--ch-neon-gold);">TMDB FİLM ARAMA</h3>
                <button type="button" onclick="document.getElementById('tmdbModal').close()" style="background:none; border:none; color:#fff; font-size:1.5rem; cursor:pointer;">&times;</button>
            </div>
            
            <div style="padding:1rem;">
                <div style="display:flex; gap:10px; margin-bottom:1rem;">
                    <input type="text" id="tmdbSearchInput" placeholder="Film adı..." style="flex:1; padding:0.8rem; background:rgba(0,0,0,0.5); border:1px solid #555; color:#fff; border-radius:4px;" onkeydown="if(event.key === 'Enter') searchTMDB()">
                    <button type="button" onclick="searchTMDB()" style="padding:0 2rem; background:var(--ch-neon-cyan); border:none; border-radius:4px; font-weight:bold; cursor:pointer;">ARA</button>
                </div>
                
                <div id="tmdbLoading" style="display:none; text-align:center; padding:2rem; color:#888;">Aranıyor...</div>
                
                <div id="tmdbResults" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap:1rem; overflow-y:auto; max-height:calc(80vh - 150px); padding-right:0.5rem;">
                    <!-- Results will appear here -->
                </div>
            </div>
        </dialog>

        <script>
            function openSearchModal() {
                const title = document.getElementById('titleInput').value;
                if(title) {
                    document.getElementById('tmdbSearchInput').value = title;
                    searchTMDB();
                }
                document.getElementById('tmdbModal').showModal();
            }

            async function searchTMDB() {
                const query = document.getElementById('tmdbSearchInput').value;
                if(!query) return;
                
                document.getElementById('tmdbLoading').style.display = 'block';
                document.getElementById('tmdbResults').innerHTML = '';
                
                try {
                    const res = await fetch('/films/api/search?q=' + encodeURIComponent(query));
                    const data = await res.json();
                    
                    document.getElementById('tmdbLoading').style.display = 'none';
                    
                    if(data.results && data.results.length > 0) {
                        document.getElementById('tmdbResults').innerHTML = data.results.map(movie => {
                            const poster = movie.poster_path ? '${TMDB_IMAGE_BASE}' + movie.poster_path : '';
                            const year = movie.release_date ? movie.release_date.split('-')[0] : 'Unknown';
                            
                            return \`
                            <div onclick="selectMovie(\${movie.id})" style="background:#222; border-radius:4px; overflow:hidden; cursor:pointer; transition:transform 0.2s; border:1px solid #333;" onmouseover="this.style.borderColor='var(--ch-neon-gold)'; this.style.transform='scale(1.02)'" onmouseout="this.style.borderColor='#333'; this.style.transform='scale(1)'">
                                <div style="aspect-ratio:2/3; background:#111;">
                                    \${poster ? '<img src="' + poster + '" style="width:100%; height:100%; object-fit:cover;">' : '<div style="display:flex; justify-content:center; align-items:center; height:100%; color:#555;">No Poster</div>'}
                                </div>
                                <div style="padding:0.5rem;">
                                    <div style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">\${movie.title}</div>
                                    <div style="color:#666; font-size:0.8rem;">\${year} • \${movie.vote_average}</div>
                                </div>
                            </div>
                            \`;
                        }).join('');
                    } else {
                        document.getElementById('tmdbResults').innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#666;">Sonuç bulunamadı.</div>';
                    }
                } catch(e) {
                    document.getElementById('tmdbLoading').innerText = 'Hata oluştu: ' + e.message;
                }
            }

            async function selectMovie(id) {
                try {
                    // Fetch full details
                    const res = await fetch('/films/api/details/' + id);
                    const movie = await res.json();
                    
                    // Populate Form
                    document.querySelector('input[name="title"]').value = movie.title;
                    document.querySelector('input[name="year"]').value = movie.release_date ? movie.release_date.split('-')[0] : '';
                    // document.querySelector('textarea[name="description"]').value = movie.overview;
                    document.querySelector('input[name="imageUrl"]').value = movie.poster_path ? '${TMDB_IMAGE_BASE}' + movie.poster_path : '';
                    
                    // Director from credits
                    const director = movie.credits.crew.find(c => c.job === 'Director');
                    if(director) {
                        document.querySelector('input[name="director"]').value = director.name;
                    }
                    
                    // Rating mapping (TMDB is 1-10, we behave same)
                    // document.querySelector('input[name="rating"]').value = movie.vote_average.toFixed(1);
                    
                    // Genres
                    const genres = movie.genres.map(g => g.name);
                    
                    // Update genres
                    window.dispatchEvent(new CustomEvent('update-genres', { detail: genres }));
                    
                    document.getElementById('tmdbModal').close();
                    
                } catch(e) {
                    alert('Detaylar çekilemedi: ' + e.message);
                }
            }
        </script>
    `;
};

// GET / - Homepage (Current Year Only)
router.get('/', (req, res) => {
    const editMode = req.query.edit === 'true';
    const currentYear = new Date().getFullYear();
    const showAll = req.query.showEveryone === 'true'; // Hidden param to debug

    // Only films watched in current year or later AND status is watched
    const films = db.prepare("SELECT * FROM films WHERE status = 'watched' AND watchDate >= ? ORDER BY watchDate DESC, id DESC").all(`${currentYear}-01-01`);

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
            ${renderFilmGrid(films, editMode, getWatcherStats())}
        </div>
    `, 'Vizyon | Film Veritabanı', req));
});

// GET /archive - All Films with Filters
// GET /archive - All Films with Filters
router.get('/archive', (req, res) => {
    const editMode = req.query.edit === 'true';
    const { director, genre, year, sort, q, isCinema } = req.query;
    const filters = getFilterData();

    let query = "SELECT * FROM films WHERE status = 'watched'";
    const params = [];

    if (q) {
        query += " AND (title LIKE ? OR director LIKE ?)";
        params.push(`%${q}%`, `%${q}%`);
    }
    if (director) { query += " AND director = ?"; params.push(director); }
    if (year) { query += " AND strftime('%Y', watchDate) = ?"; params.push(year); }
    if (genre) { query += " AND genres LIKE ?"; params.push(`%${genre}%`); }
    if (isCinema) { query += " AND isCinema = 1"; }

    if (sort === 'rating_desc') query += " ORDER BY rating DESC";
    else if (sort === 'rating_asc') query += " ORDER BY rating ASC";
    else query += " ORDER BY watchDate DESC";

    const films = db.prepare(query).all(...params);

    const filterHtml = `
        <div class="filter-panel" style="margin-bottom: 2rem; padding: 1rem; background: rgba(0,0,0,0.3); border: 1px solid var(--ch-border);">
            <form action="/films/archive" method="GET" class="filter-form" style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
                ${editMode ? '<input type="hidden" name="edit" value="true">' : ''}
                
                <div style="flex:1; min-width:200px; display:flex;">
                     <input type="text" name="q" class="cinema-input-sm" value="${q || ''}" placeholder="Film veya yönetmen ara..." style="width:100%; border-right:none; border-top-right-radius:0; border-bottom-right-radius:0;">
                     <button type="submit" class="btn-cinema-sm" style="border-top-left-radius:0; border-bottom-left-radius:0; background:var(--ch-neon-cyan); color:#000; border-color:var(--ch-neon-cyan);">ARA</button>
                </div>

                <label style="display:flex; align-items:center; color:#ccc; font-size:0.9rem; cursor:pointer; background:rgba(0,0,0,0.5); padding:0 10px; height:38px; border:1px solid #444; border-radius:4px;">
                    <input type="checkbox" name="isCinema" onchange="this.form.submit()" ${isCinema ? 'checked' : ''} style="margin-right:5px;">
                    SİNEMA
                </label>

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
                <a href="/films/archive${editMode ? '?edit=true' : ''}" class="btn-cinema-sm" style="text-decoration:none; display:inline-block; text-align:center;">SIFIRLA</a>
            </form>
        </div>
    `;

    res.send(renderPage(`
        <div class="section-header">
            <h2 style="color:var(--ch-neon-gold);">FİLM ARŞİVİ (${films.length})</h2>
        </div>
        ${filterHtml}
        <div class="film-grid">
            ${renderFilmGrid(films, editMode, getWatcherStats())}
        </div>
    `, 'Arşiv | Film Veritabanı', req));
});

// GET /watchlist - Items to watch
router.get('/watchlist', (req, res) => {
    const editMode = req.query.edit === 'true';
    const films = db.prepare("SELECT * FROM films WHERE status = 'watchlist' ORDER BY id DESC").all();

    res.send(renderPage(`
        <div class="section-header">
            <h2 class="page-title" style="color:var(--ch-neon-cyan);">İZLENECEKLER LİSTESİ (${films.length})</h2>
        </div>
        
        ${films.length > 0 ? `
            <div class="film-grid">
                ${renderFilmGrid(films, editMode)}
            </div>
        ` : '<div style="text-align:center; padding:4rem; color:#666; font-size:1.2rem;">Listeniz boş. Film eklerken "İzlenecekler" listesine ekleyebilirsiniz.</div>'}

    `, 'İzlenecekler | Film Veritabanı', req));
});

// POST /mark-watched/:id
router.post('/mark-watched/:id', (req, res) => {
    const id = req.params.id;
    const watchDate = req.body.watchDate || new Date().toISOString().split('T')[0];

    db.prepare("UPDATE films SET status = 'watched', watchDate = ? WHERE id = ?").run(watchDate, id);
    res.redirect('/films'); // Redirect to homepage to see it in "Latest"
});

// GET /hall-of-fame - High Rated Films
router.get('/hall-of-fame', (req, res) => {
    const editMode = req.query.edit === 'true';
    // Fetch films with isHallOfFame = 1
    const films = db.prepare("SELECT * FROM films WHERE isHallOfFame = 1 ORDER BY rating DESC, watchDate DESC").all();

    res.send(renderPage(`
        <div class="hall-of-fame-container" style="text-align:center; padding:2rem 0;">
            <div class="hof-header" style="margin-bottom:3rem;">
                <div style="font-size:3rem; margin-bottom:0.5rem;">⚜️</div>
                <h2 style="font-family:var(--ch-font-display); font-size:2.5rem; background: linear-gradient(to bottom, #ffd700, #b8860b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-shadow: 0 0 30px rgba(255, 215, 0, 0.3); margin:0;">BAŞYAPITLAR</h2>
                <p style="color:#888; letter-spacing:2px; font-size:0.9rem; margin-top:0.5rem;">SİNEMA TARİHİNİN EN İYİLERİ</p>
            </div>
            
            ${films.length > 0 ? `
                <div class="film-grid hof-grid">
                    ${renderFilmGrid(films, editMode).replace(/class="film-card"/g, 'class="film-card hof-card"')}
                </div>
            ` : '<div style="color:#666; margin-top:2rem;">Henüz koleksiyona eklenmiş bir başyapıt yok.</div>'}
        </div>
        
        <style>
            .hof-grid {
                display: flex !important;
                flex-wrap: wrap !important;
                justify-content: center !important;
                gap: 2rem !important;
            }
            .hof-card {
                flex: 0 1 300px !important; /* Fixed width for centering */
                max-width: 300px !important;
                border: 1px solid #ffd700 !important;
                box-shadow: 0 0 20px rgba(255, 215, 0, 0.15) !important;
                text-align: left; /* Fixes title alignment inheritance */
            }
            .hof-card .poster-frame::before {
                content: '⚜️';
                position: absolute;
                top: -15px;
                right: -15px;
                font-size: 2rem;
                z-index: 10;
                filter: drop-shadow(0 2px 5px rgba(0,0,0,0.5));
                transform: rotate(15deg);
            }
            .hof-card .rating-value {
                color: #ffd700 !important;
                text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
            }
        </style>
    `, 'Başyapıtlar | Film Veritabanı', req));
});



// GET /api/search - TMDB Proxy
router.get('/api/search', (req, res) => {
    const query = req.query.q;
    if (!query) return res.json({ results: [] });

    const url = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&language=tr-TR&query=${encodeURIComponent(query)}`;

    https.get(url, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
            try {
                const json = JSON.parse(data);
                // Enhance results with director (requires detail fetch, skipping for speed, only doing basic search)
                // Actually, let's just return basic info
                res.json(json);
            } catch (e) {
                res.status(500).json({ error: 'Failed to parse TMDB response' });
            }
        });
    }).on('error', (e) => {
        res.status(500).json({ error: e.message });
    });
});

// GET /api/details/:id - Fetch full details including credits
router.get('/api/details/:id', (req, res) => {
    const id = req.params.id;
    const url = `${TMDB_BASE_URL}/movie/${id}?api_key=${TMDB_API_KEY}&language=tr-TR&append_to_response=credits`;

    https.get(url, (apiRes) => {
        let data = '';
        apiRes.on('data', (chunk) => data += chunk);
        apiRes.on('end', () => {
            try {
                const json = JSON.parse(data);
                res.json(json);
            } catch (e) {
                res.status(500).json({ error: 'Parse Error' });
            }
        });
    }).on('error', (e) => {
        res.status(500).json({ error: e.message });
    });
});

// POST /api/tools/fetch-missing - Auto Fetch Tool
router.post('/api/tools/fetch-missing', async (req, res) => {
    try {
        // Find films with no image
        const films = db.prepare("SELECT * FROM films WHERE imageUrl IS NULL OR imageUrl = ''").all();
        let updateCount = 0;
        let errors = [];

        // Helper function for Promise-based request
        const fetchTMDB = (query, year) => {
            return new Promise((resolve, reject) => {
                const url = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&language=tr-TR&query=${encodeURIComponent(query)}${year ? `&year=${year}` : ''}`;
                https.get(url, (apiRes) => {
                    let data = '';
                    apiRes.on('data', c => data += c);
                    apiRes.on('end', () => {
                        try {
                            const json = JSON.parse(data);
                            resolve(json.results && json.results.length > 0 ? json.results[0] : null);
                        } catch (e) { resolve(null); }
                    });
                }).on('error', () => resolve(null));
            });
        };

        // Process sequentially to be nice to API
        for (const film of films) {
            // Only try if we have a title
            if (!film.title) continue;

            // Search
            const result = await fetchTMDB(film.title, film.year);

            if (result) {
                // Prepare Update Data
                // Only update fields that are missing in our DB, or overwrite image always?
                // Let's overwrite Image, Description if empty, Director if empty...

                // Get Detailed Info for Genres/Director
                // (Simple search result has basic info, we might need detail for Director)
                // For speed, let's just grab Poster, Overview, Rating if missing.

                let newImage = result.poster_path ? `${TMDB_IMAGE_BASE}${result.poster_path}` : film.imageUrl;
                let newYear = (!film.year && result.release_date) ? result.release_date.split('-')[0] : film.year;

                // Update
                const update = db.prepare(`
                    UPDATE films SET 
                    imageUrl = ?, year = ?
                    WHERE id = ?
                `);

                update.run(newImage, newYear, film.id);
                updateCount++;

                // Slight delay
                await new Promise(r => setTimeout(r, 200));
            } else {
                errors.push(`${film.title}: Bulunamadı`);
            }
        }

        res.json({ success: true, count: updateCount, errors });

    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /stats - Statistics Dashboard
router.get('/stats', (req, res) => {
    // 1. Determine Years for Filter
    const allFilms = db.prepare('SELECT * FROM films').all();
    const availableYears = [...new Set(allFilms.map(f => f.watchDate ? f.watchDate.substring(0, 4) : null).filter(y => y))].sort().reverse();

    // Determine Selected Year
    const currentYearStr = new Date().getFullYear().toString();
    const queryYear = req.query.year;
    // If no query param, default to current year if exists, else 'all'
    const selectedYear = queryYear || (availableYears.includes(currentYearStr) ? currentYearStr : 'all');

    // FILTER DATASET BY YEAR (Global Filter)
    // Only count watched films
    let statsFilms = allFilms.filter(f => f.status === 'watched');
    let periodTitle = "TÜM ZAMANLAR";

    if (selectedYear !== 'all') {
        statsFilms = allFilms.filter(f => f.watchDate && f.watchDate.startsWith(selectedYear));
        periodTitle = `${selectedYear} YILI`; // "TEST" is added below in the HTML title as requested
    }

    // 2. Monthly Activity
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const monthlyCounts = new Array(12).fill(0);

    statsFilms.forEach(f => {
        if (f.watchDate) {
            const monthIndex = new Date(f.watchDate).getMonth();
            monthlyCounts[monthIndex]++;
        }
    });
    const maxMonthly = Math.max(...monthlyCounts, 1);

    // 3. Genre Distribution
    const genreCounts = {};
    statsFilms.forEach(f => {
        if (f.genres) {
            try {
                const list = JSON.parse(f.genres);
                list.forEach(g => genreCounts[g] = (genreCounts[g] || 0) + 1);
            } catch (e) { }
        }
    });
    const topGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1]);

    // 4. Cinema vs Home
    const cinemaCount = statsFilms.filter(f => f.isCinema).length;
    const homeCount = statsFilms.length - cinemaCount;

    // Render Stats Page
    const content = `
    < div class="stats-container" >
            <div class="stats-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem;">
                <h2 class="page-title" style="margin:0; color:var(--ch-neon-gold);">SİNEMA ANALİZİ <span style="font-size:0.6em; color:#666;">// ${periodTitle}</span></h2>
                
                <form action="/films/stats" method="GET" style="margin:0;">
                    <select name="year" class="cinema-input-sm" onchange="this.form.submit()" style="background:rgba(20,20,20,0.8); border:1px solid var(--ch-neon-gold); color:var(--ch-neon-gold); font-weight:bold; padding: 0.5rem 1rem; border-radius:4px; cursor:pointer;">
                        <option value="all" ${selectedYear === 'all' ? 'selected' : ''}>TÜM ZAMANLAR</option>
                        ${availableYears.map(y => `<option value="${y}" ${selectedYear == y ? 'selected' : ''}>${y}</option>`).join('')}
                    </select>
                </form>
            </div>
            
            <div class="stats-grid">
                <!-- Monthly Activity Chart -->
                <div class="stat-card full-width">
                    <h3>AYLIK İZLEME GRAFİĞİ</h3>
                    <div class="chart-bar-container">
                        ${months.map((m, i) => {
        const count = monthlyCounts[i];
        const height = maxMonthly > 0 ? (count / maxMonthly) * 100 : 0;
        return `
                                <div class="bar-group">
                                    <div class="bar-value">${count > 0 ? count : ''}</div>
                                    <div class="bar" style="height: ${height}%; box-shadow: 0 0 ${count > 0 ? '10px' : '0'} var(--ch-neon-cyan);"></div>
                                    <div class="bar-label">${m.substring(0, 3)}</div>
                                </div>
                            `;
    }).join('')}
                    </div>
                </div>

                <!-- Genre Distribution -->
                <div class="stat-card" style="max-height: 500px; overflow-y: auto;">
                    <h3>TÜR DAĞILIMI</h3>
                    <div class="chart-list">
                        ${topGenres.length > 0 ? topGenres.map(([genre, count]) => {
        const max = topGenres[0][1];
        const width = (count / max) * 100;
        return `
                                <div class="list-item-group">
                                    <div class="list-label">${genre}</div>
                                    <div class="list-bar-frame">
                                        <div class="list-bar" style="width: ${width}%"></div>
                                    </div>
                                    <div class="list-value">${count}</div>
                                </div>
                            `;
    }).join('') : '<div style="color:#666; text-align:center; padding:1rem;">Veri yok</div>'}
                    </div>
                </div>

                <!-- Cinema vs Home -->
                <div class="stat-card">
                    <h3>SİNEMA vs EV</h3>
                    ${statsFilms.length > 0 ? `
                        <div class="donut-chart-container">
                            <div class="donut-stat">
                                <span style="color:var(--ch-neon-red); font-size:2rem; font-weight:bold;">${cinemaCount}</span>
                                <small>SİNEMA</small>
                            </div>
                            <div class="donut-divider"></div>
                            <div class="donut-stat">
                                <span style="color:var(--ch-neon-cyan); font-size:2rem; font-weight:bold;">${homeCount}</span>
                                <small>EV</small>
                            </div>
                        </div>
                        <div class="progress-bar-stacked">
                            <div class="segment cinema" style="width: ${(cinemaCount / statsFilms.length * 100)}%"></div>
                            <div class="segment home" style="width: ${(homeCount / statsFilms.length * 100)}%"></div>
                        </div>
                    ` : '<div style="color:#666; text-align:center; padding:1rem;">Veri yok</div>'}
                </div>
            </div>
        </div >
    `;

    res.send(renderPage(content, 'İstatistikler', req));
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

        <div class="form-container" style="margin-top: 2rem; border-top-color: var(--ch-neon-cyan);">
            <h2 style="font-family:var(--ch-font-display); color:var(--ch-neon-cyan); margin-top:0;">OTOMATİK VERİ TAMAMLAMA</h2>
            <p style="color:#aaa; font-size:0.9rem; margin-bottom:1rem;">Görseli veya detayı eksik olan filmleri TMDB üzerinden tarar ve otomatik tamamlar.</p>
            
            <button type="button" onclick="startAutoFetch()" id="btnAutoFetch" class="btn-cinema" style="width:100%; border-color:var(--ch-neon-cyan); color:var(--ch-neon-cyan);">EKSİKLERİ TAMAMLA (SCAN)</button>
            
             <div id="fetchLog" style="margin-top:1rem; max-height:200px; overflow-y:auto; font-size:0.8rem; color:#888; display:none; background:#111; padding:0.5rem; border-radius:4px;"></div>
        </div>

        <script>
            async function startAutoFetch() {
                const btn = document.getElementById('btnAutoFetch');
                const log = document.getElementById('fetchLog');
                
                if(!confirm('Bu işlem eksik verisi olan tüm filmler için internetten veri çekecektir. Devam edilsin mi?')) return;

                btn.disabled = true;
                btn.innerText = 'TARANIYOR...';
                log.style.display = 'block';
                log.innerHTML = '<div>🚀 İşlem başlatıldı...</div>';

                try {
                    const res = await fetch('/films/api/tools/fetch-missing', { method: 'POST' });
                    // Provide a stream-like experience? No, just wait for simple JSON response for now.
                    // Or we could implement a basic polling if needed, but let's stick to simple "wait and show report".
                    
                    const data = await res.json();
                    
                    if(data.success) {
                        log.innerHTML += \`<div style="color:var(--ch-neon-gold); margin-top:10px;">✅ İŞLEM TAMAMLANDI!</div>\`;
                        log.innerHTML += \`<div>Toplam Güncellenen: \${data.count}</div>\`;
                        if(data.errors.length > 0) {
                            log.innerHTML += \`<div style="color:var(--ch-neon-red);">⚠️ Bazı Hatalar:</div>\`;
                            data.errors.forEach(e => log.innerHTML += \`<div>- \${e}</div>\`);
                        }
                        btn.innerText = 'TAMAMLANDI';
                    } else {
                         log.innerHTML += \`<div style="color:red;">❌ HATA: \${data.error}</div>\`;
                         btn.innerText = 'HATA';
                         btn.disabled = false;
                    }

                } catch(e) {
                     log.innerHTML += \`<div style="color:red;">❌ AĞ HATASI: \${e.message}</div>\`;
                     btn.innerText = 'TEKRAR DENE';
                     btn.disabled = false;
                }
            }
        </script>
`;
    res.send(renderPage(renderForm() + importForm, 'Film Ekle', req));
});

// GET /edit/:id
router.get('/edit/:id', (req, res) => {
    const film = db.prepare('SELECT * FROM films WHERE id = ?').get(req.params.id);
    if (!film) return res.redirect('/films');
    const returnUrl = req.get('Referer') || '/films';
    res.send(renderPage(renderForm(film, returnUrl), 'Film Düzenle', req));
});

// POST /add
router.post('/add', upload.single('image'), (req, res) => {
    // If rating is empty, assume watchlist? No, let's use explicit status logic or a checkbox
    // Actually, let's auto-detect: if rating is null/empty, status='watchlist'
    // BUT user wanted separate list. Let's add checkbox logic.
    // For now, let's assume if it comes from Import it might need logic.

    let { title, director, year, rating, description, watchDate, isCinema, isHallOfFame, genres, status } = req.body;

    // Determine Status
    // If user explicitly sent status, use it (future proof)
    // Otherwise, default to 'watched' unless we add a UI toggle for it.
    // Wait, I updated DB to default 'watched'. 
    // Let's rely on a check in the form (todo: add checkbox to form)
    if (!status) status = 'watched'; // Fallback


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

    // Handle Checkboxes
    isCinema = isCinema ? 1 : 0;
    isHallOfFame = isHallOfFame ? 1 : 0;

    const insert = db.prepare(`
        INSERT INTO films(title, director, year, rating, description, imageUrl, genres, watchDate, isCinema, isHallOfFame, status)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(title, director, year, rating, description, imageUrl, genres, watchDate, isCinema, isHallOfFame, status);
    res.redirect('/films');
});

// POST /edit/:id
router.post('/edit/:id', upload.single('image'), (req, res) => {
    let { title, director, year, rating, description, watchDate, isCinema, isHallOfFame, genres, status } = req.body;
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

    // Calculate Checkboxes
    isCinema = isCinema ? 1 : 0;
    isHallOfFame = isHallOfFame ? 1 : 0;

    // Handle Image (Only update if new file uploaded)
    let imageSql = "";
    if (!status) status = 'watched';

    const params = [title, director, year, rating, description, genres, watchDate, isCinema, isHallOfFame, status];

    if (req.file) {
        imageSql = ", imageUrl = ?";
        params.push('/uploads/' + req.file.filename);
    }

    params.push(id);

    const update = db.prepare(`
        UPDATE films SET
title = ?, director = ?, year = ?, rating = ?, description = ?, genres = ?, watchDate = ?, isCinema = ?, isHallOfFame = ?, status = ?
    ${imageSql}
        WHERE id = ?
    `);

    update.run(...params);
    const returnUrl = req.body.returnUrl;
    res.redirect(returnUrl || '/films');
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
                INSERT INTO films(title, director, year, rating, description, genres, watchDate, isCinema, isHallOfFame)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0)
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
                        // Clean the string
                        let dStr = row[kDate].trim();
                        // Try various formats
                        // 1. DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
                        const parts = dStr.split(/[\/\.\-]/);
                        if (parts.length === 3) {
                            // Assume DD MM YYYY
                            const day = parts[0].padStart(2, '0');
                            const month = parts[1].padStart(2, '0');
                            const year = parts[2];
                            // Basic validation
                            if (year.length === 4) {
                                watchDate = `${year}-${month}-${day}`;
                            }
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
    const referer = req.get('Referer');
    res.redirect(referer || '/films');
});

module.exports = router;

const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const https = require('https');
const { t, getLocale } = require('../../utils/i18n');

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
const renderPage = (content, titleKey = 'title_showcase', req = null) => {
    const editMode = req && req.query.edit === 'true';
    const locale = req ? getLocale(req) : 'tr';

    // Ensure we use the full path including mount point (/films)
    let currentPath = req ? (req.baseUrl + req.path) : '/films';
    if (currentPath.endsWith('/') && currentPath.length > 1) currentPath = currentPath.slice(0, -1);

    // Toggle URL Logic (Edit Mode)
    let toggleUrl = currentPath;
    if (req) {
        const query = { ...req.query };
        if (editMode) {
            delete query.edit;
        } else {
            query.edit = 'true';
        }
        const queryString = new URLSearchParams(query).toString();
        toggleUrl = queryString ? `${currentPath}?${queryString}` : currentPath;
    }

    // Language Switcher URLs
    const getLangUrl = (lang) => {
        if (!req) return '#';
        const query = { ...req.query, lang };
        // If switching lang, set cookie via client-side script or just rely on query param for now?
        // Plan said: Query param sets cookie in middleware. I haven't added middleware yet.
        // Let's add a script to set cookie on click to be safe, or just use query param which utility checks.
        // The utility checks query param FIRST. So ?lang=en works immediately.
        // But for persistence, we need to set cookie.
        return `?${new URLSearchParams(query).toString()}`; // Simple link, let middleware handle cookie
    };

    return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${t(titleKey, locale)}</title>
    <link rel="stylesheet" href="/films.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&family=Oswald:wght@400;500;700&display=swap" rel="stylesheet">
    <script>
        // Simple cookie setter for language persistence
        function setLang(lang) {
            document.cookie = "lang=" + lang + ";path=/;max-age=31536000";
            const url = new URL(window.location);
            url.searchParams.set('lang', lang);
            window.location.href = url.toString();
        }
    </script>
</head>
<body class="film-theme">
    <div class="container">
        <header class="glass-header">
            <a href="/films" class="nav-brand">SİNEMA<span>SALONU</span></a>
            
            <nav class="glass-nav">
                <a href="/films" class="nav-item ${currentPath === '/films' ? 'active' : ''}">${t('nav_showcase', locale)}</a>
                <a href="/films/archive" class="nav-item ${currentPath === '/films/archive' ? 'active' : ''}">${t('nav_archive', locale)}</a>
                <a href="/films/watchlist" class="nav-item ${currentPath === '/films/watchlist' ? 'active' : ''}">${t('nav_watchlist', locale)}</a>
                <a href="/films/stats" class="nav-item ${currentPath === '/films/stats' ? 'active' : ''}">${t('nav_stats', locale)}</a>
                <a href="/films/hall-of-fame" class="nav-item ${currentPath === '/films/hall-of-fame' ? 'active' : ''}" style="color:#ffd700;">${t('nav_hall_of_fame', locale)}</a>
                <a href="/films/add" class="nav-item ${currentPath === '/films/add' ? 'active' : ''}">${t('nav_add', locale)}</a>
            </nav>

            <div class="header-controls">
                <div class="lang-switcher" style="margin-right:1rem; display:flex; gap:0.5rem;">
                    <button onclick="setLang('tr')" style="background:none; border:none; color:${locale === 'tr' ? '#fff' : '#888'}; cursor:pointer; font-weight:bold;">TR</button>
                    <span style="color:#444;">|</span>
                    <button onclick="setLang('en')" style="background:none; border:none; color:${locale === 'en' ? '#fff' : '#888'}; cursor:pointer; font-weight:bold;">EN</button>
                </div>
                
                <a href="${toggleUrl}" class="control-btn ${editMode ? 'active' : ''}" title="${editMode ? t('edit_off', locale) : t('edit_mode', locale)}">
                    ${editMode ? '🔒' : '✏️'}
                </a>
                <a href="/" class="control-btn exit-btn" title="${t('exit', locale)}">⏏</a>
            </div>
        </header>

        <main class="content-wrapper">
            ${content}
        </main>

        
        <!-- MARK WATCHED MODAL -->
        <dialog id="markWatchedModal" style="background:var(--ch-bg-card); border:1px solid var(--ch-neon-cyan); color:#fff; padding:2rem; border-radius:8px; backdrop-filter:blur(10px);">
            <form id="markWatchedForm" method="POST" action="">
                <h3 style="margin-top:0; font-family:var(--ch-font-display);">${t('watch_details', locale)}</h3>
                <p style="color:#aaa; font-size:0.9rem;">${t('watch_date_q', locale)}</p>
                <input type="date" name="watchDate" required style="background:rgba(0,0,0,0.3); border:1px solid #444; color:#fff; padding:0.5rem; width:100%; border-radius:4px; margin-bottom:1rem;">
                
                <p style="color:#aaa; font-size:0.9rem;">${t('score_q', locale)}</p>
                <input type="number" name="rating" step="0.1" min="0" max="10" style="background:rgba(0,0,0,0.3); border:1px solid #444; color:#fff; padding:0.5rem; width:100%; border-radius:4px; margin-bottom:1rem;">
                
                <p style="color:#aaa; font-size:0.9rem;">${t('notes', locale)}:</p>
                <textarea name="userNotes" rows="3" style="background:rgba(0,0,0,0.3); border:1px solid #444; color:#fff; padding:0.5rem; width:100%; border-radius:4px; margin-bottom:1rem; font-family:inherit;"></textarea>
                
                <div style="display:flex; justify-content:flex-end; gap:1rem;">
                    <button type="button" onclick="document.getElementById('markWatchedModal').close()" style="background:transparent; border:1px solid #555; color:#aaa; padding:0.5rem 1rem; cursor:pointer;">${t('cancel', locale)}</button>
                    <button type="submit" style="background:var(--ch-neon-cyan); border:none; color:#000; padding:0.5rem 1rem; font-weight:bold; cursor:pointer;">${t('save', locale)}</button>
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
                
                // Set form action
                form.action = '/films/watchlist/' + id + '/watched';
                
                modal.showModal();
            }

            function toggleDelete(btn, e) {
                e.stopPropagation();
                const wrapper = btn.closest('.delete-wrapper');
                const confirmBtn = wrapper.querySelector('.delete-confirm');
                
                if (confirmBtn.style.display === 'none') {
                    btn.style.display = 'none';
                    confirmBtn.style.display = 'inline-block';
                    
                    // Hide after 3 seconds if not clicked
                    setTimeout(() => {
                       if(document.body.contains(btn)) {
                           btn.style.display = 'inline-block';
                           confirmBtn.style.display = 'none';
                       }
                    }, 3000);
                }
            }

            async function confirmDelete(btn, id, e) {
                e.stopPropagation();
                
                const card = btn.closest('.film-card');
                if(!card) return;

                // Optimistic UI Removal
                card.style.transition = 'opacity 0.3s, transform 0.3s';
                card.style.opacity = '0';
                card.style.transform = 'scale(0.9)';
                
                try {
                    const res = await fetch(\`/films/delete/\${id}\`, { 
                        method: 'POST',
                        headers: { 'Accept': 'application/json' }
                    });
                    
                    if (res.ok) {
                        setTimeout(() => card.remove(), 300);
                    } else {
                        // Revert if failed
                        card.style.opacity = '1';
                        card.style.transform = 'scale(1)';
                        alert('Silme başarısız oldu.');
                    }
                } catch (err) {
                     card.style.opacity = '1';
                     card.style.transform = 'scale(1)';
                     alert('Hata: ' + err.message);
                }
            }

            function openEditModal(filmStr) {
                const film = JSON.parse(decodeURIComponent(filmStr));
                const isoDate = film.watchDate ? new Date(film.watchDate).toISOString().split('T')[0] : '';

                document.getElementById('editId').value = film.id;
                document.getElementById('editReturnUrl').value = window.location.pathname;
                document.getElementById('editTitle').value = film.title;
                document.getElementById('editTitleTr').value = film.title_tr || '';
                document.getElementById('editDirector').value = film.director || '';
                document.getElementById('editYear').value = film.year || '';
                document.getElementById('editImageUrl').value = film.imageUrl || '';
                document.getElementById('editRating').value = film.rating || '';
                document.getElementById('editWatchDate').value = isoDate;
                document.getElementById('editUserNotes').value = film.userNotes || '';
                
                document.getElementById('editIsCinema').checked = film.isCinema === 1;
                document.getElementById('editIsHallOfFame').checked = film.isHallOfFame === 1;

                const img = document.getElementById('editImagePreview');
                if(film.imageUrl) {
                    img.src = film.imageUrl;
                    img.style.display = 'block';
                } else {
                    img.style.display = 'none';
                }

                document.getElementById('editFilmModal').showModal();
            }

            async function handleEditSubmit(e) {
                e.preventDefault();
                const form = e.target;
                const formData = new FormData(form);

                try {
                     const res = await fetch('/films/edit/' + formData.get('id'), {
                        method: 'POST',
                        body: formData
                    });

                    if (res.redirected) {
                        window.location.href = res.url;
                    } else if (res.ok) {
                        window.location.reload();
                    } else {
                        alert('Güncelleme başarısız!');
                    }
                } catch(err) {
                    alert('Hata: ' + err.message);
                }
            }
        </script>

        <!-- FILM DETAIL MODAL -->
        <dialog id="detailModal" style="width:95%; max-width:1100px; background:var(--ch-bg-card); border:1px solid var(--ch-neon-gold); color:#fff; padding:0; border-radius:12px; backdrop-filter:blur(20px); box-shadow:0 0 50px rgba(0,0,0,0.8);">
            <div style="position:relative;">
                <button type="button" onclick="document.getElementById('detailModal').close()" style="position:absolute; top:15px; right:15px; background:rgba(0,0,0,0.5); border:none; color:#fff; font-size:1.5rem; cursor:pointer; width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; z-index:20;">&times;</button>
                
                <div style="display:flex; flex-wrap:wrap;">
                    <!-- Left: Poster -->
                    <div style="flex:1 1 300px; max-width:400px; background:#000; display:flex; align-items:center; justify-content:center;">
                        <img id="modalPoster" src="" style="width:100%; height:auto; max-height:80vh; object-fit:contain; display:block;">
                    </div>
                    
                    <!-- Right: Info -->
                    <div style="flex:2 1 300px; padding:2.5rem; overflow-y:auto; max-height:80vh; position:relative;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem;">
                            <div style="flex:1;">
                                <h2 id="modalTitle" style="font-family:var(--ch-font-display); font-size:2.5rem; margin:0 0 0.5rem 0; line-height:1.1; color:var(--ch-neon-gold);"></h2>
                                <div id="modalTitleTr" style="color:#888; margin-bottom:1.5rem; font-size:1.1rem;"></div>
                            </div>
                            <div id="modalRatingBadge" class="film-rating-badge" style="width:50px; height:50px; flex-shrink:0; margin-right:40px;"></div>
                        </div>
                        
                        <div style="display:flex; align-items:center; gap:1.5rem; margin-bottom:2rem; font-size:0.95rem; color:#aaa; border-bottom:1px solid #333; padding-bottom:1rem;">
                            <div id="modalYear"></div>
                            <div id="modalDirector" style="color:#e0e0e0;"></div>
                            <div id="modalCinema"></div>
                        </div>


                        <div id="modalDescription" style="line-height:1.6; margin-bottom:2rem; font-size:1.05rem;"></div>

                        <div id="modalUserNotesContainer" style="display:none; background:rgba(255, 215, 0, 0.1); border-left:4px solid var(--ch-neon-gold); padding:1rem; margin-bottom:2rem; border-radius:4px;">
                            <h4 style="margin:0 0 0.5rem 0; color:var(--ch-neon-gold); font-family:var(--ch-font-display);">${t('notes', locale).toUpperCase()}</h4>
                            <div id="modalUserNotes" style="font-style:italic; color:#ddd;"></div>
                        </div>

                        <h4 style="color:var(--ch-neon-cyan); margin-bottom:1rem; font-family:var(--ch-font-display);">${t('cast', locale).toUpperCase()}</h4>
                        <div id="modalCast" style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:2rem;">
                            <!-- Cast tags -->
                        </div>

                         <div style="display:flex; justify-content:space-between; align-items:center; margin-top:auto; font-size:0.8rem; color:#666;">
                            <div id="modalGenres" class="genre-list" style="gap:8px;"></div>
                             <div id="modalDate"></div>
                         </div>
                    </div>
                </div>
            </div>
        </dialog>

        <script>
            function openDetailModal(filmStr) {
                const film = JSON.parse(decodeURIComponent(filmStr));
                const m = document.getElementById('detailModal');
                
                // Elements
                document.getElementById('modalPoster').src = film.imageUrl || '';
                document.getElementById('modalTitle').innerText = film.title;
                document.getElementById('modalTitleTr').innerText = film.title_tr || '';
                document.getElementById('modalYear').innerText = film.year;
                document.getElementById('modalDirector').innerText = film.director || 'Bilinmiyor';
                
                // Rating Badge
                const r = film.rating;
                const badge = document.getElementById('modalRatingBadge');
                if (r) {
                    badge.style.display = 'flex';
                    badge.style.boxShadow = \`0 0 \${Math.max(0, (r - 4) * 3)}px rgba(255, 215, 0, \${r / 15})\`;
                    badge.style.borderColor = \`rgba(255, 215, 0, \${r / 12})\`;
                    badge.innerHTML = \`<span class="rating-value" style="font-size:1.5rem; text-shadow: 0 0 \${Math.max(0, (r - 5) * 3)}px rgba(255, 215, 0, 0.6); color: \${r < 5 ? '#888' : 'var(--ch-neon-gold)'}">\${r}</span>\`;
                } else {
                    badge.style.display = 'none';
                }

                document.getElementById('modalCinema').innerHTML = film.isCinema ? '<span style="color:var(--ch-neon-cyan); border:1px solid var(--ch-neon-cyan); padding:2px 6px; border-radius:4px; font-size:0.8rem;">SİNEMA</span>' : '';
                document.getElementById('modalDescription').innerText = film.description || 'Açıklama yok.';
                
                if (film.userNotes) {
                    document.getElementById('modalUserNotesContainer').style.display = 'block';
                    document.getElementById('modalUserNotes').innerText = film.userNotes;
                } else {
                    document.getElementById('modalUserNotesContainer').style.display = 'none';
                }
                
                // Date
                // Date & History
                const date = film.watchDate ? new Date(film.watchDate).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
                
                let historyHtml = '';
                if (film.stats && film.stats.count > 1) {
                    historyHtml = \`
                        <details style="margin-top:5px;">
                            <summary style="cursor:pointer; color:var(--ch-neon-gold); font-size:0.85rem; user-select:none; opacity:0.8; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8">
                                👁️ Toplam \${film.stats.count} kez izlendi
                            </summary>
                            <div style="margin-top:8px; display:flex; flex-direction:column; gap:4px; padding-left:10px; border-left:2px solid var(--ch-neon-gold);">
                                \${film.stats.dates.map((d, i) => \`
                                    <div style="color:#bbb; font-size:0.85rem;">
                                        <span style="color:#666; font-size:0.75rem; margin-right:5px;">#\${film.stats.dates.length - i}</span>
                                        \${new Date(d).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' })}
                                    </div>
                                \`).join('')}
                            </div>
                        </details>
                    \`;
                }
                
                document.getElementById('modalDate').innerHTML = \`
                    <div style="color:#ddd; margin-bottom:5px;">📅 \${date}</div>
                    \${historyHtml}
                \`;

                // Genres
                let genres = [];
                try { 
                    genres = JSON.parse(film.genres); 
                    if (!Array.isArray(genres)) genres = [];
                } catch(e) { genres = []; }
                document.getElementById('modalGenres').innerHTML = genres.map(g => \`<span class="mini-tag">\${g}</span>\`).join('');

                // Cast
                let actors = [];
                try { 
                    actors = JSON.parse(film.actors); 
                    if (!Array.isArray(actors)) actors = [];
                } catch(e) { actors = []; }
                if(actors.length > 0) {
                     document.getElementById('modalCast').innerHTML = actors.slice(0, 10).map(a => \`
                        <a href="/films/actor/\${encodeURIComponent(a)}" style="text-decoration:none; color:inherit;">
                            <div style="background:rgba(0,0,0,0.5); padding:5px 10px; border-radius:4px; border:1px solid #333; font-size:0.9rem; transition:all 0.2s;" onmouseover="this.style.borderColor='var(--ch-neon-cyan)'; this.style.color='var(--ch-neon-cyan)';" onmouseout="this.style.borderColor='#333'; this.style.color='inherit';">
                                \${a}
                            </div>
                        </a>
                     \`).join('');
                } else {
                    document.getElementById('modalCast').innerHTML = '<span style="color:#555;">Oyuncu bilgisi yok.</span>';
                }

                m.showModal();
            }
        </script>
    </div>
</body>
</html>
`;
};

// Helper: Render Film Grid
const renderFilmGrid = (films, editMode = false, stats = {}, locale = 'tr') => {
    return films.map(film => {
        const isCinema = film.isCinema === 1;
        // Watch Stats
        const filmStats = stats[film.title] || { count: 1, dates: [film.watchDate] };
        const isRewatched = filmStats.count > 1;
        const watchCountBadge = isRewatched ? `
            <div title="${t('watch_details', locale)}: ${filmStats.count}" 
                 style="position:absolute; top:10px; right:10px; background:rgba(0,0,0,0.8); color:var(--ch-neon-gold); 
                        border:1px solid var(--ch-neon-gold); padding:2px 8px; border-radius:12px; font-size:0.75rem; 
                        font-weight:bold; box-shadow:0 0 5px rgba(255,215,0,0.3); z-index:5; display:flex; align-items:center; gap:4px;">
                 <span>👁️</span> ${filmStats.count}
            </div>` : '';

        // Format dates for tooltip
        const dateListTooltip = isRewatched ?
            filmStats.dates.map(d => new Date(d).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })).join('\n')
            : '';

        // Parse genres safely
        let genreList = [];
        try {
            if (film.genres && film.genres.trim().startsWith('[')) {
                genreList = JSON.parse(film.genres);
            } else if (film.genres) {
                genreList = [film.genres];
            }
        } catch (e) { genreList = []; }

        const genreHtml = genreList.slice(0, 3).map(g => `<span class="mini-tag">${g}</span>`).join('');

        const dateDisplay = film.watchDate ? new Date(film.watchDate).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
        const filmData = encodeURIComponent(JSON.stringify(film)).replace(/'/g, '%27');

        const editActions = editMode ? `
            <div class="btn-actions">
                <button onclick="openEditModal('${filmData}')" style="background:none; border:none; color:var(--ch-neon-cyan); font-size:0.8rem; cursor:pointer; text-decoration:none;">${t('edit', locale)}</button>
                <div class="delete-wrapper" style="display:inline-block; position:relative;">
                    <button type="button" onclick="toggleDelete(this, event)" style="background:none; border:none; color:#555; font-size:0.8rem; cursor:pointer; text-decoration:underline;">${t('delete', locale)}</button>
                    <button type="button" onclick="confirmDelete(this, ${film.id}, event)" class="delete-confirm" style="display:none; background:var(--ch-neon-red); color:#fff; border:none; padding:2px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer; margin-left:5px;">Sil?</button>
                </div>
            </div>
        ` : '';

        // SPECIAL ACTION: Mark Watched (for Watchlist items only)
        const watchlistAction = film.status === 'watchlist' ? `
            <div class="btn-actions" style="justify-content:center; border-top-color:var(--ch-neon-cyan);">
                <button type="button" onclick="markAsWatched(${film.id})" style="background:var(--ch-neon-cyan); color:#000; border:none; padding:0.5rem 1rem; border-radius:4px; font-weight:bold; cursor:pointer; width:100%;">
                    ✅ ${t('mark_watched', locale)}
                </button>
            </div>
        ` : '';

        // Attach stats to film object for modal
        film.stats = filmStats;

        // filmData was already encoded above

        return `
        <div class="film-card" onclick="openDetailModal('${filmData}')" style="cursor:pointer;">
            <div class="poster-frame">
                ${film.imageUrl ? `<img src="${film.imageUrl}" alt="${film.title}" class="poster-img">` : '<div style="width:100%; height:100%; background:#222; display:flex; align-items:center; justify-content:center; color:#555;">NO POSTER</div>'}
                ${isCinema ? `<div class="cinema-badge">${t('cinema_mode', locale)}</div>` : ''}
                ${watchCountBadge}
            </div>
            <div class="film-info">
                <div class="info-header">
                    <div class="film-title-group">
                        <div class="film-title" title="${film.title}">${film.title}</div>
                        ${film.title_tr ? `<div class="film-title-tr" style="color:#777; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:-2px;">${film.title_tr}</div>` : ''}
                        <div class="film-director">${film.director || t('director', locale) + '?'}</div>
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
                
                ${film.userNotes ? `<div class="film-description" title="${t('notes', locale)}" onclick="event.stopPropagation(); this.classList.toggle('expanded')">${film.userNotes}</div>` : ''}
                
                <div class="info-footer">
                        <div class="genre-list">${genreHtml}</div>
                    <div class="watch-date" title="${isRewatched ? 'History:\n' + dateListTooltip : ''}" style="${isRewatched ? 'border-bottom:1px dashed #666; cursor:help;' : ''}">
                        ${dateDisplay} ${isRewatched ? '<span style="font-size:0.7em; color:var(--ch-neon-gold);">(+Hits)</span>' : ''}
                    </div>
                </div>
                <!-- Stop Propagation for Actions -->
                <div onclick="event.stopPropagation()">
                    ${watchlistAction}
                    ${editActions}
                </div>
            </div>
        </div >
    `;
    }).join('');
};


// Helper: Render Form (Shared for Add & Edit)
const renderForm = (film = null, returnUrl = '', locale = 'tr') => {
    const isEdit = !!film;
    const action = isEdit ? `/films/edit/${film.id}` : '/films/add';
    const title = isEdit ? 'BİLETİ DÜZENLE' : t('title_add', locale); // Needs proper key for 'Edit Ticket'? 'title_add' is 'Add New Film'. 
    // Let's use generic 'edit' key or similar? The dictionary has 'edit'. 'BİLETİ DÜZENLE' is stylized. 
    // I'll stick to hardcoded stylized or add to dictionary. I added 'title_add'.
    const formTitle = isEdit ? t('edit', locale).toUpperCase() : t('title_add', locale).toUpperCase();
    const btnText = isEdit ? t('save', locale) : t('add_film_btn', locale);

    // Safety checks for values
    const val = (key) => film ? (film[key] || '') : '';
    const genres = film && film.genres ? JSON.parse(film.genres) : [];
    const isCinemaChecked = film && film.isCinema ? 'checked' : '';

    return `
    <div class="form-container">
            <h2 style="font-family:var(--ch-font-display); color:var(--ch-neon-red); margin-top:0;">${formTitle}</h2>
            <form action="${action}" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="returnUrl" value="${returnUrl}">
                <div class="form-group">
                    <label class="cinema-label">TITLE (ORIGINAL)</label>
                    <div style="display:flex; gap:10px;">
                        <input type="text" id="titleInput" name="title" class="cinema-input" value="${val('title')}" required style="flex:1;">
                        <button type="button" onclick="openSearchModal()" class="btn-search">
                            🔍 TMDB
                        </button>
                    </div>
                </div>

                <div class="form-group">
                    <label class="cinema-label">TITLE (LOCAL)</label>
                    <input type="text" name="title_tr" class="cinema-input" value="${val('title_tr')}" placeholder="Opsiyonel">
                </div>
                
                <div class="form-group" style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
                    <div>
                        <label class="cinema-label">${t('director', locale).toUpperCase()}</label>
                        <input type="text" name="director" class="cinema-input" value="${val('director')}">
                    </div>
                    <div>
                        <label class="cinema-label">${t('year', locale).toUpperCase()}</label>
                        <input type="number" name="year" class="cinema-input" value="${val('year')}">
                    </div>
                </div>

                <div class="form-group">
                    <label class="cinema-label">${t('cast', locale).toUpperCase()}</label>
                    <div class="genre-input-container" onclick="document.getElementById('actor-input').focus()">
                        <div id="actor-tags" style="display:contents;"></div>
                        <input type="text" id="actor-input" class="genre-type-input" placeholder="${t('search_placeholder', locale)}" autocomplete="off">
                    </div>
                    <input type="hidden" name="actors" id="actors-hidden" value='${val('actors') || '[]'}'>
                    
                    <script>
                        (function() {
                            const input = document.getElementById('actor-input');
                            const hidden = document.getElementById('actors-hidden');
                            const container = document.getElementById('actor-tags');
                            let actors = [];
                            try { actors = JSON.parse(hidden.value); } catch(e){ actors = []; }

                            function render() {
                                container.innerHTML = actors.map(a => \`
                                    <div class="genre-tag">
                                        \${a}
                                        <span class="remove" onclick="removeActor('\${a}')">&times;</span>
                                    </div>
                                \`).join('');
                                hidden.value = JSON.stringify(actors);
                            }

                            window.removeActor = function(a) {
                                actors = actors.filter(x => x !== a);
                                render();
                            }

                            input.addEventListener('keydown', function(e) {
                                if(e.key === 'Enter' || e.key === ',') {
                                    e.preventDefault();
                                    const val = this.value.trim();
                                    if(val && !actors.includes(val)) {
                                        actors.push(val);
                                        render();
                                    }
                                    this.value = '';
                                }
                                if(e.key === 'Backspace' && !this.value && actors.length > 0) {
                                    actors.pop();
                                    render();
                                }
                            });
                            
                            // Listen for Auto-Fill
                            window.addEventListener('update-actors', function(e) {
                                actors = e.detail;
                                render();
                            });

                            render();
                        })();
                    </script>
                </div>

                <div class="form-group">
                    <label class="cinema-label">${t('genre', locale).toUpperCase()}</label>
                    
                    <div class="genre-input-container" onclick="document.getElementById('genre-input').focus()">
                        <div id="genre-tags" style="display:contents;">
                            <!-- Tags will be dynamically added here -->
                        </div>
                        <input type="text" id="genre-input" class="genre-type-input" placeholder="..." list="genre-list" autocomplete="off">
                    </div>

                    <input type="hidden" name="genres" id="genres-hidden" value='${JSON.stringify(genres)}'>
                    
                    <datalist id="genre-list">
                        ${['Sci-Fi', 'Drama', 'Action', 'Thriller', 'Horror', 'Comedy', 'Adventure', 'Mystery', 'Romance', 'Animation', 'Crime', 'Fantasy', 'Biography', 'Family', 'Musical', 'Music'].map(g => `<option value="${g}">`).join('')}
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
                         <input type="date" id="inputCheckDate" name="watchDate" class="cinema-input" value="${val('watchDate')}">
                    </div>
                    <div>
                         <label class="cinema-label">PUAN (0-10)</label>
                         <input type="number" id="inputCheckRating" name="rating" step="0.1" max="10" class="cinema-input" value="${val('rating')}">
                    </div>
                </div>

                <div class="form-group" style="margin-bottom:0.5rem;">
                    <label class="cinema-label">LİSTE DURUMU</label>
                    <select id="inputCheckStatus" name="status" class="cinema-input">
                        <option value="watched" ${val('status') === 'watched' || !val('status') ? 'selected' : ''}>✅ İZLENDİ (ARŞİV)</option>
                        <option value="watchlist" ${val('status') === 'watchlist' ? 'selected' : ''}>⏳ İZLENECEK (LİSTE)</option>
                    </select>
                </div>
                
                <script>
                    (function() {
                        const dateInput = document.getElementById('inputCheckDate');
                        const ratingInput = document.getElementById('inputCheckRating');
                        const statusSelect = document.getElementById('inputCheckStatus');

                        function checkValidation() {
                            if (statusSelect.value === 'watched') {
                                // REQUIRE Date & Rating
                                dateInput.required = true;
                                ratingInput.required = true;
                                
                                // Visual cues
                                dateInput.style.borderLeft = '3px solid var(--ch-neon-red)';
                                ratingInput.style.borderLeft = '3px solid var(--ch-neon-red)';
                            } else {
                                // Watchlist -> Not required
                                dateInput.required = false;
                                ratingInput.required = false;
                                
                                dateInput.style.borderLeft = '';
                                ratingInput.style.borderLeft = '';
                            }
                        }

                        // Listeners
                        statusSelect.addEventListener('change', checkValidation);
                        
                        dateInput.addEventListener('input', function() {
                            if (this.value) {
                                // User entered date -> Auto set Watched
                                statusSelect.value = 'watched';
                            } else {
                                // User cleared date -> Auto set Watchlist (Optional, but user requested smart flow)
                                statusSelect.value = 'watchlist';
                            }
                            checkValidation();
                        });

                        // Initial check
                        checkValidation();
                    })();
                </script>

                <div class="form-group">
                    <label class="cinema-label">AFİŞ GÖRSELİ ${isEdit ? '(Boş bırakılırsa değişmez)' : ''}</label>
                    <input type="file" name="image" class="cinema-input" accept="image/*">
                    <input type="hidden" name="imageUrl" value="${val('imageUrl')}">
                    ${isEdit && film.imageUrl ? `
                        <div id="poster-preview-container" style="display:flex; align-items:center; gap:10px; margin-top:5px; background:#222; padding:10px; border-radius:4px;">
                            <img src="${film.imageUrl}" style="height:60px; border-radius:4px;">
                            <div style="flex:1;">
                                <small style="color:#aaa;">Mevcut Afiş</small>
                            </div>
                            <button type="button" onclick="removePoster()" style="background:#ef4444; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">❌ AFİŞİ SİL</button>
                        </div>
                        
                        <script>
                            function removePoster() {
                                if(!confirm('Afiş silinecek. Emin misiniz?')) return;
                                document.getElementById('poster-preview-container').remove();
                                document.querySelector('input[name=imageUrl]').value = '';
                            }
                        </script>
                    ` : ''}
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
                    <label class="cinema-label">FİLM ÖZETİ (Description)</label>
                    <textarea name="description" rows="3" class="cinema-input">${val('description')}</textarea>
                </div>

                <div class="form-group">
                    <label class="cinema-label">NOTLAR / İNCELEME (User Notes)</label>
                    <textarea name="userNotes" rows="3" class="cinema-input" placeholder="Film hakkında kişisel notlarınız...">${val('userNotes')}</textarea>
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
                    // Populate Form - SMART FILL (Only if empty)
                    // TITLE LOGIC: Original -> title, Turkish -> title_tr
                    const titleInput = document.querySelector('input[name="title"]');
                    titleInput.value = movie.original_title || movie.title; 

                    const titleTrInput = document.querySelector('input[name="title_tr"]');
                     // If we fetched with language=tr (default), movie.title might be localized.
                     // But strictly, we want title_tr to be the Turkish title.
                     // TMDB result 'title' is usually localized if language=tr is used.
                     // So we set title_tr = movie.title
                    if (!titleTrInput.value) titleTrInput.value = movie.title;

                    const yearInput = document.querySelector('input[name="year"]');
                    if (!yearInput.value) yearInput.value = movie.release_date ? movie.release_date.split('-')[0] : '';
                    
                    const descInput = document.querySelector('textarea[name="description"]');
                    if (!descInput.value) descInput.value = movie.overview || '';
                    
                    const imgInput = document.querySelector('input[name="imageUrl"]');
                    if (!imgInput.value) imgInput.value = movie.poster_path ? '${TMDB_IMAGE_BASE}' + movie.poster_path : '';
                    
                    // Director
                    const dirInput = document.querySelector('input[name="director"]');
                    if (!dirInput.value) {
                        const director = movie.credits.crew.find(c => c.job === 'Director');
                        if(director) dirInput.value = director.name;
                    }
                    
                    // NEVER AUTO-FILL RATING
                    // const rateInput = document.querySelector('input[name="rating"]');
                    // if (!rateInput.value) rateInput.value = movie.vote_average.toFixed(1);
                    
                    // Genres - Only if empty
                    const genresHidden = document.getElementById('genres-hidden');
                    let currentGenres = [];
                    try { currentGenres = JSON.parse(genresHidden.value); } catch(e){}
                    
                    if (currentGenres.length === 0) {
                        const genres = movie.genres.map(g => g.name);
                        window.dispatchEvent(new CustomEvent('update-genres', { detail: genres }));
                    }

                    // Actors - Only if empty
                    const actorsHidden = document.getElementById('actors-hidden');
                    let currentActors = [];
                    try { currentActors = JSON.parse(actorsHidden.value); } catch(e){}
                    
                    if (movie.credits && movie.credits.cast) {
                        const actors = movie.credits.cast.slice(0, 10).map(c => c.name);
                        window.dispatchEvent(new CustomEvent('update-actors', { detail: actors }));
                    }
                    
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
    const locale = getLocale(req);
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
            <h2 class="page-title">${t('nav_showcase', locale)} ${currentYear}</h2>
            <div class="cinema-stats">
                <div class="stat-item"><strong>${stats.total}</strong> ${t('film', locale)}</div>
                <div class="stat-item"><strong>${stats.cinema}</strong> ${t('cinema', locale)}</div>
                <div class="stat-item"><strong>${stats.avg}</strong> ${t('avg', locale)}</div>
            </div>
        </div>
        <div class="film-grid">
            ${renderFilmGrid(films, editMode, getWatcherStats(), locale)}
        </div>
    `, 'title_showcase', req));
});

// GET /archive - All Films with Filters
// GET /archive - All Films with Filters
router.get('/archive', (req, res) => {
    const editMode = req.query.edit === 'true';
    const locale = getLocale(req);
    const { director, genre, year, sort, q, isCinema } = req.query;
    const filters = getFilterData();

    let query = "SELECT * FROM films WHERE status = 'watched'";
    const params = [];

    if (q) {
        query += " AND (title LIKE ? OR title_tr LIKE ? OR director LIKE ? OR actors LIKE ?)";
        params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
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
                     <input type="text" name="q" class="cinema-input-sm" value="${q || ''}" placeholder="${t('search_placeholder', locale)}" style="width:100%; border-right:none; border-top-right-radius:0; border-bottom-right-radius:0;">
                     <button type="submit" class="btn-cinema-sm" style="border-top-left-radius:0; border-bottom-left-radius:0; background:var(--ch-neon-cyan); color:#000; border-color:var(--ch-neon-cyan);">${t('search_btn', locale)}</button>
                </div>

                <label style="display:flex; align-items:center; color:#ccc; font-size:0.9rem; cursor:pointer; background:rgba(0,0,0,0.5); padding:0 10px; height:38px; border:1px solid #444; border-radius:4px;">
                    <input type="checkbox" name="isCinema" onchange="this.form.submit()" ${isCinema ? 'checked' : ''} style="margin-right:5px;">
                    ${t('cinema', locale)}
                </label>

                <select name="director" class="cinema-input-sm" onchange="this.form.submit()">
                    <option value="">${t('filter_all', locale)} ${t('director', locale)}</option>
                    ${filters.directors.map(d => `<option value="${d}" ${director === d ? 'selected' : ''}>${d}</option>`).join('')}
                </select>
                <select name="year" class="cinema-input-sm" onchange="this.form.submit()">
                    <option value="">${t('filter_all', locale)} ${t('year', locale)}</option>
                    ${filters.years.map(y => `<option value="${y}" ${year === y ? 'selected' : ''}>${y}</option>`).join('')}
                </select>
                <select name="genre" class="cinema-input-sm" onchange="this.form.submit()">
                    <option value="">${t('filter_all', locale)} ${t('genre', locale)}</option>
                    ${filters.genres.map(g => `<option value="${g}" ${genre === g ? 'selected' : ''}>${g}</option>`).join('')}
                </select>
                <select name="sort" class="cinema-input-sm" onchange="this.form.submit()">
                    <option value="date_desc" ${sort === 'date_desc' ? 'selected' : ''}>${t('sort_date_desc', locale)}</option>
                    <option value="rating_desc" ${sort === 'rating_desc' ? 'selected' : ''}>${t('sort_rating_desc', locale)}</option>
                    <option value="rating_asc" ${sort === 'rating_asc' ? 'selected' : ''}>${t('sort_rating_asc', locale)}</option>
                </select>
                <a href="/films/archive${editMode ? '?edit=true' : ''}" class="btn-cinema-sm" style="text-decoration:none; display:inline-block; text-align:center;">${t('reset', locale)}</a>
            </form>
        </div>
    `;

    res.send(renderPage(`
        <div class="section-header">
            <h2 style="color:var(--ch-neon-gold);">${t('title_archive', locale).toUpperCase()} (${films.length})</h2>
        </div>
        ${filterHtml}
        <div class="film-grid">
            ${renderFilmGrid(films, editMode, getWatcherStats(), locale)}
        </div>
    `, 'title_archive', req));
});

// GET /watchlist - Items to watch
router.get('/watchlist', (req, res) => {
    const editMode = req.query.edit === 'true';
    const locale = getLocale(req);
    const films = db.prepare("SELECT * FROM films WHERE status = 'watchlist' ORDER BY id DESC").all();

    res.send(renderPage(`
        <div class="section-header">
            <h2 class="page-title" style="color:var(--ch-neon-cyan);">${t('title_watchlist', locale).toUpperCase()} (${films.length})</h2>
        </div>
        
        ${films.length > 0 ? `
            <div class="film-grid">
                ${renderFilmGrid(films, editMode, {}, locale)}
            </div>
        ` : `<div style="text-align:center; padding:4rem; color:#666; font-size:1.2rem;">${t('empty_watchlist', locale)}</div>`}

    `, 'title_watchlist', req));
});

// POST /mark-watched/:id
router.post('/mark-watched/:id', (req, res) => {
    const id = req.params.id;
    const watchDate = req.body.watchDate || new Date().toISOString().split('T')[0];
    const rating = req.body.rating ? parseFloat(req.body.rating) : null;
    const userNotes = req.body.userNotes || null;

    db.prepare("UPDATE films SET status = 'watched', watchDate = ?, rating = ?, userNotes = ? WHERE id = ?").run(watchDate, rating, userNotes, id);
    res.redirect('/films'); // Redirect to homepage to see it in "Latest"
});

// GET /hall-of-fame - High Rated Films
router.get('/hall-of-fame', (req, res) => {
    const editMode = req.query.edit === 'true';
    const locale = getLocale(req);
    // Fetch films with isHallOfFame = 1
    const films = db.prepare("SELECT * FROM films WHERE isHallOfFame = 1 ORDER BY rating DESC, watchDate DESC").all();

    res.send(renderPage(`
        <div class="hall-of-fame-container" style="text-align:center; padding:2rem 0;">
            <div class="hof-header" style="margin-bottom:3rem;">
                <div style="font-size:3rem; margin-bottom:0.5rem;">⚜️</div>
                <h2 style="font-family:var(--ch-font-display); font-size:2.5rem; background: linear-gradient(to bottom, #ffd700, #b8860b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-shadow: 0 0 30px rgba(255, 215, 0, 0.3); margin:0;">${t('hall_of_fame_title', locale)}</h2>
                <p style="color:#888; letter-spacing:2px; font-size:0.9rem; margin-top:0.5rem;">${t('hall_of_fame_subtitle', locale)}</p>
            </div>
            
            ${films.length > 0 ? `
                <div class="film-grid hof-grid">
                    ${renderFilmGrid(films, editMode, {}, locale).replace(/class="film-card"/g, 'class="film-card hof-card"')}
                </div>
            ` : `<div style="color:#666; margin-top:2rem;">${t('empty_hof', locale)}</div>`}
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
    `, 'hall_of_fame_title', req));
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

// POST /api/tools/fetch-missing - Auto Fetch Tool (Smart Match)
router.post('/api/tools/fetch-missing', async (req, res) => {
    try {
        const films = db.prepare("SELECT * FROM films").all();
        let updateCount = 0;
        let errors = [];
        let ambiguous = [];

        // Helper: Fetch basic search results
        const searchTMDB = (query, year) => {
            return new Promise((resolve) => {
                const url = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&language=tr-TR&query=${encodeURIComponent(query)}${year ? `&year=${year}` : ''}`;
                https.get(url, (res) => {
                    let data = '';
                    res.on('data', c => data += c);
                    res.on('end', () => {
                        try { resolve(JSON.parse(data).results || []); } catch (e) { resolve([]); }
                    });
                }).on('error', () => resolve([]));
            });
        };

        // Helper: Fetch details (for director)
        const getDetails = (id) => {
            return new Promise((resolve) => {
                // Determine language based on app preference? For now keep tr-TR
                const url = `${TMDB_BASE_URL}/movie/${id}?api_key=${TMDB_API_KEY}&language=tr-TR&append_to_response=credits`;
                https.get(url, (res) => {
                    let data = '';
                    res.on('data', c => data += c);
                    res.on('end', () => {
                        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
                    });
                }).on('error', () => resolve(null));
            });
        };

        for (const film of films) {
            // Skip if manually verified (optional flag? for now just process all but be careful)
            if (!film.title) continue;

            // Skip if already has an image (User Request)
            if (film.imageUrl && film.imageUrl.trim() !== '') continue;

            // 1. Search Strategy - Multi-Stage Smart Search
            // Only try next stage if previous returned ZERO results
            // If we have 1+ results, they're likely correct - no need to search more

            // Helper: Clean title (decode URL encoding + trim)
            const cleanupTitle = (title) => {
                if (!title) return '';
                try {
                    // Decode URL encoding (e.g., "Dune 2021%20" → "Dune 2021 ")
                    title = decodeURIComponent(title);
                } catch (e) {
                    // If decode fails, use original
                }
                return title.trim();
            };

            const originalTitle = cleanupTitle(film.title);
            const turkishTitle = film.title_tr ? cleanupTitle(film.title_tr) : null;

            // Helper to strip year suffixes
            const stripYear = (title) => {
                return title.replace(/\s+\(?\d{4}\)?$/g, '').replace(/\s+\[\d{4}\]$/g, '').trim();
            };

            // A. Primary Search (Original Title)
            let candidates = await searchTMDB(originalTitle);

            // B. Fallback 1: Year-Stripped Original (ONLY if no results)
            if (candidates.length === 0) {
                const cleanTitle = stripYear(originalTitle);
                if (cleanTitle !== originalTitle) {
                    candidates = await searchTMDB(cleanTitle);
                }
            }

            // C. Fallback 2: Turkish Title (ONLY if still no results)
            if (candidates.length === 0 && turkishTitle && turkishTitle !== originalTitle) {
                candidates = await searchTMDB(turkishTitle);
            }

            // D. Fallback 3: Year-Stripped Turkish (ONLY if still no results)
            if (candidates.length === 0 && turkishTitle) {
                const cleanTurkish = stripYear(turkishTitle);
                if (cleanTurkish !== turkishTitle && cleanTurkish !== originalTitle) {
                    candidates = await searchTMDB(cleanTurkish);
                }
            }

            if (candidates.length === 0) {
                errors.push(`${film.title} (${film.year}): Bulunamadı`);
                continue;
            }

            // 2. Enrich Candidates (Get Director) - Limit to Top 3 to save API
            // Only enrich if we really need to check director or there are multiple options
            // actually we always need actors/details for the update.
            const enrichedCandidates = [];
            for (const cand of candidates.slice(0, 5)) {
                const details = await getDetails(cand.id);
                if (details) {
                    const director = details.credits?.crew?.find(c => c.job === 'Director')?.name || '';
                    enrichedCandidates.push({ ...cand, ...details, directorName: director }); // details has extensive info
                }
            }

            if (enrichedCandidates.length === 0) {
                errors.push(`${film.title}: Detaylar çekilemedi`);
                continue;
            }

            // 3. Selection Logic
            let winner = null;

            // A. Director Match (Strong Signal)
            if (film.director) {
                const dirMatches = enrichedCandidates.filter(c =>
                    c.directorName && c.directorName.toLowerCase().includes(film.director.toLowerCase())
                );

                if (dirMatches.length === 1) {
                    winner = dirMatches[0];
                } else if (dirMatches.length > 1) {
                    // Ambiguous among directors?
                    // Tie-breaker: Year?
                    if (film.year) {
                        const yearMatches = dirMatches.filter(c => c.release_date && c.release_date.startsWith(film.year));
                        if (yearMatches.length === 1) winner = yearMatches[0];
                    }
                }
            }

            // B. Single Result fallback
            if (!winner && enrichedCandidates.length === 1) {
                winner = enrichedCandidates[0];
            }

            // C. Exact Title + Year Match (if Director check didn't happen or failed)
            if (!winner && film.year) {
                const exactMatches = enrichedCandidates.filter(c =>
                    (c.title.toLowerCase() === film.title.toLowerCase() || c.original_title.toLowerCase() === film.title.toLowerCase()) &&
                    c.release_date && c.release_date.startsWith(film.year)
                );
                if (exactMatches.length === 1) winner = exactMatches[0];
            }

            // D. Exact Title Match (Ignore Year - Absolute Fallback)
            if (!winner) {
                const cleanTitle = film.title.trim().toLowerCase();
                const titleStrictMatches = enrichedCandidates.filter(c =>
                    c.original_title.toLowerCase() === cleanTitle ||
                    c.title.toLowerCase() === cleanTitle
                );

                // If we have exact matches, pick the best one
                if (titleStrictMatches.length > 0) {
                    // Sort by popularity/votes
                    titleStrictMatches.sort((a, b) => b.vote_count - a.vote_count);
                    winner = titleStrictMatches[0];
                }
            }

            // 4. Action
            if (winner) {
                // AUTO UPDATE
                let shouldUpdate = false;

                // Logic: Only update if fields are missing OR to correct Title Case/Tr
                // But user wants "Smart Fix".

                const newTitle = winner.original_title; // Always prefer original logic?
                // Logic from before:
                // If DB Key is Turkish, keep Turkish. If Original, keep Original.
                // Simplified:
                const dbIsTr = film.title === winner.title;
                const dbIsOrg = film.title === winner.original_title;

                let targetTitle = film.title;
                let targetTitleTr = film.title_tr;

                // Smart Title fill
                if (!dbIsTr && !dbIsOrg) {
                    // DB has weird title. Set Title = Original, TitleTR = Turkish
                    targetTitle = winner.original_title;
                    targetTitleTr = winner.title;
                    shouldUpdate = true;
                } else {
                    if (!targetTitleTr && winner.title !== winner.original_title) {
                        targetTitleTr = winner.title;
                        shouldUpdate = true;
                    }
                }

                let targetImage = film.imageUrl;
                if (!targetImage && winner.poster_path) {
                    targetImage = `${TMDB_IMAGE_BASE}${winner.poster_path}`;
                    shouldUpdate = true;
                } else if (targetImage && targetImage.includes('tmdb') && winner.poster_path && !targetImage.includes(winner.poster_path)) {
                    // Image mismatch? Update to correct one?
                    // User said "bazen hatalı poster çekiyor". Trust new 'Smart Match' result.
                    targetImage = `${TMDB_IMAGE_BASE}${winner.poster_path}`;
                    shouldUpdate = true;
                }

                let targetDesc = film.description;
                if (!targetDesc && winner.overview) {
                    targetDesc = winner.overview;
                    shouldUpdate = true;
                }

                let targetActors = film.actors;
                try {
                    const curr = JSON.parse(film.actors || '[]');
                    if (curr.length === 0 && winner.credits?.cast) {
                        targetActors = JSON.stringify(winner.credits.cast.slice(0, 10).map(c => c.name));
                        shouldUpdate = true;
                    }
                } catch (e) { }

                let targetDirector = film.director;
                if (!targetDirector && winner.directorName) {
                    targetDirector = winner.directorName;
                    shouldUpdate = true;
                }

                let targetYear = film.year;
                if (winner.release_date) {
                    const y = winner.release_date.split('-')[0];
                    if (targetYear !== y) {
                        targetYear = y;
                        shouldUpdate = true;
                    }
                }

                if (shouldUpdate) {
                    const update = db.prepare(`
                        UPDATE films SET 
                        title = ?, title_tr = ?, imageUrl = ?, year = ?, description = ?, actors = ?, director = ?
                        WHERE id = ?
                    `);
                    update.run(targetTitle, targetTitleTr, targetImage, targetYear, targetDesc, targetActors, targetDirector, film.id);
                    updateCount++;
                }

            } else {
                // AMBIGUOUS
                // Return top candidates for user selection
                ambiguous.push({
                    film: film,
                    candidates: enrichedCandidates.map(c => ({
                        id: c.id,
                        title: c.title,
                        original_title: c.original_title,
                        year: c.release_date ? c.release_date.split('-')[0] : '',
                        directorName: c.directorName,  // Fixed: was 'director', should match frontend expectation
                        poster_path: c.poster_path
                    }))
                });
            }

            // Rate limit compliance
            await new Promise(r => setTimeout(r, 200));
        }

        res.json({ success: true, count: updateCount, errors, ambiguous });

    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/tools/apply-match - Manually apply a TMDB match
router.post('/api/tools/apply-match', async (req, res) => {
    const { filmId, tmdbId } = req.body;

    try {
        const film = db.prepare("SELECT * FROM films WHERE id = ?").get(filmId);

        if (!film) {
            return res.json({ success: false, error: 'Film not found' });
        }

        // Fetch details
        const url = `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=tr-TR&append_to_response=credits`;
        https.get(url, (apiRes) => {
            let data = '';
            apiRes.on('data', c => data += c);
            apiRes.on('end', () => {
                try {
                    const movie = JSON.parse(data);

                    if (!movie || !movie.id) {
                        return res.status(500).json({ success: false, error: 'Invalid TMDB response' });
                    }

                    // Update Logic (Force Update)
                    const newTitle = movie.original_title || film.title;
                    const newTitleTr = movie.title || film.title_tr;
                    const newYear = movie.release_date ? movie.release_date.split('-')[0] : film.year;
                    const newImage = movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : film.imageUrl;
                    const newDesc = movie.overview || film.description;

                    let newActors = film.actors;
                    if (movie.credits && movie.credits.cast) {
                        newActors = JSON.stringify(movie.credits.cast.slice(0, 10).map(c => c.name));
                    }

                    const director = movie.credits?.crew?.find(c => c.job === 'Director')?.name || film.director;

                    const update = db.prepare(`
                        UPDATE films SET 
                        title = ?, title_tr = ?, imageUrl = ?, year = ?, description = ?, actors = ?, director = ?
                        WHERE id = ?
                    `);
                    const result = update.run(newTitle, newTitleTr, newImage, newYear, newDesc, newActors, director, filmId);

                    if (result.changes > 0) {
                        console.log(`Updated film ${filmId} with TMDB ${tmdbId}`);
                        res.json({ success: true });
                    } else {
                        res.status(500).json({ success: false, error: 'DB Update failed' });
                    }

                } catch (e) {
                    console.error('Apply Match Error:', e);
                    res.status(500).json({ success: false, error: e.message });
                }
            });
        }).on('error', (e) => res.status(500).json({ success: false, error: e.message }));

    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /stats - Statistics Dashboard
router.get('/stats', (req, res) => {
    // 1. Determine Years for Filter
    const editMode = req.query.edit === 'true'; // Wait, stats doesn't use editMode but renderPage might need the param to keep it? Using req
    const locale = getLocale(req);
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
    let periodTitle = t('stats_all_time', locale);

    if (selectedYear !== 'all') {
        statsFilms = allFilms.filter(f => f.watchDate && f.watchDate.startsWith(selectedYear));
        periodTitle = `${selectedYear}`; // Just year
    }

    // 2. Monthly Activity
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    // TODO: Translate months? 'months' array is used for display. I should use locale specific months.
    // I can generate them using Date.
    const getMonthName = (index) => new Date(2000, index, 1).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US', { month: 'short' });

    // ... logic ...
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
                <h2 class="page-title" style="margin:0; color:var(--ch-neon-gold);">${t('stats_title', locale)} <span style="font-size:0.6em; color:#666;">// ${periodTitle}</span></h2>
                
                <form action="/films/stats" method="GET" style="margin:0;">
                    <select name="year" class="cinema-input-sm" onchange="this.form.submit()" style="background:rgba(20,20,20,0.8); border:1px solid var(--ch-neon-gold); color:var(--ch-neon-gold); font-weight:bold; padding: 0.5rem 1rem; border-radius:4px; cursor:pointer;">
                        <option value="all" ${selectedYear === 'all' ? 'selected' : ''}>${t('stats_all_time', locale)}</option>
                        ${availableYears.map(y => `<option value="${y}" ${selectedYear == y ? 'selected' : ''}>${y}</option>`).join('')}
                    </select>
                </form>
            </div>
            
            <div class="stats-grid">
                <!-- Monthly Activity Chart -->
                <div class="stat-card full-width">
                    <h3>${t('stats_monthly', locale)}</h3>
                    <div class="chart-bar-container">
                        ${monthlyCounts.map((count, i) => {
        const height = maxMonthly > 0 ? (count / maxMonthly) * 100 : 0;
        return `
                                <div class="bar-group">
                                    <div class="bar-value">${count > 0 ? count : ''}</div>
                                    <div class="bar" style="height: ${height}%; box-shadow: 0 0 ${count > 0 ? '10px' : '0'} var(--ch-neon-cyan);"></div>
                                    <div class="bar-label">${getMonthName(i)}</div>
                                </div>
                            `;
    }).join('')}
                    </div>
                </div>

                <!-- Genre Distribution -->
                <div class="stat-card" style="max-height: 500px; overflow-y: auto;">
                    <h3>${t('stats_genre', locale)}</h3>
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
                    <h3>${t('stats_cinema_vs_home', locale)}</h3>
                    ${statsFilms.length > 0 ? `
                        <div class="donut-chart-container">
                            <div class="donut-stat">
                                <span style="color:var(--ch-neon-red); font-size:2rem; font-weight:bold;">${cinemaCount}</span>
                                <small>${t('cinema', locale)}</small>
                            </div>
                            <div class="donut-divider"></div>
                            <div class="donut-stat">
                                <span style="color:var(--ch-neon-cyan); font-size:2rem; font-weight:bold;">${homeCount}</span>
                                <small>${t('home', locale)}</small>
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

    res.send(renderPage(content, 'title_stats', req));
});

// GET /add - New Ticket Form
router.get('/add', (req, res) => {
    const locale = getLocale(req);
    const importForm = `
    <!-- CSV Import Section -->
        <div class="form-container" style="margin-top: 2rem; border-top-color: #ffd700;">
            <h2 style="font-family:var(--ch-font-display); color:#ffd700; margin-top:0;">${t('import_archive', locale)}</h2>
            <form action="/films/import" method="POST" enctype="multipart/form-data">
                <div class="form-group">
                    <label class="cinema-label">${t('upload_csv', locale)}</label>
                    <input type="file" name="csvFile" class="cinema-input" accept=".csv" required>
                        <small style="color:#666; display:block; margin-top:0.5rem;">${t('common_mapping_instr', locale)}</small>
                </div>
                <button type="submit" class="btn-cinema" style="width:100%; border-color:#ffd700; color:#ffd700;">${t('confirm_upload', locale)}</button>
            </form>
        </div>

        <div class="form-container" style="margin-top: 2rem; border-top-color: var(--ch-neon-cyan);">
            <h2 style="font-family:var(--ch-font-display); color:var(--ch-neon-cyan); margin-top:0;">${t('auto_fetch', locale)}</h2>
            <p style="color:#aaa; font-size:0.9rem; margin-bottom:1rem;">Görseli veya detayı eksik olan filmleri TMDB üzerinden tarar ve otomatik tamamlar.</p>
            
            <button type="button" onclick="startAutoFetch()" id="btnAutoFetch" class="btn-cinema" style="width:100%; border-color:var(--ch-neon-cyan); color:var(--ch-neon-cyan);">${t('start_scan', locale)}</button>
            
             <div id="fetchLog" style="margin-top:1rem; max-height:200px; overflow-y:auto; font-size:0.8rem; color:#888; display:none; background:#111; padding:0.5rem; border-radius:4px;"></div>
        </div>

        <div class="form-container" style="margin-top: 2rem; border-top-color: var(--ch-neon-gold);">
            <h2 style="font-family:var(--ch-font-display); color:var(--ch-neon-gold); margin-top:0;">${t('actor_sync', locale)}</h2>
            <p style="color:#aaa; font-size:0.9rem; margin-bottom:1rem;">Arşivdeki oyuncuların bilgilerini (Biyografi, Fotoğraf, Yaş) TMDB'den otomatik çeker.</p>
            
            <button type="button" onclick="startActorSync()" id="btnActorSync" class="btn-cinema" style="width:100%; border-color:var(--ch-neon-gold); color:var(--ch-neon-gold);">${t('start_sync', locale)}</button>
            <div id="actorSyncLog" style="margin-top:1rem; max-height:200px; overflow-y:auto; font-size:0.8rem; color:#888; display:none; background:#111; padding:0.5rem; border-radius:4px;"></div>
        </div>

        <dialog id="ambiguityModal" style="background:#111; border:1px solid var(--ch-neon-red); color:#eee; border-radius:12px; padding:0; width:90%; max-width:800px; max-height:80vh; overflow:hidden; box-shadow:0 0 50px rgba(0,0,0,0.8);">
            <div style="background:#222; padding:1rem; border-bottom:1px solid #444; display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:10;">
                <h2 style="margin:0; font-family:var(--ch-font-display); color:var(--ch-neon-red);">⚠️ Manuel Çözümleme</h2>
                <button onclick="document.getElementById('ambiguityModal').close()" style="background:transparent; border:none; color:#aaa; font-size:1.5rem; cursor:pointer;">&times;</button>
            </div>
            <div id="ambiguityList" style="padding:1rem; overflow-y:auto; max-height:calc(80vh - 70px);"></div>
        </dialog>

        <!-- EDIT MODAL -->
        <dialog id="editFilmModal" style="background:var(--ch-bg-card); border:1px solid var(--ch-neon-cyan); color:#fff; padding:2rem; border-radius:8px; width:90%; max-width:600px; backdrop-filter:blur(10px); max-height:90vh; overflow-y:auto;">
            <form id="editFilmForm" onsubmit="handleEditSubmit(event)">
                <input type="hidden" name="id" id="editId">
                <input type="hidden" name="returnUrl" id="editReturnUrl">
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                    <h3 style="margin:0; font-family:var(--ch-font-display); color:var(--ch-neon-cyan);">✏️ Filmi Düzenle</h3>
                    <button type="button" onclick="document.getElementById('editFilmModal').close()" style="background:transparent; border:none; color:#aaa; font-size:1.5rem; cursor:pointer;">&times;</button>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
                    <div>
                        <label style="display:block; color:#aaa; margin-bottom:5px; font-size:0.8rem;">Film Adı</label>
                        <input type="text" name="title" id="editTitle" required style="width:100%; padding:8px; background:#111; border:1px solid #444; color:#fff; border-radius:4px;">
                    </div>
                    <div>
                        <label style="display:block; color:#aaa; margin-bottom:5px; font-size:0.8rem;">TR Adı</label>
                        <input type="text" name="title_tr" id="editTitleTr" style="width:100%; padding:8px; background:#111; border:1px solid #444; color:#fff; border-radius:4px;">
                    </div>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-top:1rem;">
                    <div>
                        <label style="display:block; color:#aaa; margin-bottom:5px; font-size:0.8rem;">Yönetmen</label>
                        <input type="text" name="director" id="editDirector" style="width:100%; padding:8px; background:#111; border:1px solid #444; color:#fff; border-radius:4px;">
                    </div>
                    <div>
                        <label style="display:block; color:#aaa; margin-bottom:5px; font-size:0.8rem;">Yıl</label>
                        <input type="number" name="year" id="editYear" style="width:100%; padding:8px; background:#111; border:1px solid #444; color:#fff; border-radius:4px;">
                    </div>
                </div>

                <div style="margin-top:1rem;">
                     <label style="display:block; color:#aaa; margin-bottom:5px; font-size:0.8rem;">Afiş URL</label>
                     <div style="display:flex; gap:10px;">
                        <input type="text" name="imageUrl" id="editImageUrl" style="flex:1; padding:8px; background:#111; border:1px solid #444; color:#fff; border-radius:4px;">
                        <img id="editImagePreview" src="" style="width:40px; height:60px; object-fit:cover; display:none; border:1px solid #555;">
                     </div>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-top:1rem;">
                    <div>
                         <label style="display:block; color:#aaa; margin-bottom:5px; font-size:0.8rem;">Puan</label>
                         <input type="number" name="rating" id="editRating" step="0.1" max="10" style="width:100%; padding:8px; background:#111; border:1px solid #444; color:#fff; border-radius:4px;">
                    </div>
                    <div>
                         <label style="display:block; color:#aaa; margin-bottom:5px; font-size:0.8rem;">İzleme Tarihi</label>
                         <input type="date" name="watchDate" id="editWatchDate" style="width:100%; padding:8px; background:#111; border:1px solid #444; color:#fff; border-radius:4px;">
                    </div>
                </div>
                
                 <div style="margin-top:1rem;">
                     <label style="display:block; color:#aaa; margin-bottom:5px; font-size:0.8rem;">Kişisel Notlar</label>
                     <textarea name="userNotes" id="editUserNotes" rows="3" style="width:100%; padding:8px; background:#111; border:1px solid #444; color:#fff; border-radius:4px; font-family:inherit;"></textarea>
                </div>

                <div style="margin-top:1rem; display:flex; gap:1rem; align-items:center;">
                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
                        <input type="checkbox" name="isCinema" id="editIsCinema">
                        <span style="font-size:0.9rem;">Sinemada İzlendi</span>
                    </label>
                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
                        <input type="checkbox" name="isHallOfFame" id="editIsHallOfFame">
                        <span style="font-size:0.9rem;">Hall of Fame</span>
                    </label>
                </div>

                <div style="margin-top:2rem; display:flex; justify-content:flex-end; gap:1rem;">
                    <button type="button" onclick="document.getElementById('editFilmModal').close()" style="background:transparent; border:1px solid #555; color:#aaa; padding:0.5rem 1rem; cursor:pointer; border-radius:4px;">İptal</button>
                    <button type="submit" class="btn-cinema" style="border:none; padding:0.5rem 1.5rem; cursor:pointer; color:var(--ch-neon-cyan); border:1px solid var(--ch-neon-cyan);">Kaydet</button>
                </div>
            </form>
        </dialog>

        <script>
            // ... (keep existing scripts) ...
            let ambiguousFilms = [];

            async function startAutoFetch() {
                const btn = document.getElementById('btnAutoFetch');
                const log = document.getElementById('fetchLog');
                
                if(!confirm('Bu işlem eksik verisi olan tüm filmler için internetten veri çekecektir. Devam edilsin mi?')) return;

                btn.disabled = true;
                btn.innerText = 'TARANIYOR (Smart Match)...';
                log.style.display = 'block';
                log.innerHTML = '<div>🚀 İşlem başlatıldı...</div>';

                try {
                    const res = await fetch('/films/api/tools/fetch-missing', { method: 'POST' });
                    const data = await res.json();
                    
                    if(data.success) {
                        log.innerHTML += '<div style="color:var(--ch-neon-gold); margin-top:10px;">✅ İŞLEM TAMAMLANDI!</div>';
                        log.innerHTML += '<div>Toplam Güncellenen: ' + data.count + '</div>';
                        
                        if(data.ambiguous && data.ambiguous.length > 0) {
                            ambiguousFilms = data.ambiguous;
                            log.innerHTML += '<div style="color:var(--ch-neon-red); margin-top:10px;">⚠️ ' + data.ambiguous.length + ' film için belirsizlik var.</div>';
                            log.innerHTML += '<button onclick="openAmbiguityModal()" class="btn-cinema-sm" style="margin-top:5px; width:100%; background:var(--ch-neon-red);">⚠️ Manuel Gözden Geçir</button>';
                            btn.innerText = 'Manuel İşlem Gerekli';
                        } else {
                            btn.innerText = 'TAMAMLANDI';
                        }

                        if(data.errors.length > 0) {
                             log.innerHTML += '<div style="color:var(--ch-neon-red); margin-top:10px;">⚠️ Bazı Hatalar:</div>';
                             data.errors.slice(0, 5).forEach(e => log.innerHTML += '<div>- ' + e + '</div>');
                             if(data.errors.length > 5) log.innerHTML += '<div>...ve ' + (data.errors.length - 5) + ' tane daha.</div>';
                        }
                    } else {
                         log.innerHTML += '<div style="color:red;">❌ HATA: ' + data.error + '</div>';
                         btn.innerText = 'HATA';
                         btn.disabled = false;
                    }

                } catch(e) {
                     log.innerHTML += '<div style="color:red;">❌ AĞ HATASI: ' + e.message + '</div>';
                     btn.innerText = 'TEKRAR DENE';
                     btn.disabled = false;
                }
            }
            
            function openAmbiguityModal() {
                const modal = document.getElementById('ambiguityModal');
                renderAmbiguityList();
                modal.showModal();
            }

            function renderAmbiguityList() {
                const container = document.getElementById('ambiguityList');
                if(ambiguousFilms.length === 0) {
                    container.innerHTML = '<div style="text-align:center; padding:2rem;">Tüm çakışmalar çözüldü! 🎉</div>';
                    setTimeout(() => document.getElementById('ambiguityModal').close(), 1500);
                    return;
                }

                container.innerHTML = ambiguousFilms.map((item, index) => {
                    const film = item.film;
                    let html = '<div style="background:#222; border:1px solid #444; padding:1rem; border-radius:8px; margin-bottom:1rem;">';
                    html += '<h3 style="margin:0 0 0.5rem; color:var(--ch-neon-gold); font-size:1.1rem;">' + film.title + ' <span style="font-size:0.8rem; color:#888;">(' + (film.year || 'Yıl Yok') + ')</span></h3>';
                    html += '<div style="font-size:0.8rem; margin-bottom:1rem; color:#aaa;">DB Yönetmen: ' + (film.director || 'Yok') + '</div>';
                    
                    html += '<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap:10px;">';
                    
                    const candidatesHtml = item.candidates.map(c => {
                        const poster = c.poster_path ? '<img src="${TMDB_IMAGE_BASE}' + c.poster_path + '" style="width:100%; height:100%; object-fit:cover;">' : '<div style="width:100%; height:100%; background:#333;"></div>';
                        return '<div onclick="resolveItem(' + index + ', ' + c.id + ')" style="cursor:pointer; border:1px solid #333; padding:5px; border-radius:4px; text-align:center; transition:0.2s; background:#111; position:relative;" onmouseover="this.style.borderColor=\\'var(--ch-neon-cyan)\\'" onmouseout="this.style.borderColor=\\'#333\\'">' +
                               '<div style="aspect-ratio:2/3; background:#000; margin-bottom:5px; position:relative;">' + 
                               poster + 
                               '<div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.7); font-size:0.7rem; color:#fff; padding:2px;">' + (c.year || '-') + '</div>' + 
                               '</div>' +
                               '<div style="font-size:0.8rem; font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + c.title.replace(/'/g, "&#39;") + '</div>' +
                               '<div style="font-size:0.7rem; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + (c.directorName || '').replace(/'/g, "&#39;") + '</div>' +
                               '</div>';
                    }).join('');
                    
                    html += candidatesHtml;

                    html += '<div onclick="skipItem(' + index + ')" style="cursor:pointer; border:1px dashed #444; display:flex; align-items:center; justify-content:center; padding:10px; color:#666; font-size:0.8rem; flex-direction:column; gap:5px;"><span>🚫</span><span>Atla</span></div>';
                    html += '</div></div>';
                    return html;
                }).join('');
            }

            async function resolveItem(index, tmdbId) {
                const item = ambiguousFilms[index];
                const filmId = item.film.id;
                
                try {
                     const res = await fetch('/films/api/tools/apply-match', { 
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ filmId, tmdbId })
                    });
                    
                    const data = await res.json();
                    
                    if (data.success) {
                        ambiguousFilms.splice(index, 1);
                        renderAmbiguityList();
                    } else {
                        alert('Güncelleme başarısız: ' + (data.error || 'Bilinmeyen Hata'));
                    }

                } catch(e) {
                    alert('Hata oluştu: ' + e.message);
                }
            }

            function openEditModal(filmStr) {
                const film = JSON.parse(decodeURIComponent(filmStr));
                const isoDate = film.watchDate ? new Date(film.watchDate).toISOString().split('T')[0] : '';

                document.getElementById('editId').value = film.id;
                document.getElementById('editReturnUrl').value = window.location.pathname;
                document.getElementById('editTitle').value = film.title;
                document.getElementById('editTitleTr').value = film.title_tr || '';
                document.getElementById('editDirector').value = film.director || '';
                document.getElementById('editYear').value = film.year || '';
                document.getElementById('editImageUrl').value = film.imageUrl || '';
                document.getElementById('editRating').value = film.rating || '';
                document.getElementById('editWatchDate').value = isoDate;
                document.getElementById('editUserNotes').value = film.userNotes || '';
                
                document.getElementById('editIsCinema').checked = film.isCinema === 1;
                document.getElementById('editIsHallOfFame').checked = film.isHallOfFame === 1;

                const img = document.getElementById('editImagePreview');
                if(film.imageUrl) {
                    img.src = film.imageUrl;
                    img.style.display = 'block';
                } else {
                    img.style.display = 'none';
                }

                document.getElementById('editFilmModal').showModal();
            }

            async function handleEditSubmit(e) {
                e.preventDefault();
                const form = e.target;
                const formData = new FormData(form);
                // Backend expects specific fields. 
                // Convert FormData to JSON/UrlEncoded? 
                // Backend uses body-parser (urlencoded) and multer.
                // Fetch with FormData automatically sets Content-Type to multipart/form-data boundary.
                // But /edit/:id route uses upload.single('image'). 
                // Even if we don't send a file, it should work.

                try {
                     const res = await fetch('/films/edit/' + formData.get('id'), {
                        method: 'POST',
                        body: formData // Sends as multipart/form-data
                    });

                    if (res.redirected) {
                        window.location.href = res.url;
                    } else if (res.ok) {
                        window.location.reload();
                    } else {
                        alert('Güncelleme başarısız!');
                    }
                } catch(err) {
                    alert('Hata: ' + err.message);
                }
            }

            function skipItem(index) {
                ambiguousFilms.splice(index, 1);
                renderAmbiguityList();
            }

            async function startActorSync() {
                const btn = document.getElementById('btnActorSync');
                const log = document.getElementById('actorSyncLog');
                
                if(!confirm('Bu işlem tüm oyuncular için internetten veri çekecektir. Uzun sürebilir. Devam edilsin mi?')) return;

                btn.disabled = true;
                btn.innerText = 'TARANIYOR...';
                log.style.display = 'block';
                log.innerHTML = '<div>🚀 İşlem başlatıldı...</div>';

                try {
                    const res = await fetch('/films/api/tools/sync-actors', { method: 'POST' });
                    const data = await res.json();
                    
                    if(data.success) {
                        log.innerHTML += '<div style="color:var(--ch-neon-gold); margin-top:10px;">✅ ' + data.message + '</div>';
                        btn.innerText = 'TAMAMLANDI';
                    } else {
                         log.innerHTML += '<div style="color:red;">❌ HATA: ' + data.error + '</div>';
                         btn.innerText = 'HATA';
                         btn.disabled = false;
                    }

                } catch(e) {
                     log.innerHTML += '<div style="color:red;">❌ AĞ HATASI: ' + e.message + '</div>';
                     btn.innerText = 'TEKRAR DENE';
                     btn.disabled = false;
                }
            }
    </script>
`;
    res.send(renderPage(renderForm(null, '', locale) + importForm, 'title_add', req));
});

// GET /edit/:id
router.get('/edit/:id', (req, res) => {
    const locale = getLocale(req);
    const film = db.prepare('SELECT * FROM films WHERE id = ?').get(req.params.id);
    if (!film) return res.redirect('/films');
    const returnUrl = req.get('Referer') || '/films';
    res.send(renderPage(renderForm(film, returnUrl, locale), 'edit', req));
});

// POST /add
router.post('/add', upload.single('image'), (req, res) => {
    let { title, title_tr, director, year, rating, description, userNotes, watchDate, isCinema, isHallOfFame, genres, status } = req.body;

    // Auto-Watchlist Logic
    if (!status) {
        if (!watchDate) status = 'watchlist'; else status = 'watched';
    }

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

    // Handle Actors
    let actors = req.body.actors;
    if (actors) {
        if (typeof actors === 'string' && actors.trim().startsWith('[')) {
            // Already JSON
        } else {
            actors = '[]';
        }
    } else {
        actors = '[]';
    }

    // Handle Image
    // Use uploaded file if present, otherwise use the URL from the form (e.g. from "Find" tool)
    let finalImageUrl = req.body.imageUrl || '';
    if (req.file) {
        finalImageUrl = '/uploads/' + req.file.filename;
    }

    // Calculate Checkboxes
    isCinema = isCinema ? 1 : 0;
    isHallOfFame = isHallOfFame ? 1 : 0;

    const insert = db.prepare(`
        INSERT INTO films (title, title_tr, director, year, rating, description, userNotes, imageUrl, genres, actors, watchDate, isCinema, isHallOfFame, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(title, title_tr, director, year, rating, description, userNotes, finalImageUrl, genres, actors, watchDate, isCinema, isHallOfFame, status);
    res.redirect('/films');
});


// POST /edit/:id
router.post('/edit/:id', upload.single('image'), (req, res) => {
    let { title, title_tr, director, year, rating, description, userNotes, watchDate, isCinema, isHallOfFame, genres, status } = req.body;
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

    // Handle Actors
    let actors = req.body.actors;
    if (actors) {
        if (typeof actors === 'string' && actors.trim().startsWith('[')) {
            // Already JSON
        } else {
            actors = '[]';
        }
    } else {
        actors = '[]';
    }

    // Calculate Checkboxes
    isCinema = isCinema ? 1 : 0;
    isHallOfFame = isHallOfFame ? 1 : 0;

    // Handle Image (Only update if new file uploaded)
    // Handle Image
    let finalImageUrl = req.body.imageUrl;
    if (req.file) {
        finalImageUrl = '/uploads/' + req.file.filename;
    }

    if (!status) status = 'watched';

    const params = [title, title_tr, director, year, rating, description, userNotes, genres, actors, watchDate, isCinema, isHallOfFame, status, finalImageUrl, id];

    const update = db.prepare(`
        UPDATE films SET
        title = ?, title_tr = ?, director = ?, year = ?, rating = ?, description = ?, userNotes = ?, genres = ?, actors = ?, watchDate = ?, isCinema = ?, isHallOfFame = ?, status = ?, imageUrl = ?
        WHERE id = ?
    `);

    update.run(...params);
    const returnUrl = req.body.returnUrl;
    res.redirect(returnUrl || '/films');
});

// POST /import - Step 1: Upload & Map Columns
router.post('/import', upload.single('csvFile'), (req, res) => {
    const locale = getLocale(req);
    if (!req.file) return res.redirect('/films/add');

    const csv = require('csv-parser');
    const results = [];
    const headers = [];

    // We only need the headers first, but csv-parser gives us rows. 
    // We'll read the first row to get headers.
    // Actually, 'headers' event or just reading the first chunk?
    // Let's just read the whole file to be safe, it's usually small.
    // Wait, if it's huge, memory issue? 
    // Optimization: Just read enough to get headers. 
    // But for simplicity in this "Personal DB" context, reading all is fine.

    fs.createReadStream(req.file.path)
        .pipe(csv({ mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') }))
        .on('headers', (headerList) => {
            headerList.forEach(h => headers.push(h));
        })
        .on('data', (data) => results.push(data)) // We don't need data yet, but need to consume stream
        .on('end', () => {
            // Render Mapping Page
            const filename = req.file.filename; // Persisted in uploads/

            // Expected Fields
            const fields = [
                { key: 'title', label: 'Film Adı (Zorunlu)', required: true },
                { key: 'title_tr', label: 'Türkçe Adı' },
                { key: 'director', label: 'Yönetmen' },
                { key: 'rating', label: 'Puan (0-10)' }, // 8.5 or 8/10
                { key: 'watchDate', label: 'İzlenme Tarihi' },
                { key: 'isCinema', label: 'Sinemada İzlendi? (Yes/No)' },
                { key: 'genres', label: 'Türler (Virgülle ayrılmış)' },
                { key: 'year', label: 'Yapım Yılı' },
                { key: 'description', label: 'Açıklama / Özet' },
                { key: 'userNotes', label: 'Kişisel Notlar' }
            ];

            // Helper to guess mapping
            const clean = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
            const findMatch = (fieldKey) => {
                const search = clean(fieldKey);
                // Common aliases
                const aliases = {
                    'title': ['name', 'film', 'movie', 'ad', 'isim', 'baslik'],
                    'title_tr': ['tr', 'turkce'],
                    'rating': ['score', 'puan', 'vote', 'star'],
                    'watchDate': ['date', 'time', 'tarih', 'zaman', 'when'],
                    'director': ['yonetmen', 'dir'],
                    'isCinema': ['cinema', 'sinema', 'salon', 'theater'],
                    'genres': ['tags', 'tur', 'category', 'kategori'],
                    'year': ['yil', 'sene', 'released'],
                    'userNotes': ['note', 'not', 'review', 'inceleme']
                };

                // Direct match
                let match = headers.find(h => clean(h) === search);
                if (match) return match;

                // Alias match
                if (aliases[fieldKey]) {
                    for (const alias of aliases[fieldKey]) {
                        match = headers.find(h => clean(h).includes(alias));
                        if (match) return match;
                    }
                }
                return '';
            };

            // Custom Format Detection (Friend's Format)
            const isFriendFormat = headers.includes('Film Adı') && headers.includes('Sinemada İzlendi');

            const mappingForm = `
                <div class="form-container" style="max-width:800px; margin:2rem auto;">
                    <h2 style="font-family:var(--ch-font-display); color:var(--ch-neon-gold);">${t('column_mapping', locale)}</h2>
                    
                    ${isFriendFormat ? `
                        <div style="background:rgba(0,255,0,0.1); border:1px solid var(--ch-neon-green); padding:1rem; margin-bottom:2rem; border-radius:4px;">
                            <h3 style="color:var(--ch-neon-green); margin-top:0;">🤖 ÖZEL FORMAT TESPİT EDİLDİ</h3>
                            <p style="color:#ddd;">Arkadaş formatı algılandı. Otomatik ayrıştırma ve içe aktarma yapılabilir.</p>
                            <form action="/films/import/process" method="POST">
                                <input type="hidden" name="filename" value="${filename}">
                                <input type="hidden" name="friend_mode" value="1">
                                <button type="submit" class="btn-cinema" style="width:100%; background:var(--ch-neon-green); color:#000; font-weight:bold;">
                                    🚀 OTOMATİK İÇE AKTAR (FRIEND MODE)
                                </button>
                            </form>
                        </div>
                        <div style="text-align:center; margin-bottom:2rem; color:#666;">--- VEYA MANUEL EŞLEŞTİRME ---</div>
                    ` : ''}

                    <p style="color:#aaa; margin-bottom:2rem;">${t('common_mapping_instr', locale)}</p>
                    
                    <form action="/films/import/process" method="POST">
                        <input type="hidden" name="filename" value="${filename}">
                        
                        <div style="display:grid; gap:1rem; background:rgba(0,0,0,0.3); padding:1.5rem; border-radius:8px; border:1px solid #333;">
                            ${fields.map(f => {
                const guessed = findMatch(f.key);
                return `
                                    <div style="display:grid; grid-template-columns: 1fr 1fr; align-items:center; gap:1rem; border-bottom:1px solid #222; padding-bottom:1rem;">
                                        <div>
                                            <label style="color:${f.required ? 'var(--ch-neon-red)' : '#fff'}; font-weight:bold;">${f.label}</label>
                                            ${f.required ? '<span style="color:#666; font-size:0.8rem;"> * Zorunlu</span>' : ''}
                                        </div>
                                        <select name="map_${f.key}" style="background:#111; border:1px solid #444; color:#fff; padding:0.5rem; border-radius:4px;">
                                            <option value="">-- ${locale === 'tr' ? 'Seçiniz' : 'Select'} --</option>
                                            ${headers.map(h => `<option value="${h}" ${h === guessed ? 'selected' : ''}>${h}</option>`).join('')}
                                        </select>
                                    </div>
                                `;
            }).join('')}
                        </div>

                        <div style="margin-top:2rem; display:flex; gap:1rem;">
                            <a href="/films/add" class="btn-cinema" style="text-align:center; background:#333; color:#fff; border-color:#555; text-decoration:none;">${t('cancel', locale)}</a>
                            <button type="submit" class="btn-cinema" style="flex:1; background:var(--ch-neon-green); color:#000; border-color:var(--ch-neon-green);">${t('confirm_upload', locale)}</button>
                        </div>
                    </form>
                </div>
            `;

            res.send(renderPage(mappingForm, 'column_mapping', req));
        });
});

// POST /import/process - Step 2: Execute Import
router.post('/import/process', (req, res) => {
    const filename = req.body.filename;
    if (!filename) return res.redirect('/films/add');

    const filePath = path.join(__dirname, '../../public/uploads', filename);
    if (!fs.existsSync(filePath)) return res.send('Dosya bulunamadı / zaman aşımı.');

    const mapping = {};
    const friendMode = req.body.friend_mode === '1';

    if (!friendMode) {
        // Extract mapping from body (map_title -> title)
        Object.keys(req.body).forEach(k => {
            if (k.startsWith('map_') && req.body[k]) {
                mapping[k.replace('map_', '')] = req.body[k];
            }
        });
    }

    const results = [];
    const csv = require('csv-parser');

    // Helper: Parse Friend Format
    const parseFriendRow = (row) => {
        const rawTitle = row['Film Adı'] || '';
        let title = rawTitle;
        let title_tr = '';
        let url = '';

        // Parse: "URL / Title TR"
        const parts = rawTitle.split(' / ');
        if (parts.length > 1) {
            url = parts[0].trim();
            title_tr = parts[1].trim();
        } else {
            url = rawTitle.trim();
        }

        // Extract Original Title from URL slug if possible
        try {
            if (url.includes('http')) {
                const urlObj = new URL(url);
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                // usually last part is slug, or second to last if ends with slash
                let slug = pathParts[pathParts.length - 1];
                if (slug) {
                    // Remove "tekrar-izlendi" notes if attached to slug loosely (though usually in parens)
                    title = slug.replace(/-/g, ' ')
                        .replace(/\b\w/g, c => c.toUpperCase()); // Capitalize
                }
            } else {
                title = rawTitle;
            }
        } catch (e) { title = rawTitle; }

        // Clean "(Tekrar İzlendi)" from title if present
        if (title.includes('(')) title = title.split('(')[0].trim();
        if (title_tr.includes('(')) title_tr = title_tr.split('(')[0].trim();

        // Date: DD/MM/YYYY -> YYYY-MM-DD
        let dateStr = row['İzleme Tarihi'];
        let watchDate = '';
        if (dateStr) {
            const [d, m, y] = dateStr.split('/');
            if (d && m && y) watchDate = `${y}-${m}-${d}`;
        }

        // Rating: "7/10" -> 7
        let rating = row['Puan'] ? parseFloat(row['Puan'].split('/')[0]) : null;

        // Genres
        let genres = [];
        if (row['Tür']) {
            genres = row['Tür'].split(',').map(s => s.trim());
        }

        return {
            title: title || 'Bilinmeyen Film',
            title_tr: title_tr,
            director: row['Yönetmen'],
            year: dateStr ? dateStr.split('/')[2] : '',
            rating: rating,
            watchDate: watchDate,
            isCinema: !!row['Sinemada İzlendi'],
            genres: JSON.stringify(genres),
            imageUrl: '',
            description: '',
            userNotes: rawTitle.includes('Tekrar') ? 'Tekrar İzlendi' : '',
            status: 'watched', // Assume watched since there is a date
            isHallOfFame: false
        };
    };

    // Helper: Parse Manual Format
    const parseManualRow = (row, mapping) => {
        const getVal = (key) => {
            const csvHeader = mapping[key];
            if (!csvHeader) return null;
            return row[csvHeader] ? row[csvHeader].trim() : null;
        };

        const title = getVal('title') || 'Bilinmeyen Film';
        const title_tr = getVal('title_tr');
        const director = getVal('director');
        const year = getVal('year');
        const description = getVal('description');
        const userNotes = getVal('userNotes');

        // Rating Parsing
        let rating = null;
        const rStr = getVal('rating');
        if (rStr) {
            // "8.5", "8,5", "8/10"
            let clean = rStr.split('/')[0].replace(',', '.');
            rating = parseFloat(clean);
            if (isNaN(rating)) rating = null;
        }

        // Date Parsing
        let watchDate = getVal('watchDate');
        if (watchDate) {
            // Attempt to parse: DD/MM/YYYY, YYYY-MM-DD
            if (watchDate.match(/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}$/)) {
                const parts = watchDate.split(/[\/\-\.]/);
                // Assume DD-MM-YYYY
                watchDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }

        // Cinema Boolean
        let isCinema = 0;
        const cVal = getVal('isCinema');
        if (cVal && (cVal.toLowerCase() === 'yes' || cVal.toLowerCase() === 'evet' || cVal === '1' || cVal.toLowerCase() === 'true')) {
            isCinema = 1;
        }

        // Genres
        let genres = '[]';
        const gVal = getVal('genres');
        if (gVal) {
            const list = gVal.split(/[\|,]/).map(s => s.trim()).filter(s => s);
            genres = JSON.stringify(list);
        }

        return { title, title_tr, director, year, rating, description, userNotes, genres, watchDate, isCinema, status: 'watched', isHallOfFame: 0 };
    };

    fs.createReadStream(filePath)
        .pipe(csv({ mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') }))
        .on('data', (data) => results.push(data))
        .on('end', () => {
            const insert = db.prepare(`
                INSERT INTO films(title, title_tr, director, year, rating, description, userNotes, genres, watchDate, isCinema, isHallOfFame, status)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const insertMany = db.transaction((rows) => {
                for (const row of rows) {
                    let entry = friendMode ? parseFriendRow(row) : parseManualRow(row, mapping);

                    // Ensure defaults/types
                    if (entry.isCinema === true) entry.isCinema = 1;
                    if (entry.isCinema === false) entry.isCinema = 0;
                    if (!entry.status) entry.status = 'watched';
                    if (!entry.isHallOfFame) entry.isHallOfFame = 0;

                    insert.run(entry.title, entry.title_tr, entry.director, entry.year, entry.rating, entry.description, entry.userNotes, entry.genres, entry.watchDate, entry.isCinema, entry.isHallOfFame, entry.status);
                }
            });
            try {
                insertMany(results);
                // Clean up file
                try { fs.unlinkSync(filePath); } catch (e) { }

            } catch (err) {
                console.error('Import Error:', err);
                return res.send('Hata oluştu: ' + err.message);
            }

            res.redirect('/films');
        });
});

// POST /delete/:id
// POST /delete/:id
router.post('/delete/:id', (req, res) => {
    try {
        const deleteParams = db.prepare('DELETE FROM films WHERE id = ?');
        const info = deleteParams.run(req.params.id);

        if (info.changes === 0) {
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                return res.status(404).json({ success: false, error: 'Film bulunamadı' });
            }
        }

        // Check if JSON requested (AJAX)
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.json({ success: true });
        }

        const referer = req.get('Referer');
        res.redirect(referer || '/films');
    } catch (e) {
        console.error('Delete Error:', e);
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.status(500).json({ success: false, error: e.message });
        }
        res.status(500).send('Silme işlemi başarısız: ' + e.message);
    }
});


// --- ACTOR DETAILS FEATURE ---

// Helper: Search Person
function searchPersonTMDB(query) {
    return new Promise((resolve) => {
        const url = `${TMDB_BASE_URL}/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.results && result.results.length > 0) {
                        resolve(result.results[0]);
                    } else {
                        resolve(null);
                    }
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

// Helper: Get Person Details
function getPersonDetailsTMDB(id) {
    return new Promise((resolve) => {
        const url = `${TMDB_BASE_URL}/person/${id}?api_key=${TMDB_API_KEY}&language=tr-TR`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

// Tool: Sync Actors
router.post('/api/tools/sync-actors', async (req, res) => {
    try {
        const allFilms = db.prepare('SELECT actors FROM films').all();
        const uniqueActors = new Set();
        allFilms.forEach(f => {
            if (f.actors) {
                try { JSON.parse(f.actors).forEach(a => uniqueActors.add(a)); } catch (e) { }
            }
        });

        const actorList = [...uniqueActors];
        let processed = 0;
        let updated = 0; // New entries or updates

        for (const name of actorList) {
            const existing = db.prepare('SELECT name FROM actors WHERE name = ?').get(name);

            // If checking for updates for older entries, logic would be here.
            // For now, only insert missing ones.
            if (!existing) {
                // Fetch from TMDB
                const person = await searchPersonTMDB(name);
                if (person) {
                    const details = await getPersonDetailsTMDB(person.id);
                    if (details) {
                        const imageUrl = details.profile_path ? TMDB_IMAGE_BASE + details.profile_path : null;
                        db.prepare('INSERT OR IGNORE INTO actors (name, imageUrl, bio, birthDate, placeOfBirth, tmdbId, lastUpdated) VALUES (?, ?, ?, ?, ?, ?, ?)')
                            .run(name, imageUrl, details.biography, details.birthday, details.place_of_birth, person.id, new Date().toISOString());
                        updated++;
                    }
                }
            }
            processed++;
            // Small delay to avoid rate limits
            if (updated % 5 === 0) await new Promise(r => setTimeout(r, 200));
        }

        res.json({ success: true, message: `Senkronizasyon Tamamlandı. ${processed} oyuncu tarandı, ${updated} yeni kayıt eklendi.` });
    } catch (error) {
        console.error('Actor Sync Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Route: Actor Profile
router.get('/actor/:name', (req, res) => {
    const name = decodeURIComponent(req.params.name);
    const actor = db.prepare('SELECT * FROM actors WHERE name = ?').get(name);

    // Find films in archive
    const allFilms = db.prepare('SELECT * FROM films').all();
    const films = allFilms.filter(f => {
        if (!f.actors) return false;
        try { return JSON.parse(f.actors).includes(name); } catch (e) { return false; }
    });

    // Sort films by date
    films.sort((a, b) => new Date(b.watchDate || 0) - new Date(a.watchDate || 0));

    // Calculate age if birthDate exists
    let age = '';
    if (actor && actor.birthDate) {
        const birth = new Date(actor.birthDate);
        const diff = Date.now() - birth.getTime();
        const ageDate = new Date(diff);
        age = Math.abs(ageDate.getUTCFullYear() - 1970);
    }

    const content = `
        <div style="display:flex; gap:2rem; padding:2rem; align-items:flex-start; flex-wrap:wrap;">
            <div style="flex:1; max-width:300px; position:sticky; top:100px;">
                <div style="border-radius:12px; overflow:hidden; border:2px solid var(--ch-neon-gold); box-shadow:0 0 20px rgba(255, 215, 0, 0.2); aspect-ratio: 2/3;">
                    ${actor && actor.imageUrl ? `<img src="${actor.imageUrl}" style="width:100%; height:100%; object-fit:cover;">` : '<div style="width:100%; height:100%; background:#222; display:flex; align-items:center; justify-content:center; color:#555;">RESİM YOK</div>'}
                </div>
                <h1 style="font-family:var(--ch-font-display); color:var(--ch-neon-gold); margin:1rem 0 0.5rem; text-align:center; font-size:2rem; text-transform:uppercase;">${name}</h1>
                ${actor && actor.birthDate ? `
                    <div style="text-align:center; color:#ccc; font-size:1rem; margin-bottom:5px;">
                        ${new Date(actor.birthDate).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' })} 
                        ${age ? `<span style="color:#888;">(${age} yaşında)</span>` : ''}
                    </div>` : ''}
                ${actor && actor.placeOfBirth ? `<div style="text-align:center; color:#666; font-size:0.9rem;">${actor.placeOfBirth}</div>` : ''}
                
                <div style="margin-top:2rem; text-align:center;">
                    <button onclick="syncActor('${name}')" style="background:transparent; border:1px solid #444; color:#666; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem;">🔄 Bilgileri Güncelle</button>
                    <div id="syncStatus" style="font-size:0.8rem; margin-top:5px;"></div>
                </div>

                <script>
                    async function syncActor(name) {
                        const status = document.getElementById('syncStatus');
                        status.innerText = 'Güncelleniyor...';
                        try {
                            // Reuse the sync tool but focused? Currently generic sync scans all.
                            // Ideally create specific sync. For now, trigger full scan or just UI feedback.
                            // Let's rely on the main "Update" button in stats for now.
                             status.innerText = 'Henüz tekil güncelleme aktif değil. İstatistik sayfasından genel güncelleme yapınız.';
                        } catch(e) {
                             status.innerText = 'Hata oluştu.';
                        }
                    }
                </script>
            </div>
            
            <div style="flex:3; min-width:300px;">
                ${actor && actor.bio ? `
                    <div class="bio-container" style="background:rgba(255,255,255,0.05); padding:2rem; border-radius:12px; margin-bottom:3rem; line-height:1.8; color:#ddd; position:relative; overflow:hidden;">
                         <div style="position:absolute; top:0; left:0; width:4px; height:100%; background:var(--ch-neon-cyan);"></div>
                        <h3 style="margin-top:0; color:var(--ch-neon-cyan); font-family:var(--ch-font-display); font-size:1.5rem; margin-bottom:1rem;">BİYOGRAFİ</h3>
                        
                        <div id="bioText" style="max-height:150px; overflow:hidden; transition:max-height 0.5s ease; position:relative;">
                            ${actor.bio}
                            <div id="bioFade" style="position:absolute; bottom:0; left:0; width:100%; height:50px; background:linear-gradient(to bottom, transparent, rgba(30,30,30,0.95)); pointer-events:none;"></div>
                        </div>
                        
                        <button id="bioToggleBtn" onclick="toggleBio()" style="background:transparent; border:none; color:var(--ch-neon-cyan); margin-top:1rem; cursor:pointer; font-weight:bold; display:flex; align-items:center; gap:5px;">
                            <span>DEVAMINI OKU</span> <span style="font-size:1.2rem;">↓</span>
                        </button>

                        <script>
                            function toggleBio() {
                                const bio = document.getElementById('bioText');
                                const btn = document.getElementById('bioToggleBtn');
                                const fade = document.getElementById('bioFade');
                                
                                if (bio.style.maxHeight === '150px') {
                                    bio.style.maxHeight = '2000px'; // Enough to show long text
                                    btn.innerHTML = '<span>KÜÇÜLT</span> <span style="font-size:1.2rem;">↑</span>';
                                    fade.style.display = 'none';
                                } else {
                                    bio.style.maxHeight = '150px';
                                    btn.innerHTML = '<span>DEVAMINI OKU</span> <span style="font-size:1.2rem;">↓</span>';
                                    fade.style.display = 'block';
                                }
                            }
                            
                            // Hide button if bio is short
                            document.addEventListener('DOMContentLoaded', () => {
                                const bio = document.getElementById('bioText');
                                if(bio.scrollHeight <= 150) {
                                    document.getElementById('bioToggleBtn').style.display = 'none';
                                    document.getElementById('bioFade').style.display = 'none';
                                }
                            });
                        </script>
                    </div>
                ` : `<div style="background:rgba(255,255,255,0.02); padding:2rem; border-radius:12px; margin-bottom:3rem; text-align:center; color:#666; font-style:italic;">
                        Biyografi bulunamadı. "İstatistik" sayfasından "Oyuncuları Senkronize Et" butonuna basarak verileri çekebilirsiniz.
                     </div>`}
                
                <h3 style="color:var(--ch-neon-red); font-family:var(--ch-font-display); font-size:1.8rem; border-bottom:1px solid #333; padding-bottom:1rem; margin-bottom:1.5rem;">
                    ARŞİVDEKİ FİLMLERİ <span style="font-size:1rem; color:#666; vertical-align:middle; margin-left:10px;">(${films.length})</span>
                </h3>
                
                <div class="film-grid" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:1.5rem;">
                    ${renderFilmGrid(films)}
                </div>
            </div>
        </div>
    `;

    res.send(renderPage(content, `${name} - Oyuncu Profili`, req));
});

module.exports = router;

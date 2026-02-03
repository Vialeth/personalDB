const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const csv = require('csv-parser');

const db = new Database(path.join(__dirname, '../../database/books.db'));

// Configure Multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../../public/uploads'));
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'cover-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Helper string color (CSS/JS injection)
const stringToColorScript = `
<script>
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
}
document.querySelectorAll('.shelf-book').forEach(el => {
    el.style.backgroundColor = stringToColor(el.dataset.title || '');
});

// Modal Actions
function openRatingModal(bookId, action, event) {
    if(event) event.stopPropagation();
    const modal = document.getElementById('rating-modal');
    const form = document.getElementById('rating-form');
    const title = document.getElementById('modal-title');
    const actionInput = document.getElementById('modal-action-input');
    
    modal.style.display = 'flex';
    form.action = '/books/' + action + '/' + bookId;
    actionInput.value = action;
    
    if (action === 'finish') {
        title.innerText = 'Kitabı Bitir - Puanla';
    } else {
        title.innerText = 'Kitabı Bırak - Puanla (Opsiyonel)';
    }
}

function openDeleteModal(bookId, bookTitle, event) {
    if(event) event.stopPropagation();
    const modal = document.getElementById('delete-modal');
    const form = document.getElementById('delete-form');
    const msg = document.getElementById('delete-msg');
    
    modal.style.display = 'flex';
    form.action = '/books/delete/' + bookId;
    msg.innerText = '"' + bookTitle + '" kitabını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.';
}

function closeRatingModal() {
    document.getElementById('rating-modal').style.display = 'none';
}

function closeDeleteModal() {
    document.getElementById('delete-modal').style.display = 'none';
}

function toggleEditMode() {
    const grid = document.querySelector('.library-grid');
    grid.classList.toggle('edit-mode-active');
    const btn = document.getElementById('edit-mode-btn');
    if (grid.classList.contains('edit-mode-active')) {
        btn.classList.add('active');
        btn.innerText = 'Düzenleme Modu: AÇIK';
    } else {
        btn.classList.remove('active');
        btn.innerText = 'Düzenleme Modu';
    }
}

function toggleCard(card) {
    if (event.target.closest('button') || event.target.closest('a')) return;
    card.classList.toggle('expanded');
}

// Close modal if clicking outside
window.onclick = function(event) {
    const ratingModal = document.getElementById('rating-modal');
    const deleteModal = document.getElementById('delete-modal');
    if (event.target == ratingModal) ratingModal.style.display = "none";
    if (event.target == deleteModal) deleteModal.style.display = "none";
}
</script>
`;

// Date Formatter Helper
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
}

// Helper for layout
const renderPage = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Personal Library</title>
    <!-- Common Reset/Base -->
    <link rel="stylesheet" href="/style.css"> 
    <!-- Dark Academia Theme -->
    <link rel="stylesheet" href="/books.css">
    <script>
        function showSection(sectionId) {
            document.querySelectorAll('.app-section').forEach(el => el.style.display = 'none');
            document.getElementById(sectionId).style.display = 'block';
        }

        function toggleStatusFields() {
             const statusInput = document.querySelector('input[name="status"]:checked');
             if(!statusInput) return;
             const status = statusInput.value;
             
             const endDates = document.getElementById('end-date-group');
             const ratingGroup = document.getElementById('rating-group');
             
             if (status === 'reading') {
                 if(endDates) endDates.style.display = 'none';
                 if(ratingGroup) ratingGroup.style.display = 'none';
             } else {
                 if(endDates) endDates.style.display = 'block';
                 if(ratingGroup) ratingGroup.style.display = 'block';
             }
        }
        
        window.addEventListener('DOMContentLoaded', toggleStatusFields);
    </script>
    <style>
        /* Modal Styles */
        .modal {
            display: none; 
            position: fixed; 
            z-index: 1000; 
            left: 0;
            top: 0;
            width: 100%; 
            height: 100%; 
            overflow: auto; 
            background-color: rgba(0,0,0,0.7); 
            justify-content: center;
            align-items: center;
            backdrop-filter: blur(5px);
        }
        .modal-content {
            background-color: var(--da-panel-wood);
            padding: 2rem;
            border: 1px solid var(--da-border);
            width: 80%;
            max-width: 400px;
            border-radius: 4px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            text-align: center;
        }
        .modal-buttons {
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin-top: 1.5rem;
        }
        
        /* Interactive Library Card */
        .library-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 1.5rem;
            grid-auto-flow: dense; /* Help fill gaps when cards expand */
        }
        .library-card {
            background: rgba(0,0,0,0.2);
            border-radius: 4px;
            overflow: hidden;
            display: flex;
            flex-direction: row;
            border: 1px solid rgba(255,255,255,0.08);
            
            /* Orientation default: Row */
            max-height: 140px; 
            transition: max-height 0.4s ease-out, box-shadow 0.2s, background-color 0.3s;
            
            position: relative;
            cursor: pointer;
        }
        
        /* EXPANDED STATE CONFIG */
        .library-card.expanded {
            /* Desktop: Span 2 cols for "Horizontal Expansion" */
            grid-column: span 2;
            
            max-height: 600px; /* Plenty of vertical space */
            
            flex-direction: row; 
            z-index: 10;
            background: var(--da-bg-espresso); 
            border-color: var(--da-accent-orange);
            box-shadow: 0 15px 40px rgba(0,0,0,0.7);
        }

        /* Mobile fallback: Don't span if screen is too small */
        @media (max-width: 650px) {
            .library-card.expanded {
                grid-column: span 1;
            }
        }

        /* Hover Effect (only when not expanded) */
        .library-card:not(.expanded):hover {
            transform: translateY(-3px);
            border-color: rgba(255,255,255,0.2);
        }

        /* IMAGE STYLES */
        .library-card-img {
            width: 100px; /* Minimized width */
            flex-shrink: 0;
            transition: width 0.4s ease;
            overflow: hidden;
            height: auto; 
            align-self: stretch;
            display: flex;
            position: relative;
        }
        .library-card.expanded .library-card-img {
            width: 240px; /* Much wider in expanded mode */
        }
        .library-card-img img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            filter: brightness(0.9);
            transition: filter 0.4s;
            display: block; 
        }
        .library-card.expanded .library-card-img img {
            filter: brightness(1);
        }

        /* INFO CONTENT */
        .library-info {
            padding: 1rem;
            display: flex;
            flex-direction: column;
            flex: 1;
            position: relative;
        }
        .library-card.expanded .library-info {
            padding: 2rem 2.5rem; /* Luxurious padding */
        }

        /* TYPOGRAPHY */
        .library-title {
            font-family: var(--da-font-display);
            font-size: 1.15rem;
            margin-bottom: 0.25rem;
            line-height: 1.25;
            color: var(--da-text-cream);
            padding-right: 2.5rem; /* Space for rating in min view */
            transition: all 0.3s;
            
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .library-card.expanded .library-title {
            font-size: 2rem; /* Hero Title */
            margin-bottom: 0.5rem;
            padding-right: 4rem; /* More space for the larger badge */
            -webkit-line-clamp: unset;
        }

        .library-author {
            color: var(--da-text-muted);
            font-size: 0.9rem;
            margin-bottom: auto; 
            font-style: italic;
            transition: all 0.3s;
        }
        .library-card.expanded .library-author {
            font-size: 1.2rem;
            margin-bottom: 2rem;
            color: var(--da-accent-orange);
            font-family: var(--da-font-display);
        }

        /* DETAILS (Hidden by default) */
        .library-details {
            opacity: 0;
            max-height: 0;
            overflow: hidden;
            transition: all 0.5s ease;
            font-size: 0.95rem;
            color: var(--da-text-muted);
            margin-top: 0;
        }
        .library-card.expanded .library-details {
            opacity: 1;
            max-height: 500px; 
            margin-top: 1rem;
            border-top: 1px solid rgba(255,255,255,0.1);
            padding-top: 1.5rem;
            
            /* Grid layout for details in expanded view */
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1.5rem;
        }
        
        /* Spanning the full width for Genre/Long text */
        .detail-row.full-width {
            grid-column: span 2;
        }

        .detail-row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 1rem; 
        }
        .detail-row span:last-child {
            text-align: right;
            flex: 1;
            word-wrap: break-word; 
            font-size: 1.1rem;
            color: var(--da-text-cream);
        }
        .detail-label { 
            color: var(--da-text-muted); 
            font-size: 0.8em;
            font-weight: 600; 
            text-transform:uppercase; 
            letter-spacing: 2px;
            flex-shrink: 0; 
        }

        /* RATING (Top Right) */
        .rating-badge {
            position: absolute;
            top: 0.75rem;
            right: 0.75rem;
            background: rgba(0,0,0,0.5);
            padding: 0.3rem 0.6rem;
            border-radius: 6px;
            font-family: var(--da-font-display);
            color: var(--da-accent-orange);
            font-size: 1.1rem;
            font-weight: bold;
            border: 1px solid rgba(199, 92, 58, 0.4);
            transition: all 0.3s;
            z-index: 5;
        }
        .library-card.expanded .rating-badge {
            top: 2rem;
            right: 2rem;
            font-size: 1.8rem;
            padding: 0.5rem 1rem;
            background: rgba(0,0,0,0.3);
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        }

        /* ACTIONS (Delete/Edit) */
        .card-actions {
            display: none; /* Hidden by default */
            position: absolute;
            bottom: 0.5rem;
            right: 0.5rem;
            gap: 0.5rem;
            z-index: 20;
        }
        /* Show actions only when Edit Mode is active */
        .library-grid.edit-mode-active .card-actions {
            display: flex;
        }

        .btn-da-danger {
            background: var(--da-accent-red);
            color: white;
            border: none;
        }
        .btn-da-danger:hover { background: #6b2b2b; }
        
        .action-btn {
            background: rgba(0,0,0,0.8); 
            border: none; 
            color: var(--da-text-muted); 
            font-size: 1rem; 
            cursor: pointer; 
            padding: 0.4rem 0.6rem;
            border-radius: 4px;
            transition: all 0.2s;
        }
        .action-btn:hover { color: white; transform: scale(1.1); }
        .action-btn.delete { color: var(--da-accent-red); }
        .action-btn.edit { color: var(--da-accent-orange); }

        /* File Input Style */
        .file-input-wrapper {
            position: relative;
            margin-bottom: 1rem;
            background: rgba(15, 23, 42, 0.5);
            border: 1px solid var(--border-color);
            border-radius: 0.5rem;
            padding: 0.75rem;
            display: flex;
            align-items: center;
        }
        .file-input-wrapper input[type=file] {
            border: none;
            background: transparent;
            padding: 0;
            margin: 0;
        }
        
        #edit-mode-btn.active {
            background-color: var(--da-accent-orange);
            color: white;
            border-color: var(--da-accent-orange);
        }
    </style>
</head>
<body class="book-theme">
    <div class="container">
        <nav style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-family: var(--da-font-display); font-size: 1.5rem;">
                <a href="/" style="text-decoration:none; margin-right: 1rem;">🏠</a>
                <span>Ex Libris</span>
            </div>
            <div style="display: flex; gap: 2rem;">
                <a href="#" onclick="showSection('section-home'); return false;" class="nav-link">Vitrin</a>
                <a href="#" onclick="showSection('section-library'); return false;" class="nav-link">Kütüphane</a>
                <a href="#" onclick="showSection('section-add'); return false;" class="nav-link">Kitap Ekle</a>
            </div>
        </nav>

        ${content}
        
        <!-- Rating Modal -->
        <div id="rating-modal" class="modal">
            <div class="modal-content">
                <h3 id="modal-title" style="margin-top:0;">Puanla</h3>
                <form id="rating-form" method="POST">
                    <input type="hidden" name="action" id="modal-action-input">
                    <div style="margin-bottom: 1.5rem;">
                        <label style="display:block; margin-bottom:0.5rem; color: var(--da-text-muted);">Puanınız (0-10)</label>
                        <input type="number" name="rating" step="0.1" min="0" max="10" class="filter-input" style="width: 100px; text-align: center; font-size: 1.2rem;" autofocus>
                    </div>
                     <div style="margin-bottom: 1.5rem;">
                        <label style="display:block; margin-bottom:0.5rem; color: var(--da-text-muted);">Bitiş Tarihi</label>
                        <input type="date" name="endDate" class="filter-input" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                    <div class="modal-buttons">
                        <button type="button" class="btn-da" onclick="closeRatingModal()">İptal</button>
                        <button type="submit" class="btn-da btn-da-primary">Kaydet</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Delete Modal -->
        <div id="delete-modal" class="modal">
            <div class="modal-content">
                <h3 style="margin-top:0; color: var(--da-accent-red)">Kitabı Sil</h3>
                <p id="delete-msg" style="color: var(--da-text-cream); margin-bottom: 1.5rem;"></p>
                <form id="delete-form" method="POST">
                    <div class="modal-buttons">
                        <button type="button" class="btn-da" onclick="closeDeleteModal()">Vazgeç</button>
                        <button type="submit" class="btn-da btn-da-danger">Sil</button>
                    </div>
                </form>
            </div>
        </div>

    </div>
    ${stringToColorScript}
</body>
</html>
`;

// Shared Data Fetcher
function getCommonData(req) {
    const currentReads = db.prepare("SELECT * FROM books WHERE status = 'reading' ORDER BY startDate DESC").all();
    const currentYear = new Date().getFullYear();
    const annualBooks = db.prepare("SELECT * FROM books WHERE (status = 'read' OR status = 'dropped') AND (startDate LIKE ? OR endDate LIKE ?)").all(`${currentYear}%`, `${currentYear}%`);
    const totalBooks = annualBooks.length;
    const totalPages = annualBooks.reduce((acc, b) => acc + (b.pageCount || 0), 0);
    const avgRating = totalBooks > 0 ? (annualBooks.reduce((acc, b) => acc + (b.rating || 0), 0) / totalBooks).toFixed(1) : 0;

    // Filters Data Extraction
    const allAuthors = db.prepare("SELECT DISTINCT author FROM books ORDER BY author ASC").all()
        .map(r => r.author)
        .filter(a => a && a.trim().length > 0);

    // Extract Years
    const dates = db.prepare("SELECT startDate, endDate FROM books").all();
    const yearsSet = new Set();
    dates.forEach(d => {
        if (d.startDate && d.startDate.length >= 4) yearsSet.add(d.startDate.substring(0, 4));
        if (d.endDate && d.endDate.length >= 4) yearsSet.add(d.endDate.substring(0, 4));
    });
    const allYears = Array.from(yearsSet).filter(y => y).sort().reverse();

    // Extract Genres
    const genreRows = db.prepare("SELECT genres FROM books").all();
    const genreSet = new Set();
    genreRows.forEach(r => {
        if (r.genres) {
            try {
                const gList = JSON.parse(r.genres);
                if (Array.isArray(gList)) gList.forEach(g => {
                    if (g && g.trim().length > 0) genreSet.add(g.trim());
                });
            } catch (e) { }
        }
    });
    const allGenres = Array.from(genreSet).sort();

    // Main Query Construction
    let query = "SELECT * FROM books WHERE 1=1";
    const params = [];

    if (req.query.search) {
        query += " AND (title LIKE ? OR author LIKE ?)";
        params.push(`%${req.query.search}%`, `%${req.query.search}%`);
    }

    if (req.query.author) {
        query += " AND author = ?";
        params.push(req.query.author);
    }

    if (req.query.year) {
        query += " AND (startDate LIKE ? OR endDate LIKE ?)";
        params.push(`${req.query.year}%`, `${req.query.year}%`);
    }

    if (req.query.genre) {
        // Simple JSON search hack: looks for "Genre" string
        // Note: This matches "Sci-Fi" inside "Sci-Fi Thriller" which is good,
        // but might match substring accidents. Good enough for personal db.
        query += " AND genres LIKE ?";
        params.push(`%${req.query.genre}%`);
    }

    query += " ORDER BY endDate DESC, startDate DESC";
    const allBooks = db.prepare(query).all(...params);

    // Global Library Stats
    const libStats = db.prepare("SELECT COUNT(*) as count, SUM(pageCount) as pages, AVG(rating) as rating FROM books").get();
    const libTotalBooks = libStats.count || 0;
    const libTotalPages = libStats.pages || 0;
    const libAvgRating = libStats.rating ? libStats.rating.toFixed(1) : 0;

    return {
        currentReads, annualBooks, currentYear, totalBooks, totalPages, avgRating,
        allBooks, libTotalBooks, libTotalPages, libAvgRating,
        allAuthors, allYears, allGenres
    };
}

// Handler for Main Page (Normal View or Edit View)
function serveApp(req, res, editBookId = null) {
    const data = getCommonData(req);
    const { currentReads, annualBooks, currentYear, totalBooks, totalPages, avgRating, allBooks } = data;

    let bookToEdit = null;
    if (editBookId) {
        bookToEdit = db.prepare("SELECT * FROM books WHERE id = ?").get(editBookId);
    }

    const currentReadsHtml = currentReads.length > 0 ? currentReads.map(b => `
        <div class="read-card">
            <img src="${b.imageUrl || 'https://via.placeholder.com/100x150?text=No+Cover'}" alt="Cover">
            <div class="read-info">
                <div class="read-title">${b.title}</div>
                <div class="read-author">${b.author}</div>
                <div class="read-progress">
                    <span>${b.pageCount ? b.pageCount + ' pages' : 'Unknown length'}</span>
                </div>
                <div style="margin-top: auto; display: flex; gap: 0.5rem;">
                    <a href="/books/edit/${b.id}" class="btn-da" style="text-decoration:none; text-align:center; padding-top:0.3rem;">✎</a>
                    <button type="button" class="btn-da btn-da-primary" onclick="openRatingModal(${b.id}, 'finish', event)">Bitir</button>
                    <button type="button" class="btn-da" onclick="openRatingModal(${b.id}, 'drop', event)">Bırak</button>
                </div>
            </div>
        </div>
    `).join('') : '<p style="color:var(--da-text-muted); font-style:italic;">Şu anda okunan kitap yok.</p>';

    const shelfHtml = annualBooks.map(b => `
        <div class="collection-item" onclick="toggleCard(document.getElementById('book-${b.id}'))">
            ${b.imageUrl ?
            `<img src="${b.imageUrl}" alt="${b.title}" class="collection-cover">` :
            `<div class="collection-placeholder">
                    <span>${b.title}</span>
                </div>`
        }
            ${b.rating ? `<div class="collection-rating">${b.rating}</div>` : ''}
        </div>
    `).join('');

    const libraryCardsHtml = allBooks.map(b => `
        <div id="book-${b.id}" class="library-card" onclick="toggleCard(this)">
            <div class="library-card-img">
                <img src="${b.imageUrl || 'https://via.placeholder.com/200x280?text=No+Cover'}" alt="${b.title}">
            </div>
            
            ${b.rating ? `<div class="rating-badge">${b.rating}</div>` : ''}

            <div class="library-info">
                <div class="library-title">${b.title}</div>
                <div class="library-author">${b.author}</div>

                <!-- Minimized View Info -->
                <div style="margin-top:0.5rem; display:flex; justify-content:space-between; align-items:flex-end;">
                     <span class="status-chip status-${b.status}" style="font-size:0.65em; padding:0.1rem 0.4rem;">${b.status}</span>
                     ${b.endDate ? `<span style="font-size:0.75rem; color:var(--da-text-muted); font-style:italic;">${b.endDate}</span>` : ''}
                </div>

                <!-- Expanded Details -->
                <div class="library-details">
                    <div class="detail-row">
                        <span class="detail-label">Sayfa</span>
                        <span>${b.pageCount || '-'}</span>
                    </div>
                     <div class="detail-row">
                        <span class="detail-label">ISBN</span>
                        <span>${b.isbn || '-'}</span>
                    </div>
                     <div class="detail-row">
                        <span class="detail-label">Başlama</span>
                        <span>${formatDate(b.startDate)}</span>
                    </div>
                     <div class="detail-row">
                        <span class="detail-label">Bitiş</span>
                        <span>${formatDate(b.endDate) || '-'}</span>
                    </div>
                     <div class="detail-row full-width">
                        <span class="detail-label">Türler</span>
                        <span>${b.genres ? JSON.parse(b.genres).join(', ') : '-'}</span>
                    </div>
                </div>

                <!-- Actions (visible in Edit Mode) -->
                <div class="card-actions">
                     <a href="/books/edit/${b.id}" class="action-btn edit" title="Düzenle">✎</a>
                     <button type="button" onclick="openDeleteModal(${b.id}, '${b.title.replace(/'/g, "\\'")}', event)" class="action-btn delete" title="Sil">✕</button>
                </div>
            </div>
        </div>
    `).join('');

    let activeSectionInfo = { home: 'block', lib: 'none', add: 'none' };
    if (bookToEdit) {
        activeSectionInfo = { home: 'none', lib: 'none', add: 'block' };
    } else if (req.query.search || req.query.author || req.query.genre || req.query.year || req.query.section === 'library') {
        activeSectionInfo = { home: 'none', lib: 'block', add: 'none' };
    }

    const formTitle = bookToEdit ? 'Kitabı Düzenle' : 'Manuel Giriş';
    const formAction = bookToEdit ? `/books/edit/${bookToEdit.id}` : '/books/add';
    const formBtnText = bookToEdit ? 'Güncelle' : 'Kaydet';
    const b = bookToEdit || {};

    res.send(renderPage(`
        <!-- SECTION A: VITRIN -->
        <div id="section-home" class="app-section" style="display:${activeSectionInfo.home};">
            <div class="section-title">Şu Anda Okunanlar</div>
            <div class="current-reads-grid" style="margin-bottom: 3rem;">
                ${currentReadsHtml}
            </div>

            <div class="section-title">Yıllık Koleksiyon (${currentYear})</div>
            <div class="shelf-container">
                ${shelfHtml}
            </div>

            <div class="stats-bar">
                <div class="stat-item">
                    <div class="stat-value">${totalBooks}</div>
                    <div class="stat-label">Kitap</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${totalPages}</div>
                    <div class="stat-label">Sayfa</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${avgRating}</div>
                    <div class="stat-label">Ort. Puan</div>
                </div>
            </div>
        </div>

        <!-- SECTION B: KÜTÜPHANE -->
        <div id="section-library" class="app-section" style="display:${activeSectionInfo.lib};">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
                 <div class="section-title" style="margin-bottom:0;">Kütüphane</div>
                 <button id="edit-mode-btn" class="btn-da" onclick="toggleEditMode()" style="font-size: 0.8rem; padding: 0.3rem 0.6rem;">Düzenleme Modu</button>
            </div>

            <!-- Library Stats Bar -->
            <div class="stats-bar" style="margin-bottom: 2rem;">
                <div class="stat-item">
                    <div class="stat-value">${data.libTotalBooks}</div>
                    <div class="stat-label">Toplam Kitap</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${data.libTotalPages}</div>
                    <div class="stat-label">Toplam Sayfa</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${data.libAvgRating}</div>
                    <div class="stat-label">Genel Puan</div>
                </div>
            </div>
           
            <div class="filter-panel" style="margin-top:1rem;">
                <form action="/books" method="GET" class="filter-form">
                    <!-- Search -->
                    <input type="text" name="search" placeholder="Kitap ara..." class="filter-input" style="flex:1; min-width: 200px;" value="${req.query.search || ''}">
                    
                    <!-- Filters -->
                    <select name="author" class="filter-input" style="width:auto; cursor:pointer;">
                        <option value="">Yazar (Tümü)</option>
                        ${data.allAuthors.map(a => `<option value="${a}" ${req.query.author === a ? 'selected' : ''}>${a}</option>`).join('')}
                    </select>

                     <select name="genre" class="filter-input" style="width:auto; cursor:pointer;">
                        <option value="">Tür (Tümü)</option>
                        ${data.allGenres.map(g => `<option value="${g}" ${req.query.genre === g ? 'selected' : ''}>${g}</option>`).join('')}
                    </select>

                     <select name="year" class="filter-input" style="width:auto; cursor:pointer;">
                        <option value="">Yıl (Tümü)</option>
                        ${data.allYears.map(y => `<option value="${y}" ${req.query.year === y ? 'selected' : ''}>${y}</option>`).join('')}
                    </select>

                    <button type="submit" class="btn-da">Uygula</button>
                    ${(req.query.search || req.query.author || req.query.genre || req.query.year) ? '<a href="/books?section=library" class="btn-da" style="border:none; color:var(--da-text-muted);">✖ Temizle</a>' : ''}
                </form>
            </div>
            
            <div class="library-grid">
                ${libraryCardsHtml}
            </div>
        </div>

        <!-- SECTION C: KITAP EKLE / DUZENLE -->
        <div id="section-add" class="app-section" style="display:${activeSectionInfo.add};">
            <div class="section-title">Kitap Ekle / Düzenle</div>
            <div style="display:grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
                <div class="card">
                    <h3>${formTitle}</h3>
                    <form action="${formAction}" method="POST" enctype="multipart/form-data">
                         ${bookToEdit ? '<div style="margin-bottom:1rem;"><a href="/books" style="color:var(--da-text-muted);">← İptal ve Geri Dön</a></div>' : ''}
                        
                        <div class="switch-container">
                            <label class="switch-option ${(!b.status || b.status === 'reading') ? 'active' : ''}">
                                <input type="radio" name="status" value="reading" ${(!b.status || b.status === 'reading') ? 'checked' : ''} style="display:none;" onchange="toggleStatusFields(); this.parentElement.classList.add('active'); this.parentElement.nextElementSibling.classList.remove('active'); this.parentElement.nextElementSibling.nextElementSibling.classList.remove('active');">
                                Okunuyor
                            </label>
                            <label class="switch-option ${(b.status === 'read') ? 'active' : ''}">
                                <input type="radio" name="status" value="read" ${(b.status === 'read') ? 'checked' : ''} style="display:none;" onchange="toggleStatusFields(); this.parentElement.classList.add('active'); this.parentElement.previousElementSibling.classList.remove('active'); this.parentElement.parentElement.lastElementChild.classList.remove('active');">
                                Okundu
                            </label>
                            <label class="switch-option ${(b.status === 'dropped') ? 'active' : ''}">
                                <input type="radio" name="status" value="dropped" ${(b.status === 'dropped') ? 'checked' : ''} style="display:none;" onchange="toggleStatusFields(); this.parentElement.classList.add('active'); this.parentElement.previousElementSibling.classList.remove('active'); this.parentElement.previousElementSibling.previousElementSibling.classList.remove('active');">
                                Yarım
                            </label>
                        </div>
                        <label>Kitap Adı</label>
                        <input type="text" name="title" value="${b.title || ''}" required>
                        <label>Yazar</label>
                        <input type="text" name="author" value="${b.author || ''}" required>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div>
                                <label>Sayfa Sayısı</label>
                                <input type="number" name="pageCount" value="${b.pageCount || ''}">
                            </div>
                            <div>
                                <label>ISBN</label>
                                <input type="text" name="isbn" value="${b.isbn || ''}">
                            </div>
                        </div>
                        <label>Türler (Virgül ile ayırın)</label>
                        <input type="text" name="genres" value="${b.genres ? JSON.parse(b.genres).join(', ') : ''}" placeholder="Roman, Bilim Kurgu...">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div>
                                <label>Başlama Tarihi</label>
                                <input type="date" name="startDate" value="${b.startDate || new Date().toISOString().split('T')[0]}">
                            </div>
                            <div id="end-date-group" style="${(b.status && b.status !== 'reading') ? 'display:block' : 'display:none'}">
                                <label>Bitiş Tarihi</label>
                                <input type="date" name="endDate" value="${b.endDate || ''}">
                            </div>
                        </div>
                        <div id="rating-group" style="${(b.status && b.status !== 'reading') ? 'display:block' : 'display:none'}">
                            <label>Puan (0-10)</label>
                            <input type="number" name="rating" step="0.1" max="10" value="${b.rating || ''}">
                        </div>
                        
                        <label>Kapak Resmi</label>
                        <div class="file-input-wrapper">
                            <input type="file" name="imageFile" accept="image/*">
                        </div>
                        <div style="margin-bottom: 1rem; font-size: 0.8rem; color: var(--da-text-muted);">
                             ${bookToEdit && b.imageUrl ? 'Mevcut resim var. Değiştirmek istemiyorsanız boş bırakın.' : 'Veya resim yükleyin.'}
                        </div>
                        
                        <button type="submit" class="btn-da btn-da-primary" style="width:100%; margin-top: 1rem;">${formBtnText}</button>
                    </form>
                </div>
                ${!bookToEdit ? `
                <div class="card" style="height: fit-content;">
                    <h3>Toplu İçe Aktarım</h3>
                    <div style="border: 2px dashed var(--da-border); padding: 1.5rem; text-align: center; border-radius: 4px; color: var(--da-text-muted);">
                        <form action="/books/import" method="POST" enctype="multipart/form-data">
                            <p style="margin-bottom:1rem; font-size:0.9rem;">Notion CSV export dosyanızı yükleyin.</p>
                            <input type="file" name="csvFile" accept=".csv" required style="max-width:100%; margin-bottom:1rem;">
                            <button type="submit" class="btn-da">Yükle ve İçe Aktar</button>
                        </form>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `));
}

// GET / - Main View
router.get('/', (req, res) => {
    serveApp(req, res);
});

// GET /edit/:id
router.get('/edit/:id', (req, res) => {
    serveApp(req, res, req.params.id);
});

// POST /add
router.post('/add', upload.single('imageFile'), (req, res) => {
    let { title, author, pageCount, isbn, genres, startDate, endDate, rating, status } = req.body;
    let imageUrl = null;
    if (req.file) {
        imageUrl = '/uploads/' + req.file.filename;
    }

    const genreArray = genres ? genres.split(',').map(g => g.trim()).filter(g => g) : [];
    const insert = db.prepare(`
        INSERT INTO books (title, author, pageCount, isbn, genres, startDate, endDate, rating, status, imageUrl)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(title, author, pageCount, isbn, JSON.stringify(genreArray), startDate, endDate, rating, status, imageUrl);
    res.redirect('/books');
});

// POST /edit/:id
router.post('/edit/:id', upload.single('imageFile'), (req, res) => {
    let { title, author, pageCount, isbn, genres, startDate, endDate, rating, status } = req.body;
    const genreArray = genres ? genres.split(',').map(g => g.trim()).filter(g => g) : [];

    if (endDate === '') endDate = null;
    if (rating === '') rating = null;

    let imageUrl = null;
    let sql = `UPDATE books SET title=?, author=?, pageCount=?, isbn=?, genres=?, startDate=?, endDate=?, rating=?, status=?`;
    let params = [title, author, pageCount, isbn, JSON.stringify(genreArray), startDate, endDate, rating, status];

    if (req.file) {
        imageUrl = '/uploads/' + req.file.filename;
        sql += `, imageUrl=?`;
        params.push(imageUrl);
    }

    sql += ` WHERE id = ?`;
    params.push(req.params.id);

    const update = db.prepare(sql);
    update.run(...params);
    res.redirect('/books');
});

// Standard Action Routes
router.post('/finish/:id', (req, res) => {
    const { rating, endDate } = req.body;
    const finalDate = endDate || new Date().toISOString().split('T')[0];
    db.prepare("UPDATE books SET status = 'read', endDate = ?, rating = ? WHERE id = ?")
        .run(finalDate, rating || null, req.params.id);
    res.redirect('/books');
});

router.post('/drop/:id', (req, res) => {
    const { rating, endDate } = req.body;
    const finalDate = endDate || new Date().toISOString().split('T')[0];
    db.prepare("UPDATE books SET status = 'dropped', endDate = ?, rating = ? WHERE id = ?")
        .run(finalDate, rating || null, req.params.id);
    res.redirect('/books');
});

router.post('/delete/:id', (req, res) => {
    db.prepare('DELETE FROM books WHERE id = ?').run(req.params.id);
    res.redirect('/books');
});

router.get('/delete/:id', (req, res) => {
    db.prepare('DELETE FROM books WHERE id = ?').run(req.params.id);
    res.redirect('/books');
});


// POST /import - Handle CSV Import
router.post('/import', upload.single('csvFile'), (req, res) => {
    console.log('Import request received');
    if (!req.file) {
        console.error('No file uploaded');
        return res.redirect('/books?error=NoFile');
    }

    console.log('File uploaded:', req.file.path);
    const results = [];
    fs.createReadStream(req.file.path)
        .pipe(csv({
            mapHeaders: ({ header, index }) => {
                // Strip BOM and whitespace
                return header.trim().replace(/^\ufeff/, '');
            }
        }))
        .on('data', (data) => results.push(data))
        .on('end', () => {
            console.log('CSV Parsing completed. Rows found:', results.length);
            if (results.length > 0) {
                console.log('First row headers:', Object.keys(results[0]));
                console.log('First row sample:', results[0]);
            }

            // Processing logic
            const insert = db.prepare(`
                INSERT INTO books (title, author, pageCount, isbn, genres, startDate, endDate, rating, status, imageUrl)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const dateToISO = (dateStr) => {
                if (!dateStr) return null;
                const parts = dateStr.split('/');
                if (parts.length !== 3) return null;
                // DD/MM/YYYY -> YYYY-MM-DD
                return `${parts[2]}-${parts[1]}-${parts[0]}`;
            };

            const parseRating = (rateStr) => {
                if (!rateStr) return null;
                // "9/10" -> 9
                const match = rateStr.match(/(\d+(\.\d+)?)/);
                return match ? parseFloat(match[0]) : null;
            };

            try {
                db.transaction(() => {
                    let importedCount = 0;
                    results.forEach((row, index) => {
                        const title = row['Kitap Adı'];
                        if (!title) {
                            console.warn(`Row ${index} skipped: Missing 'Kitap Adı'`);
                            return;
                        }

                        console.log(`Processing row ${index}: ${title}`);

                        const author = row['Yazar'];
                        const pageCount = parseInt(row['Sayfa Sayısı']) || null;
                        const isbn = row['ISBN'] === '-' ? null : row['ISBN'];

                        // Genre parsing
                        let genres = [];
                        if (row['Tür']) {
                            // Handle "Comedy, Drama" etc.
                            genres = row['Tür'].split(',').map(g => g.trim()).filter(g => g);
                        }

                        const startDate = dateToISO(row['Başlama Tarihi']);
                        const endDate = dateToISO(row['Bitiş Tarihi']);
                        const rating = parseRating(row['Puan']);

                        // Determine Status
                        let status = 'reading';
                        if (endDate) status = 'read';
                        else if (rating) status = 'read';

                        insert.run(title, author, pageCount, isbn, JSON.stringify(genres), startDate, endDate, rating, status, null);
                        importedCount++;
                    });
                    console.log(`Transaction success. Imported ${importedCount} books.`);
                })();
            } catch (error) {
                console.error('Transaction failed:', error);
            }

            // Cleanup uploaded CSV
            try {
                fs.unlinkSync(req.file.path);
            } catch (e) { console.error('Error deleting temp file:', e); }

            res.redirect('/books');
        });
});

module.exports = router;

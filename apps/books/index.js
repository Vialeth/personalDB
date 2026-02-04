const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const csv = require('csv-parser');
const https = require('https');

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
    
    // Close detail modal on backdrop click
    const detailDialog = document.getElementById('bookDetailDialog');
    if (event.target == detailDialog) {
        detailDialog.close();
    }
}

// Global Books Data populated by server
let booksData = [];


function openBookDetail(id) {
    console.log('[BookDetail] Opening for ID:', id);
    try {
        console.log('[BookDetail] Total books available:', booksData.length);
        const book = booksData.find(b => b.id === id);
        if(!book) {
             console.error('[BookDetail] Book NOT found for ID:', id);
             return;
        }
        console.log('[BookDetail] Book found:', book.title);

        // Populate Modal
        const modal = document.getElementById('bookDetailDialog');
        if(!modal) {
            console.error('[BookDetail] Modal element #bookDetailDialog NOT found!');
            return;
        }

        // Cover
        const coverContainer = document.getElementById('detail-cover');
        if(book.imageUrl) {
            coverContainer.innerHTML = \`<img src="\${book.imageUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:4px;">\`;
        } else {
            coverContainer.innerHTML = \`<div style="width:100%; height:100%; background:#2a2422; display:flex; align-items:center; justify-content:center; color:#e8dcc4; font-family:var(--da-font-display);">\${book.title}</div>\`;
        }
        
        // Text Info
        document.getElementById('detail-title').textContent = book.title;
        document.getElementById('detail-author').textContent = book.author;
        document.getElementById('detail-pageCount').textContent = book.pageCount || '-';
        document.getElementById('detail-isbn').textContent = book.isbn || '-';
        
        // Date formatting safe check
        try {
             document.getElementById('detail-dates').textContent = \`\${formatDate(book.startDate)} - \${formatDate(book.endDate) || '...'}\`;
        } catch(err) {
            console.error('[BookDetail] Date formatting error:', err);
             document.getElementById('detail-dates').textContent = 'Tarih Hatası';
        }
        
        // Genres
        const genresEl = document.getElementById('detail-genres');
        genresEl.innerHTML = '';
        if(book.genres) {
            try {
                const gList = JSON.parse(book.genres);
                if(Array.isArray(gList)) {
                    genresEl.innerHTML = gList.map(g => \`<span class="tag">\${g}</span>\`).join('');
                }
            } catch(e) {
                 console.warn('[BookDetail] Genre parse error:', e);
                 genresEl.innerText = book.genres;
            }
        }
        
        // Rating Badge
        const ratingEl = document.getElementById('detail-rating');
        if(book.rating) {
            ratingEl.style.display = 'block';
            ratingEl.innerText = book.rating;
        } else {
            ratingEl.style.display = 'none';
        }
        
        // Status Chip
        const statusEl = document.getElementById('detail-status');
        if(statusEl) {
            statusEl.className = \`status-chip status-\${book.status}\`;
            statusEl.innerText = book.status === 'reading' ? 'OKUNUYOR' : (book.status === 'read' ? 'OKUNDU' : 'YARIM');
        }
        
        // Actions
        document.getElementById('detail-edit-link').href = \`/books/edit/\${book.id}\`;
        
        // Setup Delete Button with correct closure
        const delBtn = document.getElementById('detail-delete-btn');
        // Remove old listeners by cloning
        const newDelBtn = delBtn.cloneNode(true);
        delBtn.parentNode.replaceChild(newDelBtn, delBtn);
        
        newDelBtn.onclick = (e) => {
            modal.close();
            openDeleteModal(book.id, book.title.replace(/'/g, "\\'"), e);
        };

        if (typeof modal.showModal === "function") {
            modal.showModal();
            console.log('[BookDetail] Modal opened successfully via showModal');
        } else {
            console.error("[BookDetail] dialog.showModal is not a function - browser support issue?");
            modal.setAttribute("open", ""); // Fallback
        }

    } catch(err) {
        console.error('[BookDetail] Critical Error:', err);
        alert('Detay açılırken hata oluştu: ' + err.message);
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = String(d.getFullYear());
        return \`\${day}.\${month}.\${year}\`;
    } catch(e) { return dateStr; }
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
const renderPage = (content, allBooks = []) => `
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
                <a href="/books?section=home" class="nav-link">Vitrin</a>
                <a href="/books/stats" class="nav-link">İstatistik</a>
                <a href="/books?section=library" class="nav-link">Kütüphane</a>
                <a href="/books?section=add" class="nav-link">Kitap Ekle</a>
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
        </div>
        
        <!-- Book Detail Modal (New) -->
        <dialog id="bookDetailDialog" style="padding:0; border:1px solid var(--da-accent-orange); border-radius:8px; background:var(--da-panel-wood); color:var(--da-text-cream); width:90%; max-width:700px; backdrop-filter:blur(10px); box-shadow:0 20px 50px rgba(0,0,0,0.8);">
            
             <!-- Close Button (Absolute) -->
            <button type="button" onclick="document.getElementById('bookDetailDialog').close()" style="position:absolute; top:10px; right:15px; background:none; border:none; color:var(--da-text-muted); cursor:pointer; font-size:2rem; z-index:10; line-height:1;">&times;</button>

            <div style="display:flex; flex-direction:column;">
                <div style="display:flex; flex-wrap:wrap; padding:2.5rem 2rem 2rem 2rem; gap:2rem;">
                    <!-- Left: Cover -->
                    <div style="flex:0 0 200px; display:flex; flex-direction:column; align-items:center;">
                        <div style="position:relative; width:200px; height:300px; box-shadow:5px 5px 15px rgba(0,0,0,0.5); border-radius:4px; overflow:hidden; background:#222;">
                            <div id="detail-cover" style="width:100%; height:100%;"></div>
                        </div>
                        <div id="detail-rating" style="margin-top:1rem; font-size:2.5rem; color:var(--da-accent-orange); font-family:var(--da-font-display); font-weight:bold;"></div>
                        <span id="detail-status" style="margin-top:0.5rem; display:block;"></span>
                    </div>
                    
                    <!-- Right: Info -->
                    <div style="flex:1; min-width:250px;">
                        
                        <h2 id="detail-title" style="margin:0 0 0.5rem 0; font-size:2rem; line-height:1.2;"></h2>
                        <div id="detail-author" style="font-size:1.2rem; color:var(--da-accent-orange); margin-bottom:1.5rem; font-style:italic;"></div>
                        
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.5rem; background:rgba(0,0,0,0.2); padding:1rem; border-radius:4px;">
                            <div>
                                <div class="detail-label">Sayfa</div>
                                <div id="detail-pageCount" style="font-size:1.1rem;"></div>
                            </div>
                            <div>
                                <div class="detail-label">ISBN</div>
                                <div id="detail-isbn" style="font-size:1.1rem;"></div>
                            </div>
                            <div style="grid-column:span 2;">
                                <div class="detail-label">Tarih Aralığı</div>
                                <div id="detail-dates" style="font-size:1.1rem;"></div>
                            </div>
                        </div>
                        
                        <div class="detail-label">Türler</div>
                        <div id="detail-genres" style="margin-bottom:2rem;"></div>
                        
                        <div style="display:flex; gap:1rem; margin-top:auto;">
                            <a id="detail-edit-link" class="btn-da">Düzenle</a>
                            <button id="detail-delete-btn" class="btn-da btn-da-danger">Sil</button>
                        </div>
                    </div>
                </div>
            </div>
        </dialog>

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

    ${stringToColorScript}
    <script>
        // Inject Server Data
        booksData = ${JSON.stringify(allBooks).replace(/</g, '\\u003c')};
    </script>
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
    const ratedBooks = annualBooks.filter(b => b.rating !== null && b.rating !== undefined);
    const avgRating = ratedBooks.length > 0 ? (ratedBooks.reduce((acc, b) => acc + b.rating, 0) / ratedBooks.length).toFixed(1) : 0;

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
            <div class="read-cover-wrapper">
                <img src="${b.imageUrl || 'https://via.placeholder.com/100x150?text=No+Cover'}" alt="Cover">
            </div>
            <div class="read-info">
                <div class="read-title">${b.title}</div>
                <div class="read-author">${b.author}</div>
                
                <!-- Progress Bar -->
                <div class="progress-container" style="margin: 0.5rem 0;">
                    <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--da-text-muted); margin-bottom:0.2rem;">
                         <span>${b.currentPage || 0} / ${b.pageCount || '?'}</span>
                         <span>${b.pageCount ? Math.round(((b.currentPage || 0) / b.pageCount) * 100) + '%' : ''}</span>
                    </div>
                    <div style="background:rgba(255,255,255,0.1); height:6px; border-radius:3px; overflow:hidden;">
                         <div style="background:var(--da-accent-orange); height:100%; width:${b.pageCount ? Math.min(100, ((b.currentPage || 0) / b.pageCount) * 100) : 0}%;"></div>
                    </div>
                </div>

                <!-- Quick Updates -->
                <!-- Quick Updates -->
                <div style="margin-bottom:0.5rem; display:grid; gap:0.5rem;">
                     <!-- Daily Session Form -->
                     <form action="/books/progress/${b.id}" method="POST" style="display:flex; gap:0.5rem;">
                         <input type="number" name="pages" placeholder="+Sayfa" class="filter-input" style="flex:1; min-width:0; font-size:0.9rem; padding:0.3rem;" min="1" required>
                         <button type="submit" class="btn-da" style="font-size:0.8rem; padding:0.3rem 0.5rem; background:rgba(255,255,255,0.1);">Ekle</button>
                     </form>
                     
                     <!-- Manual Override Form -->
                     <details style="font-size:0.8rem; color:var(--da-text-muted);">
                        <summary style="cursor:pointer; margin-bottom:0.2rem;">Düzelt</summary>
                        <form action="/books/progress/${b.id}" method="POST" style="display:flex; gap:0.5rem;">
                            <input type="number" name="currentPage" placeholder="Şu an kaçtasın?" class="filter-input" style="flex:1; min-width:0; font-size:0.9rem; padding:0.3rem;" value="${b.currentPage || 0}">
                            <button type="submit" class="btn-da" style="font-size:0.8rem; padding:0.3rem 0.5rem;">Güncelle</button>
                        </form>
                     </details>
                </div>

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
        <div class="collection-item" onclick="openBookDetail(${b.id})">
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
        <div id="book-${b.id}" class="library-card" onclick="openBookDetail(${b.id})">
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

    // Explicit Generic Section Handling
    const section = req.query.section;
    if (editBookId) {
        activeSectionInfo = { home: 'none', lib: 'none', add: 'block' };
    } else if (section === 'add') {
        activeSectionInfo = { home: 'none', lib: 'none', add: 'block' };
    } else if (section === 'library' || req.query.search || req.query.author || req.query.genre || req.query.year) {
        activeSectionInfo = { home: 'none', lib: 'block', add: 'none' };
    } else if (section === 'home') {
        activeSectionInfo = { home: 'block', lib: 'none', add: 'none' };
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

                    <button type="submit" class="btn-da">Filtrele</button>
                    ${(req.query.search || req.query.author || req.query.genre || req.query.year) ? '<a href="/books?section=library" class="btn-da" style="text-decoration:none; border-color:var(--da-accent-red); color:var(--da-accent-red);">Temizle</a>' : ''}
                </form>
            </div>
            
            <div class="library-grid">
                ${libraryCardsHtml}
            </div>
        </div>

        <!-- SECTION C: KITAP EKLE/DUZENLE -->
        <div id="section-add" class="app-section" style="display:${activeSectionInfo.add}; max-width:600px; margin:0 auto;">
            <div class="section-title">${formTitle}</div>
            
            <div style="display: flex; gap: 1rem; margin-bottom: 2rem;">
                  <button class="btn-da btn-da-primary" onclick="window.location.href='/books?section=add'">
                     Manuel Ekle
                  </button>
                  <button class="btn-da" onclick="document.getElementById('bookSearchModal').showModal()">
                     🔍 İnternetten Ara & Ekle
                  </button>
            </div>

            <!-- Import CSV Section (Collapsed) -->
            <details style="margin-bottom:2rem; background:rgba(0,0,0,0.2); padding:1rem; border-radius:4px; border:1px solid var(--da-border);">
                <summary style="cursor:pointer; font-weight:bold; color:var(--da-accent-orange);">📤 Toplu CSV Yükle / İçe Aktar</summary>
                <div style="margin-top:1rem;">
                     <p style="font-size:0.9rem; color:var(--da-text-muted); margin-bottom:1rem;">
                        CSV dosyanız şu sütunları içerebilir: <code>Title, Author, My Rating, Date Read, Number of Pages, Exclusive Shelf, ISBN, Original Publication Year, Date Added</code>. <br>
                        (Goodreads export formatı desteklenir)
                     </p>
                     <form action="/books/import-csv" method="POST" enctype="multipart/form-data" style="display:flex; gap:1rem; align-items:center;">
                        <div class="file-input-wrapper" style="flex:1; margin-bottom:0;">
                             <input type="file" name="csvFile" accept=".csv" required>
                        </div>
                        <button type="submit" class="btn-da">Yükle</button>
                     </form>
                </div>
            </details>

            <!-- Main Form -->
            <form action="${formAction}" method="POST" enctype="multipart/form-data" style="background:var(--da-panel-wood); padding:2rem; border-radius:8px; border:1px solid var(--da-border);">
                <!-- Hidden inputs for logic -->
                <input type="hidden" name="id" value="${b.id || ''}">
                <input type="hidden" id="hidden-imageUrl" name="imageUrl" value="${b.imageUrl || ''}">
                
                <label style="display:block; margin-bottom:0.5rem;">Kitap Adı *</label>
                <input type="text" name="title" required class="filter-input" value="${b.title || ''}">

                <label style="display:block; margin-bottom:0.5rem;">Yazar *</label>
                <input type="text" name="author" required class="filter-input" value="${b.author || ''}">

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div>
                        <label style="display:block; margin-bottom:0.5rem;">Sayfa Sayısı</label>
                        <input type="number" name="pageCount" class="filter-input" value="${b.pageCount || ''}">
                    </div>
                     <div>
                        <label style="display:block; margin-bottom:0.5rem;">ISBN</label>
                        <input type="text" name="isbn" class="filter-input" value="${b.isbn || ''}">
                    </div>
                </div>

                <label style="display:block; margin-bottom:0.5rem;">Kapak Görseli</label>
                <!-- Helper text regarding image source -->
                <div id="image-helper-text" style="font-size:0.8rem; color:var(--da-text-muted); margin-bottom:0.5rem;">
                    ${b.imageUrl ? '<span style="color:var(--da-accent-green);">✓ Mevcut kapak URL ile tanımlı.</span> Değiştirmek için dosya yükleyin veya arama yapın.' : 'Dosya yükleyebilir veya "İnternetten Ara" ile otomatik seçebilirsiniz.'}
                </div>
                <div class="file-input-wrapper">
                    <input type="file" name="coverImage" accept="image/*">
                </div>

                <label style="display:block; margin-bottom:0.5rem;">Durum</label>
                <div class="switch-container" style="background:rgba(0,0,0,0.5);">
                    <label class="switch-option active">
                        <input type="radio" name="status" value="reading" ${(!b.status || b.status === 'reading') ? 'checked' : ''} onclick="toggleStatusFields()" style="display:none;">
                        Okuyorum
                    </label>
                    <label class="switch-option">
                        <input type="radio" name="status" value="read" ${b.status === 'read' ? 'checked' : ''} onclick="toggleStatusFields()" style="display:none;">
                        Okudum
                    </label>
                    <label class="switch-option">
                        <input type="radio" name="status" value="dropped" ${b.status === 'dropped' ? 'checked' : ''} onclick="toggleStatusFields()" style="display:none;">
                        Yarım
                    </label>
                </div>

                <!-- Conditional Fields -->
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div>
                        <label style="display:block; margin-bottom:0.5rem;">Başlama Tarihi</label>
                        <input type="date" name="startDate" class="filter-input" value="${b.startDate || new Date().toISOString().split('T')[0]}">
                    </div>
                    <div id="end-date-group" style="display:none;">
                        <label style="display:block; margin-bottom:0.5rem;">Bitiş Tarihi</label>
                        <input type="date" name="endDate" class="filter-input" value="${b.endDate || ''}">
                    </div>
                </div>

                <div id="rating-group" style="display:none; margin-top:1rem;">
                    <label style="display:block; margin-bottom:0.5rem;">Puanım (0-10)</label>
                    <input type="number" name="rating" step="0.1" min="0" max="10" class="filter-input" value="${b.rating || ''}">
                </div>

                <label style="display:block; margin-top:1rem; margin-bottom:0.5rem;">Türler (Virgülle ayırın)</label>
                <input type="text" name="genres" placeholder="Örn: Bilim Kurgu, Klasik, Roman" class="filter-input" value="${b.genres ? JSON.parse(b.genres).join(', ') : ''}">

                <button type="submit" class="btn-da btn-da-primary" style="width:100%; margin-top:1rem; font-size:1.1rem; padding:1rem;">${formBtnText}</button>
            </form>
        </div>

        <!-- Google Books Search Modal -->
        <dialog id="bookSearchModal" style="width:90%; max-width:800px; background:var(--da-bg-card); border:1px solid var(--da-accent-orange); color:var(--da-text-cream); padding:0; border-radius:8px; backdrop-filter:blur(10px); height:80vh;">
             <div style="padding:1rem; border-bottom:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0; font-family:var(--da-font-display); color:var(--da-accent-orange);">Kitap Arama (Open Library)</h3>
                <button type="button" onclick="document.getElementById('bookSearchModal').close()" style="background:none; border:none; color:#fff; font-size:1.5rem; cursor:pointer;">&times;</button>
            </div>
            <div style="padding:1rem;">
                <div style="display:flex; gap:10px; margin-bottom:1rem;">
                    <input type="text" id="apiSearchInput" placeholder="Kitap veya yazar ara..." class="filter-input" style="flex:1;" onkeydown="if(event.key === 'Enter') searchBooksApi()">
                    <button type="button" onclick="searchBooksApi()" class="btn-da btn-da-primary">ARA</button>
                </div>
                <div id="apiLoading" style="display:none; text-align:center; padding:2rem; color:#888;">Aranıyor...</div>
                <div id="apiResults" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap:1rem; overflow-y:auto; max-height:calc(80vh - 150px); padding-right:0.5rem;"></div>
            </div>
        </dialog>

         <script>
            function openBookSearch() {
                const title = document.querySelector('input[name="title"]').value;
                if(title) {
                    document.getElementById('apiSearchInput').value = title;
                    searchBooksApi();
                }
                document.getElementById('bookSearchModal').showModal();
            }

            async function searchBooksApi() {
                const query = document.getElementById('apiSearchInput').value;
                if(!query) return;

                document.getElementById('apiLoading').style.display = 'block';
                document.getElementById('apiResults').innerHTML = '';

                try {
                    // Using Open Library API to avoid Google's 429 Rate Limits
                    const res = await fetch(\`https://openlibrary.org/search.json?q=\${encodeURIComponent(query)}&limit=20\`);
                    if (!res.ok) throw new Error(\`HTTP Error: \${res.status} \${res.statusText}\`);
                    const data = await res.json();
                    
                    document.getElementById('apiLoading').style.display = 'none';

                    if(data.docs && data.docs.length > 0) {
                        document.getElementById('apiResults').innerHTML = data.docs.map(book => {
                            // Extract & Normalize Data from Open Library
                            const title = book.title;
                            const author = book.author_name ? book.author_name[0] : 'Unknown';
                            const coverUrl = book.cover_i ? \`https://covers.openlibrary.org/b/id/\${book.cover_i}-M.jpg\` : '';
                            const pageCount = book.number_of_pages_median || book.number_of_pages || 0;
                            const genres = book.subject ? book.subject.slice(0, 5) : []; // Take top 5 subjects
                            const isbn = book.isbn ? book.isbn[0] : '';
                            
                            // Safe assignment for onclick
                            const bookData = {
                                title: title,
                                authors: book.author_name || [],
                                pageCount: pageCount,
                                categories: genres,
                                isbn: isbn,
                                coverUrl: coverUrl
                            };

                            // Escape quotes for onclick params
                            const safeBook = JSON.stringify(bookData).replace(/'/g, "&#39;").replace(/"/g, "&quot;");
                            return \`
                            <div onclick='selectBook(\${safeBook})' style="background:rgba(0,0,0,0.3); border-radius:4px; padding:0.5rem; cursor:pointer; text-align:center; border:1px solid transparent; transition:all 0.2s;" onmouseover="this.style.borderColor='var(--da-accent-orange)'" onmouseout="this.style.borderColor='transparent'">
                                <div style="height:160px; margin-bottom:0.5rem; display:flex; align-items:center; justify-content:center; background:#111;">
                                    \${coverUrl ? '<img src="' + coverUrl + '" style="max-height:100%; max-width:100%;">' : '<span style="color:#555; font-size:0.8rem;">No Cover</span>'}
                                </div>
                                <div style="font-weight:bold; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${title}</div>
                                <div style="font-size:0.75rem; color:#888;">\${author}</div>
                            </div>
                            \`;
                        }).join('');
                    } else {
                        document.getElementById('apiResults').innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#666;">Sonuç bulunamadı.</div>';
                    }
                } catch(e) {
                    document.getElementById('apiLoading').style.display = 'none';
                    document.getElementById('apiResults').innerHTML = \`<div style="grid-column:1/-1; text-align:center; color:#ff5555; padding:1rem;">Hata Oluştu: \${e.message}</div>\`;
                    console.error('Book Search Error:', e);
                }
            }

function selectBook(book) {
    try {
        // Populate Fields
        document.querySelector('input[name="title"]').value = book.title;
        if (book.authors && book.authors.length > 0) {
            document.querySelector('input[name="author"]').value = book.authors.join(', ');
        }
        if (book.pageCount) {
            document.querySelector('input[name="pageCount"]').value = book.pageCount;
        }
        if (book.categories && book.categories.length > 0) {
            document.querySelector('input[name="genres"]').value = book.categories.join(', ');
        }
        if (book.isbn) {
            document.querySelector('input[name="isbn"]').value = book.isbn;
        }

        // Image URL to hidden field
        if (book.coverUrl) {
            document.getElementById('hidden-imageUrl').value = book.coverUrl;

            // Update helper text to show success
            const helper = document.getElementById('image-helper-text');
            if (helper) {
                helper.innerHTML = '<span style="color:var(--da-accent-orange);">✓ Kapak resmi seçildi.</span> (Dosya yüklerseniz o geçerli olur)';
            }
        }

        document.getElementById('bookSearchModal').close();
    } catch (e) {
        alert('Seçim hatası: ' + e.message);
    }
}
         </script >
    `, allBooks));
}

// GET / - Main View
router.get('/', (req, res) => {
    serveApp(req, res);
});

// GET /edit/:id
router.get('/edit/:id', (req, res) => {
    serveApp(req, res, req.params.id);
});



// Google Books API Helper
async function fetchBookMetadata(title, author) {
    return new Promise((resolve) => {
        if (!title) return resolve(null);

        const query = `intitle:${encodeURIComponent(title)}${author ? `+inauthor:${encodeURIComponent(author)}` : ''} `;
        const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1&langRestrict=tr`;

        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.totalItems > 0 && json.items && json.items[0].volumeInfo) {
                        const info = json.items[0].volumeInfo;
                        resolve({
                            genres: info.categories || [],
                            pageCount: info.pageCount || null,
                            imageUrl: (info.imageLinks && info.imageLinks.thumbnail) ? info.imageLinks.thumbnail.replace('http:', 'https:') : null,
                            isbn: (info.industryIdentifiers && info.industryIdentifiers.find(i => i.type === 'ISBN_13')) ? info.industryIdentifiers.find(i => i.type === 'ISBN_13').identifier : null,
                            description: info.description || null
                        });
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    console.error('API Parse Error:', e);
                    resolve(null);
                }
            });
        }).on('error', (e) => {
            console.error('API Request Error:', e);
            resolve(null);
        });
    });
}

// GET /api/search - Proxy to Google Books
router.get('/api/search', (req, res) => {
    const q = req.query.q;
    if (!q) return res.json({ items: [] });

    console.log(`[Search] Query: ${q}`);
    // Removed langRestrict=tr to allow all books (e.g. English)
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=20`;
    console.log(`[Search] URL: ${url}`);

    https.get(url, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
            console.log(`[Search] API Response Status: ${apiRes.statusCode}`);
            try {
                const json = JSON.parse(data);
                console.log(`[Search] Items found: ${json.items ? json.items.length : 0}`);

                const results = (json.items || []).map(item => {
                    const info = item.volumeInfo;
                    return {
                        id: item.id,
                        title: info.title,
                        authors: info.authors || [],
                        publishedDate: info.publishedDate,
                        description: info.description,
                        pageCount: info.pageCount,
                        categories: info.categories || [],
                        imageLinks: info.imageLinks,
                        industryIdentifiers: info.industryIdentifiers
                    };
                });
                res.json({ items: results });
            } catch (e) {
                console.error('[Search] Parse Error:', e);
                console.error('[Search] Raw Data:', data.substring(0, 200)); // Log first 200 chars
                res.status(500).json({ error: 'Parse error' });
            }
        });
    }).on('error', (e) => {
        console.error('[Search] Request Error:', e);
        res.status(500).json({ error: e.message });
    });
});

// POST /add
router.post('/add', upload.single('imageFile'), async (req, res) => {
    let { title, author, pageCount, isbn, genres, startDate, endDate, rating, status, imageUrl } = req.body;

    if (req.file) {
        imageUrl = '/uploads/' + req.file.filename;
    }

    // Auto-Fetch if critical fields are missing
    if (!genres || !pageCount) {
        try {
            const metadata = await fetchBookMetadata(title, author);
            if (metadata) {
                if (!genres && metadata.genres.length > 0) genres = metadata.genres.join(', ');
                if (!pageCount && metadata.pageCount) pageCount = metadata.pageCount;
                if (!isbn && metadata.isbn) isbn = metadata.isbn;
                if (!imageUrl && metadata.imageUrl) imageUrl = metadata.imageUrl;
            }
        } catch (e) { console.error('Metadata fetch failed:', e); }
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
router.post('/edit/:id', upload.single('imageFile'), async (req, res) => {
    let { title, author, pageCount, isbn, genres, startDate, endDate, rating, status } = req.body;

    // Auto-Fetch for Edit too if fields are empty
    if (!genres || !pageCount) {
        try {
            const metadata = await fetchBookMetadata(title, author);
            if (metadata) {
                if (!genres && metadata.genres.length > 0) genres = metadata.genres.join(', ');
                if (!pageCount && metadata.pageCount) pageCount = metadata.pageCount;
                if (!isbn && metadata.isbn) isbn = metadata.isbn;
                // For edit, we only update image if they don't have one and didn't upload one, 
                // but usually better to leave existing image alone unless explicitly requested.
                // We'll skip auto-updating image on edit to prevent overwriting user's custom cover with generic one unnecessarily.
            }
        } catch (e) { console.error('Metadata fetch failed:', e); }
    }

    const genreArray = genres ? genres.split(',').map(g => g.trim()).filter(g => g) : [];

    if (endDate === '') endDate = null;
    if (rating === '') rating = null;

    if (req.file) {
        imageUrl = '/uploads/' + req.file.filename;
        sql += `, imageUrl=?`;
        params.push(imageUrl);
    } else if (req.body.imageUrl) {
        // If no new file uploaded, but we have a URL from the search (hidden input)
        // We update it. Note: If it's empty, we might not want to clear it unless intended.
        // Assuming if hidden input has text, it's a new URL selected from search.
        imageUrl = req.body.imageUrl;
        sql += `, imageUrl=?`;
        params.push(imageUrl);
    }
    // Note: We don't verify if 'imageUrl' was fetched because we decided not to auto-update image on edit to be safe.

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

// POST /progress/:id - Log Reading Session & Update Page
router.post('/progress/:id', (req, res) => {
    const bookId = req.params.id;
    const { pages, currentPage } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const book = db.prepare("SELECT * FROM books WHERE id = ?").get(bookId);
    if (!book) return res.redirect('/books');

    // Scenario 1: Adding a session (e.g. read 20 pages today)
    if (pages) {
        const pagesInt = parseInt(pages);
        if (pagesInt > 0) {
            db.prepare("INSERT INTO reading_sessions (book_id, date, pages) VALUES (?, ?, ?)").run(bookId, today, pagesInt);
            // Auto-update current page (Handle NULL with COALESCE)
            db.prepare("UPDATE books SET currentPage = COALESCE(currentPage, 0) + ? WHERE id = ?").run(pagesInt, bookId);
        }
    }

    // Scenario 2: Manual Override (Setting absolute page number)
    if (currentPage !== undefined && currentPage !== '') {
        const currentInt = parseInt(currentPage);
        db.prepare("UPDATE books SET currentPage = ? WHERE id = ?").run(currentInt, bookId);
    }

    // Check completion
    const updatedBook = db.prepare("SELECT * FROM books WHERE id = ?").get(bookId);
    if (updatedBook.pageCount && updatedBook.currentPage >= updatedBook.pageCount) {
        // Optional: Auto-mark as read? For now, let user decide.
    }

    res.redirect('/books');
});

// GET /stats - Reading Statistics
router.get('/stats', (req, res) => {
    const currentYear = new Date().toISOString().split('T')[0].substring(0, 4);

    // 1. Daily Reading Trend (Last 30 days)
    const sessions = db.prepare(`
        SELECT date, SUM(pages) as total_pages 
        FROM reading_sessions 
        WHERE date >= date('now', '-30 days') 
        GROUP BY date 
        ORDER BY date ASC
    `).all();

    // 2. Total Stats
    const totalRead = db.prepare("SELECT SUM(pages) as count FROM reading_sessions").get().count || 0;
    const thisYearRead = db.prepare("SELECT SUM(pages) as count FROM reading_sessions WHERE date LIKE ?").get(`${currentYear}%`).count || 0;

    // 3. Completion Estimates
    const currentBooks = db.prepare("SELECT * FROM books WHERE status = 'reading'").all();
    // Calculate avg speed (pages/day) from last 7 active reading days
    const recentActivity = db.prepare(`
        SELECT AVG(daily_pages) as speed FROM (
            SELECT SUM(pages) as daily_pages FROM reading_sessions 
            WHERE date >= date('now', '-14 days') 
            GROUP BY date
        )
    `).get();
    const avgSpeed = recentActivity ? Math.round(recentActivity.speed || 0) : 0;

    const estimates = currentBooks.map(b => {
        const remaining = (b.pageCount || 0) - (b.currentPage || 0);
        const daysLeft = avgSpeed > 0 ? Math.ceil(remaining / avgSpeed) : '?';
        return { title: b.title, remaining, daysLeft };
    });

    res.send(renderPage(`
        <div id="section-stats" class="app-section" style="display:block;">
            <div class="section-title">Okuma İstatistikleri</div>

            <!-- Summary Cards -->
            <div class="stats-bar" style="margin-bottom:2rem; background:rgba(0,0,0,0.2);">
                <div class="stat-item">
                    <div class="stat-value" style="color:var(--da-accent-orange);">${totalRead}</div>
                    <div class="stat-label">Toplam Okunan Sayfa</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value" style="color:var(--da-text-cream);">${thisYearRead}</div>
                    <div class="stat-label">Bu Yıl (${currentYear})</div>
                </div>
                 <div class="stat-item">
                    <div class="stat-value" style="color:#a8d5ba;">${avgSpeed}</div>
                    <div class="stat-label">Ort. Hız (Sayfa/Gün)</div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns: 2fr 1fr; gap:2rem;">
                <!-- Chart Area -->
                <div class="card">
                    <h3>Son 30 Günlük Okuma Grafiği</h3>
                    <div style="display:flex; align-items:flex-end; height:200px; gap:4px; padding-top:20px; border-bottom:1px solid rgba(255,255,255,0.1);">
                        ${sessions.length > 0 ? sessions.map(s => `
                            <div style="flex:1; background:var(--da-accent-orange); opacity:0.8; border-radius:2px 2px 0 0; min-width:4px; 
                                        height:${Math.min(100, (s.total_pages / 100) * 100)}%; position:relative; transition:height 0.3s;" 
                                        title="${s.date}: ${s.total_pages} sayfa">
                            </div>
                        `).join('') : '<div style="width:100%; text-align:center; color:#666; align-self:center;">Henüz veri yok</div>'}
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-top:5px; font-size:0.7rem; color:#666;">
                        <span>-30 Gün</span>
                        <span>Bugün</span>
                    </div>
                </div>

                <!-- Estimates -->
                <div class="card">
                    <h3>Tahmini Bitiş Süreleri</h3>
                    ${estimates.length > 0 ? estimates.map(e => `
                        <div style="margin-bottom:1rem; padding-bottom:0.5rem; border-bottom:1px solid rgba(255,255,255,0.05);">
                            <div style="font-weight:bold; color:var(--da-text-cream);">${e.title}</div>
                            <div style="font-size:0.85rem; color:var(--da-text-muted);">
                                ${e.remaining} sayfa kaldı 
                                <span style="float:right; color:${e.daysLeft === '?' ? '#666' : 'var(--da-accent-orange)'};">
                                    ${e.daysLeft === '?' ? 'Yetersiz Veri' : `~${e.daysLeft} Gün`}
                                </span>
                            </div>
                        </div>
                    `).join('') : '<p style="color:#666;">Şu an okunan kitap yok.</p>'}
                </div>
            </div>
            
             <div style="margin-top:2rem;">
                  <a href="/books" class="btn-da">← Kütüphaneye Dön</a>
             </div>
        </div>
    `));
});

module.exports = router;

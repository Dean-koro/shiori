CREATE TABLE IF NOT EXISTS series (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    series_id TEXT,
    title TEXT NOT NULL,
    volume_number REAL DEFAULT 1.0,
    file_name TEXT NOT NULL,
    cover_name TEXT,
    total_pages INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread', 'reading', 'paused', 'completed')),
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reading_progress (
    book_id TEXT PRIMARY KEY,
    current_page INTEGER NOT NULL DEFAULT 1,
    scroll_offset REAL NOT NULL DEFAULT 0.0,
    zoom_level REAL NOT NULL DEFAULT 1.0,
    view_mode TEXT NOT NULL DEFAULT 'single' CHECK(view_mode IN ('single', 'double', 'scroll')),
    theme TEXT NOT NULL DEFAULT 'original' CHECK(theme IN ('original', 'sepia', 'night')),
    last_read_at TEXT,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('logbook', 'bookmark', 'highlight', 'note')),
    page_number INTEGER,
    selected_text TEXT,
    comment TEXT,
    color TEXT DEFAULT 'yellow',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS glossary (
    id TEXT PRIMARY KEY,
    series_id TEXT,
    book_id TEXT,
    term TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'character',
    definition TEXT NOT NULL,
    FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);
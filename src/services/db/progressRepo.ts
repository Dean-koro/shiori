import { getDatabase } from '../storages/initAppStorage';
import { ReaderTheme, ReadingProgress, ViewMode } from '../../types/library';
import { BookWithProgress } from './booksRepo';

export async function getReadingProgress(bookId: string): Promise<ReadingProgress> {
  const db = await getDatabase();
  const rows = await db.select<ReadingProgress[]>(
    'SELECT * FROM reading_progress WHERE book_id = $1 LIMIT 1',
    [bookId]
  );

  if (rows.length > 0) {
    return rows[0];
  }

  return {
    book_id: bookId,
    current_page: 1,
    scroll_offset: 0,
    zoom_level: 1.0,
    view_mode: 'single',
    theme: 'original',
    last_read_at: null,
  };
}

export async function saveReadingProgress(params: {
  bookId: string;
  currentPage: number;
  scrollOffset: number;
  zoomLevel: number;
  viewMode: ViewMode;
  theme: ReaderTheme;
  totalPages: number;
}): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO reading_progress (book_id, current_page, scroll_offset, zoom_level, view_mode, theme, last_read_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(book_id) DO UPDATE SET
       current_page = excluded.current_page,
       scroll_offset = excluded.scroll_offset,
       zoom_level = excluded.zoom_level,
       view_mode = excluded.view_mode,
       theme = excluded.theme,
       last_read_at = excluded.last_read_at`,
    [
      params.bookId,
      params.currentPage,
      params.scrollOffset,
      params.zoomLevel,
      params.viewMode,
      params.theme,
      now,
    ]
  );

  const newStatus = params.currentPage >= params.totalPages ? 'completed' : 'reading';
  await db.execute(
    `UPDATE books SET status = $1 WHERE id = $2 AND status != 'paused'`,
    [newStatus, params.bookId]
  );
}

export async function getNextVolumeInSeries(
  seriesId: string | null,
  currentVolume: number
): Promise<BookWithProgress | null> {
  if (!seriesId) return null;
  const db = await getDatabase();
  const rows = await db.select<BookWithProgress[]>(
    `SELECT 
      b.*,
      s.title AS series_title,
      COALESCE(rp.current_page, 1) AS current_page,
      rp.last_read_at
     FROM books b
     LEFT JOIN series s ON b.series_id = s.id
     LEFT JOIN reading_progress rp ON b.id = rp.book_id
     WHERE b.series_id = $1 AND b.volume_number > $2
     ORDER BY b.volume_number ASC
     LIMIT 1`,
    [seriesId, currentVolume]
  );

  return rows.length > 0 ? rows[0] : null;
}
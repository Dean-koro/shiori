import { getDatabase } from '../storages/initAppStorage';
import { Book, BookStatus, Series } from '../../types/library';
import { ImportedPdfData } from '../pdf/pdfImporter';

export interface BookWithProgress extends Book {
  series_title: string | null;
  current_page: number;
  last_read_at: string | null;
}

export async function getAllBooks(): Promise<BookWithProgress[]> {
  const db = await getDatabase();
  return await db.select<BookWithProgress[]>(`
    SELECT 
      b.*,
      s.title AS series_title,
      COALESCE(rp.current_page, 1) AS current_page,
      rp.last_read_at
    FROM books b
    LEFT JOIN series s ON b.series_id = s.id
    LEFT JOIN reading_progress rp ON b.id = rp.book_id
    ORDER BY 
      CASE WHEN rp.last_read_at IS NULL THEN 1 ELSE 0 END,
      rp.last_read_at DESC,
      b.added_at DESC
  `);
}

export async function getAllSeries(): Promise<Series[]> {
  const db = await getDatabase();
  return await db.select<Series[]>('SELECT * FROM series ORDER BY title ASC');
}

export async function createBookFromImport(data: ImportedPdfData): Promise<void> {
  const db = await getDatabase();

  await db.execute(
    `INSERT INTO books (id, title, volume_number, file_name, cover_name, total_pages, status)
     VALUES ($1, $2, 1.0, $3, $4, $5, 'unread')`,
    [data.id, data.title, data.fileName, data.coverName, data.totalPages]
  );

  await db.execute(
    `INSERT INTO reading_progress (book_id, current_page, scroll_offset, zoom_level, view_mode, theme)
     VALUES ($1, 1, 0.0, 1.0, 'single', 'original')`,
    [data.id]
  );
}

export async function updateBookMetadata(params: {
  bookId: string;
  title: string;
  volumeNumber: number;
  status: BookStatus;
  seriesTitle: string;
}): Promise<void> {
  const db = await getDatabase();
  let seriesId: string | null = null;

  const trimmedSeries = params.seriesTitle.trim();
  if (trimmedSeries.length > 0) {
    const existing = await db.select<Series[]>(
      'SELECT * FROM series WHERE LOWER(title) = LOWER($1) LIMIT 1',
      [trimmedSeries]
    );
    if (existing.length > 0) {
      seriesId = existing[0].id;
    } else {
      seriesId = crypto.randomUUID();
      await db.execute('INSERT INTO series (id, title) VALUES ($1, $2)', [
        seriesId,
        trimmedSeries,
      ]);
    }
  }

  await db.execute(
    `UPDATE books 
     SET title = $1, volume_number = $2, status = $3, series_id = $4
     WHERE id = $5`,
    [params.title.trim(), params.volumeNumber, params.status, seriesId, params.bookId]
  );
}

export async function updateBookCoverName(bookId: string, coverName: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('UPDATE books SET cover_name = $1 WHERE id = $2', [coverName, bookId]);
}
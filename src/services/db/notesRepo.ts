import { getDatabase } from '../storages/initAppStorage';
import { Annotation, GlossaryCategory, GlossaryEntry } from '../../types/library';

export async function getLogbook(bookId: string): Promise<Annotation | null> {
  const db = await getDatabase();
  const rows = await db.select<Annotation[]>(
    `SELECT * FROM annotations WHERE book_id = $1 AND type = 'logbook' LIMIT 1`,
    [bookId]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function saveLogbook(bookId: string, comment: string): Promise<Annotation> {
  const db = await getDatabase();
  const existing = await getLogbook(bookId);
  const now = new Date().toISOString();

  if (existing) {
    await db.execute(
      `UPDATE annotations SET comment = $1, updated_at = $2 WHERE id = $3`,
      [comment, now, existing.id]
    );
    return { ...existing, comment, updated_at: now };
  }

  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO annotations (id, book_id, type, page_number, selected_text, comment, color, updated_at)
     VALUES ($1, $2, 'logbook', NULL, NULL, $3, 'indigo', $4)`,
    [id, bookId, comment, now]
  );

  return {
    id,
    book_id: bookId,
    type: 'logbook',
    page_number: null,
    selected_text: null,
    comment,
    color: 'indigo',
    updated_at: now,
  };
}

export async function getBookAnnotations(bookId: string): Promise<Annotation[]> {
  const db = await getDatabase();
  return await db.select<Annotation[]>(
    `SELECT * FROM annotations 
     WHERE book_id = $1 AND type != 'logbook'
     ORDER BY page_number ASC, updated_at DESC`,
    [bookId]
  );
}

export async function addPageAnnotation(params: {
  bookId: string;
  type: 'note' | 'highlight';
  pageNumber: number;
  selectedText?: string;
  comment: string;
  color: string;
}): Promise<void> {
  const db = await getDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO annotations (id, book_id, type, page_number, selected_text, comment, color, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      params.bookId,
      params.type,
      params.pageNumber,
      params.selectedText?.trim() || null,
      params.comment.trim(),
      params.color,
      now,
    ]
  );
}

export async function togglePageBookmark(bookId: string, pageNumber: number): Promise<boolean> {
  const db = await getDatabase();
  const existing = await db.select<Annotation[]>(
    `SELECT id FROM annotations WHERE book_id = $1 AND type = 'bookmark' AND page_number = $2 LIMIT 1`,
    [bookId, pageNumber]
  );

  if (existing.length > 0) {
    await db.execute(`DELETE FROM annotations WHERE id = $1`, [existing[0].id]);
    return false;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO annotations (id, book_id, type, page_number, selected_text, comment, color, updated_at)
     VALUES ($1, $2, 'bookmark', $3, NULL, 'Marcador de página', 'amber', $4)`,
    [id, bookId, pageNumber, now]
  );
  return true;
}

export async function deleteAnnotation(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM annotations WHERE id = $1`, [id]);
}

export async function getGlossaryEntries(
  bookId: string,
  seriesId: string | null
): Promise<GlossaryEntry[]> {
  const db = await getDatabase();
  if (seriesId) {
    return await db.select<GlossaryEntry[]>(
      `SELECT * FROM glossary WHERE series_id = $1 OR book_id = $2 ORDER BY term ASC`,
      [seriesId, bookId]
    );
  }
  return await db.select<GlossaryEntry[]>(
    `SELECT * FROM glossary WHERE book_id = $1 ORDER BY term ASC`,
    [bookId]
  );
}

export async function addGlossaryEntry(params: {
  bookId: string;
  seriesId: string | null;
  term: string;
  category: GlossaryCategory;
  definition: string;
}): Promise<void> {
  const db = await getDatabase();
  const id = crypto.randomUUID();

  await db.execute(
    `INSERT INTO glossary (id, series_id, book_id, term, category, definition)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      params.seriesId,
      params.seriesId ? null : params.bookId,
      params.term.trim(),
      params.category,
      params.definition.trim(),
    ]
  );
}

export async function deleteGlossaryEntry(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM glossary WHERE id = $1`, [id]);
}
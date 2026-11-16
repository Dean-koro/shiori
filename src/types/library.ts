export type BookStatus = 'unread' | 'reading' | 'paused' | 'completed';
export type ViewMode = 'single' | 'double' | 'scroll';
export type ReaderTheme = 'original' | 'sepia' | 'night';
export type AnnotationType = 'logbook' | 'bookmark' | 'highlight' | 'note';
export type GlossaryCategory = 'character' | 'place' | 'faction' | 'term';

export interface Series {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  created_at: string;
}

export interface Book {
  id: string;
  series_id: string | null;
  title: string;
  volume_number: number;
  file_name: string;
  cover_name: string | null;
  total_pages: number;
  status: BookStatus;
  added_at: string;
}

export interface ReadingProgress {
  book_id: string;
  current_page: number;
  scroll_offset: number;
  zoom_level: number;
  view_mode: ViewMode;
  theme: ReaderTheme;
  last_read_at: string | null;
}

export interface Annotation {
  id: string;
  book_id: string;
  type: AnnotationType;
  page_number: number | null;
  selected_text: string | null;
  comment: string | null;
  color: string;
  updated_at: string;
}

export interface GlossaryEntry {
  id: string;
  series_id: string | null;
  book_id: string | null;
  term: string;
  category: GlossaryCategory;
  definition: string;
}
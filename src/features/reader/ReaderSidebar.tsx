import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import {
  BookMarked,
  StickyNote,
  Users,
  Search,
  Trash2,
  Download,
  Check,
  Plus,
  Bookmark,
} from 'lucide-react';
import { BookWithProgress } from '../../services/db/booksRepo';
import {
  addGlossaryEntry,
  addPageAnnotation,
  deleteAnnotation,
  deleteGlossaryEntry,
  getGlossaryEntries,
  saveLogbook,
} from '../../services/db/notesRepo';
import { PdfSearchMatch, searchInPdf } from '../../services/pdf/pdfSearch';
import { Annotation, GlossaryCategory, GlossaryEntry } from '../../types/library';

export type SidebarTab = 'logbook' | 'notes' | 'glossary' | 'search';

interface ReaderSidebarProps {
  book: BookWithProgress;
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  currentPage: number;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  logbook: Annotation | null;
  onLogbookSaved: (updated: Annotation) => void;
  annotations: Annotation[];
  onAnnotationsChanged: () => Promise<void>;
  onJumpToPage: (page: number, recordJump?: boolean) => void;
  searchFocusTrigger: number;
}

const COLOR_LABELS: Record<string, { label: string; hex: string }> = {
  yellow: { label: 'Evento clave', hex: '#eab308' },
  blue: { label: 'Personaje / Lugar', hex: '#3b82f6' },
  green: { label: 'Cita favorita', hex: '#22c55e' },
  pink: { label: 'Duda / Teoría', hex: '#ec4899' },
};

const CATEGORY_LABELS: Record<GlossaryCategory, string> = {
  character: 'Personaje',
  place: 'Lugar',
  faction: 'Facción',
  term: 'Término',
};

export function ReaderSidebar({
  book,
  pdfDoc,
  currentPage,
  activeTab,
  onTabChange,
  logbook,
  onLogbookSaved,
  annotations,
  onAnnotationsChanged,
  onJumpToPage,
  searchFocusTrigger,
}: ReaderSidebarProps) {
  // Estado Bitácora
  const [logText, setLogText] = useState(logbook?.comment || '');
  const [logSavedFeedback, setLogSavedFeedback] = useState(false);

  // Estado Nueva Nota
  const [noteQuote, setNoteQuote] = useState('');
  const [noteComment, setNoteComment] = useState('');
  const [noteColor, setNoteColor] = useState('yellow');

  // Estado Glosario
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [termInput, setTermInput] = useState('');
  const [categoryInput, setCategoryInput] = useState<GlossaryCategory>('character');
  const [defInput, setDefInput] = useState('');

  // Estado Buscador
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PdfSearchMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setLogText(logbook?.comment || '');
  }, [logbook]);

  useEffect(() => {
    void getGlossaryEntries(book.id, book.series_id)
      .then(setGlossary)
      .catch((err) => setActionError(`No se pudo cargar el glosario: ${String(err)}`));
  }, [book.id, book.series_id]);

  useEffect(() => {
    if (activeTab === 'search' && searchFocusTrigger > 0) {
      const timer = window.setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => window.clearTimeout(timer);
    }
  }, [activeTab, searchFocusTrigger]);

  async function handleSaveLogbook() {
    try {
      const saved = await saveLogbook(book.id, logText);
      onLogbookSaved(saved);
      setLogSavedFeedback(true);
      window.setTimeout(() => setLogSavedFeedback(false), 1800);
    } catch (err) {
      setActionError(`No se pudo guardar la bitácora: ${String(err)}`);
    }
  }

  async function handleCreateNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteComment.trim() && !noteQuote.trim()) return;

    try {
      await addPageAnnotation({
        bookId: book.id,
        type: noteQuote.trim() ? 'highlight' : 'note',
        pageNumber: currentPage,
        selectedText: noteQuote,
        comment: noteComment,
        color: noteColor,
      });
      setNoteQuote('');
      setNoteComment('');
      await onAnnotationsChanged();
    } catch (err) {
      setActionError(`No se pudo guardar el apunte: ${String(err)}`);
    }
  }

  async function handleCreateGlossary(e: React.FormEvent) {
    e.preventDefault();
    if (!termInput.trim() || !defInput.trim()) return;

    try {
      await addGlossaryEntry({
        bookId: book.id,
        seriesId: book.series_id,
        term: termInput,
        category: categoryInput,
        definition: defInput,
      });
      setTermInput('');
      setDefInput('');
      const updated = await getGlossaryEntries(book.id, book.series_id);
      setGlossary(updated);
    } catch (err) {
      setActionError(`No se pudo guardar el término: ${String(err)}`);
    }
  }

  async function handleRunSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!pdfDoc || searchQuery.trim().length < 2) return;
    setSearching(true);
    setActionError(null);
    try {
      const hits = await searchInPdf(pdfDoc, searchQuery);
      setSearchResults(hits);
    } catch (err) {
      setActionError(`No se pudo buscar en el PDF: ${String(err)}`);
    } finally {
      setSearching(false);
    }
  }

  async function handleExportMarkdown() {
    let targetPath: string | null;
    try {
      targetPath = await save({
        defaultPath: `${book.title} - Vol ${book.volume_number} - Apuntes.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
    } catch (err) {
      setActionError(`No se pudo abrir el diálogo de exportación: ${String(err)}`);
      return;
    }
    if (!targetPath) return;

    const lines: string[] = [
      `# ${book.title} — Volumen ${book.volume_number}`,
      book.series_title ? `**Saga:** ${book.series_title}` : '',
      `**Progreso:** Página ${currentPage} de ${book.total_pages}`,
      '',
      '## Bitácora de Estado (¿En qué me quedé?)',
      logText.trim() ? logText.trim() : '_Sin resumen registrado._',
      '',
      '## Notas y Marcadores',
    ];

    if (annotations.length === 0) {
      lines.push('_Sin notas registradas._');
    } else {
      for (const item of annotations) {
        const tag = item.type === 'bookmark' ? 'Marcador' : COLOR_LABELS[item.color]?.label || 'Nota';
        lines.push(`### Página ${item.page_number} · ${tag}`);
        if (item.selected_text) lines.push(`> "${item.selected_text}"`);
        if (item.comment) lines.push(item.comment);
        lines.push('');
      }
    }

    if (glossary.length > 0) {
      lines.push('## Glosario de Personajes y Términos');
      for (const g of glossary) {
        lines.push(`- **${g.term}** (${CATEGORY_LABELS[g.category]}): ${g.definition}`);
      }
    }

    const encoded = new TextEncoder().encode(lines.filter((l) => l !== null).join('\n'));
    try {
      await writeFile(targetPath, encoded);
    } catch (err) {
      setActionError(`No se pudieron exportar las notas: ${String(err)}`);
    }
  }

  return (
    <aside className="reader-sidebar">
      <div className="sidebar-tabs">
        <button
          className={activeTab === 'logbook' ? 'active' : ''}
          onClick={() => onTabChange('logbook')}
          title="Bitácora de trama"
        >
          <BookMarked size={15} /> Bitácora
        </button>
        <button
          className={activeTab === 'notes' ? 'active' : ''}
          onClick={() => onTabChange('notes')}
          title="Notas y marcadores"
        >
          <StickyNote size={15} /> Apuntes ({annotations.length})
        </button>
        <button
          className={activeTab === 'glossary' ? 'active' : ''}
          onClick={() => onTabChange('glossary')}
          title="Glosario"
        >
          <Users size={15} /> Glosario
        </button>
        <button
          className={activeTab === 'search' ? 'active' : ''}
          onClick={() => onTabChange('search')}
          title="Buscar en el PDF (Ctrl+F)"
        >
          <Search size={15} />
        </button>
      </div>

      <div className="sidebar-body">
        {actionError && (
          <div className="form-error" role="alert">
            {actionError}
          </div>
        )}
        {/* PESTAÑA 1: BITÁCORA */}
        {activeTab === 'logbook' && (
          <div className="sidebar-section">
            <div className="section-heading">
              <h4>¿En qué me quedé?</h4>
              <button
                className="icon-btn"
                onClick={handleExportMarkdown}
                title="Exportar bitácora y notas a Markdown (.md)"
              >
                <Download size={15} />
              </button>
            </div>
            <p className="helper-text">
              Escribe un resumen corto de la escena actual, conflictos abiertos o hacia dónde van
              los personajes para retomarlo fácil si dejas de leer por meses.
            </p>
            <textarea
              className="logbook-textarea"
              rows={9}
              placeholder="Ej. Terminaron la reunión en la capital; Subaru sospecha del mercader y planean salir al amanecer..."
              value={logText}
              onChange={(e) => setLogText(e.target.value)}
            />
            <button className="btn-primary full-width" onClick={handleSaveLogbook}>
              {logSavedFeedback ? (
                <>
                  <Check size={16} /> Bitácora guardada
                </>
              ) : (
                'Guardar bitácora'
              )}
            </button>
            {logbook?.updated_at && (
              <span className="timestamp-hint">
                Última actualización: {new Date(logbook.updated_at).toLocaleDateString()}
              </span>
            )}
          </div>
        )}

        {/* PESTAÑA 2: NOTAS Y MARCADORES */}
        {activeTab === 'notes' && (
          <div className="sidebar-section">
            <form className="compact-form" onSubmit={handleCreateNote}>
              <div className="section-heading">
                <h4>Apunte en página {currentPage}</h4>
                <div className="color-dots">
                  {Object.entries(COLOR_LABELS).map(([key, info]) => (
                    <button
                      type="button"
                      key={key}
                      className={`color-dot ${noteColor === key ? 'selected' : ''}`}
                      style={{ backgroundColor: info.hex }}
                      title={info.label}
                      onClick={() => setNoteColor(key)}
                    />
                  ))}
                </div>
              </div>
              <input
                type="text"
                placeholder="Cita o fragmento del texto (opcional)"
                value={noteQuote}
                onChange={(e) => setNoteQuote(e.target.value)}
              />
              <textarea
                rows={3}
                placeholder="Tu nota o comentario..."
                value={noteComment}
                onChange={(e) => setNoteComment(e.target.value)}
              />
              <button type="submit" className="btn-primary full-width">
                <Plus size={15} /> Guardar en pág. {currentPage}
              </button>
            </form>

            <div className="items-list">
              {annotations.length === 0 ? (
                <p className="empty-hint">Aún no hay marcadores ni notas en este volumen.</p>
              ) : (
                annotations.map((item) => (
                  <div
                    key={item.id}
                    className="note-card"
                    style={{
                      borderLeftColor:
                        item.type === 'bookmark'
                          ? '#f59e0b'
                          : COLOR_LABELS[item.color]?.hex || '#6366f1',
                    }}
                  >
                    <div className="note-card-header">
                      <button
                        className="page-jump-link"
                        onClick={() => item.page_number && onJumpToPage(item.page_number, true)}
                      >
                        {item.type === 'bookmark' && <Bookmark size={12} />}
                        Pág. {item.page_number}
                      </button>
                      <button
                        className="icon-btn"
                        onClick={async () => {
                          try {
                            await deleteAnnotation(item.id);
                            await onAnnotationsChanged();
                          } catch (err) {
                            setActionError(`No se pudo eliminar el apunte: ${String(err)}`);
                          }
                        }}
                        title="Eliminar"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {item.selected_text && (
                      <blockquote className="note-quote">"{item.selected_text}"</blockquote>
                    )}
                    {item.comment && <p className="note-comment">{item.comment}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* PESTAÑA 3: GLOSARIO */}
        {activeTab === 'glossary' && (
          <div className="sidebar-section">
            <form className="compact-form" onSubmit={handleCreateGlossary}>
              <h4>
                {book.series_title ? `Glosario de ${book.series_title}` : 'Glosario del libro'}
              </h4>
              <div className="glossary-row">
                <input
                  type="text"
                  placeholder="Nombre o término"
                  value={termInput}
                  onChange={(e) => setTermInput(e.target.value)}
                  required
                />
                <select
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value as GlossaryCategory)}
                >
                  <option value="character">Personaje</option>
                  <option value="place">Lugar</option>
                  <option value="faction">Facción</option>
                  <option value="term">Término</option>
                </select>
              </div>
              <textarea
                rows={2}
                placeholder="Quién es o qué significa..."
                value={defInput}
                onChange={(e) => setDefInput(e.target.value)}
                required
              />
              <button type="submit" className="btn-primary full-width">
                <Plus size={15} /> Agregar al glosario
              </button>
            </form>

            <div className="items-list">
              {glossary.length === 0 ? (
                <p className="empty-hint">
                  Anota personajes secundarios o lugares para no olvidarlos entre volúmenes.
                </p>
              ) : (
                glossary.map((entry) => (
                  <div key={entry.id} className="note-card">
                    <div className="note-card-header">
                      <div>
                        <strong>{entry.term}</strong>{' '}
                        <span className="pill-tag">{CATEGORY_LABELS[entry.category]}</span>
                      </div>
                      <button
                        className="icon-btn"
                        onClick={async () => {
                          try {
                            await deleteGlossaryEntry(entry.id);
                            setGlossary(await getGlossaryEntries(book.id, book.series_id));
                          } catch (err) {
                            setActionError(`No se pudo eliminar el término: ${String(err)}`);
                          }
                        }}
                        title="Eliminar"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <p className="note-comment">{entry.definition}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* PESTAÑA 4: BUSCADOR INTERNO */}
        {activeTab === 'search' && (
          <div className="sidebar-section">
            <form className="compact-form" onSubmit={handleRunSearch}>
              <h4>Buscar en el texto</h4>
              <div className="glossary-row">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Personaje o palabra clave..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button type="submit" className="btn-primary" disabled={searching}>
                  {searching ? '...' : 'Ir'}
                </button>
              </div>
            </form>

            <div className="items-list">
              {searchResults.map((hit, i) => (
                <button
                  key={`${hit.pageNumber}-${i}`}
                  className="search-hit-card"
                  onClick={() => onJumpToPage(hit.pageNumber, true)}
                >
                  <span className="hit-page">Página {hit.pageNumber}</span>
                  <p>{hit.snippet}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
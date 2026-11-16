import { useEffect, useRef, useState } from 'react';
import { BaseDirectory, readFile } from '@tauri-apps/plugin-fs';
import { BookOpen, Plus, Search, Edit3, Clock } from 'lucide-react';
import {
  BookWithProgress,
  createBookFromImport,
  getAllBooks,
  updateBookCoverName,
  updateBookMetadata,
} from '../../services/db/booksRepo';
import { pickAndImportPdfs, regeneratePdfCover } from '../../services/pdf/pdfImporter';
import { BookStatus } from '../../types/library';

interface LibraryViewProps {
  onOpenBook: (book: BookWithProgress) => void;
}

export function LibraryView({ onOpenBook }: LibraryViewProps) {
  const [books, setBooks] = useState<BookWithProgress[]>([]);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [editingBook, setEditingBook] = useState<BookWithProgress | null>(null);

  // Campos del formulario de edición
  const [editTitle, setEditTitle] = useState('');
  const [editVolume, setEditVolume] = useState('1');
  const [editSeries, setEditSeries] = useState('');
  const [editStatus, setEditStatus] = useState<BookStatus>('unread');
  const [coverPage, setCoverPage] = useState('1');
  const [regeneratingCover, setRegeneratingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const coverUrlsRef = useRef<Record<string, string>>({});
  const mountedRef = useRef(true);

  async function loadLibrary() {
    const list = await getAllBooks();
    if (!mountedRef.current) return;
    setBooks(list);

    const urls: Record<string, string> = {};
    for (const b of list) {
      if (b.cover_name) {
        try {
          const bytes = await readFile(`covers/${b.cover_name}`, {
            baseDir: BaseDirectory.AppData,
          });
          const lowerName = b.cover_name.toLowerCase();
          const type = lowerName.endsWith('.png')
            ? 'image/png'
            : lowerName.endsWith('.webp')
              ? 'image/webp'
              : 'image/jpeg';
          urls[b.id] = URL.createObjectURL(new Blob([bytes], { type }));
        } catch (err) {
          console.error(`No se pudo cargar la portada de ${b.title}:`, err);
        }
      }
    }
    if (!mountedRef.current) {
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
      return;
    }
    Object.values(coverUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    coverUrlsRef.current = urls;
    setCoverUrls(urls);
  }

  useEffect(() => {
    mountedRef.current = true;
    void loadLibrary();
    return () => {
      mountedRef.current = false;
      Object.values(coverUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  async function handleImport() {
    setImporting(true);
    try {
      const imported = await pickAndImportPdfs();
      for (const item of imported) {
        await createBookFromImport(item);
      }
      if (imported.length > 0) await loadLibrary();
    } finally {
      setImporting(false);
    }
  }

  function openEditModal(book: BookWithProgress) {
    setEditingBook(book);
    setEditTitle(book.title);
    setEditVolume(String(book.volume_number));
    setEditSeries(book.series_title || '');
    setEditStatus(book.status);
    setCoverPage('1');
    setCoverError(null);
  }

  async function handleSaveMetadata(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBook) return;
    await updateBookMetadata({
      bookId: editingBook.id,
      title: editTitle,
      volumeNumber: parseFloat(editVolume) || 1,
      status: editStatus,
      seriesTitle: editSeries,
    });
    setEditingBook(null);
    await loadLibrary();
  }

  async function handleRegenerateCover(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBook) return;

    const pageNumber = Number.parseInt(coverPage, 10);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > editingBook.total_pages) {
      setCoverError(`Indica una página entre 1 y ${editingBook.total_pages}.`);
      return;
    }

    setRegeneratingCover(true);
    setCoverError(null);
    try {
      const coverName = await regeneratePdfCover(
        editingBook.file_name,
        editingBook.id,
        pageNumber
      );
      await updateBookCoverName(editingBook.id, coverName);
      await loadLibrary();
    } catch (err) {
      setCoverError(`No se pudo regenerar la portada: ${String(err)}`);
    } finally {
      setRegeneratingCover(false);
    }
  }

  function formatTimeAgo(isoDate: string | null): string {
    if (!isoDate) return 'Sin empezar';
    const diffDays = Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 30) return `Hace ${diffDays} días`;
    const months = Math.floor(diffDays / 30);
    return months === 1 ? 'Hace 1 mes' : `Hace ${months} meses`;
  }

  const lastReadBook = books.find((b) => b.last_read_at !== null) || books[0];

  const filteredBooks = books.filter((b) => {
    const q = search.toLowerCase();
    return (
      b.title.toLowerCase().includes(q) ||
      (b.series_title && b.series_title.toLowerCase().includes(q))
    );
  });

  return (
    <div className="library-container">
      <header className="library-header">
        <div className="brand">
          <BookOpen size={24} />
          <h1>Shiori</h1>
        </div>

        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Buscar novela o saga..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button className="btn-primary" onClick={handleImport} disabled={importing}>
          <Plus size={18} />
          {importing ? 'Importando...' : 'Agregar PDFs'}
        </button>
      </header>

      {lastReadBook && (
        <section className="hero-card">
          <div className="hero-cover">
            {coverUrls[lastReadBook.id] ? (
              <img src={coverUrls[lastReadBook.id]} alt={lastReadBook.title} />
            ) : (
              <div className="cover-placeholder">Sin portada</div>
            )}
          </div>
          <div className="hero-info">
            <span className="badge">CONTINUAR LEYENDO</span>
            {lastReadBook.series_title && (
              <p className="series-label">{lastReadBook.series_title}</p>
            )}
            <h2>
              {lastReadBook.title} — Vol. {lastReadBook.volume_number}
            </h2>
            <div className="progress-meta">
              <span>
                Página {lastReadBook.current_page} de {lastReadBook.total_pages} (
                {Math.round((lastReadBook.current_page / Math.max(1, lastReadBook.total_pages)) * 100)}
                %)
              </span>
              <span className="time-ago">
                <Clock size={14} /> {formatTimeAgo(lastReadBook.last_read_at)}
              </span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.min(
                    100,
                    (lastReadBook.current_page / Math.max(1, lastReadBook.total_pages)) * 100
                  )}%`,
                }}
              />
            </div>
            <button className="btn-primary" onClick={() => onOpenBook(lastReadBook)}>
              Retomar lectura
            </button>
          </div>
        </section>
      )}

      <section className="grid-section">
        <h3>Todos los volúmenes ({filteredBooks.length})</h3>
        {filteredBooks.length === 0 ? (
          <div className="empty-state">
            <p>Aún no tienes novelas en tu biblioteca.</p>
            <button className="btn-primary" onClick={handleImport}>
              Importar tu primer PDF
            </button>
          </div>
        ) : (
          <div className="books-grid">
            {filteredBooks.map((book) => {
              const pct = Math.round(
                (book.current_page / Math.max(1, book.total_pages)) * 100
              );
              return (
                <article key={book.id} className="book-card">
                  <div className="book-cover-wrapper" onClick={() => onOpenBook(book)}>
                    {coverUrls[book.id] ? (
                      <img src={coverUrls[book.id]} alt={book.title} />
                    ) : (
                      <div className="cover-placeholder">{book.title}</div>
                    )}
                    <span className="vol-tag">Vol. {book.volume_number}</span>
                  </div>

                  <div className="book-details">
                    {book.series_title && (
                      <span className="book-series">{book.series_title}</span>
                    )}
                    <h4 title={book.title} onClick={() => onOpenBook(book)}>
                      {book.title}
                    </h4>

                    <div className="progress-bar small">
                      <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>

                    <div className="book-footer">
                      <span>
                        {pct}% · {formatTimeAgo(book.last_read_at)}
                      </span>
                      <button
                        className="icon-btn"
                        title="Editar metadatos"
                        onClick={() => openEditModal(book)}
                      >
                        <Edit3 size={14} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {editingBook && (
        <div className="modal-backdrop" onClick={() => setEditingBook(null)}>
          <form
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveMetadata}
          >
            <h3>Editar detalles del volumen</h3>
            <label>
              Título del volumen
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
              />
            </label>
            <label>
              Saga / Serie (agrupa volúmenes relacionados)
              <input
                type="text"
                placeholder="Ej. Overlord, Mushoku Tensei..."
                value={editSeries}
                onChange={(e) => setEditSeries(e.target.value)}
              />
            </label>
            <div className="form-row">
              <label>
                Número de volumen
                <input
                  type="number"
                  step="0.5"
                  value={editVolume}
                  onChange={(e) => setEditVolume(e.target.value)}
                />
              </label>
              <label>
                Estado
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as BookStatus)}
                >
                  <option value="unread">Sin empezar</option>
                  <option value="reading">Leyendo</option>
                  <option value="paused">Pausado</option>
                  <option value="completed">Completado</option>
                </select>
              </label>
            </div>
            <div className="cover-regenerate">
              <span className="form-label">Regenerar portada desde página [N]</span>
              <div className="cover-regenerate-row">
                <input
                  type="number"
                  min="1"
                  max={editingBook.total_pages}
                  value={coverPage}
                  onChange={(e) => setCoverPage(e.target.value)}
                  aria-label="Página para regenerar la portada"
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleRegenerateCover}
                  disabled={regeneratingCover}
                >
                  {regeneratingCover ? 'Generando...' : 'Regenerar portada'}
                </button>
              </div>
              {coverError && <span className="form-error">{coverError}</span>}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setEditingBook(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary">
                Guardar cambios
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { BaseDirectory, readFile } from '@tauri-apps/plugin-fs';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Columns,
  FileText,
  ScrollText,
  Sun,
  Moon,
  BookOpen,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo2,
  ArrowRightCircle,
  Bookmark,
  BookmarkCheck,
  PanelRight,
  History,
} from 'lucide-react';
import { BookWithProgress } from '../../services/db/booksRepo';
import {
  getNextVolumeInSeries,
  getReadingProgress,
  saveReadingProgress,
} from '../../services/db/progressRepo';
import {
  getBookAnnotations,
  getLogbook,
  togglePageBookmark,
} from '../../services/db/notesRepo';
import { Annotation, ReaderTheme, ViewMode } from '../../types/library';
import { PdfPageCanvas } from './PdfPageCanvas';
import { ReaderSidebar, SidebarTab } from './ReaderSidebar';
import { ResumeWelcomeModal } from './ResumeWelcomeModal';

interface ReaderViewProps {
  book: BookWithProgress;
  onBack: () => void;
  onSwitchBook: (nextBook: BookWithProgress) => void;
}

const INACTIVITY_DAYS_THRESHOLD = 14;

function VirtualPageSlot({
  pdfDoc,
  pageNumber,
  scale,
  defaultSize,
  rootRef,
}: {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  defaultSize: { width: number; height: number };
  rootRef: React.RefObject<HTMLDivElement | null>;
}) {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [exactSize, setExactSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        root: rootRef.current,
        rootMargin: '700px 0px',
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootRef]);

  const handleMeasure = useCallback((_: number, w: number, h: number) => {
    setExactSize((prev) =>
      prev && prev.width === w && prev.height === h ? prev : { width: w, height: h }
    );
  }, []);

  const size = exactSize || defaultSize;

  return (
    <div
      ref={slotRef}
      className={`pdf-page-wrapper ${isVisible ? 'is-loaded' : 'is-placeholder'}`}
      data-page={pageNumber}
      style={{
        width: `${Math.floor(size.width * scale)}px`,
        height: `${Math.floor(size.height * scale)}px`,
      }}
    >
      {isVisible && (
        <PdfPageCanvas
          pdfDoc={pdfDoc}
          pageNumber={pageNumber}
          scale={scale}
          onMeasure={handleMeasure}
        />
      )}
      <span className="page-number-badge">{pageNumber}</span>
    </div>
  );
}

export function ReaderView({ book, onBack, onSwitchBook }: ReaderViewProps) {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [defaultPageSize, setDefaultPageSize] = useState({ width: 550, height: 800 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(book.current_page || 1);
  const [pageInput, setPageInput] = useState(String(book.current_page || 1));
  const [zoom, setZoom] = useState(1.1);
  const [viewMode, setViewMode] = useState<ViewMode>('single');
  const [theme, setTheme] = useState<ReaderTheme>('original');
  const [jumpHistory, setJumpHistory] = useState<number[]>([]);
  const [nextVolume, setNextVolume] = useState<BookWithProgress | null>(null);

  // Estado de memoria, notas y panel lateral
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('logbook');
  const [searchFocusTrigger, setSearchFocusTrigger] = useState(0);
  const [logbook, setLogbook] = useState<Annotation | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [previousLastRead, setPreviousLastRead] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const initialScrollOffsetRef = useRef<number>(0);
  const currentScrollOffsetRef = useRef<number>(0);
  const scrollRafRef = useRef<number | null>(null);

  const refreshAnnotations = useCallback(async () => {
    const list = await getBookAnnotations(book.id);
    setAnnotations(list);
  }, [book.id]);

  useEffect(() => {
    let active = true;
    let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;

    async function loadDocument() {
      setLoading(true);
      setError(null);
      setJumpHistory([]);

      try {
        const [savedProgress, nextVol, savedLog, savedNotes, pdfBytes] = await Promise.all([
          getReadingProgress(book.id),
          getNextVolumeInSeries(book.series_id, book.volume_number),
          getLogbook(book.id),
          getBookAnnotations(book.id),
          readFile(`books/${book.file_name}`, { baseDir: BaseDirectory.AppData }),
        ]);

        if (!active) return;

        setNextVolume(nextVol);
        setLogbook(savedLog);
        setAnnotations(savedNotes);
        setPreviousLastRead(savedProgress.last_read_at);

        setCurrentPage(savedProgress.current_page);
        setPageInput(String(savedProgress.current_page));
        setZoom(savedProgress.zoom_level || 1.1);
        setViewMode(savedProgress.view_mode);
        setTheme(savedProgress.theme);
        initialScrollOffsetRef.current = savedProgress.scroll_offset;
        currentScrollOffsetRef.current = savedProgress.scroll_offset;

        // Activar tarjeta de bienvenida si pasaron >= 14 días y ya habías empezado el libro
        if (savedProgress.last_read_at && savedProgress.current_page > 1) {
          const daysAway =
            (Date.now() - new Date(savedProgress.last_read_at).getTime()) / (1000 * 60 * 60 * 24);
          if (daysAway >= INACTIVITY_DAYS_THRESHOLD) {
            setShowResumeModal(true);
          }
        }

        loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
        const loadedDoc = await loadingTask.promise;

        const samplePageNum = Math.min(
          loadedDoc.numPages,
          Math.max(1, Math.min(10, Math.ceil(loadedDoc.numPages / 4)))
        );
        const samplePage = await loadedDoc.getPage(samplePageNum);
        const vp = samplePage.getViewport({ scale: 1 });
        samplePage.cleanup();

        if (!active) {
          await loadingTask.destroy();
          return;
        }

        setDefaultPageSize({ width: vp.width, height: vp.height });
        setPdfDoc(loadedDoc);
      } catch (err) {
        if (active) setError(`No se pudo abrir el PDF: ${String(err)}`);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDocument();

    return () => {
      active = false;
      if (loadingTask) {
        loadingTask.destroy().catch(() => {});
      }
    };
  }, [book]);

  useEffect(() => {
    if (!pdfDoc || !viewportRef.current) return;
    const container = viewportRef.current;

    const timer = setTimeout(() => {
      if (viewMode === 'scroll') {
        const targetEl = container.querySelector(
          `[data-page="${currentPage}"]`
        ) as HTMLElement | null;
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'auto' });
        }
      } else if (initialScrollOffsetRef.current > 0) {
        const maxScroll = container.scrollHeight - container.clientHeight;
        container.scrollTop = maxScroll * initialScrollOffsetRef.current;
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [pdfDoc, viewMode]);

  const persistNow = useCallback(async () => {
    try {
      await saveReadingProgress({
        bookId: book.id,
        currentPage,
        scrollOffset: currentScrollOffsetRef.current,
        zoomLevel: zoom,
        viewMode,
        theme,
        totalPages: book.total_pages,
      });
    } catch (err) {
      setError(`No se pudo guardar el progreso: ${String(err)}`);
    }
  }, [book.id, book.total_pages, currentPage, zoom, viewMode, theme]);

  useEffect(() => {
    if (loading || !pdfDoc) return;
    const timer = setTimeout(() => {
      void persistNow();
    }, 600);

    return () => clearTimeout(timer);
  }, [loading, pdfDoc, persistNow]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      void persistNow();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [persistNow]);

  const goToPage = useCallback(
    (target: number, recordJump = false) => {
      const clamped = Math.max(1, Math.min(book.total_pages, target));
      if (recordJump && Math.abs(clamped - currentPage) > 2) {
        setJumpHistory((prev) => [...prev.slice(-9), currentPage]);
      }

      setCurrentPage(clamped);
      setPageInput(String(clamped));
      currentScrollOffsetRef.current = 0;

      if (viewportRef.current) {
        if (viewMode === 'scroll') {
          const el = viewportRef.current.querySelector(
            `[data-page="${clamped}"]`
          ) as HTMLElement | null;
          el?.scrollIntoView({ behavior: 'auto' });
        } else {
          viewportRef.current.scrollTop = 0;
        }
      }
    },
    [book.total_pages, currentPage, viewMode]
  );

  const handleToggleBookmark = useCallback(async () => {
    try {
      await togglePageBookmark(book.id, currentPage);
      await refreshAnnotations();
    } catch (err) {
      setError(`No se pudo actualizar el marcador: ${String(err)}`);
    }
  }, [book.id, currentPage, refreshAnnotations]);

  const stepAmount = viewMode === 'double' ? 2 : 1;

  // Atajos de teclado: Flechas, B (marcador) y Ctrl+F (buscador)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSidebarOpen(true);
        setSidebarTab('search');
        setSearchFocusTrigger((n) => n + 1);
        return;
      }

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handleToggleBookmark();
        return;
      }

      if (viewMode !== 'scroll') {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          goToPage(currentPage + stepAmount);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          goToPage(currentPage - stepAmount);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, stepAmount, viewMode, goToPage, handleToggleBookmark]);

  function handleViewportScroll() {
    if (scrollRafRef.current !== null) return;

    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const container = viewportRef.current;
      if (!container) return;

      const maxScroll = Math.max(1, container.scrollHeight - container.clientHeight);
      currentScrollOffsetRef.current = Number((container.scrollTop / maxScroll).toFixed(4));

      if (viewMode === 'scroll') {
        const rect = container.getBoundingClientRect();
        const hitEl = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height * 0.35
        );
        const pageWrapper = hitEl?.closest('[data-page]') as HTMLElement | null;
        if (pageWrapper) {
          const detected = Number(pageWrapper.dataset.page);
          if (detected && detected !== currentPage) {
            setCurrentPage(detected);
            setPageInput(String(detected));
          }
        }
      }
    });
  }

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  function handleFitWidth() {
    if (!viewportRef.current) return;
    const availableWidth = viewportRef.current.clientWidth - 96;
    const targetFactor = viewMode === 'double' ? 2.05 : 1;
    const idealZoom = availableWidth / (defaultPageSize.width * targetFactor);
    setZoom(Math.max(0.5, Math.min(2.5, Number(idealZoom.toFixed(2)))));
  }

  function handlePageInputSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseInt(pageInput, 10);
    if (!isNaN(parsed)) {
      goToPage(parsed, true);
    } else {
      setPageInput(String(currentPage));
    }
  }

  function handleUndoJump() {
    if (jumpHistory.length === 0) return;
    const previousPage = jumpHistory[jumpHistory.length - 1];
    setJumpHistory((prev) => prev.slice(0, -1));
    goToPage(previousPage, false);
  }

  async function handleExitReader() {
    await persistNow();
    onBack();
  }

  const isCurrentPageBookmarked = annotations.some(
    (a) => a.type === 'bookmark' && a.page_number === currentPage
  );

  const latestNote = [...annotations]
    .filter((a) => a.type !== 'bookmark')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] || null;

  const singleOrDoublePages: number[] = [];
  if (pdfDoc && viewMode !== 'scroll') {
    singleOrDoublePages.push(currentPage);
    if (viewMode === 'double' && currentPage + 1 <= book.total_pages) {
      singleOrDoublePages.push(currentPage + 1);
    }
  }

  const progressPct = Math.round((currentPage / Math.max(1, book.total_pages)) * 100);
  const isAtEnd = currentPage >= book.total_pages - (viewMode === 'double' ? 1 : 0);

  return (
    <div className="reader-shell">
      <header className="reader-topbar">
        <div className="reader-left">
          <button className="btn-secondary" onClick={handleExitReader}>
            <ArrowLeft size={16} /> Biblioteca
          </button>
          <div className="reader-title-group">
            <span className="reader-book-title">
              {book.title} — Vol. {book.volume_number}
            </span>
            {book.series_title && <span className="reader-series">{book.series_title}</span>}
          </div>
          {jumpHistory.length > 0 && (
            <button
              className="btn-jump-back"
              onClick={handleUndoJump}
              title="Regresar a la página anterior al salto"
            >
              <Undo2 size={14} /> Volver a pág. {jumpHistory[jumpHistory.length - 1]}
            </button>
          )}
        </div>

        <form className="page-stepper" onSubmit={handlePageInputSubmit}>
          <button
            type="button"
            className="icon-btn"
            disabled={currentPage <= 1}
            onClick={() => goToPage(currentPage - stepAmount)}
          >
            <ChevronLeft size={18} />
          </button>
          <input
            type="text"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            aria-label="Página actual"
          />
          <span>/ {book.total_pages}</span>
          <button
            type="button"
            className="icon-btn"
            disabled={currentPage >= book.total_pages}
            onClick={() => goToPage(currentPage + stepAmount)}
          >
            <ChevronRight size={18} />
          </button>
        </form>

        <div className="reader-controls">
          <div className="segmented-control" title="Modo de vista">
            <button
              className={viewMode === 'single' ? 'active' : ''}
              onClick={() => setViewMode('single')}
              title="Página única"
            >
              <FileText size={15} />
            </button>
            <button
              className={viewMode === 'double' ? 'active' : ''}
              onClick={() => setViewMode('double')}
              title="Doble página"
            >
              <Columns size={15} />
            </button>
            <button
              className={viewMode === 'scroll' ? 'active' : ''}
              onClick={() => setViewMode('scroll')}
              title="Scroll continuo"
            >
              <ScrollText size={15} />
            </button>
          </div>

          <div className="segmented-control" title="Tema de lectura">
            <button
              className={theme === 'original' ? 'active' : ''}
              onClick={() => setTheme('original')}
              title="Original"
            >
              <Sun size={15} />
            </button>
            <button
              className={theme === 'sepia' ? 'active' : ''}
              onClick={() => setTheme('sepia')}
              title="Sepia"
            >
              <BookOpen size={15} />
            </button>
            <button
              className={theme === 'night' ? 'active' : ''}
              onClick={() => setTheme('night')}
              title="Modo Noche"
            >
              <Moon size={15} />
            </button>
          </div>

          <div className="zoom-controls">
            <button
              className="icon-btn"
              onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}
              title="Alejar"
            >
              <ZoomOut size={16} />
            </button>
            <span className="zoom-label">{Math.round(zoom * 100)}%</span>
            <button
              className="icon-btn"
              onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.15).toFixed(2))))}
              title="Acercar"
            >
              <ZoomIn size={16} />
            </button>
            <button
              className="icon-btn"
              onClick={handleFitWidth}
              title="Ajustar al ancho de pantalla"
            >
              <Maximize2 size={15} />
            </button>
          </div>

          <div className="memory-controls">
            <button
              className={`icon-btn ${isCurrentPageBookmarked ? 'bookmarked' : ''}`}
              onClick={handleToggleBookmark}
              title="Guardar/quitar marcador en esta página (Tecla B)"
            >
              {isCurrentPageBookmarked ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
            </button>

            <button
              className="icon-btn"
              onClick={() => setShowResumeModal(true)}
              title="Resumen de contexto y vistazo rápido"
            >
              <History size={17} />
            </button>

            <button
              className={`btn-secondary ${sidebarOpen ? 'active-pill' : ''}`}
              onClick={() => setSidebarOpen((o) => !o)}
              title="Abrir panel de bitácora y notas"
            >
              <PanelRight size={16} /> Notas
            </button>
          </div>
        </div>
      </header>

      <div className="reader-workspace">
        <main
          ref={viewportRef}
          className={`reader-viewport theme-${theme}`}
          onScroll={handleViewportScroll}
        >
          {loading && <div className="center-screen">Cargando documento...</div>}
          {error && <div className="center-screen">{error}</div>}

          {!loading && !error && pdfDoc && (
            <div className={`pages-container mode-${viewMode}`}>
              {viewMode === 'scroll'
                ? Array.from({ length: book.total_pages }, (_, idx) => idx + 1).map((pageNum) => (
                    <VirtualPageSlot
                      key={pageNum}
                      pdfDoc={pdfDoc}
                      pageNumber={pageNum}
                      scale={zoom}
                      defaultSize={defaultPageSize}
                      rootRef={viewportRef}
                    />
                  ))
                : singleOrDoublePages.map((pageNum) => (
                    <div key={pageNum} className="pdf-page-wrapper is-loaded" data-page={pageNum}>
                      <PdfPageCanvas pdfDoc={pdfDoc} pageNumber={pageNum} scale={zoom} />
                      <span className="page-number-badge">{pageNum}</span>
                    </div>
                  ))}
            </div>
          )}

          {!loading && isAtEnd && nextVolume && (
            <div className="next-volume-banner">
              <p>Has llegado al final de este volumen.</p>
              <button
                className="btn-primary"
                onClick={async () => {
                  await persistNow();
                  onSwitchBook(nextVolume);
                }}
              >
                Continuar con Vol. {nextVolume.volume_number}: {nextVolume.title}
                <ArrowRightCircle size={18} />
              </button>
            </div>
          )}
        </main>

        {sidebarOpen && (
          <ReaderSidebar
            book={book}
            pdfDoc={pdfDoc}
            currentPage={currentPage}
            activeTab={sidebarTab}
            onTabChange={setSidebarTab}
            logbook={logbook}
            onLogbookSaved={(updated) => setLogbook(updated)}
            annotations={annotations}
            onAnnotationsChanged={refreshAnnotations}
            onJumpToPage={goToPage}
            searchFocusTrigger={searchFocusTrigger}
          />
        )}
      </div>

      <footer className="reader-bottombar">
        <input
          type="range"
          min={1}
          max={Math.max(1, book.total_pages)}
          value={currentPage}
          onChange={(e) => goToPage(Number(e.target.value), true)}
          className="reader-scrubber"
        />
        <span className="reader-pct">{progressPct}% leído</span>
      </footer>

      {showResumeModal && (
        <ResumeWelcomeModal
          book={book}
          pdfDoc={pdfDoc}
          currentPage={currentPage}
          lastReadAt={previousLastRead}
          logbook={logbook}
          latestNote={latestNote}
          onClose={() => setShowResumeModal(false)}
          onOpenLogbook={() => {
            setSidebarOpen(true);
            setSidebarTab('logbook');
          }}
        />
      )}
    </div>
  );
}
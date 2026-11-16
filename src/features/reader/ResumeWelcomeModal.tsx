import { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Clock, Eye, BookOpen, X } from 'lucide-react';
import { BookWithProgress } from '../../services/db/booksRepo';
import { Annotation } from '../../types/library';
import { PdfPageCanvas } from './PdfPageCanvas';

interface ResumeWelcomeModalProps {
  book: BookWithProgress;
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  currentPage: number;
  lastReadAt: string | null;
  logbook: Annotation | null;
  latestNote: Annotation | null;
  onClose: () => void;
  onOpenLogbook: () => void;
}

export function ResumeWelcomeModal({
  book,
  pdfDoc,
  currentPage,
  lastReadAt,
  logbook,
  latestNote,
  onClose,
  onOpenLogbook,
}: ResumeWelcomeModalProps) {
  const [showQuickPeek, setShowQuickPeek] = useState(false);

  const prevPages: number[] = [];
  if (currentPage - 2 >= 1) prevPages.push(currentPage - 2);
  if (currentPage - 1 >= 1) prevPages.push(currentPage - 1);

  function formatElapsed(iso: string | null): string {
    if (!iso) return 'Primera sesión';
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Leído hoy';
    if (days === 1) return 'Hace 1 día';
    if (days < 30) return `Hace ${days} días`;
    const months = Math.floor(days / 30);
    return months === 1 ? 'Hace 1 mes' : `Hace ${months} meses`;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`resume-modal ${showQuickPeek ? 'wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="resume-header">
          <div>
            <span className="badge">RETOMAR LECTURA</span>
            <h3>
              {book.title} — Vol. {book.volume_number}
            </h3>
          </div>
          <button className="icon-btn" onClick={onClose} title="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="resume-meta-bar">
          <span>
            <Clock size={14} /> {formatElapsed(lastReadAt)}
          </span>
          <span>
            Te quedaste en la <strong>página {currentPage}</strong> de {book.total_pages}
          </span>
        </div>

        {!showQuickPeek ? (
          <>
            <div className="resume-box">
              <div className="resume-box-title">
                <span>Bitácora de trama (¿En qué me quedé?)</span>
                <button
                  className="page-jump-link"
                  onClick={() => {
                    onClose();
                    onOpenLogbook();
                  }}
                >
                  Editar
                </button>
              </div>
              <p className="resume-text">
                {logbook?.comment?.trim()
                  ? logbook.comment
                  : 'No dejaste un resumen en la bitácora la última vez.'}
              </p>
            </div>

            {latestNote && (
              <div className="resume-box">
                <div className="resume-box-title">
                  <span>Último apunte guardado (Pág. {latestNote.page_number})</span>
                </div>
                {latestNote.selected_text && (
                  <blockquote className="note-quote">"{latestNote.selected_text}"</blockquote>
                )}
                <p className="resume-text">{latestNote.comment}</p>
              </div>
            )}

            <div className="resume-actions">
              {prevPages.length > 0 && pdfDoc && (
                <button className="btn-secondary" onClick={() => setShowQuickPeek(true)}>
                  <Eye size={16} /> Vistazo rápido (págs. {prevPages.join(' y ')})
                </button>
              )}
              <button className="btn-primary" onClick={onClose}>
                <BookOpen size={16} /> Continuar en pág. {currentPage}
              </button>
            </div>
          </>
        ) : (
          <div className="quick-peek-container">
            <div className="quick-peek-bar">
              <span>Vistazo rápido de contexto (tu marcador sigue en la pág. {currentPage})</span>
              <button className="btn-secondary" onClick={() => setShowQuickPeek(false)}>
                Volver al resumen
              </button>
            </div>
            <div className="quick-peek-pages">
              {pdfDoc &&
                prevPages.map((p) => (
                  <div key={p} className="pdf-page-wrapper is-loaded">
                    <PdfPageCanvas pdfDoc={pdfDoc} pageNumber={p} scale={0.85} />
                    <span className="page-number-badge">Pág. {p}</span>
                  </div>
                ))}
            </div>
            <div className="resume-actions">
              <button className="btn-primary" onClick={onClose}>
                Listo, ir a página {currentPage}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
import { useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

interface PdfPageCanvasProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  onMeasure?: (pageNumber: number, baseWidth: number, baseHeight: number) => void;
}

export function PdfPageCanvas({ pdfDoc, pageNumber, scale, onMeasure }: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;
    let loadedPage: pdfjsLib.PDFPageProxy | null = null;
    const canvas = canvasRef.current;

    async function renderPage() {
      if (!canvas) return;

      try {
        const page = await pdfDoc.getPage(pageNumber);
        loadedPage = page;
        if (isCancelled) {
          page.cleanup();
          return;
        }

        const baseVp = page.getViewport({ scale: 1 });
        onMeasure?.(pageNumber, baseVp.width, baseVp.height);

        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const viewport = page.getViewport({ scale });

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, viewport.width, viewport.height);

        renderTask = page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        });

        await renderTask.promise;
        page.cleanup();
      } catch (err: unknown) {
        if ((err as { name?: string })?.name !== 'RenderingCancelledException') {
          console.error(`Error renderizando página ${pageNumber}:`, err);
        }
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
      if (loadedPage) {
        loadedPage.cleanup();
      }
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, [pdfDoc, pageNumber, scale, onMeasure]);

  return <canvas ref={canvasRef} />;
}
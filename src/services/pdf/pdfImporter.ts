import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { open } from '@tauri-apps/plugin-dialog';
import { BaseDirectory, readFile, writeFile } from '@tauri-apps/plugin-fs';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface ImportedPdfData {
  id: string;
  title: string;
  fileName: string;
  coverName: string | null;
  totalPages: number;
}

async function generateCoverJpeg(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number
): Promise<Uint8Array | null> {
  let page: pdfjsLib.PDFPageProxy | null = null;
  try {
    if (pageNumber < 1 || pageNumber > pdfDoc.numPages) return null;

    page = await pdfDoc.getPage(pageNumber);
    const unscaledViewport = page.getViewport({ scale: 1 });
    const targetWidth = 320;
    const scale = targetWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
    );
    if (!blob) return null;

    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (err) {
    console.error('No se pudo extraer la portada:', err);
    return null;
  } finally {
    page?.cleanup();
  }
}

async function loadPdfCover(
  pdfBytes: Uint8Array,
  bookId: string,
  pageNumber: number
): Promise<string | null> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
  try {
    const pdfDoc = await loadingTask.promise;
    const coverBytes = await generateCoverJpeg(pdfDoc, pageNumber);
    if (!coverBytes) return null;

    const coverName = `${bookId}.jpg`;
    await writeFile(`covers/${coverName}`, coverBytes, { baseDir: BaseDirectory.AppData });
    return coverName;
  } finally {
    await loadingTask.destroy();
  }
}

export async function regeneratePdfCover(
  fileName: string,
  bookId: string,
  pageNumber: number
): Promise<string> {
  const pdfBytes = await readFile(`books/${fileName}`, { baseDir: BaseDirectory.AppData });
  const coverName = await loadPdfCover(pdfBytes, bookId, pageNumber);
  if (!coverName) {
    throw new Error(`No se pudo generar la portada desde la página ${pageNumber}.`);
  }
  return coverName;
}

export async function pickAndImportPdfs(): Promise<ImportedPdfData[]> {
  const selected = await open({
    multiple: true,
    filters: [{ name: 'Novelas PDF', extensions: ['pdf'] }],
  });

  if (!selected) return [];
  const paths = Array.isArray(selected) ? selected : [selected];
  const results: ImportedPdfData[] = [];

  for (const filePath of paths) {
    const id = crypto.randomUUID();
    const rawName = filePath.split(/[/\\]/).pop() || 'Sin titulo.pdf';
    const cleanTitle = rawName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();

    const pdfBytes = await readFile(filePath);
    const fileName = `${id}.pdf`;

    // Guardar copia interna antes de pasar el buffer al worker de PDF.js
    await writeFile(`books/${fileName}`, pdfBytes, { baseDir: BaseDirectory.AppData });

    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
    let coverName: string | null = null;
    try {
      const pdfDoc = await loadingTask.promise;
      const totalPages = pdfDoc.numPages;
      const coverBytes = await generateCoverJpeg(pdfDoc, 1);

      if (coverBytes) {
        coverName = `${id}.jpg`;
        await writeFile(`covers/${coverName}`, coverBytes, { baseDir: BaseDirectory.AppData });
      }

      results.push({
        id,
        title: cleanTitle,
        fileName,
        coverName,
        totalPages,
      });
    } finally {
      await loadingTask.destroy();
    }
  }

  return results;
}
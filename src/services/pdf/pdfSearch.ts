import * as pdfjsLib from 'pdfjs-dist';

export interface PdfSearchMatch {
  pageNumber: number;
  snippet: string;
}

export async function searchInPdf(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  query: string,
  maxResults = 60
): Promise<PdfSearchMatch[]> {
  const cleanQuery = query.trim().toLowerCase();
  if (cleanQuery.length < 2) return [];

  const matches: PdfSearchMatch[] = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    if (matches.length >= maxResults) break;

    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    page.cleanup();

    const fullText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ');

    const lowerText = fullText.toLowerCase();
    const hitIndex = lowerText.indexOf(cleanQuery);

    if (hitIndex !== -1) {
      const start = Math.max(0, hitIndex - 45);
      const end = Math.min(fullText.length, hitIndex + cleanQuery.length + 65);
      const prefix = start > 0 ? '...' : '';
      const suffix = end < fullText.length ? '...' : '';

      matches.push({
        pageNumber: pageNum,
        snippet: `${prefix}${fullText.slice(start, end)}${suffix}`,
      });
    }
  }

  return matches;
}
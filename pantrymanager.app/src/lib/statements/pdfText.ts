// Extrae las líneas de texto de un PDF en el navegador, con pdf.js. El archivo no se sube a ningún lado.

export interface TextPiece {
  str: string;
  x: number;
  y: number;
}

// Junta trozos de texto en líneas: los que tienen casi la misma altura van en la misma línea, de izquierda a derecha.
// En un PDF el eje y crece hacia arriba, así que las líneas de arriba tienen y mayor.
export function piecesToLines(pieces: TextPiece[], tolerance = 3): string[] {
  const sorted = pieces.filter((p) => p.str.trim().length > 0).sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: { y: number; items: TextPiece[] }[] = [];
  for (const piece of sorted) {
    const row = rows.find((r) => Math.abs(r.y - piece.y) <= tolerance);
    if (row) row.items.push(piece);
    else rows.push({ y: piece.y, items: [piece] });
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) =>
      r.items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str.trim())
        .join(" ")
    );
}

interface PdfTextItem {
  str?: string;
  transform?: number[];
}

export async function extractPdfLines(file: File): Promise<string[]> {
  // pdf.js pesa bastante: se carga solo al importar un estado.
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;

  const lines: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const pieces: TextPiece[] = [];
    for (const item of content.items as PdfTextItem[]) {
      if (typeof item.str === "string" && item.transform) {
        pieces.push({ str: item.str, x: item.transform[4], y: item.transform[5] });
      }
    }
    lines.push(...piecesToLines(pieces));
  }

  await pdf.destroy();
  return lines;
}

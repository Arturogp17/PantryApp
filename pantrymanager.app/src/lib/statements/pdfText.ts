// Extrae las líneas de texto de un PDF en el navegador, con pdf.js. El archivo no se sube a ningún lado.

export interface TextPiece {
  str: string;
  x: number;
  y: number;
  // Ancho del trozo en el PDF, si pdf.js lo entrega.
  width?: number;
}

// Un trozo que empieza con puntuación o con un acento combinante va pegado al anterior.
const ATTACHES_LEFT = /^[\p{P}\p{M}]/u;

// Une los trozos de una línea ya ordenados por x. Si se conoce el ancho del anterior y el hueco entre ellos
// es casi cero, van pegados (pdf.js a veces parte una palabra en dos trozos). Si no, van con un espacio.
function joinRow(items: TextPiece[]): string {
  let text = "";
  items.forEach((item, i) => {
    if (i === 0) {
      text = item.str;
      return;
    }
    const prev = items[i - 1];
    const known = prev.width !== undefined;
    const gap = known ? item.x - (prev.x + (prev.width as number)) : Infinity;
    const glue = known && (gap < 1 || ATTACHES_LEFT.test(item.str));
    text += (glue ? "" : " ") + item.str;
  });
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
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
    .map((r) => joinRow(r.items.sort((a, b) => a.x - b.x)))
    .filter((line) => line.length > 0);
}

interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
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
        pieces.push({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width });
      }
    }
    lines.push(...piecesToLines(pieces));
  }

  await pdf.destroy();
  return lines;
}

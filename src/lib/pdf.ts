/**
 * Minimaler PDF-Schreiber fuer eine einzelne Seite. Nur die 14
 * Standardschriften, damit keine Schriftdatei ins Repository muss.
 * Kodierung ist WinAnsi, damit deutsche Umlaute ankommen.
 */

export const A4_PORTRAIT = { width: 595, height: 842 } as const

export type PdfFont = 'regular' | 'bold'

export interface PdfText {
  x: number
  y: number
  size: number
  font: PdfFont
  text: string
}

export interface PdfStroke {
  x1: number
  y1: number
  x2: number
  y2: number
}

const UNICODE_TO_WINANSI: ReadonlyMap<number, number> = new Map([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
  [0x2212, 0x2d], // MINUS → hyphen
])

function toWinAnsiByte(codePoint: number): number {
  if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) return 0x20
  if (codePoint >= 0x20 && codePoint <= 0x7e) return codePoint
  if (codePoint >= 0xa0 && codePoint <= 0xff) return codePoint
  return UNICODE_TO_WINANSI.get(codePoint) ?? 0x3f
}

/** Helvetica-Breiten in 1/1000 em, Adobe-AFM, ASCII 32–126. Rest: 556. */
const HELVETICA_ASCII: readonly number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 611, 556, 722, 722, 278, 500, 667, 556, 833, 722, 722,
  556, 722, 667, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]

function asciiWidth(charCode: number): number {
  if (charCode < 32 || charCode > 126) return 556
  return HELVETICA_ASCII[charCode - 32] ?? 556
}

export function helveticaWidth(text: string, size: number): number {
  let width = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 63
    width += asciiWidth(toWinAnsiByte(code))
  }
  return (width * size) / 1000
}

export function truncateToWidth(text: string, size: number, maxWidth: number): string {
  if (helveticaWidth(text, size) <= maxWidth) return text
  const ellipsis = '…'
  const ellipsisWidth = helveticaWidth(ellipsis, size)
  let kept = ''
  for (const char of text) {
    const next = kept + char
    if (helveticaWidth(next, size) + ellipsisWidth > maxWidth) break
    kept = next
  }
  return kept.length === 0 ? ellipsis : `${kept}${ellipsis}`
}

function pdfEscape(text: string): string {
  let out = ''
  for (const char of text) {
    const byte = toWinAnsiByte(char.codePointAt(0) ?? 63)
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
      out += `\\${String.fromCharCode(byte)}`
    } else if (byte < 32 || byte > 126) {
      out += `\\${byte.toString(8).padStart(3, '0')}`
    } else {
      out += String.fromCharCode(byte)
    }
  }
  return out
}

function contentStream(texts: readonly PdfText[], strokes: readonly PdfStroke[]): string {
  const chunks: string[] = []
  for (const stroke of strokes) {
    chunks.push('0.4 w')
    chunks.push(`${stroke.x1.toFixed(2)} ${stroke.y1.toFixed(2)} m`)
    chunks.push(`${stroke.x2.toFixed(2)} ${stroke.y2.toFixed(2)} l`)
    chunks.push('S')
  }
  for (const item of texts) {
    const font = item.font === 'bold' ? '/F2' : '/F1'
    chunks.push('BT')
    chunks.push(`${font} ${item.size.toFixed(2)} Tf`)
    chunks.push(`1 0 0 1 ${item.x.toFixed(2)} ${item.y.toFixed(2)} Tm`)
    chunks.push(`(${pdfEscape(item.text)}) Tj`)
    chunks.push('ET')
  }
  return chunks.join('\n')
}

function assemble(objects: readonly string[]): Uint8Array {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  let offset = 0
  const push = (chunk: string): void => {
    const bytes = encoder.encode(chunk)
    parts.push(bytes)
    offset += bytes.length
  }

  push('%PDF-1.4\n')
  const objectOffsets: number[] = []
  objects.forEach((body, index) => {
    objectOffsets.push(offset)
    push(`${index + 1} 0 obj\n${body}\nendobj\n`)
  })

  const xrefOffset = offset
  push(`xref\n0 ${objects.length + 1}\n`)
  push('0000000000 65535 f \n')
  for (const objectOffset of objectOffsets) {
    push(`${String(objectOffset).padStart(10, '0')} 00000 n \n`)
  }
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)

  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let cursor = 0
  for (const part of parts) {
    out.set(part, cursor)
    cursor += part.length
  }
  return out
}

export function renderSinglePagePdf(options: {
  width: number
  height: number
  texts: readonly PdfText[]
  strokes?: readonly PdfStroke[]
}): Uint8Array {
  const stream = contentStream(options.texts, options.strokes ?? [])
  return assemble([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${options.width} ${options.height}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ])
}

export function pdfAsString(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1')
}

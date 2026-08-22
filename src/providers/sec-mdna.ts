/**
 * Woertlicher Auszug aus dem Lagebericht (MD&A) eines 10-K oder 10-Q.
 *
 * Grundsatz: Wir fassen nicht zusammen und erfinden keine Prosa — wir
 * zitieren die ersten Absaetze des Abschnitts "Management's Discussion
 * and Analysis" woertlich und verlinken das Original. Ein heuristisch
 * gekuerztes Zitat kann schief abschneiden, aber nie etwas behaupten,
 * was nicht im Bericht steht.
 */

export interface FilingDokument {
  name: string
  url: string
}

interface IndexItem {
  name?: unknown
  size?: unknown
}

/**
 * Das Hauptdokument einer Einreichung aus dem index.json des
 * EDGAR-Ordners: die groesste .htm-Datei, die kein Index und kein
 * Anhang (ex-*) ist. 10-K/10-Q-Hauptdokumente sind praktisch immer
 * die groesste HTML-Datei im Ordner.
 */
export function findePrimaerdokument(indexJson: unknown, ordnerUrl: string): FilingDokument | null {
  if (typeof indexJson !== 'object' || indexJson === null) return null
  const directory = (indexJson as Record<string, unknown>)['directory']
  if (typeof directory !== 'object' || directory === null) return null
  const items = (directory as Record<string, unknown>)['item']
  if (!Array.isArray(items)) return null

  let bester: { name: string; size: number } | null = null
  for (const roh of items as IndexItem[]) {
    const name = typeof roh.name === 'string' ? roh.name : ''
    if (!/\.htm[l]?$/i.test(name)) continue
    const klein = name.toLowerCase()
    if (klein.includes('index') || klein.startsWith('ex-') || klein.startsWith('ex_')) continue
    if (/^r\d+\.htm/.test(klein)) continue // XBRL-Viewer-Seiten
    const size = typeof roh.size === 'number' ? roh.size : Number(roh.size ?? 0)
    if (!Number.isFinite(size)) continue
    if (bester === null || size > bester.size) bester = { name, size }
  }
  if (bester === null) return null
  return { name: bester.name, url: `${ordnerUrl}${bester.name}` }
}

/** HTML grob zu Lesetext: Skripte weg, Tags weg, Entitaeten aufgeloest. */
export function htmlZuText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6]|\/table)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#821[12];|&mdash;|&ndash;/g, '-')
    .replace(/&#\d+;|&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
}

const MDNA_START =
  /management['’]?s\s+discussion\s+and\s+analysis\s+of\s+financial\s+condition/i

const ABSCHNITT_ENDE =
  /item\s*(7a|3|4)\s*[.:—-]|quantitative\s+and\s+qualitative\s+disclosures/i

/**
 * Die ersten Absaetze des MD&A, woertlich. Die zweite Fundstelle wird
 * bevorzugt, weil die erste meist der Eintrag im Inhaltsverzeichnis
 * ist. Null, wenn der Abschnitt nicht auffindbar ist — das ist ein
 * Befund, kein Fehler (6-K und 20-F haben oft keinen solchen Titel).
 */
export function extrahiereMdna(text: string, maxZeichen = 1400): string | null {
  const treffer = [...text.matchAll(new RegExp(MDNA_START.source, 'gi'))]
  if (treffer.length === 0) return null
  // Letzte Fundstelle: nach Inhaltsverzeichnis und Kolumnentiteln.
  const start = treffer[treffer.length - 1]?.index
  if (start === undefined) return null

  let ausschnitt = text.slice(start, start + 60_000)
  const ende = ausschnitt.search(ABSCHNITT_ENDE)
  if (ende > 200) ausschnitt = ausschnitt.slice(0, ende)

  // Ueberschriftszeile und Standard-Vorspann abwerfen, Absaetze sammeln.
  const zeilen = ausschnitt
    .split('\n')
    .map((zeile) => zeile.trim())
    .filter((zeile) => zeile.length > 0)
    .slice(1)

  const absaetze: string[] = []
  let gesamt = 0
  for (const zeile of zeilen) {
    // Zwischentitel und Tabellenreste (kurz, ohne Satzzeichen) lohnen
    // im Zitat nicht.
    if (zeile.length < 60 && !/[.]$/.test(zeile)) continue
    absaetze.push(zeile)
    gesamt += zeile.length
    if (gesamt >= maxZeichen) break
  }
  if (absaetze.length === 0) return null

  let ergebnis = absaetze.join('\n\n')
  if (ergebnis.length > maxZeichen) {
    const gekappt = ergebnis.slice(0, maxZeichen)
    const letzterPunkt = gekappt.lastIndexOf('.')
    ergebnis = letzterPunkt > maxZeichen / 2 ? gekappt.slice(0, letzterPunkt + 1) : `${gekappt} …`
  }
  return ergebnis
}

/** Auszug einer Einreichung holen: index.json, Hauptdokument, MD&A. */
export async function holeMdnaAuszug(
  ordnerUrl: string,
  userAgent: string,
): Promise<{ auszug: string; dokumentUrl: string } | null> {
  const headers = { 'User-Agent': userAgent, Accept: 'application/json' }
  const indexAntwort = await fetch(`${ordnerUrl}index.json`, { headers })
  if (!indexAntwort.ok) throw new Error(`index.json: HTTP ${indexAntwort.status}`)
  const dokument = findePrimaerdokument(await indexAntwort.json(), ordnerUrl)
  if (dokument === null) return null

  const dokAntwort = await fetch(dokument.url, {
    headers: { 'User-Agent': userAgent, Accept: 'text/html' },
  })
  if (!dokAntwort.ok) throw new Error(`${dokument.name}: HTTP ${dokAntwort.status}`)
  const html = await dokAntwort.text()
  // 10-K-Dokumente koennen zweistellige Megabyte haben; fuer den
  // MD&A-Anfang reicht der vordere Teil sicher aus.
  const auszug = extrahiereMdna(htmlZuText(html.slice(0, 8_000_000)))
  if (auszug === null) return null
  return { auszug, dokumentUrl: dokument.url }
}

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
 * Juristischer Standard-Vorspann, der in jedem Bericht praktisch
 * gleich lautet und nichts ueber das Geschaeft sagt. Absaetze mit
 * diesen Markern fliegen aus dem Zitat.
 */
export const BOILERPLATE =
  /forward[- ]looking|safe harbor|undue reliance|risks?\s+and\s+uncertaint|zukunftsgerichtete?n?\s+aussagen|prognosen?\s+beruhen\s+auf\s+annahmen/i

function kappen(absaetze: readonly string[], maxZeichen: number): string {
  let ergebnis = absaetze.join('\n\n')
  if (ergebnis.length > maxZeichen) {
    const gekappt = ergebnis.slice(0, maxZeichen)
    const letzterPunkt = gekappt.lastIndexOf('.')
    ergebnis = letzterPunkt > maxZeichen / 2 ? gekappt.slice(0, letzterPunkt + 1) : `${gekappt} …`
  }
  return ergebnis
}

/**
 * Absaetze nach einer Ueberschrift einsammeln. Eine Fundstelle zaehlt
 * nur, wenn ihr ein substanzieller Absatz folgt — so fallen
 * Inhaltsverzeichnis-Eintraege und Kolumnentitel durch, und die Suche
 * geht zur naechsten Fundstelle weiter. Boilerplate-Absaetze werden
 * uebersprungen.
 */
export function extrahiereNachUeberschrift(
  text: string,
  ueberschrift: RegExp,
  optionen: { maxZeichen?: number; abschnittEnde?: RegExp } = {},
): string | null {
  const maxZeichen = optionen.maxZeichen ?? 1400
  const treffer = [...text.matchAll(new RegExp(ueberschrift.source, 'gi'))]
  for (const fund of treffer) {
    const start = fund.index
    if (start === undefined) continue
    let ausschnitt = text.slice(start, start + 60_000)
    if (optionen.abschnittEnde !== undefined) {
      const ende = ausschnitt.search(optionen.abschnittEnde)
      if (ende > 200) ausschnitt = ausschnitt.slice(0, ende)
    }

    const zeilen = ausschnitt
      .split('\n')
      .map((zeile) => zeile.trim())
      .filter((zeile) => zeile.length > 0)
      .slice(1)

    const absaetze: string[] = []
    let gesamt = 0
    for (const zeile of zeilen) {
      // Zwischentitel und Tabellenreste (kurz, ohne Satzzeichen)
      // lohnen im Zitat nicht.
      if (zeile.length < 60 && !/[.]$/.test(zeile)) {
        if (absaetze.length > 0) break
        continue
      }
      if (BOILERPLATE.test(zeile)) continue
      absaetze.push(zeile)
      gesamt += zeile.length
      if (gesamt >= maxZeichen) break
    }
    // Der erste Absatz muss Substanz haben, sonst war die Fundstelle
    // ein Verzeichniseintrag.
    if (absaetze.length === 0 || (absaetze[0]?.length ?? 0) < 120) continue
    return kappen(absaetze, maxZeichen)
  }
  return null
}

/**
 * Die ersten substanziellen Absaetze des MD&A, woertlich und ohne den
 * juristischen Standard-Vorspann. Null, wenn der Abschnitt nicht
 * auffindbar ist — das ist ein Befund, kein Fehler (6-K und 20-F
 * haben oft keinen solchen Titel).
 */
export function extrahiereMdna(text: string, maxZeichen = 1400): string | null {
  return extrahiereNachUeberschrift(text, MDNA_START, {
    maxZeichen,
    abschnittEnde: ABSCHNITT_ENDE,
  })
}

const GUIDANCE_START =
  /(?:business\s+|financial\s+|full[- ]year\s+|fiscal\s+(?:year\s+)?\d{4}\s+)?(?:outlook|guidance)\b/i

/**
 * Die Prognose des Managements (Outlook/Guidance), woertlich. Die
 * Ueberschrift muss eine eigene kurze Zeile sein, sonst faengt man
 * jeden Satz, der das Wort "outlook" enthaelt.
 */
export function extrahiereGuidance(text: string, maxZeichen = 900): string | null {
  const zeilen = text.split('\n')
  for (let index = 0; index < zeilen.length; index += 1) {
    const zeile = zeilen[index]?.trim() ?? ''
    if (zeile.length === 0 || zeile.length > 80) continue
    if (!GUIDANCE_START.test(zeile)) continue

    const absaetze: string[] = []
    let gesamt = 0
    for (let weiter = index + 1; weiter < zeilen.length; weiter += 1) {
      const kandidat = zeilen[weiter]?.trim() ?? ''
      if (kandidat.length === 0) continue
      if (kandidat.length < 60 && !/[.]$/.test(kandidat)) {
        if (absaetze.length > 0) break
        continue
      }
      if (BOILERPLATE.test(kandidat)) continue
      absaetze.push(kandidat)
      gesamt += kandidat.length
      if (gesamt >= maxZeichen) break
    }
    if (absaetze.length === 0 || (absaetze[0]?.length ?? 0) < 120) continue
    return kappen(absaetze, maxZeichen)
  }
  return null
}

/** Auszug einer Einreichung: index.json, Hauptdokument, MD&A samt
 * Guidance aus demselben Text. */
export async function holeMdnaAuszug(
  ordnerUrl: string,
  userAgent: string,
): Promise<{ auszug: string; guidance: string | null; dokumentUrl: string } | null> {
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
  const text = htmlZuText(html.slice(0, 8_000_000))
  const auszug = extrahiereMdna(text)
  if (auszug === null) return null
  return { auszug, guidance: extrahiereGuidance(text), dokumentUrl: dokument.url }
}

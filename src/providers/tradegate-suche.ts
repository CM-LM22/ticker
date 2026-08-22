/**
 * Titelsuche ueber die Tradegate-Kurssuche: frei, ohne Schluessel,
 * ohne Abruflimit — und sie liefert die ISIN, den Schluessel zu allem
 * Weiteren (Live-Kurse und Tagesschluss ueber Tradegate selbst,
 * Jahresbericht ueber GLEIF und ESEF).
 *
 * Die Seite ist undokumentiertes HTML, wie schon die Kursabfrage
 * (E25). Deshalb: tolerant parsen — gesucht werden schlicht alle
 * Verweise mit einer ISIN und der Text derselben Tabellenzeile —,
 * eine Messzeile ins Protokoll und eine Diagnose-Probe daneben.
 */

import { IsinSchema } from '../domain/instrument'

export function tradegateSucheUrl(query: string): string {
  return `https://www.tradegate.de/kurssuche.php?suche=${encodeURIComponent(query)}`
}

export interface TradegateSucheTreffer {
  isin: string
  /** WKN, wenn in der Zeile erkennbar; dient als kurzes Kuerzel. */
  wkn: string | null
  name: string
}

function textAus(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Zeilenweise nach ISIN-Verweisen suchen. Der Name ist der laengste
 * Textbrocken der Zeile, die WKN ein sechsstelliger Block ohne die
 * Verwechslungszeichen I und O.
 */
export function parseTradegateSuche(html: string, limit = 8): TradegateSucheTreffer[] {
  const treffer = new Map<string, TradegateSucheTreffer>()
  const zeilen = html.split(/<tr[\s>]/i)
  for (const zeile of zeilen) {
    const isinTreffer = /isin=([A-Z]{2}[A-Z0-9]{9}\d)/.exec(zeile)
    if (isinTreffer === null) continue
    const isin = isinTreffer[1]
    if (isin === undefined || treffer.has(isin)) continue
    if (!IsinSchema.safeParse(isin).success) continue

    const zellen = [...zeile.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((zelle) => textAus(zelle[1] ?? ''))
      .filter((text) => text.length > 0)
    const name =
      zellen
        .filter((text) => text !== isin && !/^[A-Z0-9]{6}$/.test(text))
        .sort((a, b) => b.length - a.length)[0] ?? ''
    if (name.length < 2) continue
    const wkn = zellen.find((text) => /^[A-HJ-NP-Z0-9]{6}$/.test(text) && text !== isin) ?? null

    treffer.set(isin, { isin, wkn, name: name.slice(0, 80) })
    if (treffer.size >= limit) break
  }
  return [...treffer.values()]
}

const cache = new Map<string, { treffer: TradegateSucheTreffer[]; geladen: number }>()
const CACHE_TTL_MS = 6 * 3_600_000

export async function holeTradegateTreffer(query: string): Promise<TradegateSucheTreffer[]> {
  const schluessel = query.trim().toUpperCase()
  const getroffen = cache.get(schluessel)
  if (getroffen !== undefined && Date.now() - getroffen.geladen < CACHE_TTL_MS) {
    return getroffen.treffer
  }

  const antwort = await fetch(tradegateSucheUrl(query), {
    headers: { Accept: 'text/html' },
  })
  if (!antwort.ok) throw new Error(`Tradegate-Suche: HTTP ${antwort.status}`)
  const treffer = parseTradegateSuche(await antwort.text())
  console.info(
    `suche tradegate "${schluessel}": ${treffer.length} Treffer` +
      (treffer.length > 0 ? ` | ${treffer.map((eintrag) => eintrag.isin).slice(0, 5).join(', ')}` : ''),
  )
  cache.set(schluessel, { treffer, geladen: Date.now() })
  return treffer
}

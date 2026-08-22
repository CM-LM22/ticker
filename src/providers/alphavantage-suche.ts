import { parseSymbolSearch, symbolSearchUrl } from './alphavantage'
import type { XetraTreffer } from './alphavantage'

/**
 * Die Alpha-Vantage-Symbolsuche mit Query-Cache. Jede neue Anfrage
 * kostet einen der 25 Tagesabrufe; dieselbe Anfrage am selben Tag —
 * etwa die Bestaetigung direkt nach der Suche — kostet nichts mehr.
 */
const cache = new Map<string, { treffer: XetraTreffer[]; geladen: number }>()
const CACHE_TTL_MS = 24 * 3_600_000

export async function holeXetraTreffer(query: string, apiKey: string): Promise<XetraTreffer[]> {
  const schluessel = query.trim().toUpperCase()
  const getroffen = cache.get(schluessel)
  if (getroffen !== undefined && Date.now() - getroffen.geladen < CACHE_TTL_MS) {
    return getroffen.treffer
  }

  const antwort = await fetch(symbolSearchUrl(query, apiKey), {
    headers: { Accept: 'application/json' },
  })
  if (!antwort.ok) throw new Error(`Alpha Vantage: HTTP ${antwort.status}`)
  const treffer = parseSymbolSearch(await antwort.json())
  cache.set(schluessel, { treffer, geladen: Date.now() })
  return treffer
}

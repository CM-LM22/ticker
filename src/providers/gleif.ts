/**
 * ISIN-zu-LEI-Aufloesung ueber das amtliche GLEIF-Register (Global
 * Legal Entity Identifier Foundation). Frei, ohne Schluessel. Die LEI
 * wird nirgends von Hand gepflegt (E9: keine erfundenen Kennnummern):
 * sie kommt zur Laufzeit aus der vetteten ISIN, und die Antwort nennt
 * den Firmennamen, der als Kontrolle mitgefuehrt wird.
 */

export function gleifUrl(isin: string): string {
  return `https://api.gleif.org/api/v1/lei-records?filter%5Bisin%5D=${encodeURIComponent(isin)}`
}

export interface LeiRecord {
  lei: string
  name: string
}

export function parseLeiRecord(raw: unknown): LeiRecord | null {
  if (typeof raw !== 'object' || raw === null) return null
  const data = (raw as Record<string, unknown>)['data']
  if (!Array.isArray(data) || data.length === 0) return null
  const eintrag = data[0]
  if (typeof eintrag !== 'object' || eintrag === null) return null
  const attributes = (eintrag as Record<string, unknown>)['attributes']
  if (typeof attributes !== 'object' || attributes === null) return null
  const lei = (attributes as Record<string, unknown>)['lei']
  if (typeof lei !== 'string' || !/^[A-Z0-9]{20}$/.test(lei)) return null

  const entity = (attributes as Record<string, unknown>)['entity']
  const legalName =
    typeof entity === 'object' && entity !== null
      ? (entity as Record<string, unknown>)['legalName']
      : null
  const name =
    typeof legalName === 'object' && legalName !== null
      ? (legalName as Record<string, unknown>)['name']
      : null
  return { lei, name: typeof name === 'string' ? name : '' }
}

const cache = new Map<string, { record: LeiRecord | null; geladen: number }>()
const CACHE_TTL_MS = 24 * 3_600_000

/** LEI zu einer ISIN, einen Tag im Speicher gehalten. */
export async function holeLei(isin: string): Promise<LeiRecord | null> {
  const getroffen = cache.get(isin)
  if (getroffen !== undefined && Date.now() - getroffen.geladen < CACHE_TTL_MS) {
    return getroffen.record
  }
  const antwort = await fetch(gleifUrl(isin), { headers: { Accept: 'application/vnd.api+json' } })
  if (!antwort.ok) throw new Error(`GLEIF: HTTP ${antwort.status}`)
  const record = parseLeiRecord(await antwort.json())
  cache.set(isin, { record, geladen: Date.now() })
  return record
}

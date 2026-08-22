import { neon } from '@neondatabase/serverless'

/**
 * Neon ueber HTTP statt ueber eine dauerhafte Verbindung.
 *
 * Serverlose Funktionen leben nur fuer die Dauer einer Anfrage; ein
 * Verbindungspool waere dort sinnlos und wuerde die Verbindungsgrenze
 * der Datenbank sprengen. Der HTTP-Treiber macht aus jeder Abfrage
 * einen einzelnen Aufruf und passt damit genau zu diesem Modell.
 */
export type Sql = ReturnType<typeof neon>

/**
 * Die Verbindungszeichenfolge heisst nicht ueberall gleich.
 *
 * Vercels Neon-Integration legt sie je nach Weg als DATABASE_URL,
 * POSTGRES_URL oder DATABASE_URL_UNPOOLED ab. Statt einen Namen zu
 * verlangen und den Rest als "nicht eingerichtet" zu melden, sucht die
 * Anwendung der Reihe nach und sagt auf der Diagnoseseite, welchen
 * Namen sie gefunden hat.
 *
 * Die Reihenfolge ist Absicht: der gepoolte Zugang zuerst, weil
 * serverlose Funktionen viele kurze Verbindungen oeffnen.
 */
export const DATABASE_URL_CANDIDATES = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'NEON_DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
] as const

export class MissingDatabaseUrl extends Error {
  constructor() {
    super(
      `Keine Verbindungszeichenfolge gefunden. Gesucht wurde nach: ${DATABASE_URL_CANDIDATES.join(', ')}. ` +
        'In Vercel unter Settings, Environment Variables eintragen und neu deployen.',
    )
    this.name = 'MissingDatabaseUrl'
  }
}

export interface DatabaseUrlFund {
  name: string
  url: string
}

/** Null, wenn keiner der bekannten Namen gesetzt ist. */
export function resolveDatabaseUrl(): DatabaseUrlFund | null {
  for (const name of DATABASE_URL_CANDIDATES) {
    const url = process.env[name]?.trim()
    if (url !== undefined && url.length > 0) return { name, url }
  }
  return null
}

let cached: Sql | null = null
let cachedFor: string | null = null

export function getSql(): Sql {
  const fund = resolveDatabaseUrl()
  if (fund === null) throw new MissingDatabaseUrl()
  // Wechselt der Name oder der Wert, wird neu verbunden statt still
  // die alte Verbindung weiterzubenutzen.
  if (cached === null || cachedFor !== fund.url) {
    cached = neon(fund.url)
    cachedFor = fund.url
  }
  return cached
}

export function hasDatabase(): boolean {
  return resolveDatabaseUrl() !== null
}

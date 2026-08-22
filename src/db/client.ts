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

export class MissingDatabaseUrl extends Error {
  constructor() {
    super('DATABASE_URL ist nicht gesetzt. In Vercel unter Settings, Environment Variables eintragen.')
    this.name = 'MissingDatabaseUrl'
  }
}

let cached: Sql | null = null

export function getSql(): Sql {
  const url = process.env['DATABASE_URL']?.trim()
  if (url === undefined || url.length === 0) throw new MissingDatabaseUrl()
  cached ??= neon(url)
  return cached
}

export function hasDatabase(): boolean {
  const url = process.env['DATABASE_URL']?.trim()
  return url !== undefined && url.length > 0
}

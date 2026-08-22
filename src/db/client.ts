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
  // NEON_URL steht vorn, weil die Vercel-Neon-Integration sie so
  // benennt. Liegen aus einer frueheren Verbindung noch andere
  // Variablen herum, gewinnt trotzdem die aktuelle.
  'NEON_URL',
  'DATABASE_URL',
  'POSTGRES_URL',
  'NEON_DATABASE_URL',
  'NEON_POSTGRES_URL',
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

function wert(name: string): string | null {
  const roh = process.env[name]?.trim()
  return roh === undefined || roh.length === 0 ? null : roh
}

/**
 * Manche Integrationen setzen keine fertige Zeichenfolge, sondern nur
 * die Einzelteile (PGHOST, PGUSER, PGPASSWORD, PGDATABASE). Dann wird
 * sie hier zusammengesetzt, statt "nicht eingerichtet" zu melden,
 * obwohl alles da ist.
 */
function ausEinzelteilen(): DatabaseUrlFund | null {
  const host = wert('PGHOST') ?? wert('POSTGRES_HOST')
  const user = wert('PGUSER') ?? wert('POSTGRES_USER')
  const passwort = wert('PGPASSWORD') ?? wert('POSTGRES_PASSWORD')
  const datenbank = wert('PGDATABASE') ?? wert('POSTGRES_DATABASE')
  if (host === null || user === null || passwort === null || datenbank === null) return null
  return {
    name: 'PGHOST/PGUSER/PGPASSWORD/PGDATABASE',
    url: `postgres://${encodeURIComponent(user)}:${encodeURIComponent(passwort)}@${host}/${datenbank}?sslmode=require`,
  }
}

/** Null, wenn weder ein bekannter Name noch die Einzelteile gesetzt sind. */
export function resolveDatabaseUrl(): DatabaseUrlFund | null {
  for (const name of DATABASE_URL_CANDIDATES) {
    const url = wert(name)
    if (url !== null) return { name, url }
  }
  return ausEinzelteilen()
}

/**
 * Namen aller gesetzten Variablen, die nach Datenbank aussehen — nur
 * Namen, nie Werte. Beantwortet die Frage "wie hat die Integration das
 * Ding genannt", ohne etwas preiszugeben.
 */
export function datenbankVariablenNamen(): string[] {
  return Object.keys(process.env)
    .filter((name) => /^(PG|POSTGRES|DATABASE|NEON)/i.test(name))
    .filter((name) => (process.env[name] ?? '').trim().length > 0)
    .sort()
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

/**
 * Postgres meldet eine fehlende Tabelle mit 42P01. Solange noch kein
 * Abruf gelaufen ist, ist das der Normalzustand und kein Stoerfall.
 */
export function istTabelleFehlt(fehler: unknown): boolean {
  return (
    typeof fehler === 'object' &&
    fehler !== null &&
    'code' in fehler &&
    (fehler as { code?: unknown }).code === '42P01'
  )
}

import { createHash } from 'node:crypto'

/**
 * Doppelte Alerts sind der haeufigste Fehlerfall dieser Art von App.
 * Jedes Ereignis bekommt deshalb einen Schluessel, der sich allein aus
 * seinem Inhalt ergibt: gleiche Meldung, gleicher Schluessel, egal wie
 * oft und von welchem Lauf sie gepollt wurde.
 *
 * Der Schluessel ist die erste Verteidigungslinie. Die zweite ist der
 * Unique-Index auf event.id in der Datenbank, siehe src/db/schema.sql.
 */
export interface IdempotencyInput {
  source: string
  /** Fremd-ID beim Anbieter. Muss vom Adapter kanonisch geliefert werden. */
  sourceEventId: string
  ticker: string
  occurredAt: Date
}

export function normalizeTicker(raw: string): string {
  const normalized = raw.trim().toUpperCase()
  if (normalized.length === 0) throw new Error('Ticker ist leer')
  return normalized
}

/**
 * Auf Sekunden gekuerzter UTC-Zeitstempel. Ohne das Kuerzen erzeugen
 * Anbieter, die mal mit und mal ohne Millisekunden liefern, zwei
 * Schluessel fuer dieselbe Meldung.
 */
export function normalizeTimestamp(occurredAt: Date): string {
  const millis = occurredAt.getTime()
  if (Number.isNaN(millis)) throw new Error('Zeitstempel ist ungueltig')
  return new Date(Math.floor(millis / 1000) * 1000).toISOString()
}

function normalizeIdentifier(raw: string, label: string): string {
  const normalized = raw.trim().toUpperCase()
  if (normalized.length === 0) throw new Error(`${label} ist leer`)
  return normalized
}

/**
 * Kanonische Zeichenkette, aus der der Schluessel gebildet wird. Oeffentlich,
 * damit Tests und Fehlersuche sehen koennen, was gehasht wurde.
 */
export function canonicalEventString(input: IdempotencyInput): string {
  return [
    normalizeIdentifier(input.source, 'source'),
    normalizeIdentifier(input.sourceEventId, 'sourceEventId'),
    normalizeTicker(input.ticker),
    normalizeTimestamp(input.occurredAt),
  ].join('|')
}

/** 128 Bit aus SHA-256. Kollisionsrisiko bei dieser Menge vernachlaessigbar. */
export function eventId(input: IdempotencyInput): string {
  return createHash('sha256').update(canonicalEventString(input), 'utf8').digest('hex').slice(0, 32)
}

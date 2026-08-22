import type { Venue } from '../domain/instrument'
import { ProviderError } from './types'
import type { ProviderCapabilities } from './types'

/**
 * Tradegate Exchange, ohne Schluessel, adressiert per ISIN.
 *
 * Gemessen erreichbar von Vercel aus (siehe Diagnose): die einzige
 * gefundene Gratisquelle fuer aktuelle Kurse deutscher Titel. Die
 * Schnittstelle ist undokumentiert; deshalb wird defensiv geparst und
 * jede Zahl gegen den gespeicherten Schlusskurs plausibilisiert, bevor
 * sie jemand zu sehen bekommt.
 */
export const TRADEGATE_CAPABILITIES: ProviderCapabilities = {
  id: 'tradegate',
  kind: 'prices',
  coversUsListings: false,
  coversNonUsListings: true,
  requiresApiKey: false,
  rateLimit: null,
  monthlyQuota: null,
  costEurPerMonth: 0,
  evidence: 'measured',
  verifiedAt: '2026-08-22',
}

export function tradegateUrl(isin: string): string {
  return `https://www.tradegate.de/refresh.php?isin=${encodeURIComponent(isin)}`
}

/**
 * Tradegate liefert Zahlen im deutschen Format als Zeichenketten:
 * "1.234,56". Punkt ist Tausendertrenner, Komma das Dezimalzeichen.
 */
export function parseGermanNumber(roh: unknown): number | null {
  if (typeof roh === 'number') return Number.isFinite(roh) ? roh : null
  if (typeof roh !== 'string') return null
  const bereinigt = roh
    .replace(/\s|%| /g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  if (bereinigt.length === 0 || !/^[+-]?\d+(\.\d+)?$/.test(bereinigt)) return null
  const wert = Number(bereinigt)
  return Number.isFinite(wert) ? wert : null
}

export interface TradegateQuote {
  isin: string
  last: number
  /** Tagesveraenderung in Prozent, falls die Quelle sie mitliefert. */
  deltaPct: number | null
  bid: number | null
  ask: number | null
}

export function parseTradegateQuote(raw: unknown, isin: string): TradegateQuote {
  if (typeof raw !== 'object' || raw === null) {
    throw new ProviderError(TRADEGATE_CAPABILITIES.id, `${isin}: unerwartete Antwort`, false)
  }
  const daten = raw as Record<string, unknown>
  const last = parseGermanNumber(daten['last'])
  if (last === null || last <= 0) {
    throw new ProviderError(TRADEGATE_CAPABILITIES.id, `${isin}: kein Kursfeld`, false)
  }
  return {
    isin,
    last,
    deltaPct: parseGermanNumber(daten['delta']),
    bid: parseGermanNumber(daten['bid']),
    ask: parseGermanNumber(daten['ask']),
  }
}

/**
 * Der Wachhund gegen eine falsch zugeordnete ISIN: Ein Kurs wird nur
 * angenommen, wenn er in der Naehe des gespeicherten Schlusskurses
 * liegt. Zeigt die ISIN versehentlich auf ein anderes Unternehmen,
 * weicht der Preis fast sicher weit ab — dann lieber kein Kurs als ein
 * falscher. 15 Prozent lassen auch einem heftigen Handelstag Platz.
 */
export function quoteIstPlausibel(last: number, gespeicherterSchluss: number): boolean {
  if (gespeicherterSchluss <= 0) return false
  return Math.abs(last / gespeicherterSchluss - 1) <= 0.15
}

/** Nur XETRA-Titel mit hinterlegter ISIN laufen ueber Tradegate. */
export function tradegateEligible(entry: { venue: Venue; isin?: string | undefined }): string | null {
  if (entry.venue !== 'XETRA') return null
  return entry.isin ?? null
}

export async function fetchTradegateQuote(isin: string): Promise<TradegateQuote> {
  const antwort = await fetch(tradegateUrl(isin), {
    headers: { Accept: 'application/json, text/plain' },
  })
  if (!antwort.ok) {
    throw new ProviderError(
      TRADEGATE_CAPABILITIES.id,
      `HTTP ${antwort.status}`,
      antwort.status === 429 || antwort.status >= 500,
    )
  }
  return parseTradegateQuote(await antwort.json(), isin)
}

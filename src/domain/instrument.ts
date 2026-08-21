import { z } from 'zod'

/** Handelsplatz, an dem wir den Titel beobachten. */
export const VenueSchema = z.enum(['NASDAQ', 'NYSE', 'XETRA'])
export type Venue = z.infer<typeof VenueSchema>

/**
 * Eine CIK ist die Schluesselnummer der SEC. Wir halten sie durchgaengig
 * zehnstellig mit fuehrenden Nullen, weil die submissions-API genau so
 * adressiert wird. Quellen liefern sie mal als Zahl, mal gekuerzt.
 */
export const CikSchema = z.string().regex(/^\d{10}$/, 'CIK muss zehnstellig sein')

export function normalizeCik(raw: string | number): string {
  const digits = String(raw).trim().replace(/^CIK/i, '').replace(/\D/g, '')
  if (digits.length === 0 || digits.length > 10) {
    throw new Error(`Keine gueltige CIK: ${String(raw)}`)
  }
  return digits.padStart(10, '0')
}

export const IsinSchema = z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}\d$/, 'Keine gueltige ISIN')

export const InstrumentSchema = z.object({
  /** Lokales Kuerzel am angegebenen Handelsplatz, z. B. SAP an XETRA. */
  ticker: z.string().min(1).max(12),
  name: z.string().min(1),
  venue: VenueSchema,
  isin: IsinSchema.optional(),
  /** Erst bekannt, nachdem der Abdeckungstest sie aufgeloest hat. */
  cik: CikSchema.optional(),
})
export type Instrument = z.infer<typeof InstrumentSchema>

/**
 * Was wir vor dem ersten Abdeckungstest erwarten. Bewusst getrennt vom
 * Messergebnis: die Erwartung steht im Repository, das Ergebnis entsteht
 * in docs/coverage.md. Weichen beide voneinander ab, gewinnt die Messung.
 */
export const CoverageExpectationSchema = z.enum([
  /** US-Inlandsemittent: 8-K Item 2.02, 10-Q, 10-K. */
  'sec_domestic',
  /** Foreign Private Issuer: 6-K und 20-F, kein 10-Q. */
  'sec_foreign',
  /** Keine SEC-Registrierung erwartet. Kostenlos nicht abzudecken. */
  'none',
])
export type CoverageExpectation = z.infer<typeof CoverageExpectationSchema>

export const WatchlistEntrySchema = InstrumentSchema.extend({
  expectedCoverage: CoverageExpectationSchema,
  /**
   * Kuerzel der US-Notierung, falls es vom lokalen abweicht (DBK -> DB).
   * Hilft dem Abdeckungstest, die CIK ohne Namenssuche zu finden.
   */
  secTickerHint: z.string().min(1).max(12).optional(),
})
export type WatchlistEntry = z.infer<typeof WatchlistEntrySchema>

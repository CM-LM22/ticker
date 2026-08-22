import { z } from 'zod'

/** Woher ein Ereignis stammt. Teil des Idempotency-Keys. */
export const EventSourceSchema = z.enum([
  'sec-edgar',
  'alpha-vantage',
  'finnhub',
  'fmp',
  'yahoo',
  'manual',
])
export type EventSource = z.infer<typeof EventSourceSchema>

export const FilingFormSchema = z.enum([
  '8-K',
  '8-K/A',
  '6-K',
  '6-K/A',
  '10-Q',
  '10-Q/A',
  '10-K',
  '10-K/A',
  '20-F',
  '20-F/A',
])
export type FilingForm = z.infer<typeof FilingFormSchema>

/** Item 2.02 ist "Results of Operations and Financial Condition". */
export const EARNINGS_ITEM = '2.02'

/**
 * Formulare, die Quartals- oder Jahreszahlen tragen koennen. Ein 6-K ist
 * dabei der unsicherste Fall: es transportiert alles Moegliche, von
 * Zahlen bis zur Hauptversammlungseinladung. Die Unterscheidung faellt
 * erst im Adapter (Slice 1), nicht hier.
 */
export const EARNINGS_BEARING_FORMS: readonly FilingForm[] = [
  '8-K',
  '6-K',
  '10-Q',
  '10-K',
  '20-F',
]

const httpUrl = z.string().refine((value) => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}, 'Keine gueltige URL')

export const FilingPayloadSchema = z.object({
  kind: z.literal('filing'),
  form: FilingFormSchema,
  /** 8-K-Item-Codes wie "2.02". Bei 6-K/20-F immer leer. */
  items: z.array(z.string()).default([]),
  accessionNumber: z.string().min(1),
  primaryDocumentUrl: httpUrl,
  /** Stichtag der Periode, nicht der Einreichungszeitpunkt. */
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  /**
   * Einschaetzung des Adapters, ob die Einreichung Zahlen traegt.
   * Bei 8-K aus dem Item-Code ableitbar, bei 6-K nur heuristisch.
   */
  isEarningsRelease: z.boolean(),
})
export type FilingPayload = z.infer<typeof FilingPayloadSchema>

export const EarningsSchedulePayloadSchema = z.object({
  kind: z.literal('earnings_schedule'),
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  session: z.enum(['before_open', 'after_close', 'unknown']),
  /** Freitext des Anbieters, z. B. "Q1 2026". Nicht normalisiert. */
  fiscalPeriod: z.string().nullable(),
  /** Bestaetigt vom Unternehmen oder nur geschaetzt. */
  confirmed: z.boolean(),
  /** Gesetzt, wenn ein bereits bekannter Termin verschoben wurde. */
  previousScheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
})
export type EarningsSchedulePayload = z.infer<typeof EarningsSchedulePayloadSchema>

/**
 * Ratings kommen als Snapshot, nicht als Strom. Diese Aktionen entstehen
 * erst aus dem Vergleich zweier Snapshots, siehe ratings-diff.ts.
 */
export const RatingActionSchema = z.enum([
  /** Haus taucht erstmals auf. */
  'initiate',
  /** Einstufung verbessert. */
  'upgrade',
  /** Einstufung verschlechtert. */
  'downgrade',
  /** Einstufung geaendert, Richtung nicht bestimmbar. */
  'change',
  /** Nur das Kursziel bewegt sich. */
  'price_target',
  /** Haus fehlt im neuen Snapshot. Unsicher, siehe ratings-diff.ts. */
  'drop',
])
export type RatingAction = z.infer<typeof RatingActionSchema>

export const RatingChangePayloadSchema = z.object({
  kind: z.literal('rating_change'),
  firm: z.string().min(1),
  action: RatingActionSchema,
  gradeFrom: z.string().nullable(),
  gradeTo: z.string().nullable(),
  priceTargetFrom: z.number().nullable(),
  priceTargetTo: z.number().nullable(),
  currency: z.string().length(3).nullable(),
})
export type RatingChangePayload = z.infer<typeof RatingChangePayloadSchema>

export const EventPayloadSchema = z.discriminatedUnion('kind', [
  FilingPayloadSchema,
  EarningsSchedulePayloadSchema,
  RatingChangePayloadSchema,
])
export type EventPayload = z.infer<typeof EventPayloadSchema>
export type EventKind = EventPayload['kind']

export const MarketEventSchema = z.object({
  /** Idempotency-Key, siehe idempotency.ts. Primaerschluessel der Tabelle. */
  id: z.string().length(32),
  source: EventSourceSchema,
  /** Fremd-ID beim Anbieter, z. B. die Accession-Number. */
  sourceEventId: z.string().min(1),
  /** Kuerzel, unter dem die Quelle den Titel fuehrt. */
  ticker: z.string().min(1),
  /** CIK, falls die Quelle sie mitliefert. Bester Matching-Schluessel. */
  cik: z.string().regex(/^\d{10}$/).nullable(),
  /** Zeitpunkt des Ereignisses laut Quelle. */
  occurredAt: z.date(),
  /** Zeitpunkt, zu dem wir es gesehen haben. */
  ingestedAt: z.date(),
  payload: EventPayloadSchema,
})
export type MarketEvent = z.infer<typeof MarketEventSchema>

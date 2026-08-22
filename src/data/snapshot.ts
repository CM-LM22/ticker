import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

/**
 * Echte Daten, eingefroren in einer Datei im Repository.
 *
 * Warum eine Datei und keine Datenbank: Der Abruf laeuft in GitHub
 * Actions, wo Netzzugang besteht, und committet das Ergebnis. Die
 * Oberflaeche liest es beim Bauen. Damit gibt es echte Daten, bevor
 * Neon angebunden ist, und der Stand ist versioniert nachvollziehbar.
 * Mit Slice 6 zieht das nach Postgres um; die Domaenenschicht merkt
 * davon nichts, weil sie ohnehin nur fertige Reihen sieht.
 */

/** Kompakt als Tupel, sonst waeren 40 Titel mal 260 Tage unnoetig gross. */
const BarTupleSchema = z.tuple([z.string(), z.number(), z.number(), z.number(), z.number()])

const ReportedPeriodSchema = z.object({
  label: z.string(),
  periodEnd: z.string(),
  periodStart: z.string().nullable(),
  frame: z.enum(['quarter', 'year']),
  form: z.string(),
  revenue: z.number().nullable(),
  netIncome: z.number().nullable(),
  epsDiluted: z.number().nullable(),
  currency: z.string(),
  filedAt: z.string(),
  accessionNumber: z.string().nullable(),
  sourceUrl: z.string().nullable(),
})

const SnapshotTitleSchema = z.object({
  ticker: z.string(),
  venue: z.enum(['NASDAQ', 'NYSE', 'XETRA']),
  currency: z.string(),
  cik: z.string().nullable(),
  bars: z.array(BarTupleSchema),
  periods: z.array(ReportedPeriodSchema),
  priceError: z.string().nullable(),
  fundamentalsError: z.string().nullable(),
})

export const SnapshotSchema = z.object({
  fetchedAt: z.string(),
  priceSource: z.string(),
  fundamentalsSource: z.string(),
  titles: z.array(SnapshotTitleSchema),
})

export type Snapshot = z.infer<typeof SnapshotSchema>
export type SnapshotTitle = z.infer<typeof SnapshotTitleSchema>

const SNAPSHOT_PATH = join(process.cwd(), 'data', 'snapshot.json')

/**
 * Null, wenn noch kein Abruf gelaufen ist. Die Oberflaeche faellt dann
 * auf Demodaten zurueck und sagt das an. Ein kaputter oder unerwarteter
 * Snapshot wird ebenfalls zu null, statt den Bau scheitern zu lassen.
 */
export function loadSnapshot(): Snapshot | null {
  let raw: string
  try {
    raw = readFileSync(SNAPSHOT_PATH, 'utf8')
  } catch {
    return null
  }
  const parsed = SnapshotSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    console.warn('data/snapshot.json ist unbrauchbar, verwende Demodaten:', parsed.error.message)
    return null
  }
  return parsed.data.titles.length === 0 ? null : parsed.data
}

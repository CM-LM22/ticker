import type { ReportedPeriod } from '../domain/fundamentals'
import type { PriceBar, PriceSeries } from '../domain/price-series'
import { getSql } from './client'

/**
 * Zugriff auf die gespeicherten Kurse und Berichtszahlen.
 *
 * Alle Zahlenspalten werden beim Lesen ausdruecklich nach float8
 * gecastet. Der Postgres-Typ numeric kommt sonst als Zeichenkette
 * zurueck, und eine Zeichenkette, die aussieht wie eine Zahl, ist genau
 * die Sorte Fehler, die erst in der Auswertung auffaellt.
 */

export interface StoredTitle {
  ticker: string
  currency: string
  bars: PriceBar[]
  periods: ReportedPeriod[]
}

export async function saveBars(ticker: string, series: PriceSeries): Promise<number> {
  if (series.bars.length === 0) return 0
  const sql = getSql()
  const days = series.bars.map((bar) => bar.date)
  const open = series.bars.map((bar) => bar.open)
  const high = series.bars.map((bar) => bar.high)
  const low = series.bars.map((bar) => bar.low)
  const close = series.bars.map((bar) => bar.close)

  await sql`
    INSERT INTO price_bar (ticker, day, open, high, low, close, currency, source)
    SELECT ${ticker}, d, o, h, l, c, ${series.currency}, ${series.source}
    FROM unnest(
      ${days}::date[], ${open}::numeric[], ${high}::numeric[],
      ${low}::numeric[], ${close}::numeric[]
    ) AS t(d, o, h, l, c)
    ON CONFLICT (ticker, day) DO UPDATE SET
      open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
      close = EXCLUDED.close, currency = EXCLUDED.currency, source = EXCLUDED.source
  `
  return series.bars.length
}

export async function savePeriods(
  ticker: string,
  periods: readonly ReportedPeriod[],
): Promise<number> {
  if (periods.length === 0) return 0
  const sql = getSql()
  for (const period of periods) {
    await sql`
      INSERT INTO reported_period (
        ticker, period_end, frame, label, period_start, form,
        revenue, net_income, eps_diluted, currency, filed_at,
        accession_number, source_url
      ) VALUES (
        ${ticker}, ${period.periodEnd}, ${period.frame}, ${period.label},
        ${period.periodStart}, ${period.form}, ${period.revenue}, ${period.netIncome},
        ${period.epsDiluted}, ${period.currency}, ${period.filedAt},
        ${period.accessionNumber}, ${period.sourceUrl}
      )
      ON CONFLICT (ticker, period_end, frame) DO UPDATE SET
        label = EXCLUDED.label, period_start = EXCLUDED.period_start,
        form = EXCLUDED.form, revenue = EXCLUDED.revenue,
        net_income = EXCLUDED.net_income, eps_diluted = EXCLUDED.eps_diluted,
        currency = EXCLUDED.currency, filed_at = EXCLUDED.filed_at,
        accession_number = EXCLUDED.accession_number, source_url = EXCLUDED.source_url
    `
  }
  return periods.length
}

export async function recordRun(
  ticker: string,
  ok: boolean,
  bars: number,
  periods: number,
  note: string | null,
): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO refresh_run (ticker, ok, bars, periods, note)
    VALUES (${ticker}, ${ok}, ${bars}, ${periods}, ${note})
  `
}

function day(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Alles, was die Oberflaeche braucht, in zwei Abfragen. */
export async function loadStoredTitles(sinceDay: string): Promise<Map<string, StoredTitle>> {
  const sql = getSql()

  const barRows = (await sql`
    SELECT ticker, day, currency,
           open::float8 AS open, high::float8 AS high,
           low::float8 AS low, close::float8 AS close
    FROM price_bar
    WHERE day >= ${sinceDay}
    ORDER BY ticker, day
  `) as Record<string, unknown>[]

  const periodRows = (await sql`
    SELECT ticker, period_end, frame, label, period_start, form,
           revenue::float8 AS revenue, net_income::float8 AS net_income,
           eps_diluted::float8 AS eps_diluted, currency, filed_at,
           accession_number, source_url
    FROM reported_period
    ORDER BY ticker, period_end DESC
  `) as Record<string, unknown>[]

  const titles = new Map<string, StoredTitle>()

  const ensure = (ticker: string, currency: string): StoredTitle => {
    const found = titles.get(ticker)
    if (found !== undefined) return found
    const fresh: StoredTitle = { ticker, currency, bars: [], periods: [] }
    titles.set(ticker, fresh)
    return fresh
  }

  for (const row of barRows) {
    const title = ensure(String(row['ticker']), String(row['currency']))
    title.bars.push({
      date: day(row['day']),
      open: num(row['open']) ?? 0,
      high: num(row['high']) ?? 0,
      low: num(row['low']) ?? 0,
      close: num(row['close']) ?? 0,
      volume: null,
    })
  }

  for (const row of periodRows) {
    const title = ensure(String(row['ticker']), String(row['currency']))
    title.periods.push({
      label: String(row['label']),
      periodEnd: day(row['period_end']),
      periodStart: row['period_start'] === null ? null : day(row['period_start']),
      frame: row['frame'] === 'year' ? 'year' : 'quarter',
      form: String(row['form']),
      revenue: num(row['revenue']),
      netIncome: num(row['net_income']),
      epsDiluted: num(row['eps_diluted']),
      currency: String(row['currency']),
      filedAt: day(row['filed_at']),
      accessionNumber: row['accession_number'] === null ? null : String(row['accession_number']),
      sourceUrl: row['source_url'] === null ? null : String(row['source_url']),
    })
  }

  return titles
}

export async function lastRefreshAt(): Promise<Date | null> {
  const sql = getSql()
  const rows = (await sql`
    SELECT max(finished_at) AS letzte FROM refresh_run WHERE ok
  `) as Record<string, unknown>[]
  const value = rows[0]?.['letzte']
  if (value === null || value === undefined) return null
  return value instanceof Date ? value : new Date(String(value))
}

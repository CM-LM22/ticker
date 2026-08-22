import type { ReportedPeriod } from '../domain/fundamentals'
import { WatchlistEntrySchema } from '../domain/instrument'
import type { WatchlistEntry } from '../domain/instrument'
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

/* --- Analystenhandlungen ------------------------------------------- */

import { selectNewAnalystActions } from '../domain/analyst-actions'
import type { AnalystAction } from '../domain/analyst-actions'
import type { RatingAction } from '../domain/event'

export const RATINGS_POLL_KEY = 'analyst-actions'

export interface PollState {
  initialized: boolean
  fetchedAt: Date | null
  note: string | null
}

export async function readPollState(key: string): Promise<PollState> {
  const sql = getSql()
  const rows = (await sql`
    SELECT initialized, fetched_at, note FROM poll_state WHERE key = ${key}
  `) as Record<string, unknown>[]
  const row = rows[0]
  if (row === undefined) return { initialized: false, fetchedAt: null, note: null }
  return {
    initialized: row['initialized'] === true,
    fetchedAt: row['fetched_at'] === null ? null : new Date(String(row['fetched_at'])),
    note: row['note'] === null ? null : String(row['note']),
  }
}

export async function writePollState(
  key: string,
  initialized: boolean,
  note: string | null,
): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO poll_state (key, initialized, fetched_at, note)
    VALUES (${key}, ${initialized}, now(), ${note})
    ON CONFLICT (key) DO UPDATE SET
      initialized = EXCLUDED.initialized,
      fetched_at = EXCLUDED.fetched_at,
      note = EXCLUDED.note
  `
}

/**
 * Speichert die abgerufenen Handlungen und gibt zurueck, welche davon
 * neu sind.
 *
 * Gefragt wird nur nach den Fremd-IDs des aktuellen Abrufs, nicht nach
 * der gesamten Historie: das bleibt auch nach Jahren eine kleine
 * Abfrage. Die Entscheidung selbst faellt in der reinen Funktion
 * `selectNewAnalystActions`, damit die Erstlauf-Regel getestet bleibt
 * und nicht in SQL verschwindet.
 */
export async function storeAnalystActions(
  incoming: readonly AnalystAction[],
  note: string | null,
  /**
   * Nur der letzte Stapel eines Laufs setzt die Marke. Wuerde schon der
   * erste sie setzen, gaelten die Titel der folgenden Stapel als
   * "seit dem letzten Mal neu" und der Erstlauf wuerde doch alarmieren.
   */
  finalize: boolean,
): Promise<readonly AnalystAction[]> {
  const sql = getSql()
  const state = await readPollState(RATINGS_POLL_KEY)

  let bekannt: ReadonlySet<string> | null = null
  if (state.initialized) {
    const ids = incoming.map((action) => action.sourceEventId)
    const rows =
      ids.length === 0
        ? []
        : ((await sql`
            SELECT source_event_id FROM analyst_action
            WHERE source_event_id = ANY(${ids}::text[])
          `) as Record<string, unknown>[])
    bekannt = new Set(rows.map((row) => String(row['source_event_id'])))
  }

  const { newActions } = selectNewAnalystActions(bekannt, incoming)

  for (const action of incoming) {
    await sql`
      INSERT INTO analyst_action (
        source_event_id, ticker, firm, action, grade_from, grade_to, occurred_at, notified
      ) VALUES (
        ${action.sourceEventId}, ${action.ticker}, ${action.firm}, ${action.action},
        ${action.gradeFrom}, ${action.gradeTo}, ${action.occurredAt.toISOString()},
        ${!state.initialized}
      )
      ON CONFLICT (source_event_id) DO NOTHING
    `
  }

  if (finalize) await writePollState(RATINGS_POLL_KEY, true, note)
  return newActions
}

/**
 * Die Ausgangspost: gespeicherte Handlungen, die noch nicht zugestellt
 * wurden. Die Datenbank ist damit das Zustell-Log, und ein
 * abgebrochener Lauf verliert keine Meldung.
 */
export async function loadUnnotifiedActions(limit = 50): Promise<StoredAnalystAction[]> {
  const sql = getSql()
  const rows = (await sql`
    SELECT source_event_id, ticker, firm, action, grade_from, grade_to,
           occurred_at, ingested_at
    FROM analyst_action
    WHERE NOT notified
    ORDER BY occurred_at DESC
    LIMIT ${limit}
  `) as Record<string, unknown>[]
  return rows.map(toStoredAction)
}

export interface StoredAnalystAction extends AnalystAction {
  ingestedAt: Date
}

export async function loadRecentAnalystActions(limit = 80): Promise<StoredAnalystAction[]> {
  const sql = getSql()
  const rows = (await sql`
    SELECT source_event_id, ticker, firm, action, grade_from, grade_to,
           occurred_at, ingested_at
    FROM analyst_action
    ORDER BY occurred_at DESC, ingested_at DESC
    LIMIT ${limit}
  `) as Record<string, unknown>[]

  return rows.map(toStoredAction)
}

function toStoredAction(row: Record<string, unknown>): StoredAnalystAction {
  return {
    sourceEventId: String(row['source_event_id']),
    ticker: String(row['ticker']),
    firm: String(row['firm']),
    action: String(row['action']) as RatingAction,
    gradeFrom: row['grade_from'] === null ? null : String(row['grade_from']),
    gradeTo: row['grade_to'] === null ? null : String(row['grade_to']),
    occurredAt: new Date(String(row['occurred_at'])),
    ingestedAt: new Date(String(row['ingested_at'])),
  }
}

export async function markNotified(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  const sql = getSql()
  await sql`
    UPDATE analyst_action SET notified = true
    WHERE source_event_id = ANY(${[...ids]}::text[])
  `
}

/* --- Analystenkonsens (Monatsstaende) ------------------------------ */

import type { RecommendationTrend } from '../providers/finnhub'

/** Juengster gespeicherter Stand je Titel, null wenn keiner da ist. */
export async function readLatestTrend(ticker: string): Promise<RecommendationTrend | null> {
  const sql = getSql()
  const rows = (await sql`
    SELECT ticker, period, strong_buy, buy, hold, sell, strong_sell
    FROM analyst_trend WHERE ticker = ${ticker}
    ORDER BY period DESC LIMIT 1
  `) as Record<string, unknown>[]
  const row = rows[0]
  if (row === undefined) return null
  return {
    ticker: String(row['ticker']),
    period: String(row['period']),
    strongBuy: Number(row['strong_buy']),
    buy: Number(row['buy']),
    hold: Number(row['hold']),
    sell: Number(row['sell']),
    strongSell: Number(row['strong_sell']),
  }
}

export async function saveTrends(trends: readonly RecommendationTrend[]): Promise<void> {
  const sql = getSql()
  for (const trend of trends) {
    await sql`
      INSERT INTO analyst_trend (ticker, period, strong_buy, buy, hold, sell, strong_sell)
      VALUES (${trend.ticker}, ${trend.period}, ${trend.strongBuy}, ${trend.buy},
              ${trend.hold}, ${trend.sell}, ${trend.strongSell})
      ON CONFLICT (ticker, period) DO UPDATE SET
        strong_buy = EXCLUDED.strong_buy, buy = EXCLUDED.buy, hold = EXCLUDED.hold,
        sell = EXCLUDED.sell, strong_sell = EXCLUDED.strong_sell, fetched_at = now()
    `
  }
}

export async function trendFetchedAt(ticker: string): Promise<Date | null> {
  const sql = getSql()
  const rows = (await sql`
    SELECT max(fetched_at) AS letzte FROM analyst_trend WHERE ticker = ${ticker}
  `) as Record<string, unknown>[]
  const value = rows[0]?.['letzte']
  if (value === null || value === undefined) return null
  return value instanceof Date ? value : new Date(String(value))
}

export interface TrendPair {
  aktuell: RecommendationTrend
  vormonat: RecommendationTrend | null
}

/** Die zwei juengsten Monatsstaende je Titel, fuer die Anzeige. */
export async function loadTrendOverview(): Promise<Map<string, TrendPair>> {
  const sql = getSql()
  // ORDER BY gehoert in die Abfrage, nicht in eine Annahme ueber die
  // Reihenfolge der Zeilen: ohne ihn darf Postgres liefern, wie es will.
  const rows = (await sql`
    SELECT ticker, period, strong_buy, buy, hold, sell, strong_sell, rang FROM (
      SELECT *, row_number() OVER (PARTITION BY ticker ORDER BY period DESC) AS rang
      FROM analyst_trend
    ) t WHERE rang <= 2 ORDER BY ticker, rang
  `) as Record<string, unknown>[]

  const paare = new Map<string, TrendPair>()
  for (const row of rows) {
    const trend: RecommendationTrend = {
      ticker: String(row['ticker']),
      period: String(row['period']),
      strongBuy: Number(row['strong_buy']),
      buy: Number(row['buy']),
      hold: Number(row['hold']),
      sell: Number(row['sell']),
      strongSell: Number(row['strong_sell']),
    }
    if (Number(row['rang']) === 1) {
      paare.set(trend.ticker, { aktuell: trend, vormonat: null })
    } else {
      const eintrag = paare.get(trend.ticker)
      if (eintrag !== undefined) eintrag.vormonat = trend
    }
  }
  return paare
}

/** Aeltester Kurstag je Titel fehlt bewusst; gebraucht wird der neueste. */
export async function latestBarDay(ticker: string): Promise<string | null> {
  const sql = getSql()
  const rows = (await sql`
    SELECT max(day) AS tag FROM price_bar WHERE ticker = ${ticker}
  `) as Record<string, unknown>[]
  const value = rows[0]?.['tag']
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

/** Zeitpunkt des letzten erfolgreichen Abrufs mit Berichtszahlen je Titel. */
export async function lastFundamentalsSuccess(ticker: string): Promise<Date | null> {
  const sql = getSql()
  const rows = (await sql`
    SELECT max(finished_at) AS letzte FROM refresh_run
    WHERE ticker = ${ticker} AND periods > 0
  `) as Record<string, unknown>[]
  const value = rows[0]?.['letzte']
  if (value === null || value === undefined) return null
  return value instanceof Date ? value : new Date(String(value))
}

/**
 * Juengster Schlusskurs je Titel, in einer Abfrage. Dient dem
 * Plausibilitaets-Waechter der Live-Kurse als Vergleichsbasis.
 */
export async function latestCloses(): Promise<Map<string, { close: number; currency: string }>> {
  const sql = getSql()
  const rows = (await sql`
    SELECT DISTINCT ON (ticker) ticker, close::float8 AS close, currency
    FROM price_bar
    ORDER BY ticker, day DESC
  `) as Record<string, unknown>[]
  const karte = new Map<string, { close: number; currency: string }>()
  for (const row of rows) {
    const close = Number(row['close'])
    if (Number.isFinite(close) && close > 0) {
      karte.set(String(row['ticker']), { close, currency: String(row['currency']).trim() })
    }
  }
  return karte
}

/** Juengster gespeicherter Schlusskurs eines Titels samt Tag. */
export async function latestClose(
  ticker: string,
): Promise<{ day: string; close: number; currency: string } | null> {
  const sql = getSql()
  const rows = (await sql`
    SELECT day::text AS day, close::float8 AS close, currency
    FROM price_bar
    WHERE ticker = ${ticker}
    ORDER BY day DESC
    LIMIT 1
  `) as { day: string; close: number; currency: string }[]
  const row = rows[0]
  if (row === undefined) return null
  const close = Number(row.close)
  if (!Number.isFinite(close) || close <= 0) return null
  return { day: row.day.slice(0, 10), close, currency: row.currency.trim() }
}

/**
 * Selbst hinzugefuegte Titel. Die Stammdaten stammen aus dem
 * SEC-Verzeichnis; hier wird nur gespeichert und wieder gelesen.
 */
export async function loadCustomTitles(): Promise<WatchlistEntry[]> {
  const sql = getSql()
  const rows = (await sql`
    SELECT ticker, name, venue, expected_coverage, cik
    FROM custom_titel
    ORDER BY added_at
  `) as { ticker: string; name: string; venue: string; expected_coverage: string; cik: string | null }[]

  const eintraege: WatchlistEntry[] = []
  for (const row of rows) {
    const geprueft = WatchlistEntrySchema.safeParse({
      ticker: row.ticker,
      name: row.name,
      venue: row.venue,
      expectedCoverage: row.expected_coverage,
      ...(row.cik === null ? {} : { cik: row.cik }),
    })
    if (geprueft.success) {
      eintraege.push(geprueft.data)
    } else {
      // Eine kaputte Zeile soll nicht die ganze Watchlist reissen.
      console.warn(`custom_titel ${row.ticker}: Zeile unlesbar, uebersprungen.`)
    }
  }
  return eintraege
}

export async function addCustomTitle(entry: WatchlistEntry): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO custom_titel (ticker, name, venue, expected_coverage, cik)
    VALUES (${entry.ticker}, ${entry.name}, ${entry.venue}, ${entry.expectedCoverage}, ${entry.cik ?? null})
    ON CONFLICT (ticker) DO NOTHING
  `
}

/**
 * Entfernt einen selbst hinzugefuegten Titel. Die gespeicherten Kurse
 * und Berichtszahlen bleiben liegen: harmlos, und beim erneuten
 * Hinzufuegen ist die Historie sofort wieder da.
 */
export async function removeCustomTitle(ticker: string): Promise<boolean> {
  const sql = getSql()
  const rows = (await sql`
    DELETE FROM custom_titel WHERE ticker = ${ticker} RETURNING ticker
  `) as { ticker: string }[]
  return rows.length > 0
}

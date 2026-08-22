import { WATCHLIST } from '../config/watchlist'
import { buildDemoTitles, DEMO_AS_OF } from '../demo/demo-data'
import { estimateNextEarnings } from '../domain/earnings-estimate'
import type { EarningsEstimate } from '../domain/earnings-estimate'
import { summarizeFundamentals } from '../domain/fundamentals'
import type { FundamentalsSummary, ReportedPeriod } from '../domain/fundamentals'
import type { WatchlistEntry } from '../domain/instrument'
import { summarize52Weeks } from '../domain/price-series'
import type { PriceSeries, PriceSummary } from '../domain/price-series'
import { screen } from '../domain/screening'
import type { ScreenResult } from '../domain/screening'
import { hasDatabase } from '../db/client'
import { lastRefreshAt, loadStoredTitles } from '../db/repository'
import type { StoredTitle } from '../db/repository'
import { loadSnapshot } from './snapshot'
import type { SnapshotTitle } from './snapshot'

export interface TitleView {
  entry: WatchlistEntry
  series: PriceSeries | null
  price: PriceSummary | null
  fundamentals: FundamentalsSummary | null
  earnings: EarningsEstimate | null
  screen: ScreenResult
  /** Was beim Abruf nicht geklappt hat. Wird angezeigt, nicht verschluckt. */
  notes: readonly string[]
}

export interface TitleData {
  titles: readonly TitleView[]
  asOf: Date
  /** true, solange noch kein echter Abruf gelaufen ist. */
  isDemo: boolean
  priceSource: string
  fundamentalsSource: string
}

function toSeries(entry: WatchlistEntry, snapshot: SnapshotTitle): PriceSeries | null {
  if (snapshot.bars.length === 0) return null
  return {
    ticker: entry.ticker,
    currency: snapshot.currency,
    source: 'snapshot',
    bars: snapshot.bars.map(([date, open, high, low, close]) => ({
      date,
      open,
      high,
      low,
      close,
      volume: null,
    })),
  }
}

function build(
  entry: WatchlistEntry,
  series: PriceSeries | null,
  periods: readonly ReportedPeriod[],
  asOf: Date,
  notes: readonly string[],
): TitleView {
  let price: PriceSummary | null = null
  if (series !== null) {
    try {
      price = summarize52Weeks(series, asOf)
    } catch {
      // Reihe ohne Kurse im Fenster: kein Grund, die ganze Seite
      // scheitern zu lassen. Der Titel erscheint ohne Kennzahlen.
      price = null
    }
  }

  const fundamentals =
    periods.length === 0 ? null : summarizeFundamentals(entry.ticker, periods, asOf)
  const earnings =
    periods.length === 0
      ? null
      : estimateNextEarnings(
          periods.map((period) => period.filedAt),
          asOf,
        )

  return {
    entry,
    series,
    price,
    fundamentals,
    earnings,
    screen: screen({ ticker: entry.ticker, name: entry.name, price, fundamentals }),
    notes,
  }
}

/**
 * Reihenfolge der Quellen: Datenbank, dann Snapshot-Datei, dann
 * Demodaten. Die Oberflaeche fragt nur diese eine Stelle und muss den
 * Unterschied sonst nirgends kennen.
 *
 * Faellt die Datenbank aus, zeigt die App den letzten Snapshot statt
 * einer Fehlerseite. Eine veraltete Uebersicht ist brauchbarer als gar
 * keine, solange der Stand darunter steht.
 */
export async function loadTitlesFromDatabase(): Promise<TitleData | null> {
  if (!hasDatabase()) return null
  try {
    const asOf = (await lastRefreshAt()) ?? new Date()
    const sinceDay = new Date(asOf.getTime() - 420 * 86_400_000).toISOString().slice(0, 10)
    const stored: Map<string, StoredTitle> = await loadStoredTitles(sinceDay)
    if (stored.size === 0) return null

    return {
      titles: WATCHLIST.map((entry) => {
        const found = stored.get(entry.ticker)
        if (found === undefined || found.bars.length === 0) {
          return build(entry, null, found?.periods ?? [], asOf, ['Noch nicht abgerufen.'])
        }
        const series: PriceSeries = {
          ticker: entry.ticker,
          currency: found.currency,
          source: 'datenbank',
          bars: found.bars,
        }
        return build(entry, series, found.periods, asOf, [])
      }),
      asOf,
      isDemo: false,
      priceSource: 'Twelve Data',
      fundamentalsSource: 'SEC XBRL',
    }
  } catch (fehler) {
    console.warn('Datenbank nicht lesbar, weiche auf den Snapshot aus:', fehler)
    return null
  }
}

export function loadTitles(): TitleData {
  const snapshot = loadSnapshot()

  if (snapshot === null) {
    const demo = buildDemoTitles()
    return {
      titles: demo.map((title) => ({ ...title, notes: [] })),
      asOf: DEMO_AS_OF,
      isDemo: true,
      priceSource: 'synthetisch',
      fundamentalsSource: 'synthetisch',
    }
  }

  const asOf = new Date(snapshot.fetchedAt)
  const byTicker = new Map(snapshot.titles.map((title) => [title.ticker, title]))

  return {
    titles: WATCHLIST.map((entry) => {
      const found = byTicker.get(entry.ticker)
      if (found === undefined) {
        return build(entry, null, [], asOf, ['Im Snapshot nicht enthalten.'])
      }
      const notes = [found.priceError, found.fundamentalsError].filter(
        (note): note is string => note !== null,
      )
      return build(entry, toSeries(entry, found), found.periods, asOf, notes)
    }),
    asOf,
    isDemo: false,
    priceSource: snapshot.priceSource,
    fundamentalsSource: snapshot.fundamentalsSource,
  }
}

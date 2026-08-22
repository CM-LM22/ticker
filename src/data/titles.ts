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
import { hasDatabase, istTabelleFehlt } from '../db/client'
import { lastRefreshAt, loadStoredTitles } from '../db/repository'
import type { StoredTitle } from '../db/repository'

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
 * Die Daten kommen aus der Datenbank. Ist keine angebunden oder noch
 * nichts abgerufen, zeigt die Oberflaeche Demodaten und sagt das an.
 * Zwei Quellen, nicht drei: die frueher committete Snapshot-Datei ist
 * entfallen, mit ihr der zweite Datenpfad.
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
    if (istTabelleFehlt(fehler)) {
      // Noch kein Abruf gelaufen, die Tabellen entstehen beim ersten.
      // Das ist ein Zustand, kein Fehler, und braucht keinen Stapelabzug.
      console.info('Tabellen noch nicht angelegt, zeige Demodaten.')
      return null
    }
    console.warn('Datenbank nicht lesbar, zeige Demodaten:', fehler)
    return null
  }
}

/** Rueckfall, solange nichts abgerufen wurde. */
export function loadDemoTitles(): TitleData {
  return {
    titles: buildDemoTitles().map((title) => ({ ...title, notes: [] })),
    asOf: DEMO_AS_OF,
    isDemo: true,
    priceSource: 'synthetisch',
    fundamentalsSource: 'synthetisch',
  }
}

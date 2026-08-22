import { loadDemoTitles, loadTitlesFromDatabase } from './titles'
import type { TitleData } from './titles'

/**
 * Die eine Stelle, die alle Seiten aufrufen: Datenbank, sonst
 * Demodaten.
 */
export async function loadTitleData(): Promise<TitleData> {
  return (await loadTitlesFromDatabase()) ?? loadDemoTitles()
}

import { hasDatabase, istTabelleFehlt } from '../db/client'
import {
  loadRecentAnalystActions,
  loadTrendOverview,
  readPollState,
  RATINGS_POLL_KEY,
} from '../db/repository'
import type { StoredAnalystAction, TrendPair } from '../db/repository'

export interface AnalystView {
  actions: readonly StoredAnalystAction[]
  trends: readonly TrendPair[]
  fetchedAt: Date | null
  initialized: boolean
  note: string | null
  hasDatabase: boolean
  hasFinnhubKey: boolean
}

export async function loadAnalystView(): Promise<AnalystView> {
  const hasFinnhubKey = (process.env['FINNHUB_API_KEY']?.trim() ?? '').length > 0
  const leer: AnalystView = {
    actions: [],
    trends: [],
    fetchedAt: null,
    initialized: false,
    note: null,
    hasDatabase: hasDatabase(),
    hasFinnhubKey,
  }
  if (!hasDatabase()) return leer
  try {
    const [actions, state, trendMap] = await Promise.all([
      loadRecentAnalystActions(),
      readPollState(RATINGS_POLL_KEY),
      loadTrendOverview(),
    ])
    // In Watchlist-Reihenfolge, nicht in der Zufallsreihenfolge der Map.
    const { WATCHLIST } = await import('../config/watchlist')
    const trends = WATCHLIST.flatMap((entry) => {
      const paar = trendMap.get(entry.ticker)
      return paar === undefined ? [] : [paar]
    })
    return {
      actions,
      trends,
      fetchedAt: state.fetchedAt,
      initialized: state.initialized,
      note: state.note,
      hasDatabase: true,
      hasFinnhubKey,
    }
  } catch (fehler) {
    if (istTabelleFehlt(fehler)) {
      console.info('Analystentabellen noch nicht angelegt.')
      return leer
    }
    console.warn('Analystenmeldungen nicht lesbar:', fehler)
    return leer
  }
}

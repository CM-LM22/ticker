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
import { loadRecentAnalystActions, readPollState, RATINGS_POLL_KEY } from '../db/repository'
import type { StoredAnalystAction } from '../db/repository'

export interface AnalystView {
  actions: readonly StoredAnalystAction[]
  fetchedAt: Date | null
  initialized: boolean
  note: string | null
  hasDatabase: boolean
}

export async function loadAnalystView(): Promise<AnalystView> {
  const leer: AnalystView = {
    actions: [],
    fetchedAt: null,
    initialized: false,
    note: null,
    hasDatabase: hasDatabase(),
  }
  if (!hasDatabase()) return leer
  try {
    const [actions, state] = await Promise.all([
      loadRecentAnalystActions(),
      readPollState(RATINGS_POLL_KEY),
    ])
    return {
      actions,
      fetchedAt: state.fetchedAt,
      initialized: state.initialized,
      note: state.note,
      hasDatabase: true,
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

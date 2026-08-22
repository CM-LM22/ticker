import { WATCHLIST } from '../config/watchlist'
import { hasDatabase, istTabelleFehlt } from '../db/client'
import { loadCustomTitles } from '../db/repository'
import type { WatchlistEntry } from '../domain/instrument'

/**
 * Der feste Grundstock aus dem Code plus die selbst hinzugefuegten
 * Titel aus der Datenbank. Der Grundstock gewinnt bei Kollisionen:
 * ein Datenbankeintrag kann keinen fest hinterlegten Titel
 * umdefinieren.
 */
export function mergeWatchlist(
  grundstock: readonly WatchlistEntry[],
  eigene: readonly WatchlistEntry[],
): WatchlistEntry[] {
  const vorhanden = new Set(grundstock.map((entry) => entry.ticker))
  const zusatz = eigene.filter((entry) => {
    if (vorhanden.has(entry.ticker)) return false
    vorhanden.add(entry.ticker)
    return true
  })
  return [...grundstock, ...zusatz]
}

/**
 * Ohne Datenbank oder vor der ersten Migration gibt es schlicht nur
 * den Grundstock — ein Zustand, kein Fehler.
 */
export async function gesamteWatchlist(): Promise<WatchlistEntry[]> {
  if (!hasDatabase()) return [...WATCHLIST]
  try {
    return mergeWatchlist(WATCHLIST, await loadCustomTitles())
  } catch (fehler) {
    if (!istTabelleFehlt(fehler)) {
      console.warn('Eigene Titel nicht lesbar, zeige nur den Grundstock:', fehler)
    }
    return [...WATCHLIST]
  }
}

/** Die Kuerzel der selbst hinzugefuegten Titel, fuer die Anzeige. */
export async function eigeneTicker(): Promise<Set<string>> {
  if (!hasDatabase()) return new Set()
  try {
    return new Set((await loadCustomTitles()).map((entry) => entry.ticker))
  } catch {
    return new Set()
  }
}

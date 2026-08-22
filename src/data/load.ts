import { loadTitles, loadTitlesFromDatabase } from './titles'
import type { TitleData } from './titles'

/**
 * Die eine Stelle, die alle Seiten aufrufen. Erst die Datenbank, sonst
 * der Weg von vorher.
 */
export async function loadTitleData(): Promise<TitleData> {
  return (await loadTitlesFromDatabase()) ?? loadTitles()
}

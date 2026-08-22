/**
 * Holt die oeffentlichen Analystenhandlungen der Watchlist, vergleicht
 * sie mit dem letzten Stand und schreibt neue Meldungen nach
 * data/ratings-state.json. Optional geht ein Telegram-Push raus.
 *
 *   npm run ratings
 *
 * Der erste erfolgreiche Lauf speichert nur den Stand. Sonst waere jede
 * jahrealte Aufnahme ein Alert.
 */
import { writeFile } from 'node:fs/promises'
import { WATCHLIST } from '../src/config/watchlist'
import { applyIncomingActions, ratingsStateChanged } from '../src/data/ratings-poll'
import { loadRatingsState } from '../src/data/ratings-state'
import type { AnalystAction } from '../src/domain/analyst-actions'
import { clipDigestBody, formatAnalystDigest } from '../src/domain/analyst-actions'
import { sleep } from './lib/edgar'
import { ProviderError } from '../src/providers/types'
import { YahooRatingsProvider } from '../src/providers/yahoo-ratings'
import { TelegramNotifier, readTelegramConfig } from '../src/providers/telegram'

const DELAY_MS = 450
const STATE_PATH = 'data/ratings-state.json'

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function main(): Promise<void> {
  const startedAt = new Date()
  const provider = new YahooRatingsProvider()
  const incoming: AnalystAction[] = []
  const warnings: string[] = []
  let failures = 0

  for (const entry of WATCHLIST) {
    await sleep(DELAY_MS)
    try {
      const items = await provider.fetchHistory(entry)
      incoming.push(...items)
      console.log(`  ${entry.ticker.padEnd(6)} ${String(items.length).padStart(3)} Handlungen`)
    } catch (error) {
      failures += 1
      const retryable = error instanceof ProviderError && error.retryable
      const text = `${entry.ticker}: ${message(error)}${retryable ? ' (spaeter erneut)' : ''}`
      warnings.push(text)
      console.log(`  ${entry.ticker.padEnd(6)} Fehler  ${message(error)}`)
    }
  }

  const previous = loadRatingsState()
  if (incoming.length === 0 && failures === WATCHLIST.length) {
    console.log('Kein Titel geliefert, Stand bleibt unangetastet.')
    process.exitCode = 1
    return
  }

  const { next, newActions } = applyIncomingActions(previous, incoming, startedAt, warnings)
  if (ratingsStateChanged(previous, next)) {
    await writeFile(STATE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    console.log(`Geschrieben: ${STATE_PATH}`)
  } else {
    console.log('Stand unveraendert, Datei bleibt.')
  }
  console.log(
    `\n${incoming.length} Handlungen gesehen, ${newActions.length} neu, ${failures} Fehler.`,
  )

  const telegram = readTelegramConfig()
  if (telegram === null) {
    console.log('Telegram nicht konfiguriert, nur Oberflaeche.')
    return
  }
  if (newActions.length === 0) {
    console.log('Nichts zuzustellen.')
    return
  }

  const digest = formatAnalystDigest(newActions)
  const notifier = new TelegramNotifier(telegram.token, telegram.chatId)
  const result = await notifier.sendText(digest.title, clipDigestBody(digest.body))

  if (!result.ok) {
    console.log(`Telegram fehlgeschlagen: ${result.error ?? 'unbekannt'}`)
    process.exitCode = 1
    return
  }
  console.log(`Telegram zugestellt (${result.providerMessageId ?? 'ohne ID'}).`)
}

main().catch((error: unknown) => {
  console.error(message(error))
  process.exitCode = 1
})

/**
 * Holt echte Daten und legt sie als data/snapshot.json ab.
 *
 * Laeuft in GitHub Actions, weil dort Netzzugang besteht. Das Ergebnis
 * wird committet; die Oberflaeche liest es beim Bauen. Damit gibt es
 * echte Zahlen, bevor eine Datenbank angebunden ist.
 *
 *   npm run snapshot
 *
 * Kurse brauchen keinen Schluessel. Berichtszahlen brauchen
 * SEC_USER_AGENT mit Kontakt-E-Mail; fehlt der, wird nur der Kursteil
 * geholt und der Rest je Titel als Grund vermerkt.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { WATCHLIST } from '../src/config/watchlist'
import { parseStooqCsv, stooqCurrency, stooqSymbol, stooqUrl } from '../src/providers/stooq'
import { CompanyFactsSchema, companyFactsUrl, extractPeriods } from '../src/providers/sec-xbrl'
import type { ReportedPeriod } from '../src/domain/fundamentals'
import {
  CompanyTickersSchema,
  COMPANY_TICKERS_URL,
  buildCikIndex,
  resolveCik,
  sleep,
} from './lib/edgar'

/** Reicht fuer 52 Wochen Fenster plus 200-Tage-Schnitt und Vorjahresvergleich. */
const HISTORY_DAYS = 420
const STOOQ_DELAY_MS = 400
const SEC_DELAY_MS = 150
/** Nur so viele Perioden je Titel, der Rest blaeht die Datei nur auf. */
const MAX_PERIODS = 12

interface SnapshotTitle {
  ticker: string
  venue: string
  currency: string
  cik: string | null
  bars: [string, number, number, number, number][]
  periods: ReportedPeriod[]
  priceError: string | null
  fundamentalsError: string | null
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

async function main(): Promise<void> {
  const startedAt = new Date()
  const since = new Date(startedAt.getTime() - HISTORY_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10)

  const userAgent = process.env['SEC_USER_AGENT']?.trim() ?? ''
  const secReady = userAgent.includes('@')
  if (!secReady) {
    console.log('SEC_USER_AGENT fehlt oder hat keine Kontakt-E-Mail.')
    console.log('Es werden nur Kurse geholt, keine Berichtszahlen.')
  }

  let cikIndex = null
  if (secReady) {
    const response = await fetch(COMPANY_TICKERS_URL, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`company_tickers.json: HTTP ${response.status}`)
    cikIndex = buildCikIndex(CompanyTickersSchema.parse(await response.json()))
    console.log(`${cikIndex.byTicker.size} Kuerzel von der SEC geladen.`)
  }

  const titles: SnapshotTitle[] = []

  for (const entry of WATCHLIST) {
    const title: SnapshotTitle = {
      ticker: entry.ticker,
      venue: entry.venue,
      currency: stooqCurrency(entry),
      cik: null,
      bars: [],
      periods: [],
      priceError: null,
      fundamentalsError: null,
    }

    await sleep(STOOQ_DELAY_MS)
    try {
      const response = await fetch(stooqUrl(stooqSymbol(entry)), {
        headers: { Accept: 'text/csv' },
      })
      if (!response.ok) throw new Error(`Kurse: HTTP ${response.status}`)
      const series = parseStooqCsv(await response.text(), {
        ticker: entry.ticker,
        currency: title.currency,
      })
      title.bars = series.bars
        .filter((bar) => bar.date >= since)
        .map((bar) => [bar.date, round(bar.open), round(bar.high), round(bar.low), round(bar.close)])
      if (title.bars.length === 0) title.priceError = 'Keine Kurse im gewuenschten Zeitraum.'
    } catch (error) {
      title.priceError = `Kurse nicht abrufbar: ${message(error)}`
    }

    if (!secReady) {
      title.fundamentalsError = 'Berichtszahlen uebersprungen: SEC_USER_AGENT nicht gesetzt.'
    } else if (cikIndex !== null) {
      const resolution = resolveCik(entry, cikIndex)
      if (resolution === null) {
        title.fundamentalsError = 'Nicht bei der SEC registriert.'
      } else {
        title.cik = resolution.cik
        await sleep(SEC_DELAY_MS)
        try {
          const response = await fetch(companyFactsUrl(resolution.cik), {
            headers: { 'User-Agent': userAgent, Accept: 'application/json' },
          })
          if (response.status === 404) throw new Error('Keine XBRL-Daten hinterlegt')
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const periods = extractPeriods(CompanyFactsSchema.parse(await response.json()))
          title.periods = periods.slice(0, MAX_PERIODS)
          if (periods.length === 0) title.fundamentalsError = 'Keine verwertbaren Perioden.'
        } catch (error) {
          title.fundamentalsError = `Berichtszahlen nicht abrufbar: ${message(error)}`
        }
      }
    }

    titles.push(title)
    console.log(
      `  ${entry.ticker.padEnd(6)} Kurse ${String(title.bars.length).padStart(4)}` +
        `  Perioden ${String(title.periods.length).padStart(2)}` +
        `${title.priceError === null ? '' : `  ${title.priceError}`}`,
    )
  }

  await mkdir('data', { recursive: true })
  await writeFile(
    'data/snapshot.json',
    `${JSON.stringify(
      {
        fetchedAt: startedAt.toISOString(),
        priceSource: 'Stooq',
        fundamentalsSource: secReady ? 'SEC XBRL' : 'nicht abgerufen',
        titles,
      },
      null,
      0,
    )}\n`,
    'utf8',
  )

  const withPrices = titles.filter((title) => title.bars.length > 0).length
  const withPeriods = titles.filter((title) => title.periods.length > 0).length
  console.log(`\nKurse ${withPrices}/${titles.length}, Berichtszahlen ${withPeriods}/${titles.length}.`)
  console.log('Geschrieben: data/snapshot.json')
}

main().catch((error: unknown) => {
  console.error(message(error))
  process.exitCode = 1
})

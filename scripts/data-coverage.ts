/**
 * Abdeckungstest fuer Kurse und Berichtszahlen.
 *
 * Beantwortet zwei Fragen empirisch, statt sie den Anbieterseiten zu
 * glauben:
 *   1. Fuer wie viele der 40 Titel liefert Stooq ueberhaupt Tageskurse,
 *      und wie tief reicht die Historie?
 *   2. Fuer wie viele liefert die XBRL-Schnittstelle der SEC
 *      verwertbare Umsatz- und Ergebniszahlen?
 *
 * Ausfuehren:
 *   SEC_USER_AGENT="ticker-alerts/0.1 (du@example.com)" npm run coverage:data
 *
 * Die CIKs stammen aus docs/coverage.json. Fehlt die Datei, wird nur der
 * Kursteil gemessen und der Bilanzteil als offen ausgewiesen.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { WATCHLIST } from '../src/config/watchlist'
import { summarizeFundamentals } from '../src/domain/fundamentals'
import { summarize52Weeks } from '../src/domain/price-series'
import type { WatchlistEntry } from '../src/domain/instrument'
import { parseStooqCsv, stooqCurrency, stooqSymbol, stooqUrl } from '../src/providers/stooq'
import { CompanyFactsSchema, companyFactsUrl, extractPeriods } from '../src/providers/sec-xbrl'

const REQUEST_DELAY_MS = 400
const SEC_DELAY_MS = 150

interface Row {
  ticker: string
  name: string
  venue: WatchlistEntry['venue']
  stooqSymbol: string
  bars: number | null
  from: string | null
  to: string | null
  last: number | null
  currency: string
  priceError: string | null
  cik: string | null
  periods: number | null
  latestPeriod: string | null
  latestRevenue: number | null
  fundamentalsError: string | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function loadCiks(): Promise<Map<string, string>> {
  try {
    const raw = await readFile('docs/coverage.json', 'utf8')
    const parsed: unknown = JSON.parse(raw)
    const rows =
      typeof parsed === 'object' && parsed !== null && 'rows' in parsed
        ? (parsed as { rows: unknown }).rows
        : []
    const map = new Map<string, string>()
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (typeof row !== 'object' || row === null) continue
        const record = row as { ticker?: unknown; cik?: unknown }
        if (typeof record.ticker === 'string' && typeof record.cik === 'string') {
          map.set(record.ticker, record.cik)
        }
      }
    }
    return map
  } catch {
    console.log('docs/coverage.json nicht gefunden. Bilanzteil wird uebersprungen.')
    console.log('Zuerst npm run coverage:edgar laufen lassen.')
    return new Map()
  }
}

async function main(): Promise<void> {
  const userAgent = process.env['SEC_USER_AGENT']?.trim() ?? ''
  const ciks = await loadCiks()
  const asOf = new Date()
  const rows: Row[] = []

  console.log(`Abdeckungstest Kurse und Bilanzzahlen, ${WATCHLIST.length} Titel.`)

  for (const entry of WATCHLIST) {
    const symbol = stooqSymbol(entry)
    const row: Row = {
      ticker: entry.ticker,
      name: entry.name,
      venue: entry.venue,
      stooqSymbol: symbol,
      bars: null,
      from: null,
      to: null,
      last: null,
      currency: stooqCurrency(entry),
      priceError: null,
      cik: ciks.get(entry.ticker) ?? null,
      periods: null,
      latestPeriod: null,
      latestRevenue: null,
      fundamentalsError: null,
    }

    await sleep(REQUEST_DELAY_MS)
    try {
      const response = await fetch(stooqUrl(symbol), { headers: { Accept: 'text/csv' } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const series = parseStooqCsv(await response.text(), {
        ticker: entry.ticker,
        currency: row.currency,
      })
      const summary = summarize52Weeks(series, asOf)
      row.bars = series.bars.length
      row.from = series.bars[0]?.date ?? null
      row.to = summary.last.date
      row.last = summary.last.close
    } catch (error) {
      row.priceError = message(error)
    }

    if (row.cik !== null && userAgent.includes('@')) {
      await sleep(SEC_DELAY_MS)
      try {
        const response = await fetch(companyFactsUrl(row.cik), {
          headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        })
        if (response.status === 404) throw new Error('Keine companyfacts hinterlegt')
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const periods = extractPeriods(CompanyFactsSchema.parse(await response.json()))
        const summary = summarizeFundamentals(entry.ticker, periods, asOf)
        row.periods = periods.length
        row.latestPeriod = summary.latest?.period.label ?? null
        row.latestRevenue = summary.latest?.period.revenue ?? null
      } catch (error) {
        row.fundamentalsError = message(error)
      }
    } else if (row.cik === null) {
      row.fundamentalsError = 'keine CIK'
    } else {
      row.fundamentalsError = 'SEC_USER_AGENT fehlt'
    }

    rows.push(row)
    console.log(
      `  ${entry.ticker.padEnd(6)} ${symbol.padEnd(10)}` +
        ` Kurse ${row.bars === null ? 'FEHLT' : String(row.bars).padStart(5)}` +
        `  Perioden ${row.periods === null ? '—' : row.periods}`,
    )
  }

  const withPrices = rows.filter((row) => row.bars !== null)
  const withFundamentals = rows.filter((row) => (row.periods ?? 0) > 0)

  const table = (subset: readonly Row[]): string =>
    [
      '| Ticker | Stooq | Handelstage | Historie ab | letzter Kurs | Perioden | juengste Periode |',
      '| --- | --- | --: | --- | --: | --: | --- |',
      ...subset.map((row) =>
        [
          '',
          row.ticker,
          row.bars === null ? `— (${row.priceError ?? ''})` : row.stooqSymbol,
          row.bars ?? '—',
          row.from ?? '—',
          row.last === null ? '—' : `${row.last.toFixed(2)} ${row.currency}`,
          row.periods ?? `— (${row.fundamentalsError ?? ''})`,
          row.latestPeriod ?? '—',
          '',
        ].join(' | '),
      ),
    ].join('\n')

  const markdown = `# Abdeckungstest Kurse und Bilanzzahlen

Gemessen am ${asOf.toISOString().slice(0, 10)}. Erzeugt von \`npm run coverage:data\`.
Nicht von Hand bearbeiten.

**Kurse (Stooq):** ${withPrices.length} von ${rows.length} Titeln.
**Bilanzzahlen (SEC XBRL):** ${withFundamentals.length} von ${rows.length} Titeln.

## Nasdaq

${table(rows.filter((row) => row.venue === 'NASDAQ'))}

## DAX

${table(rows.filter((row) => row.venue === 'XETRA'))}

## Lesehilfe

- Stooq antwortet auch auf unbekannte Kuerzel mit HTTP 200 und einer
  Klartextzeile. Ein Eintrag ohne Handelstage bedeutet, dass der Parser
  diese Antwort abgefangen hat, nicht dass der Abruf technisch scheiterte.
- Perioden zaehlt nur, was als Quartal oder Geschaeftsjahr erkannt wurde.
  Kumulierte Halbjahres- und Neunmonatswerte fallen bewusst heraus.
- Nach diesem Lauf gehoert das Ergebnis in die Faehigkeitsbeschreibung
  der Anbieter: \`evidence\` von \`vendor_claim\` auf \`measured\` setzen
  und \`verifiedAt\` eintragen.
`

  await writeFile('docs/data-coverage.md', markdown, 'utf8')
  await writeFile(
    'docs/data-coverage.json',
    `${JSON.stringify({ measuredAt: asOf.toISOString(), rows }, null, 2)}\n`,
    'utf8',
  )

  console.log(
    `\nKurse ${withPrices.length}/${rows.length}, Bilanzzahlen ${withFundamentals.length}/${rows.length}.`,
  )
  console.log('Geschrieben: docs/data-coverage.md, docs/data-coverage.json')
}

main().catch((error: unknown) => {
  console.error(message(error))
  process.exitCode = 1
})

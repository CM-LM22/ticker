/**
 * Abdeckungstest gegen EDGAR.
 *
 * Beantwortet fuer jeden Titel der Watchlist genau eine Frage: liegt bei
 * der SEC etwas, das Quartalszahlen traegt, und wenn ja, in welcher Form?
 * Das Ergebnis landet in docs/coverage.md und docs/coverage.json.
 *
 * Ausfuehren:
 *   SEC_USER_AGENT="ticker-alerts/0.1 (du@example.com)" npm run coverage:edgar
 *
 * Ohne aussagekraeftigen User-Agent antwortet EDGAR mit HTTP 403. Das ist
 * keine Vermutung, sondern die dokumentierte Zugangsregel der SEC.
 */
import { writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { WATCHLIST } from '../src/config/watchlist'
import type { CoverageExpectation, WatchlistEntry } from '../src/domain/instrument'
import {
  COMPANY_TICKERS_URL,
  CompanyTickersSchema,
  buildCikIndex,
  requireUserAgent,
  resolveCik,
  sleep,
} from '../src/providers/edgar-index'
import type { CikIndex, Resolution } from '../src/providers/edgar-index'

const WINDOW_MONTHS = 24
/** Erlaubt sind 10 Anfragen pro Sekunde. Wir bleiben deutlich darunter. */
const REQUEST_DELAY_MS = 150
const MAX_RETRIES = 3

const RecentFilingsSchema = z.object({
  accessionNumber: z.array(z.string()),
  filingDate: z.array(z.string()),
  reportDate: z.array(z.string()).default([]),
  form: z.array(z.string()),
  items: z.array(z.string()).default([]),
  primaryDocument: z.array(z.string()).default([]),
})

const SubmissionsSchema = z.object({
  cik: z.union([z.string(), z.number()]),
  name: z.string(),
  tickers: z.array(z.string()).default([]),
  exchanges: z.array(z.string()).default([]),
  filings: z.object({ recent: RecentFilingsSchema }),
})

type Submissions = z.infer<typeof SubmissionsSchema>

interface CoverageRow {
  ticker: string
  name: string
  venue: WatchlistEntry['venue']
  expected: CoverageExpectation
  cik: string | null
  secName: string | null
  resolvedVia: Resolution['via'] | null
  counts: Record<string, number>
  earnings8K: number
  latestEarningsFiling: { form: string; filingDate: string } | null
  /** true, wenn das Fenster der API nicht bis zum Stichtag zurueckreicht. */
  windowTruncated: boolean
  measured: CoverageExpectation
  verdict: 'ok' | 'abweichung'
  note: string | null
}

async function getJson(url: string, userAgent: string): Promise<unknown> {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      })
      if (response.status === 404) return null
      if (response.status === 403) {
        throw new Error(`403 von ${url}. Pruefe den User-Agent: ${userAgent}`)
      }
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`HTTP ${response.status} von ${url}`)
        await sleep(REQUEST_DELAY_MS * 8 * attempt)
        continue
      }
      if (!response.ok) throw new Error(`HTTP ${response.status} von ${url}`)
      return await response.json()
    } catch (error) {
      lastError = error
      if (attempt === MAX_RETRIES) break
      await sleep(REQUEST_DELAY_MS * 8 * attempt)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Abruf fehlgeschlagen: ${url}`)
}

const FORMS_OF_INTEREST = ['8-K', '6-K', '10-Q', '10-K', '20-F'] as const

function analyse(submissions: Submissions, cutoff: Date): Omit<
  CoverageRow,
  'ticker' | 'name' | 'venue' | 'expected' | 'cik' | 'secName' | 'resolvedVia' | 'verdict' | 'note'
> {
  const recent = submissions.filings.recent
  const counts: Record<string, number> = Object.fromEntries(
    FORMS_OF_INTEREST.map((form) => [form, 0]),
  )
  let earnings8K = 0
  let latest: { form: string; filingDate: string } | null = null
  let oldestSeen: string | null = null

  for (let i = 0; i < recent.form.length; i += 1) {
    const form = recent.form[i]
    const filingDate = recent.filingDate[i]
    if (form === undefined || filingDate === undefined) continue
    oldestSeen = filingDate
    if (new Date(`${filingDate}T00:00:00Z`) < cutoff) continue

    // Nachtraege (8-K/A) zaehlen fuer die Abdeckungsfrage wie das Original.
    const base = form.replace(/\/A$/, '')
    if (!FORMS_OF_INTEREST.includes(base as (typeof FORMS_OF_INTEREST)[number])) continue
    counts[base] = (counts[base] ?? 0) + 1

    const items = recent.items[i] ?? ''
    const isEarnings8K = base === '8-K' && items.split(/[,\s]+/).includes('2.02')
    if (isEarnings8K) earnings8K += 1

    const carriesNumbers = isEarnings8K || base === '10-Q' || base === '10-K' || base === '20-F'
    if (carriesNumbers && latest === null) latest = { form, filingDate }
  }

  const windowTruncated =
    oldestSeen !== null && new Date(`${oldestSeen}T00:00:00Z`) > cutoff

  const measured: CoverageExpectation =
    (counts['10-Q'] ?? 0) > 0 || earnings8K > 0
      ? 'sec_domestic'
      : (counts['6-K'] ?? 0) > 0 || (counts['20-F'] ?? 0) > 0
        ? 'sec_foreign'
        : 'none'

  return { counts, earnings8K, latestEarningsFiling: latest, windowTruncated, measured }
}

function markdownTable(rows: readonly CoverageRow[]): string {
  const header =
    '| Ticker | Name laut SEC | CIK | 8-K 2.02 | 10-Q | 10-K | 6-K | 20-F | letzte Zahlen | gemessen | erwartet |\n' +
    '| --- | --- | --- | --: | --: | --: | --: | --: | --- | --- | --- |'
  const body = rows
    .map((row) => {
      const flag = row.verdict === 'ok' ? '' : ' ⚠'
      return [
        row.ticker,
        row.secName ?? '—',
        row.cik ?? '—',
        row.cik === null ? '—' : String(row.earnings8K),
        row.cik === null ? '—' : String(row.counts['10-Q'] ?? 0),
        row.cik === null ? '—' : String(row.counts['10-K'] ?? 0),
        row.cik === null ? '—' : String(row.counts['6-K'] ?? 0),
        row.cik === null ? '—' : String(row.counts['20-F'] ?? 0),
        row.latestEarningsFiling === null
          ? '—'
          : `${row.latestEarningsFiling.filingDate} (${row.latestEarningsFiling.form})`,
        row.measured,
        `${row.expected}${flag}`,
      ].join(' | ')
    })
    .map((line) => `| ${line} |`)
    .join('\n')
  return `${header}\n${body}`
}

async function main(): Promise<void> {
  const userAgent = requireUserAgent()
  const startedAt = new Date()
  const cutoff = new Date(startedAt)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - WINDOW_MONTHS)

  console.log(`Abdeckungstest gegen EDGAR, Fenster ${WINDOW_MONTHS} Monate, ${WATCHLIST.length} Titel.`)

  const rawTickers = await getJson(COMPANY_TICKERS_URL, userAgent)
  const index: CikIndex = buildCikIndex(CompanyTickersSchema.parse(rawTickers))
  console.log(`${index.byTicker.size} Kuerzel aus company_tickers.json geladen.`)

  const rows: CoverageRow[] = []
  for (const entry of WATCHLIST) {
    await sleep(REQUEST_DELAY_MS)
    const resolution: Resolution | null = resolveCik(entry, index)

    if (resolution === null) {
      rows.push({
        ticker: entry.ticker,
        name: entry.name,
        venue: entry.venue,
        expected: entry.expectedCoverage,
        cik: null,
        secName: null,
        resolvedVia: null,
        counts: {},
        earnings8K: 0,
        latestEarningsFiling: null,
        windowTruncated: false,
        measured: 'none',
        verdict: entry.expectedCoverage === 'none' ? 'ok' : 'abweichung',
        note: 'Bei der SEC nicht gefunden.',
      })
      console.log(`  ${entry.ticker.padEnd(6)} nicht gefunden`)
      continue
    }

    const raw = await getJson(
      `https://data.sec.gov/submissions/CIK${resolution.cik}.json`,
      userAgent,
    )
    if (raw === null) {
      rows.push({
        ticker: entry.ticker,
        name: entry.name,
        venue: entry.venue,
        expected: entry.expectedCoverage,
        cik: resolution.cik,
        secName: resolution.secName,
        resolvedVia: resolution.via,
        counts: {},
        earnings8K: 0,
        latestEarningsFiling: null,
        windowTruncated: false,
        measured: 'none',
        verdict: entry.expectedCoverage === 'none' ? 'ok' : 'abweichung',
        note: 'CIK bekannt, aber keine submissions-Datei.',
      })
      continue
    }

    const submissions = SubmissionsSchema.parse(raw)
    const analysis = analyse(submissions, cutoff)
    const notes: string[] = []
    if (resolution.via === 'name') notes.push('CIK ueber Namenssuche, bitte pruefen.')
    if (analysis.windowTruncated) notes.push('API-Fenster reicht nicht ueber 24 Monate zurueck.')
    if (analysis.measured === 'none') notes.push('Registriert, aber keine relevanten Einreichungen.')

    rows.push({
      ticker: entry.ticker,
      name: entry.name,
      venue: entry.venue,
      expected: entry.expectedCoverage,
      cik: resolution.cik,
      secName: submissions.name,
      resolvedVia: resolution.via,
      counts: analysis.counts,
      earnings8K: analysis.earnings8K,
      latestEarningsFiling: analysis.latestEarningsFiling,
      windowTruncated: analysis.windowTruncated,
      measured: analysis.measured,
      verdict: analysis.measured === entry.expectedCoverage ? 'ok' : 'abweichung',
      note: notes.length === 0 ? null : notes.join(' '),
    })
    console.log(
      `  ${entry.ticker.padEnd(6)} ${resolution.cik} ${analysis.measured}` +
        ` (8-K/2.02 ${analysis.earnings8K}, 10-Q ${analysis.counts['10-Q'] ?? 0},` +
        ` 6-K ${analysis.counts['6-K'] ?? 0}, 20-F ${analysis.counts['20-F'] ?? 0})`,
    )
  }

  const covered = rows.filter((row) => row.measured !== 'none')
  const deviations = rows.filter((row) => row.verdict === 'abweichung')
  const nasdaq = rows.filter((row) => row.venue === 'NASDAQ')
  const xetra = rows.filter((row) => row.venue === 'XETRA')

  const markdown = `# Abdeckungstest EDGAR

Gemessen am ${startedAt.toISOString().slice(0, 10)}, Fenster ${WINDOW_MONTHS} Monate.
Erzeugt von \`npm run coverage:edgar\`. Nicht von Hand bearbeiten.

**${covered.length} von ${rows.length} Titeln** sind ueber EDGAR abgedeckt:
${nasdaq.filter((row) => row.measured !== 'none').length} von ${nasdaq.length} Nasdaq,
${xetra.filter((row) => row.measured !== 'none').length} von ${xetra.length} DAX.
Abweichungen von der Erwartung: ${deviations.length}.

## Nasdaq

${markdownTable(nasdaq)}

## DAX

${markdownTable(xetra)}

## Anmerkungen

${rows.filter((row) => row.note !== null).map((row) => `- **${row.ticker}**: ${row.note ?? ''}`).join('\n') || '- keine'}

## Lesehilfe

- \`sec_domestic\`: US-Inlandsemittent, Zahlen kommen als 8-K Item 2.02 plus 10-Q/10-K.
- \`sec_foreign\`: Foreign Private Issuer, Zahlen kommen als 6-K, Jahresbericht als 20-F. Kein 10-Q.
- \`none\`: nichts Verwertbares bei der SEC. Kostenlos nicht abzudecken.
- Die Spalte 6-K zaehlt **alle** 6-K, nicht nur solche mit Zahlen. Ein 6-K
  transportiert auch Hauptversammlungen und Ad-hoc-Meldungen. Wie viele davon
  Quartalszahlen tragen, entscheidet erst der Adapter in Slice 1.
`

  await writeFile('docs/coverage.md', markdown, 'utf8')
  await writeFile(
    'docs/coverage.json',
    `${JSON.stringify({ measuredAt: startedAt.toISOString(), windowMonths: WINDOW_MONTHS, rows }, null, 2)}\n`,
    'utf8',
  )

  console.log(`\n${covered.length}/${rows.length} abgedeckt, ${deviations.length} Abweichungen.`)
  console.log('Geschrieben: docs/coverage.md, docs/coverage.json')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

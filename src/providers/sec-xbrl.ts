import { z } from 'zod'
import type { PeriodFrame, ReportedPeriod } from '../domain/fundamentals'
import type { WatchlistEntry } from '../domain/instrument'
import { ProviderError } from './types'
import type { FundamentalsProvider, ProviderCapabilities } from './types'

/**
 * Zahlen aus den Abschluessen, direkt aus der XBRL-Schnittstelle der SEC.
 *
 * Das ist die kostenlose Antwort auf "Summary der letzten Reports": Wer
 * bei der SEC einreicht, liefert seine Zahlen maschinenlesbar mit. Kein
 * Schluessel, kein Kontingent, dieselbe Zugangsregel wie EDGAR.
 *
 * Grenze: Es gilt, was das Unternehmen selbst getaggt hat. Konzepte
 * heissen je nach Taxonomie anders, deshalb die Prioritaetslisten unten.
 * Welche Titel damit abgedeckt sind, misst scripts/fundamentals-coverage.
 */
export const SEC_XBRL_CAPABILITIES: ProviderCapabilities = {
  id: 'sec-xbrl',
  kind: 'fundamentals',
  coversUsListings: true,
  // Foreign Private Issuers taggen nach IFRS, dieselbe Schnittstelle.
  coversNonUsListings: false,
  requiresApiKey: false,
  rateLimit: { requests: 10, perSeconds: 1 },
  monthlyQuota: null,
  costEurPerMonth: 0,
  evidence: 'vendor_claim',
  verifiedAt: null,
}

const FactEntrySchema = z.object({
  start: z.string().optional(),
  end: z.string(),
  val: z.number(),
  accn: z.string().optional(),
  fy: z.number().nullable().optional(),
  fp: z.string().nullable().optional(),
  form: z.string(),
  filed: z.string(),
})
type FactEntry = z.infer<typeof FactEntrySchema>

/**
 * Bewusst nicht das ganze Dokument validieren.
 *
 * companyfacts liefert saemtliche jemals getaggten Kennzahlen eines
 * Unternehmens — bei grossen Emittenten zweistellige Megabyte mit
 * Zehntausenden Eintraegen. Davon brauchen wir drei Konzepte. Das
 * gesamte Dokument durch Zod zu schicken kostet Speicher und Sekunden
 * fuer Daten, die sofort wieder verworfen werden, und hat den
 * Abrufendpunkt in der Praxis zum Stehen gebracht.
 *
 * Stattdessen: Rumpf grob pruefen, dann gezielt die benoetigten
 * Konzepte herausgreifen und nur deren Eintraege validieren.
 */
export const CompanyFactsSchema = z.object({
  cik: z.number(),
  entityName: z.string(),
  facts: z.record(z.string(), z.unknown()),
})
export type CompanyFacts = z.infer<typeof CompanyFactsSchema> & {
  facts: Record<string, unknown>
}

/**
 * Nach Prioritaet. Unternehmen taggen denselben Sachverhalt
 * unterschiedlich; der erste Treffer gewinnt.
 */
export const REVENUE_CONCEPTS: readonly string[] = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'Revenues',
  'RevenueFromContractWithCustomerIncludingAssessedTax',
  'SalesRevenueNet',
  'Revenue',
]
export const NET_INCOME_CONCEPTS: readonly string[] = [
  'NetIncomeLoss',
  'ProfitLoss',
  'NetIncomeLossAvailableToCommonStockholdersBasic',
]
export const EPS_CONCEPTS: readonly string[] = [
  'EarningsPerShareDiluted',
  'DilutedEarningsLossPerShare',
  'IncomeLossFromContinuingOperationsPerDilutedShare',
]

const RELEVANT_FORMS = /^(10-Q|10-K|20-F|6-K|40-F)(\/A)?$/
const MONETARY_UNIT = /^(USD|EUR|GBP|CHF|DKK|SEK|JPY)$/

const DAY_MS = 86_400_000

function daysBetween(from: string, to: string): number {
  return (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS
}

/**
 * Ordnet einer Tatsache ihr Zeitraster zu. Kumulierte Halbjahres- und
 * Neunmonatswerte, die in jedem 10-Q mitlaufen, fallen dabei heraus:
 * ohne diese Pruefung vergleicht man spaeter Neunmonatsumsatz mit
 * Quartalsumsatz.
 */
export function frameOf(entry: FactEntry): PeriodFrame | null {
  if (entry.start === undefined) return null
  const duration = daysBetween(entry.start, entry.end)
  if (duration >= 80 && duration <= 100) return 'quarter'
  if (duration >= 350 && duration <= 380) return 'year'
  return null
}

export function periodLabel(entry: FactEntry, frame: PeriodFrame): string {
  const fy = entry.fy ?? null
  const fp = entry.fp ?? null
  if (frame === 'year') return fy === null ? `GJ bis ${entry.end}` : `GJ ${fy}`
  if (fp !== null && /^Q[1-4]$/.test(fp) && fy !== null) return `${fp} ${fy}`
  return `Quartal bis ${entry.end}`
}

export function filingUrl(cik: number, accn: string | undefined): string | null {
  if (accn === undefined) return null
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accn.replace(/-/g, '')}/`
}

interface Selected {
  entry: FactEntry
  unit: string
}

const UnitsSchema = z.object({ units: z.record(z.string(), z.array(z.unknown())) })

/**
 * Alle Tatsachen des ersten Konzepts, das ueberhaupt Werte liefert.
 * Validiert wird erst hier, Eintrag fuer Eintrag, und nur fuer die
 * Konzepte, die wirklich gebraucht werden. Ein einzelner kaputter
 * Eintrag wird uebersprungen statt den ganzen Abruf zu verwerfen.
 */
function selectConcept(facts: CompanyFacts, concepts: readonly string[]): Selected[] {
  for (const concept of concepts) {
    for (const namespace of Object.values(facts.facts)) {
      if (typeof namespace !== 'object' || namespace === null) continue
      const roh = (namespace as Record<string, unknown>)[concept]
      if (roh === undefined) continue

      const geprueft = UnitsSchema.safeParse(roh)
      if (!geprueft.success) continue

      const selected: Selected[] = []
      for (const [unit, entries] of Object.entries(geprueft.data.units)) {
        for (const kandidat of entries) {
          const entry = FactEntrySchema.safeParse(kandidat)
          if (!entry.success) continue
          if (!RELEVANT_FORMS.test(entry.data.form)) continue
          selected.push({ entry: entry.data, unit })
        }
      }
      if (selected.length > 0) return selected
    }
  }
  return []
}

/** Bei mehreren Meldungen derselben Periode gewinnt die zuletzt eingereichte. */
function indexByPeriod(selected: readonly Selected[]): Map<string, Selected> {
  const index = new Map<string, Selected>()
  for (const candidate of selected) {
    const frame = frameOf(candidate.entry)
    if (frame === null) continue
    const key = `${frame}:${candidate.entry.end}`
    const existing = index.get(key)
    if (existing === undefined || candidate.entry.filed > existing.entry.filed) {
      index.set(key, candidate)
    }
  }
  return index
}

export function extractPeriods(facts: CompanyFacts): ReportedPeriod[] {
  const revenue = indexByPeriod(selectConcept(facts, REVENUE_CONCEPTS))
  const netIncome = indexByPeriod(selectConcept(facts, NET_INCOME_CONCEPTS))
  const eps = indexByPeriod(selectConcept(facts, EPS_CONCEPTS))

  const keys = new Set([...revenue.keys(), ...netIncome.keys()])
  const periods: ReportedPeriod[] = []

  for (const key of keys) {
    const anchor = revenue.get(key) ?? netIncome.get(key)
    if (anchor === undefined) continue
    const frame = frameOf(anchor.entry)
    if (frame === null) continue

    const revenueEntry = revenue.get(key)
    const netIncomeEntry = netIncome.get(key)
    const currency =
      (revenueEntry !== undefined && MONETARY_UNIT.test(revenueEntry.unit)
        ? revenueEntry.unit
        : undefined) ??
      (netIncomeEntry !== undefined && MONETARY_UNIT.test(netIncomeEntry.unit)
        ? netIncomeEntry.unit
        : undefined)
    if (currency === undefined) continue

    periods.push({
      label: periodLabel(anchor.entry, frame),
      periodEnd: anchor.entry.end,
      periodStart: anchor.entry.start ?? null,
      frame,
      form: anchor.entry.form,
      revenue: revenueEntry?.entry.val ?? null,
      netIncome: netIncomeEntry?.entry.val ?? null,
      epsDiluted: eps.get(key)?.entry.val ?? null,
      currency,
      filedAt: anchor.entry.filed,
      accessionNumber: anchor.entry.accn ?? null,
      sourceUrl: filingUrl(facts.cik, anchor.entry.accn),
    })
  }

  return periods.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
}

export function companyFactsUrl(cik: string): string {
  return `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`
}

export class SecXbrlProvider implements FundamentalsProvider {
  readonly capabilities = SEC_XBRL_CAPABILITIES

  constructor(
    private readonly userAgent: string,
    private readonly fetchJson: (url: string, userAgent: string) => Promise<unknown> = defaultFetchJson,
  ) {}

  async fetchReportedPeriods(instrument: WatchlistEntry): Promise<readonly ReportedPeriod[]> {
    if (instrument.cik === undefined) {
      throw new ProviderError(
        SEC_XBRL_CAPABILITIES.id,
        `${instrument.ticker} hat keine CIK. Erst den Abdeckungstest laufen lassen.`,
        false,
      )
    }
    const raw = await this.fetchJson(companyFactsUrl(instrument.cik), this.userAgent)
    return extractPeriods(CompanyFactsSchema.parse(raw))
  }
}

async function defaultFetchJson(url: string, userAgent: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
  })
  if (response.status === 403) {
    throw new ProviderError(
      SEC_XBRL_CAPABILITIES.id,
      `403 von ${url}. Die SEC verlangt einen User-Agent mit Kontakt-E-Mail.`,
      false,
    )
  }
  if (!response.ok) {
    throw new ProviderError(
      SEC_XBRL_CAPABILITIES.id,
      `HTTP ${response.status} von ${url}`,
      response.status === 429 || response.status >= 500,
      )
  }
  return response.json()
}

import { z } from 'zod'
import type { CoverageExpectation } from '../domain/instrument'

/**
 * Auswertung der EDGAR-Einreichungsliste. Rein, ohne Netz: die Antwort
 * kommt von aussen herein, damit die Zuordnungsregeln testbar bleiben.
 */

const RecentFilingsSchema = z.object({
  accessionNumber: z.array(z.string()),
  filingDate: z.array(z.string()),
  reportDate: z.array(z.string()).default([]),
  form: z.array(z.string()),
  items: z.array(z.string()).default([]),
})

export const SubmissionsSchema = z.object({
  cik: z.union([z.string(), z.number()]),
  name: z.string(),
  tickers: z.array(z.string()).default([]),
  exchanges: z.array(z.string()).default([]),
  filings: z.object({ recent: RecentFilingsSchema }),
})
export type Submissions = z.infer<typeof SubmissionsSchema>

export const FORMS_OF_INTEREST = ['8-K', '6-K', '10-Q', '10-K', '20-F'] as const
export type FormOfInterest = (typeof FORMS_OF_INTEREST)[number]

/** Item 2.02 ist "Results of Operations and Financial Condition". */
const EARNINGS_ITEM = '2.02'

export interface SubmissionsAnalysis {
  secName: string
  counts: Record<string, number>
  earnings8K: number
  latestEarningsFiling: { form: string; filingDate: string } | null
  /** Termine der Zahlenveroeffentlichungen, juengste zuerst. */
  earningsFilingDates: string[]
  /** true, wenn das Fenster der Schnittstelle nicht bis zum Stichtag reicht. */
  windowTruncated: boolean
  measured: CoverageExpectation
}

export function analyseSubmissions(
  submissions: Submissions,
  cutoff: Date,
): SubmissionsAnalysis {
  const recent = submissions.filings.recent
  const counts: Record<string, number> = Object.fromEntries(
    FORMS_OF_INTEREST.map((form) => [form, 0]),
  )
  let earnings8K = 0
  let latest: { form: string; filingDate: string } | null = null
  const earningsFilingDates: string[] = []
  let oldestSeen: string | null = null

  for (let i = 0; i < recent.form.length; i += 1) {
    const form = recent.form[i]
    const filingDate = recent.filingDate[i]
    if (form === undefined || filingDate === undefined) continue
    oldestSeen = filingDate
    if (new Date(`${filingDate}T00:00:00Z`) < cutoff) continue

    // Nachtraege (8-K/A) zaehlen fuer die Abdeckungsfrage wie das Original.
    const base = form.replace(/\/A$/, '')
    if (!FORMS_OF_INTEREST.includes(base as FormOfInterest)) continue
    counts[base] = (counts[base] ?? 0) + 1

    const items = recent.items[i] ?? ''
    const isEarnings8K = base === '8-K' && items.split(/[,\s]+/).includes(EARNINGS_ITEM)
    if (isEarnings8K) earnings8K += 1

    const carriesNumbers = isEarnings8K || base === '10-Q' || base === '10-K' || base === '20-F'
    if (carriesNumbers) {
      earningsFilingDates.push(filingDate)
      if (latest === null) latest = { form, filingDate }
    }
  }

  const measured: CoverageExpectation =
    (counts['10-Q'] ?? 0) > 0 || earnings8K > 0
      ? 'sec_domestic'
      : (counts['6-K'] ?? 0) > 0 || (counts['20-F'] ?? 0) > 0
        ? 'sec_foreign'
        : 'none'

  return {
    secName: submissions.name,
    counts,
    earnings8K,
    latestEarningsFiling: latest,
    earningsFilingDates,
    windowTruncated: oldestSeen !== null && new Date(`${oldestSeen}T00:00:00Z`) > cutoff,
    measured,
  }
}

export function submissionsUrl(cik: string): string {
  return `https://data.sec.gov/submissions/CIK${cik}.json`
}

import type { RatingAction, RatingChangePayload } from './event'

/**
 * Analystenratings gibt es kostenlos nur als Momentaufnahme, nie als
 * Ereignisstrom. Den Strom erzeugen wir selbst: pollen, gegen den letzten
 * Stand diffen, die Differenz als Ereignis ausgeben. Diese Datei ist der
 * Diff-Teil und bleibt bewusst frei von I/O.
 */
export interface AnalystRating {
  firm: string
  grade: string | null
  priceTarget: number | null
  currency: string | null
}

export interface RatingsSnapshot {
  ticker: string
  provider: string
  fetchedAt: Date
  /** Erwartet neueste Eintraege zuerst, so liefern es die Anbieter. */
  ratings: readonly AnalystRating[]
}

export interface DiffOptions {
  /**
   * Fallengelassene Ratings melden. Standard aus, und das aus einem
   * konkreten Grund: die meisten Free Tiers liefern ein rollierendes
   * Fenster der letzten Wochen. Ein Haus verschwindet daraus, weil sein
   * Rating alt wird, nicht weil es die Abdeckung eingestellt hat. Wer
   * das anschaltet, bekommt regelmaessig falsche Alerts.
   */
  emitDrops?: boolean
}

const GRADE_RANKS: ReadonlyMap<string, number> = new Map([
  ['strong sell', 1],
  ['sell', 2],
  ['underperform', 2],
  ['underweight', 2],
  ['reduce', 2],
  ['hold', 3],
  ['neutral', 3],
  ['market perform', 3],
  ['sector perform', 3],
  ['equal weight', 3],
  ['equalweight', 3],
  ['in line', 3],
  ['peer perform', 3],
  ['buy', 4],
  ['outperform', 4],
  ['overweight', 4],
  ['accumulate', 4],
  ['add', 4],
  ['sector outperform', 4],
  ['strong buy', 5],
  ['conviction buy', 5],
])

export function normalizeGrade(grade: string | null): string | null {
  if (grade === null) return null
  const normalized = grade.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ')
  return normalized.length === 0 ? null : normalized
}

/** null, wenn die Einstufung nicht in der Skala steht. */
export function gradeRank(grade: string | null): number | null {
  const normalized = normalizeGrade(grade)
  if (normalized === null) return null
  return GRADE_RANKS.get(normalized) ?? null
}

export function normalizeFirm(firm: string): string {
  return firm
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
}

function indexByFirm(ratings: readonly AnalystRating[]): Map<string, AnalystRating> {
  const index = new Map<string, AnalystRating>()
  for (const rating of ratings) {
    const key = normalizeFirm(rating.firm)
    // Erster Treffer gewinnt: die Liste kommt neueste Eintraege zuerst.
    if (key.length > 0 && !index.has(key)) index.set(key, rating)
  }
  return index
}

function targetsDiffer(a: AnalystRating, b: AnalystRating): boolean {
  if (a.priceTarget !== b.priceTarget) return true
  return a.priceTarget !== null && a.currency !== b.currency
}

function change(
  firm: string,
  action: RatingAction,
  before: AnalystRating | null,
  after: AnalystRating | null,
): RatingChangePayload {
  return {
    kind: 'rating_change',
    firm,
    action,
    gradeFrom: before?.grade ?? null,
    gradeTo: after?.grade ?? null,
    priceTargetFrom: before?.priceTarget ?? null,
    priceTargetTo: after?.priceTarget ?? null,
    currency: after?.currency ?? before?.currency ?? null,
  }
}

/**
 * Vergleicht zwei Snapshots desselben Titels.
 *
 * Zwei Faelle liefern bewusst nichts zurueck:
 * - Der erste Snapshot ueberhaupt (previous === null). Sonst loest der
 *   Erstlauf fuer jedes bestehende Rating einen Alert aus.
 * - Ein leerer neuer Snapshot. Das ist fast immer ein kaputter Abruf und
 *   nicht der gleichzeitige Rueckzug aller Haeuser.
 */
export function diffRatings(
  previous: RatingsSnapshot | null,
  next: RatingsSnapshot,
  options: DiffOptions = {},
): RatingChangePayload[] {
  if (previous === null) return []
  if (previous.ticker !== next.ticker) {
    throw new Error(`Snapshots verschiedener Titel: ${previous.ticker} vs. ${next.ticker}`)
  }
  if (next.ratings.length === 0) return []

  const before = indexByFirm(previous.ratings)
  const after = indexByFirm(next.ratings)
  const changes: RatingChangePayload[] = []

  for (const [key, current] of after) {
    const earlier = before.get(key)

    if (earlier === undefined) {
      changes.push(change(current.firm, 'initiate', null, current))
      continue
    }

    const earlierGrade = normalizeGrade(earlier.grade)
    const currentGrade = normalizeGrade(current.grade)

    if (earlierGrade !== currentGrade) {
      const earlierRank = gradeRank(earlier.grade)
      const currentRank = gradeRank(current.grade)
      let action: RatingAction = 'change'
      if (earlierRank !== null && currentRank !== null && earlierRank !== currentRank) {
        action = currentRank > earlierRank ? 'upgrade' : 'downgrade'
      }
      changes.push(change(current.firm, action, earlier, current))
      continue
    }

    if (targetsDiffer(earlier, current)) {
      changes.push(change(current.firm, 'price_target', earlier, current))
    }
  }

  if (options.emitDrops === true) {
    for (const [key, earlier] of before) {
      if (!after.has(key)) changes.push(change(earlier.firm, 'drop', earlier, null))
    }
  }

  return changes
}

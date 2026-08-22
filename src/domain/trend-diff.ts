import type { RecommendationTrend } from '../providers/finnhub'
import type { AnalystAction } from './analyst-actions'
import type { RatingAction } from './event'

/**
 * Macht aus zwei Monatsstaenden des Analystenkonsens eine Meldung.
 *
 * Finnhub liefert keine einzelnen Analystenurteile (die sind das
 * bezahlte Produkt der Haeuser), sondern die Verteilung: wie viele
 * raten zu Kauf, Halten, Verkauf. Interessant ist die Veraenderung.
 * Aus ihr wird eine AnalystAction gebaut, damit sie durch dieselbe
 * Leitung laeuft wie alles andere: Erstlauf-Schutz, Deduplizierung,
 * Zustell-Log, Telegram.
 */
export const KONSENS_FIRM = 'Analystenkonsens'

export function trendLabel(trend: RecommendationTrend): string {
  return `Kauf ${trend.strongBuy + trend.buy} · Halten ${trend.hold} · Verkauf ${trend.sell + trend.strongSell}`
}

/** Kaufneigung als eine Zahl, nur fuer die Richtung der Meldung. */
function neigung(trend: RecommendationTrend): number {
  return 2 * trend.strongBuy + trend.buy - trend.sell - 2 * trend.strongSell
}

export function gleicherStand(a: RecommendationTrend, b: RecommendationTrend): boolean {
  return (
    a.period === b.period &&
    a.strongBuy === b.strongBuy &&
    a.buy === b.buy &&
    a.hold === b.hold &&
    a.sell === b.sell &&
    a.strongSell === b.strongSell
  )
}

/**
 * Die Fremd-ID enthaelt die Verteilung selbst. Damit prallt derselbe
 * Stand am Unique-Index ab, eine echte Verschiebung im selben Monat
 * bekommt aber eine neue ID und wird gemeldet.
 */
export function trendActionId(trend: RecommendationTrend): string {
  return [
    'fh-trend',
    trend.ticker,
    trend.period,
    `${trend.strongBuy}-${trend.buy}-${trend.hold}-${trend.sell}-${trend.strongSell}`,
  ].join('|')
}

export function trendToAction(
  vorher: RecommendationTrend | null,
  nachher: RecommendationTrend,
): AnalystAction | null {
  if (vorher !== null && gleicherStand(vorher, nachher)) return null

  let action: RatingAction = 'change'
  if (vorher !== null) {
    const delta = neigung(nachher) - neigung(vorher)
    if (delta > 0) action = 'upgrade'
    else if (delta < 0) action = 'downgrade'
  }

  return {
    sourceEventId: trendActionId(nachher),
    ticker: nachher.ticker,
    firm: KONSENS_FIRM,
    action,
    gradeFrom: vorher === null ? null : trendLabel(vorher),
    gradeTo: trendLabel(nachher),
    occurredAt: new Date(`${nachher.period}-01T00:00:00Z`),
  }
}

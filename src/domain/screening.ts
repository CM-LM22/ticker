/**
 * Verdichtet Kurs- und Berichtszahlen zu einer vergleichbaren Uebersicht.
 *
 * Was das hier ist: eine nachvollziehbare Rangfolge nach offengelegten
 * Kriterien mit offengelegten Gewichten. Jedes Signal zeigt seinen
 * Rohwert, seine Normierung und seine Begruendung an.
 *
 * Was das hier nicht ist: eine Kaufempfehlung. Die Auswahl der Kriterien
 * ist eine Setzung, keine Erkenntnis, und eine Kennzahl aus der
 * Vergangenheit sagt nichts ueber die Zukunft. Die Entscheidung trifft
 * der Mensch vor dem Bildschirm.
 */
import type { FundamentalsSummary } from './fundamentals'
import type { PriceSummary } from './price-series'

export interface SignalValue {
  key: string
  label: string
  /** 0 bedeutet: wird angezeigt, geht aber nicht in die Summe ein. */
  weight: number
  raw: number | null
  /** Auf 0 bis 1 normiert. Null, wenn der Rohwert fehlt. */
  score: number | null
  display: string
  rationale: string
}

export interface ScreenResult {
  ticker: string
  name: string
  signals: readonly SignalValue[]
  /** 0 bis 100, oder null bei zu duenner Datenlage. */
  score: number | null
  /** Anteil des Gewichts, fuer den Daten vorlagen. */
  coverage: number
  missing: readonly string[]
}

export interface ScreenInput {
  ticker: string
  name: string
  price: PriceSummary | null
  fundamentals: FundamentalsSummary | null
}

/**
 * Mindestanteil des Gewichts, der belegt sein muss, damit ueberhaupt
 * eine Punktzahl entsteht.
 *
 * Der Wert ist so gewaehlt, dass ein Titel mit vollstaendiger
 * Kurshistorie und ohne Bilanzzahlen noch eine Punktzahl bekommt: die
 * vier Kurssignale tragen 4 der 9 Gewichtspunkte. Genau dieser Fall
 * betrifft die 16 DAX-Titel ohne SEC-Registrierung. Sie sollen nicht
 * unsichtbar werden, aber ihre halbe Datenbasis muss sichtbar bleiben,
 * deshalb wird `coverage` ueberall mit angezeigt.
 */
export const MIN_COVERAGE = 0.4

export function linearScore(value: number, atZero: number, atOne: number): number {
  if (atOne === atZero) return 0.5
  return Math.min(1, Math.max(0, (value - atZero) / (atOne - atZero)))
}

/** Deutsches Dezimalkomma, damit die Anzeige zum Rest der Oberflaeche passt. */
function de(value: number, digits: number): string {
  return value.toFixed(digits).replace('.', ',').replace('-', '\u2212')
}

function pct(value: number | null, digits = 1): string {
  return value === null ? '—' : `${value >= 0 ? '+' : ''}${de(value, digits)} %`
}

export function buildSignals(input: ScreenInput): SignalValue[] {
  const price = input.price
  const latest = input.fundamentals?.latest ?? null

  const trendPct =
    price?.sma200 != null && price.sma200 > 0
      ? ((price.last.close - price.sma200) / price.sma200) * 100
      : null

  return [
    {
      key: 'momentum12m',
      label: 'Kursentwicklung 12 Monate',
      weight: 2,
      raw: price?.returns['12M'] ?? null,
      score:
        price?.returns['12M'] == null ? null : linearScore(price.returns['12M'], -20, 40),
      display: pct(price?.returns['12M'] ?? null),
      rationale: 'Zwoelfmonatsrendite. Minus 20 Prozent ergibt 0, plus 40 Prozent ergibt 1.',
    },
    {
      key: 'trend',
      label: 'Abstand zum 200-Tage-Schnitt',
      weight: 1,
      raw: trendPct,
      score: trendPct === null ? null : linearScore(trendPct, -10, 15),
      display: pct(trendPct),
      rationale: 'Kurs ueber dem langen Durchschnitt gilt als intakter Trend.',
    },
    {
      key: 'revenueGrowth',
      label: 'Umsatzwachstum zum Vorjahr',
      weight: 2,
      raw: latest?.revenueYoYPct ?? null,
      score: latest?.revenueYoYPct == null ? null : linearScore(latest.revenueYoYPct, -5, 25),
      display: pct(latest?.revenueYoYPct ?? null),
      rationale: 'Juengste Berichtsperiode gegen dieselbe Periode des Vorjahres.',
    },
    {
      key: 'netMargin',
      label: 'Nettomarge',
      weight: 2,
      raw: latest?.netMarginPct ?? null,
      score: latest?.netMarginPct == null ? null : linearScore(latest.netMarginPct, 0, 25),
      display: latest?.netMarginPct == null ? '—' : `${de(latest.netMarginPct, 1)} %`,
      rationale: 'Nettoergebnis geteilt durch Umsatz der juengsten Periode.',
    },
    {
      key: 'marginTrend',
      label: 'Margenveraenderung',
      weight: 1,
      raw: latest?.marginDeltaPp ?? null,
      score: latest?.marginDeltaPp == null ? null : linearScore(latest.marginDeltaPp, -4, 4),
      display:
        latest?.marginDeltaPp == null
          ? '—'
          : `${latest.marginDeltaPp >= 0 ? '+' : ''}${de(latest.marginDeltaPp, 1)} pp`,
      rationale: 'Nettomarge gegen Vorjahr, in Prozentpunkten.',
    },
    {
      key: 'stability',
      label: 'Schwankung (invers)',
      weight: 1,
      raw: price?.volatilityPct ?? null,
      // Niedrige Schwankung bekommt die hoehere Punktzahl.
      score: price?.volatilityPct == null ? null : linearScore(price.volatilityPct, 60, 15),
      display: price?.volatilityPct == null ? '—' : `${de(price.volatilityPct, 0)} %`,
      rationale: 'Annualisierte Schwankung. 60 Prozent ergibt 0, 15 Prozent ergibt 1.',
    },
    {
      key: 'positionInRange',
      label: 'Position im 52-Wochen-Band',
      weight: 0,
      raw: price?.positionInRange == null ? null : price.positionInRange * 100,
      score: null,
      display:
        price?.positionInRange == null ? '—' : `${de(price.positionInRange * 100, 0)} %`,
      rationale:
        'Nur zur Einordnung, bewusst ohne Gewicht: nah am Hoch kann Staerke sein oder ein teurer Einstieg, nah am Tief ein Schnaeppchen oder ein Warnzeichen.',
    },
    {
      key: 'drawdown',
      label: 'Abstand zum 52-Wochen-Hoch',
      weight: 0,
      raw: price?.drawdownFromHighPct ?? null,
      score: null,
      display: pct(price?.drawdownFromHighPct ?? null),
      rationale: 'Nur zur Einordnung, aus demselben Grund ohne Gewicht.',
    },
  ]
}

export function screen(input: ScreenInput): ScreenResult {
  const signals = buildSignals(input)
  const weighted = signals.filter((signal) => signal.weight > 0)

  const totalWeight = weighted.reduce((sum, signal) => sum + signal.weight, 0)
  const availableWeight = weighted
    .filter((signal) => signal.score !== null)
    .reduce((sum, signal) => sum + signal.weight, 0)
  const coverage = totalWeight === 0 ? 0 : availableWeight / totalWeight

  // Fehlende Daten werden nicht als Null gewertet. Ein Titel ohne
  // Bilanzzahlen ist kein schlechter Titel, sondern ein unbekannter.
  const score =
    coverage < MIN_COVERAGE || availableWeight === 0
      ? null
      : (weighted
          .filter((signal) => signal.score !== null)
          .reduce((sum, signal) => sum + signal.weight * (signal.score ?? 0), 0) /
          availableWeight) *
        100

  return {
    ticker: input.ticker,
    name: input.name,
    signals,
    score,
    coverage,
    missing: weighted.filter((signal) => signal.score === null).map((signal) => signal.label),
  }
}

/** Absteigend nach Punktzahl. Titel ohne Punktzahl stehen hinten. */
export function rank(results: readonly ScreenResult[]): ScreenResult[] {
  return [...results].sort((a, b) => {
    if (a.score === null && b.score === null) return a.ticker.localeCompare(b.ticker)
    if (a.score === null) return 1
    if (b.score === null) return -1
    return b.score - a.score
  })
}

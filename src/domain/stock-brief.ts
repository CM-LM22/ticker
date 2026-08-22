import type { EarningsEstimate } from './earnings-estimate'
import { compare } from './fundamentals'
import type { FundamentalsSummary } from './fundamentals'
import type { WatchlistEntry } from './instrument'
import type { PriceSummary } from './price-series'
import type { ScreenResult } from './screening'
import type { RecommendationTrend } from '../providers/finnhub'

/**
 * Der Ein-Seiten-Bericht je Titel: alles, was man wissen muss, ohne den
 * Geschaeftsbericht zu lesen. Rein und ohne I/O; die PDF- und die
 * HTML-Darstellung lesen beide aus dieser einen Quelle.
 *
 * Zwei Grundsaetze, die hier Code sind:
 * - Die Einstufung ist regelbasiert und legt ihre Gruende offen. Sie
 *   ist eine Verdichtung der Signale, keine Anlageberatung, und sie
 *   sagt dazu, auf wie viel Datenbasis sie steht.
 * - Der Ausblick ist datenbasiert: Richtung von Umsatz und Marge ueber
 *   die letzten Quartale, Bewegung des Analystenkonsens, geschaetzter
 *   naechster Termin. Was das Management schreibt, steht im verlinkten
 *   Originalbericht; Prosa erfinden wir nicht.
 */

export type Einstufung = 'stark' | 'solide' | 'neutral' | 'schwach' | 'kritisch'

export const EINSTUFUNG_SATZ: Record<Einstufung, string> = {
  stark: 'Nach den offengelegten Regeln eines der staerksten Bilder der Watchlist.',
  solide: 'Mehr Staerken als Schwaechen nach den offengelegten Regeln.',
  neutral: 'Staerken und Schwaechen halten sich in etwa die Waage.',
  schwach: 'Mehr Schwaechen als Staerken nach den offengelegten Regeln.',
  kritisch: 'Fast alle Regeln schlagen negativ aus.',
}

export function einstufungFor(score: number | null): Einstufung | null {
  if (score === null) return null
  if (score >= 75) return 'stark'
  if (score >= 60) return 'solide'
  if (score >= 45) return 'neutral'
  if (score >= 30) return 'schwach'
  return 'kritisch'
}

export interface QuartalsZeile {
  label: string
  frame: 'quarter' | 'year'
  currency: string
  revenue: number | null
  revenueYoYPct: number | null
  netIncome: number | null
  netIncomeYoYPct: number | null
  margePct: number | null
}

export type Richtung = 'steigend' | 'ruecklaeufig' | 'seitwaerts'

export interface KonsensStand {
  period: string
  kauf: number
  halten: number
  verkauf: number
  /** Veraenderung der Kaufstimmen zum Vormonat, null ohne Vergleich. */
  deltaKauf: number | null
}

export interface StockBrief {
  ticker: string
  name: string
  venue: WatchlistEntry['venue']
  price: PriceSummary | null
  quartale: QuartalsZeile[]
  jahr: QuartalsZeile | null
  konsens: KonsensStand | null
  einstufung: Einstufung | null
  einstufungSatz: string
  punkte: number | null
  datenbasisPct: number
  staerken: string[]
  schwaechen: string[]
  ausblick: string[]
  /** Link zum juengsten Originalbericht bei EDGAR, wenn vorhanden. */
  quelleUrl: string | null
  luecken: string[]
}

export interface StockBriefInput {
  entry: WatchlistEntry
  price: PriceSummary | null
  fundamentals: FundamentalsSummary | null
  earnings: EarningsEstimate | null
  screen: ScreenResult
  konsensAktuell: RecommendationTrend | null
  konsensVormonat: RecommendationTrend | null
}

function zeileAus(
  summary: FundamentalsSummary,
  periodEnd: string,
  frame: 'quarter' | 'year',
): QuartalsZeile | null {
  const period = summary.periods.find(
    (kandidat) => kandidat.periodEnd === periodEnd && kandidat.frame === frame,
  )
  if (period === undefined) return null
  // Vergleich gegen den ganzen Bestand, damit die Vorjahreslogik
  // (gleicher Zeitraster, Toleranzfenster) an einer Stelle bleibt.
  const vergleich = compareLocal(summary, period.periodEnd, frame)
  return {
    label: period.label,
    frame,
    currency: period.currency,
    revenue: period.revenue,
    revenueYoYPct: vergleich?.revenueYoYPct ?? null,
    netIncome: period.netIncome,
    netIncomeYoYPct: vergleich?.netIncomeYoYPct ?? null,
    margePct:
      period.revenue !== null && period.revenue > 0 && period.netIncome !== null
        ? (period.netIncome / period.revenue) * 100
        : null,
  }
}

function compareLocal(summary: FundamentalsSummary, periodEnd: string, frame: 'quarter' | 'year') {
  const period = summary.periods.find(
    (kandidat) => kandidat.periodEnd === periodEnd && kandidat.frame === frame,
  )
  if (period === undefined) return null
  return compare(period, summary.periods)
}

export function richtung(
  erster: number,
  letzter: number,
  schwellePct: number,
): Richtung {
  if (erster === 0) return 'seitwaerts'
  const deltaPct = ((letzter - erster) / Math.abs(erster)) * 100
  if (deltaPct > schwellePct) return 'steigend'
  if (deltaPct < -schwellePct) return 'ruecklaeufig'
  return 'seitwaerts'
}

const RICHTUNG_WORT: Record<Richtung, string> = {
  steigend: 'steigend',
  ruecklaeufig: 'ruecklaeufig',
  seitwaerts: 'seitwaerts',
}

const KONFIDENZ_WORT: Record<EarningsEstimate['confidence'], string> = {
  hoch: 'hohe',
  mittel: 'mittlere',
  niedrig: 'niedrige',
}

function formatTag(day: string): string {
  const [jahr, monat, tag] = day.split('-')
  return `${tag}.${monat}.${jahr}`
}

/** Datenbasierter Ausblick. Jede Zeile nennt, worauf sie beruht. */
export function ausblickZeilen(input: {
  quartale: readonly QuartalsZeile[]
  konsens: KonsensStand | null
  earnings: EarningsEstimate | null
}): string[] {
  const zeilen: string[] = []

  const mitUmsatz = input.quartale.filter((zeile) => zeile.revenue !== null)
  if (mitUmsatz.length >= 2) {
    // quartale kommen neueste zuerst; fuer die Richtung chronologisch lesen.
    const chronologisch = [...mitUmsatz].reverse()
    const ersterUmsatz = chronologisch[0]?.revenue ?? 0
    const letzterUmsatz = chronologisch[chronologisch.length - 1]?.revenue ?? 0
    zeilen.push(
      `Umsatz ueber die letzten ${mitUmsatz.length} Quartale ${RICHTUNG_WORT[richtung(ersterUmsatz, letzterUmsatz, 2)]}.`,
    )

    const mitMarge = chronologisch.filter((zeile) => zeile.margePct !== null)
    const ersteMarge = mitMarge[0]?.margePct
    const letzteMarge = mitMarge[mitMarge.length - 1]?.margePct
    if (mitMarge.length >= 2 && ersteMarge != null && letzteMarge != null) {
      const deltaPp = letzteMarge - ersteMarge
      const wort =
        deltaPp > 0.5 ? 'verbessert sich' : deltaPp < -0.5 ? 'gibt nach' : 'bleibt stabil'
      zeilen.push(
        `Nettomarge ${wort} (${ersteMarge.toFixed(1).replace('.', ',')} auf ${letzteMarge.toFixed(1).replace('.', ',')} Prozent).`,
      )
    }
  } else {
    zeilen.push('Zu wenige Berichtsperioden fuer eine Trendaussage.')
  }

  if (input.konsens !== null) {
    if (input.konsens.deltaKauf === null) {
      zeilen.push(
        `Analystenkonsens ${input.konsens.period}: ${input.konsens.kauf} Kauf, ${input.konsens.halten} Halten, ${input.konsens.verkauf} Verkauf (kein Vormonatsvergleich).`,
      )
    } else if (input.konsens.deltaKauf > 0) {
      zeilen.push(
        `Analystenkonsens verschiebt sich Richtung Kauf (+${input.konsens.deltaKauf} Stimmen zum Vormonat).`,
      )
    } else if (input.konsens.deltaKauf < 0) {
      zeilen.push(
        `Analystenkonsens verschiebt sich weg vom Kauf (${input.konsens.deltaKauf} Stimmen zum Vormonat).`,
      )
    } else {
      zeilen.push('Analystenkonsens zum Vormonat unveraendert.')
    }
  }

  if (input.earnings !== null) {
    zeilen.push(
      `Naechste Zahlen voraussichtlich am ${formatTag(input.earnings.expected)} (Schaetzung aus dem Einreichungsrhythmus, ${KONFIDENZ_WORT[input.earnings.confidence]} Treffsicherheit).`,
    )
  }

  if (zeilen.length === 0) zeilen.push('Keine belastbaren Daten fuer einen Ausblick.')
  return zeilen
}

export function buildStockBrief(input: StockBriefInput): StockBrief {
  const luecken: string[] = []
  if (input.price === null) luecken.push('Keine Kurse vorhanden.')
  if (input.fundamentals === null) {
    luecken.push(
      input.entry.expectedCoverage === 'none'
        ? 'Keine Berichtszahlen: nicht bei der SEC registriert, ESEF-Jahresbericht noch nicht geholt.'
        : 'Berichtszahlen noch nicht abgerufen.',
    )
  }
  if (input.konsensAktuell === null) luecken.push('Kein Analystenkonsens verfuegbar.')

  // Die letzten vier Quartale plus das juengste Geschaeftsjahr.
  const quartale: QuartalsZeile[] = []
  let jahr: QuartalsZeile | null = null
  if (input.fundamentals !== null) {
    for (const period of input.fundamentals.periods) {
      if (period.frame === 'quarter' && quartale.length < 4) {
        const zeile = zeileAus(input.fundamentals, period.periodEnd, 'quarter')
        if (zeile !== null) quartale.push(zeile)
      }
      if (period.frame === 'year' && jahr === null) {
        jahr = zeileAus(input.fundamentals, period.periodEnd, 'year')
      }
    }
  }

  const konsens: KonsensStand | null =
    input.konsensAktuell === null
      ? null
      : {
          period: input.konsensAktuell.period,
          kauf: input.konsensAktuell.strongBuy + input.konsensAktuell.buy,
          halten: input.konsensAktuell.hold,
          verkauf: input.konsensAktuell.sell + input.konsensAktuell.strongSell,
          deltaKauf:
            input.konsensVormonat === null
              ? null
              : input.konsensAktuell.strongBuy +
                input.konsensAktuell.buy -
                (input.konsensVormonat.strongBuy + input.konsensVormonat.buy),
        }

  const gewichtet = input.screen.signals.filter((signal) => signal.weight > 0)
  const staerken = gewichtet
    .filter((signal) => signal.score !== null && signal.score >= 2 / 3)
    .slice(0, 3)
    .map((signal) => `${signal.label}: ${signal.display}`)
  const schwaechen = gewichtet
    .filter((signal) => signal.score !== null && signal.score <= 1 / 3)
    .slice(0, 3)
    .map((signal) => `${signal.label}: ${signal.display}`)

  const einstufung = einstufungFor(input.screen.score)

  return {
    ticker: input.entry.ticker,
    name: input.entry.name,
    venue: input.entry.venue,
    price: input.price,
    quartale,
    jahr,
    konsens,
    einstufung,
    einstufungSatz:
      einstufung === null
        ? 'Zu wenig Daten fuer eine Einstufung.'
        : EINSTUFUNG_SATZ[einstufung],
    punkte: input.screen.score,
    datenbasisPct: input.screen.coverage * 100,
    staerken,
    schwaechen,
    ausblick: ausblickZeilen({ quartale, konsens, earnings: input.earnings }),
    quelleUrl:
      input.fundamentals?.latest?.period.sourceUrl ??
      input.fundamentals?.periods[0]?.sourceUrl ??
      null,
    luecken,
  }
}

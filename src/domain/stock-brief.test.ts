import { describe, expect, it } from 'vitest'
import type { EarningsEstimate } from './earnings-estimate'
import type { FundamentalsSummary, ReportedPeriod } from './fundamentals'
import type { WatchlistEntry } from './instrument'
import type { PriceSummary } from './price-series'
import type { ScreenResult, SignalValue } from './screening'
import {
  ausblickZeilen,
  buildStockBrief,
  einstufungFor,
  richtung,
} from './stock-brief'
import type { QuartalsZeile } from './stock-brief'
import type { RecommendationTrend } from '../providers/finnhub'

function periode(overrides: Partial<ReportedPeriod>): ReportedPeriod {
  return {
    label: 'Q2 2026',
    periodEnd: '2026-06-30',
    periodStart: '2026-04-01',
    frame: 'quarter',
    form: '10-Q',
    revenue: 1000,
    netIncome: 100,
    epsDiluted: 1,
    currency: 'USD',
    filedAt: '2026-07-30',
    accessionNumber: null,
    sourceUrl: 'https://www.sec.gov/beispiel',
    ...overrides,
  }
}

/** Acht Quartale mit wachsendem Umsatz plus zwei Geschaeftsjahre. */
function fundamentals(): FundamentalsSummary {
  const quartale: ReportedPeriod[] = []
  for (let index = 0; index < 8; index += 1) {
    const jahr = 2026 - Math.floor(index / 4)
    const quartal = 2 - index // laeuft rueckwaerts durch die Stichtage
    const monat = [6, 3, 12, 9][((quartal % 4) + 4) % 4] ?? 6
    const ende = `${quartal <= 0 ? jahr - 1 : jahr}-${String(monat).padStart(2, '0')}-28`
    quartale.push(
      periode({
        label: `P${index}`,
        periodEnd: ende,
        revenue: 1000 - index * 50, // neueste zuerst: chronologisch steigend
        netIncome: 100 - index * 10,
      }),
    )
  }
  const jahre = [
    periode({ label: 'GJ 2025', periodEnd: '2025-12-28', frame: 'year', form: '10-K', revenue: 3800, netIncome: 350 }),
    periode({ label: 'GJ 2024', periodEnd: '2024-12-28', frame: 'year', form: '10-K', revenue: 3500, netIncome: 300 }),
  ]
  const periods = [...quartale.slice(0, 2), ...jahre.slice(0, 1), ...quartale.slice(2), ...jahre.slice(1)]
  return {
    ticker: 'TEST',
    currency: 'USD',
    periods,
    latest: null,
    latestYear: null,
    warnings: [],
  }
}

function signal(overrides: Partial<SignalValue>): SignalValue {
  return {
    key: 'k',
    label: 'Signal',
    weight: 1,
    raw: 1,
    score: 0.5,
    display: 'Wert',
    rationale: '',
    ...overrides,
  }
}

function screenResult(overrides: Partial<ScreenResult>): ScreenResult {
  return {
    ticker: 'TEST',
    name: 'Testwerk AG',
    signals: [],
    score: 55,
    coverage: 0.8,
    missing: [],
    ...overrides,
  }
}

function entry(overrides: Partial<WatchlistEntry> = {}): WatchlistEntry {
  return {
    ticker: 'TEST',
    name: 'Testwerk AG',
    venue: 'NASDAQ',
    expectedCoverage: 'sec_domestic',
    ...overrides,
  } as WatchlistEntry
}

function trend(overrides: Partial<RecommendationTrend>): RecommendationTrend {
  return {
    ticker: 'TEST',
    period: '2026-08',
    strongBuy: 5,
    buy: 10,
    hold: 8,
    sell: 2,
    strongSell: 1,
    ...overrides,
  }
}

function zeile(overrides: Partial<QuartalsZeile>): QuartalsZeile {
  return {
    label: 'Q',
    frame: 'quarter',
    currency: 'USD',
    revenue: 100,
    revenueYoYPct: null,
    netIncome: 10,
    netIncomeYoYPct: null,
    margePct: 10,
    ...overrides,
  }
}

describe('einstufungFor', () => {
  it('bildet die Schwellen 75/60/45/30 ab', () => {
    expect(einstufungFor(90)).toBe('stark')
    expect(einstufungFor(75)).toBe('stark')
    expect(einstufungFor(74.9)).toBe('solide')
    expect(einstufungFor(60)).toBe('solide')
    expect(einstufungFor(59)).toBe('neutral')
    expect(einstufungFor(45)).toBe('neutral')
    expect(einstufungFor(44)).toBe('schwach')
    expect(einstufungFor(30)).toBe('schwach')
    expect(einstufungFor(29)).toBe('kritisch')
    expect(einstufungFor(0)).toBe('kritisch')
  })

  it('gibt null ohne Punktzahl zurueck', () => {
    expect(einstufungFor(null)).toBeNull()
  })
})

describe('richtung', () => {
  it('erkennt steigend, ruecklaeufig und seitwaerts an der Schwelle', () => {
    expect(richtung(100, 103, 2)).toBe('steigend')
    expect(richtung(100, 97, 2)).toBe('ruecklaeufig')
    expect(richtung(100, 101, 2)).toBe('seitwaerts')
    expect(richtung(100, 102, 2)).toBe('seitwaerts') // exakt auf der Schwelle
  })

  it('bleibt bei Basis null seitwaerts statt zu dividieren', () => {
    expect(richtung(0, 50, 2)).toBe('seitwaerts')
  })
})

describe('ausblickZeilen', () => {
  it('liest die Umsatzrichtung chronologisch, obwohl neueste zuerst kommen', () => {
    const quartale = [
      zeile({ revenue: 120 }), // neuestes Quartal
      zeile({ revenue: 110 }),
      zeile({ revenue: 100 }), // aeltestes
    ]
    const zeilen = ausblickZeilen({ quartale, konsens: null, earnings: null })
    expect(zeilen[0]).toContain('steigend')
    expect(zeilen[0]).toContain('3 Quartale')
  })

  it('meldet zu wenige Perioden bei weniger als zwei Umsatzwerten', () => {
    const zeilen = ausblickZeilen({
      quartale: [zeile({ revenue: 100 })],
      konsens: null,
      earnings: null,
    })
    expect(zeilen[0]).toContain('Zu wenige Berichtsperioden')
  })

  it('beschreibt die Margenbewegung nur ausserhalb von 0,5 Punkten', () => {
    const stabil = ausblickZeilen({
      quartale: [zeile({ margePct: 10.3 }), zeile({ margePct: 10 })],
      konsens: null,
      earnings: null,
    })
    expect(stabil.join(' ')).toContain('bleibt stabil')

    const besser = ausblickZeilen({
      quartale: [zeile({ revenue: 120, margePct: 12 }), zeile({ revenue: 100, margePct: 10 })],
      konsens: null,
      earnings: null,
    })
    expect(besser.join(' ')).toContain('verbessert sich')
  })

  it('nennt die Konsensverschiebung mit Vorzeichen', () => {
    const hoch = ausblickZeilen({
      quartale: [],
      konsens: { period: '2026-08', kauf: 15, halten: 8, verkauf: 3, deltaKauf: 2 },
      earnings: null,
    })
    expect(hoch.join(' ')).toContain('Richtung Kauf (+2')

    const runter = ausblickZeilen({
      quartale: [],
      konsens: { period: '2026-08', kauf: 15, halten: 8, verkauf: 3, deltaKauf: -1 },
      earnings: null,
    })
    expect(runter.join(' ')).toContain('weg vom Kauf (-1')

    const ohneVergleich = ausblickZeilen({
      quartale: [],
      konsens: { period: '2026-08', kauf: 15, halten: 8, verkauf: 3, deltaKauf: null },
      earnings: null,
    })
    expect(ohneVergleich.join(' ')).toContain('kein Vormonatsvergleich')
  })

  it('formatiert den erwarteten Termin deutsch mit Treffsicherheit', () => {
    const earnings: EarningsEstimate = {
      expected: '2026-10-22',
      earliest: '2026-10-15',
      latest: '2026-10-29',
      periodicity: 'quarterly',
      basis: 8,
      medianGapDays: 91,
      medianErrorDays: 4,
      confidence: 'hoch',
    }
    const zeilen = ausblickZeilen({ quartale: [], konsens: null, earnings })
    expect(zeilen.join(' ')).toContain('22.10.2026')
    expect(zeilen.join(' ')).toContain('hohe Treffsicherheit')
  })
})

describe('buildStockBrief', () => {
  it('sammelt hoechstens vier Quartale und das juengste Geschaeftsjahr', () => {
    const brief = buildStockBrief({
      entry: entry(),
      price: null,
      fundamentals: fundamentals(),
      earnings: null,
      screen: screenResult({}),
      konsensAktuell: null,
      konsensVormonat: null,
    })
    expect(brief.quartale).toHaveLength(4)
    expect(brief.jahr?.label).toBe('GJ 2025')
    expect(brief.jahr?.frame).toBe('year')
    expect(brief.quelleUrl).toBe('https://www.sec.gov/beispiel')
  })

  it('rechnet Konsens auf Kauf/Halten/Verkauf herunter und bildet deltaKauf', () => {
    const brief = buildStockBrief({
      entry: entry(),
      price: null,
      fundamentals: null,
      earnings: null,
      screen: screenResult({}),
      konsensAktuell: trend({ strongBuy: 5, buy: 10 }),
      konsensVormonat: trend({ period: '2026-07', strongBuy: 4, buy: 9 }),
    })
    expect(brief.konsens).toEqual({
      period: '2026-08',
      kauf: 15,
      halten: 8,
      verkauf: 3,
      deltaKauf: 2,
    })
  })

  it('nimmt nur gewichtete Signale als Staerken und Schwaechen, je hoechstens drei', () => {
    const brief = buildStockBrief({
      entry: entry(),
      price: null,
      fundamentals: null,
      earnings: null,
      screen: screenResult({
        signals: [
          signal({ key: 'a', label: 'A', score: 1, display: 'gut' }),
          signal({ key: 'b', label: 'B', score: 0.9, display: 'gut' }),
          signal({ key: 'c', label: 'C', score: 0.8, display: 'gut' }),
          signal({ key: 'd', label: 'D', score: 0.7, display: 'gut' }),
          signal({ key: 'info', label: 'Info', weight: 0, score: 1, display: 'zaehlt nicht' }),
          signal({ key: 'x', label: 'X', score: 0, display: 'schlecht' }),
          signal({ key: 'ohne', label: 'Ohne', score: null, display: '—' }),
        ],
      }),
      konsensAktuell: null,
      konsensVormonat: null,
    })
    expect(brief.staerken).toEqual(['A: gut', 'B: gut', 'C: gut'])
    expect(brief.schwaechen).toEqual(['X: schlecht'])
  })

  it('benennt Luecken je nach erwarteter Abdeckung', () => {
    const ohneSec = buildStockBrief({
      entry: entry({ ticker: 'SIE', venue: 'XETRA', expectedCoverage: 'none' }),
      price: null,
      fundamentals: null,
      earnings: null,
      screen: screenResult({ score: null, coverage: 0.2 }),
      konsensAktuell: null,
      konsensVormonat: null,
    })
    expect(ohneSec.luecken).toContain('Keine Kurse vorhanden.')
    expect(ohneSec.luecken.join(' ')).toContain('nicht bei der SEC registriert')
    expect(ohneSec.einstufung).toBeNull()
    expect(ohneSec.einstufungSatz).toContain('Zu wenig Daten')

    const nochNicht = buildStockBrief({
      entry: entry(),
      price: null,
      fundamentals: null,
      earnings: null,
      screen: screenResult({}),
      konsensAktuell: null,
      konsensVormonat: null,
    })
    expect(nochNicht.luecken.join(' ')).toContain('noch nicht abgerufen')
  })
})

import { describe, expect, it } from 'vitest'
import {
  esefFilingsUrl,
  extrahiereFakten,
  extrahiereLagebericht,
  extraherePerioden,
  parseEsefFilings,
} from './esef'
import { gleifUrl, parseLeiRecord } from './gleif'

describe('gleif', () => {
  it('baut die ISIN-Filter-URL', () => {
    expect(gleifUrl('DE0007236101')).toBe(
      'https://api.gleif.org/api/v1/lei-records?filter%5Bisin%5D=DE0007236101',
    )
  })

  it('liest LEI und Namen aus der Antwort', () => {
    const record = parseLeiRecord({
      data: [
        {
          attributes: {
            lei: 'W38RGI023J3WT1HWRP32',
            entity: { legalName: { name: 'Siemens Aktiengesellschaft' } },
          },
        },
      ],
    })
    expect(record).toEqual({ lei: 'W38RGI023J3WT1HWRP32', name: 'Siemens Aktiengesellschaft' })
  })

  it('liefert null bei leerer Antwort oder kaputter LEI', () => {
    expect(parseLeiRecord({ data: [] })).toBeNull()
    expect(parseLeiRecord({ data: [{ attributes: { lei: 'zu-kurz' } }] })).toBeNull()
  })
})

describe('parseEsefFilings', () => {
  it('liest Einreichungen mit absoluten URLs', () => {
    const filings = parseEsefFilings({
      data: [
        {
          attributes: {
            period_end: '2025-09-30',
            date_added: '2025-12-05T10:00:00',
            json_url: '/W38RGI023J3WT1HWRP32/2025-09-30/ESEF/DE/0/bericht.json',
            report_url: '/W38RGI023J3WT1HWRP32/2025-09-30/ESEF/DE/0/bericht.xhtml',
            viewer_url: null,
          },
        },
        { attributes: { period_end: 'kaputt' } },
      ],
    })
    expect(filings).toHaveLength(1)
    expect(filings[0]?.periodEnd).toBe('2025-09-30')
    expect(filings[0]?.jsonUrl).toBe(
      'https://filings.xbrl.org/W38RGI023J3WT1HWRP32/2025-09-30/ESEF/DE/0/bericht.json',
    )
    expect(filings[0]?.dateAdded).toBe('2025-12-05')
  })

  it('enthaelt den LEI-Filter in der URL', () => {
    const url = esefFilingsUrl('W38RGI023J3WT1HWRP32')
    expect(url).toContain('entity.identifier')
    expect(url).toContain('W38RGI023J3WT1HWRP32')
    expect(url).toContain('sort=-period_end')
  })
})

function beispielXbrlJson(): unknown {
  return {
    facts: {
      f1: {
        value: '77769000000',
        dimensions: {
          concept: 'ifrs-full:Revenue',
          entity: 'scheme:W38RGI023J3WT1HWRP32',
          period: '2024-10-01T00:00:00/2025-10-01T00:00:00',
          unit: 'iso4217:EUR',
        },
      },
      f2: {
        value: '9027000000',
        dimensions: {
          concept: 'ifrs-full:ProfitLoss',
          entity: 'scheme:W38RGI023J3WT1HWRP32',
          period: '2024-10-01T00:00:00/2025-10-01T00:00:00',
          unit: 'iso4217:EUR',
        },
      },
      f3: {
        // Vorjahresvergleich aus derselben Einreichung.
        value: '75930000000',
        dimensions: {
          concept: 'ifrs-full:Revenue',
          entity: 'scheme:W38RGI023J3WT1HWRP32',
          period: '2023-10-01T00:00:00/2024-10-01T00:00:00',
          unit: 'iso4217:EUR',
        },
      },
      f4: {
        // Segmentwert mit Zusatzdimension: darf nicht einfliessen.
        value: '20000000000',
        dimensions: {
          concept: 'ifrs-full:Revenue',
          entity: 'scheme:W38RGI023J3WT1HWRP32',
          period: '2024-10-01T00:00:00/2025-10-01T00:00:00',
          unit: 'iso4217:EUR',
          'ifrs-full:SegmentsAxis': 'sie:IndustrieMember',
        },
      },
      f5: {
        // Quartalszeitraum: faellt aus dem Jahresfilter.
        value: '19000000000',
        dimensions: {
          concept: 'ifrs-full:Revenue',
          entity: 'scheme:W38RGI023J3WT1HWRP32',
          period: '2025-07-01T00:00:00/2025-10-01T00:00:00',
          unit: 'iso4217:EUR',
        },
      },
    },
  }
}

describe('extrahiereFakten und extraherePerioden', () => {
  it('nimmt nur Konzernsummen und rechnet das exklusive Periodenende um', () => {
    const fakten = extrahiereFakten(beispielXbrlJson())
    const umsatz = fakten.find(
      (fakt) => fakt.concept === 'ifrs-full:Revenue' && fakt.periodEnd === '2025-09-30',
    )
    expect(umsatz?.wert).toBe(77_769_000_000)
    expect(fakten.some((fakt) => fakt.wert === 20_000_000_000)).toBe(false)
  })

  it('baut Jahresperioden mit Vorjahresvergleich aus einer Einreichung', () => {
    const perioden = extraherePerioden(beispielXbrlJson(), {
      filedAt: '2025-12-05',
      sourceUrl: 'https://filings.xbrl.org/x/bericht.xhtml',
    })
    expect(perioden).toHaveLength(2)
    expect(perioden[0]).toMatchObject({
      label: 'GJ 2025',
      periodEnd: '2025-09-30',
      frame: 'year',
      form: 'ESEF',
      revenue: 77_769_000_000,
      netIncome: 9_027_000_000,
      currency: 'EUR',
    })
    expect(perioden[1]?.periodEnd).toBe('2024-09-30')
    expect(perioden[1]?.netIncome).toBeNull()
  })
})

describe('extrahiereLagebericht', () => {
  it('findet den Wirtschaftsbericht und ueberspringt Inhaltsverzeichnis-Treffer', () => {
    const satz =
      'Der Konzernumsatz stieg im Geschaeftsjahr 2025 um 6,2 Prozent auf 77,8 Milliarden Euro, getragen von einem starken Wachstum der Softwareerloese und einem robusten Servicegeschaeft in allen Regionen der Welt. '
    const text = [
      'Inhalt',
      'Wirtschaftsbericht 45', // Inhaltsverzeichnis
      'Kurzzeile',
      'Wirtschaftsbericht',
      satz + satz,
      satz,
    ].join('\n')
    const auszug = extrahiereLagebericht(text)
    expect(auszug).not.toBeNull()
    expect(auszug).toContain('Konzernumsatz stieg')
  })

  it('liefert null ohne einschlaegige Ueberschrift', () => {
    expect(extrahiereLagebericht('Ein Dokument ohne die gesuchten Abschnitte.')).toBeNull()
  })
})

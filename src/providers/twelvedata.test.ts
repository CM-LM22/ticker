import { describe, expect, it } from 'vitest'
import { TwelveDataPriceProvider, parseTwelveDataSeries, twelveDataUrl } from './twelvedata'
import { ProviderError } from './types'

const antwort = {
  meta: { symbol: 'AAPL', currency: 'USD' },
  values: [
    { datetime: '2026-08-21', open: '228.80', high: '230.00', low: '227.20', close: '229.10' },
    { datetime: '2026-08-20', open: '226.50', high: '229.10', low: '226.10', close: '228.75' },
  ],
  status: 'ok',
}

describe('twelveDataUrl', () => {
  it('adressiert US-Titel ohne Boersenangabe', () => {
    const url = twelveDataUrl({ ticker: 'AAPL', venue: 'NASDAQ' }, 'geheim', 420)
    expect(url).toContain('symbol=AAPL')
    expect(url).not.toContain('exchange=')
  })

  it('adressiert XETRA ueber das MIC-Kuerzel', () => {
    expect(twelveDataUrl({ ticker: 'SAP', venue: 'XETRA' }, 'geheim', 420)).toContain('exchange=XETR')
  })
})

describe('parseTwelveDataSeries', () => {
  it('liest Kurse und sortiert aufsteigend', () => {
    // Der Anbieter liefert neueste zuerst, die Domaene erwartet das Gegenteil.
    const series = parseTwelveDataSeries(antwort, { ticker: 'AAPL', currency: 'USD' })
    expect(series.bars.map((bar) => bar.date)).toEqual(['2026-08-20', '2026-08-21'])
    expect(series.bars[1]?.close).toBe(229.1)
  })

  it('wandelt die Zeichenketten des Anbieters in Zahlen', () => {
    const series = parseTwelveDataSeries(antwort, { ticker: 'AAPL', currency: 'USD' })
    expect(typeof series.bars[0]?.open).toBe('number')
  })

  it('uebernimmt die Waehrung des Anbieters', () => {
    const eur = { ...antwort, meta: { symbol: 'SAP', currency: 'EUR' } }
    expect(parseTwelveDataSeries(eur, { ticker: 'SAP', currency: 'USD' }).currency).toBe('EUR')
  })

  it('erkennt die Fehlerantwort, die mit HTTP 200 kommt', () => {
    // Twelve Data meldet auch Fehler mit Status 200 im Rumpf.
    const fehler = { status: 'error', code: 401, message: 'Ungueltiger Schluessel' }
    expect(() => parseTwelveDataSeries(fehler, { ticker: 'AAPL', currency: 'USD' })).toThrow(
      /Ungueltiger Schluessel/,
    )
  })

  it('haelt das Minutenlimit fuer wiederholbar, einen falschen Schluessel nicht', () => {
    const wiederholbar = { status: 'error', code: 429, message: 'zu viele Anfragen' }
    const endgueltig = { status: 'error', code: 401, message: 'Schluessel ungueltig' }
    try {
      parseTwelveDataSeries(wiederholbar, { ticker: 'AAPL', currency: 'USD' })
    } catch (fehler) {
      expect((fehler as ProviderError).retryable).toBe(true)
    }
    try {
      parseTwelveDataSeries(endgueltig, { ticker: 'AAPL', currency: 'USD' })
    } catch (fehler) {
      expect((fehler as ProviderError).retryable).toBe(false)
    }
  })

  it('weist eine leere Werteliste zurueck', () => {
    expect(() => parseTwelveDataSeries({ values: [] }, { ticker: 'X', currency: 'USD' })).toThrow(
      /keine Kurse/,
    )
  })

  it('weist voelligen Unsinn zurueck, statt ihn zu speichern', () => {
    expect(() => parseTwelveDataSeries('<html>', { ticker: 'X', currency: 'USD' })).toThrow(
      ProviderError,
    )
  })
})

describe('TwelveDataPriceProvider', () => {
  it('schneidet auf den Stichtag zu', async () => {
    const provider = new TwelveDataPriceProvider('geheim', 420, () => Promise.resolve(antwort))
    const series = await provider.fetchDailyHistory({
      instrument: {
        ticker: 'AAPL',
        name: 'Apple Inc.',
        venue: 'NASDAQ',
        expectedCoverage: 'sec_domestic',
      },
      since: '2026-08-21',
    })
    expect(series.bars).toHaveLength(1)
  })

  it('verlangt einen Schluessel, statt ihn leer mitzuschicken', async () => {
    const provider = new TwelveDataPriceProvider('')
    await expect(
      provider.fetchDailyHistory({
        instrument: {
          ticker: 'AAPL',
          name: 'Apple Inc.',
          venue: 'NASDAQ',
          expectedCoverage: 'sec_domestic',
        },
        since: '2026-01-01',
      }),
    ).rejects.toThrow(/TWELVEDATA_API_KEY fehlt/)
  })
})

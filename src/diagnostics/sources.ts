import { alphaVantageUrl, parseAlphaVantageDaily } from '../providers/alphavantage'
import { parseStooqCsv, stooqUrl } from '../providers/stooq'
import { parseTwelveDataSeries, twelveDataUrl } from '../providers/twelvedata'
import { submissionsUrl } from './submissions'

/**
 * Klopft die externen Quellen ab und meldet, welche antworten.
 *
 * Der Sinn: Ob eine Quelle liefert, haengt an der Adresse, von der
 * gefragt wird. Stooq und Yahoo sperren geteilte Cloud-Adressen; ob das
 * auch fuer die Adressen gilt, von denen diese Anwendung laeuft, kann
 * nur ein Abruf von genau dort beantworten. Genau deshalb sitzt diese
 * Pruefung in der Anwendung und nicht in einem Workflow.
 */
export interface SourceProbe {
  quelle: string
  ziel: string
  ok: boolean
  detail: string
}

const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

function kurz(text: string, laenge = 110): string {
  const sauber = text.replace(/\s+/g, ' ').trim()
  return sauber.length <= laenge ? sauber : `${sauber.slice(0, laenge)}…`
}

function fehlertext(fehler: unknown): string {
  return kurz(fehler instanceof Error ? fehler.message : String(fehler))
}

async function pruefe(
  quelle: string,
  ziel: string,
  lauf: () => Promise<string>,
): Promise<SourceProbe> {
  try {
    return { quelle, ziel, ok: true, detail: await lauf() }
  } catch (fehler) {
    return { quelle, ziel, ok: false, detail: fehlertext(fehler) }
  }
}

async function text(url: string): Promise<string> {
  const antwort = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, Accept: '*/*' } })
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`)
  return antwort.text()
}

async function json(url: string, userAgent = BROWSER_UA): Promise<unknown> {
  const antwort = await fetch(url, {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
  })
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`)
  return antwort.json()
}

function reihenBefund(bars: readonly { date: string; close: number }[]): string {
  const erster = bars[0]
  const letzter = bars[bars.length - 1]
  if (erster === undefined || letzter === undefined) return 'keine Kurse'
  return `${bars.length} Tage, ${erster.date} bis ${letzter.date}, zuletzt ${letzter.close}`
}

export async function probeSources(): Promise<SourceProbe[]> {
  const twelve = process.env['TWELVEDATA_API_KEY']?.trim() ?? ''
  const finnhub = process.env['FINNHUB_API_KEY']?.trim() ?? ''
  const alpha = process.env['ALPHA_VANTAGE_API_KEY']?.trim() ?? ''
  const secUserAgent = process.env['SEC_USER_AGENT']?.trim() ?? ''

  const proben: Promise<SourceProbe>[] = [
    pruefe('Stooq', 'AAPL (US)', async () =>
      reihenBefund(
        parseStooqCsv(await text(stooqUrl('aapl.us')), { ticker: 'AAPL', currency: 'USD' }).bars,
      ),
    ),
    pruefe('Stooq', 'SAP (DE)', async () =>
      reihenBefund(
        parseStooqCsv(await text(stooqUrl('sap.de')), { ticker: 'SAP', currency: 'EUR' }).bars,
      ),
    ),
    pruefe('Yahoo', 'AAPL (US)', async () => {
      const daten = await json(
        'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1mo&interval=1d',
      )
      const zeiten = (daten as { chart?: { result?: { timestamp?: number[] }[] } }).chart
        ?.result?.[0]?.timestamp
      if (zeiten === undefined || zeiten.length === 0) throw new Error('keine Kurse enthalten')
      return `${zeiten.length} Tage geliefert`
    }),
    pruefe('SEC', 'submissions AAPL', async () => {
      if (!secUserAgent.includes('@')) throw new Error('SEC_USER_AGENT fehlt oder ohne E-Mail')
      const daten = await json(submissionsUrl('0000320193'), secUserAgent)
      const name = (daten as { name?: string }).name ?? '?'
      return `erreichbar, ${name}`
    }),
  ]

  if (twelve.length > 0) {
    proben.push(
      pruefe('Twelve Data', 'AAPL (US)', async () =>
        reihenBefund(
          parseTwelveDataSeries(
            await json(twelveDataUrl({ ticker: 'AAPL', venue: 'NASDAQ' }, twelve, 30)),
            { ticker: 'AAPL', currency: 'USD' },
          ).bars,
        ),
      ),
    )

    // Ein 404 auf SAP kann "kein XETRA im Gratis-Tarif" heissen oder
    // schlicht ein falscher Parameter sein. Diese drei Varianten
    // trennen das eine vom anderen, statt es zu vermuten.
    const varianten: readonly [string, string][] = [
      ['SAP, exchange=XETR', `symbol=SAP&exchange=XETR`],
      ['SAP, exchange=XETRA', `symbol=SAP&exchange=XETRA`],
      ['SAP, mic_code=XETR', `symbol=SAP&mic_code=XETR`],
      ['SAP ohne Boerse (US-ADR)', `symbol=SAP`],
    ]
    for (const [ziel, abfrage] of varianten) {
      proben.push(
        pruefe('Twelve Data', ziel, async () => {
          const daten = await json(
            `https://api.twelvedata.com/time_series?${abfrage}&interval=1day&outputsize=5&apikey=${twelve}`,
          )
          const reihe = parseTwelveDataSeries(daten, { ticker: 'SAP', currency: 'EUR' })
          return `${reihenBefund(reihe.bars)}, Waehrung ${reihe.currency}`
        }),
      )
    }
  } else {
    proben.push(
      Promise.resolve({
        quelle: 'Twelve Data',
        ziel: 'AAPL, SAP',
        ok: false,
        detail: 'uebersprungen, TWELVEDATA_API_KEY nicht gesetzt',
      }),
    )
  }

  proben.push(
    alpha.length > 0
      ? pruefe('Alpha Vantage', 'SAP.DEX (XETRA)', async () => {
          const daten = await json(alphaVantageUrl('SAP.DEX', alpha, 'compact'))
          const reihe = parseAlphaVantageDaily(daten, { ticker: 'SAP', currency: 'EUR' })
          return `${reihenBefund(reihe.bars)}, Waehrung ${reihe.currency}`
        })
      : Promise.resolve({
          quelle: 'Alpha Vantage',
          ziel: 'SAP.DEX (XETRA)',
          ok: false,
          detail: 'uebersprungen, ALPHA_VANTAGE_API_KEY nicht gesetzt',
        }),
    alpha.length > 0
      ? pruefe('Alpha Vantage Suche', 'Stichwort "RTL"', async () => {
          const { symbolSearchUrl, parseSymbolSearch } = await import('../providers/alphavantage')
          const { treffer, rohSymbole } = parseSymbolSearch(await json(symbolSearchUrl('RTL', alpha)))
          return `${rohSymbole.length} Treffer roh, ${treffer.length} deutsch${
            rohSymbole.length > 0 ? ` (${rohSymbole.slice(0, 6).join(', ')})` : ''
          }`
        })
      : Promise.resolve({
          quelle: 'Alpha Vantage Suche',
          ziel: 'Stichwort "RTL"',
          ok: false,
          detail: 'uebersprungen, ALPHA_VANTAGE_API_KEY nicht gesetzt',
        }),
    // Tradegate speist inzwischen die Live-Kurse der deutschen Titel;
    // die Probe bleibt als Erreichbarkeitsmessung. filings.xbrl.org
    // (amtliche ESEF-Jahresabschluesse) ist weiterhin nur gemessen,
    // noch nirgends verdrahtet.
    pruefe('Tradegate', 'SAP (DE0007164600)', async () => {
      const daten = await json('https://www.tradegate.de/refresh.php?isin=DE0007164600')
      const last = (daten as { last?: unknown }).last
      if (last === undefined) throw new Error('Antwort ohne Kursfeld')
      return `letzter Preis ${String(last)}`
    }),
    pruefe('ESEF (GLEIF + filings.xbrl.org)', 'Siemens ueber ISIN', async () => {
      // Die ganze Kette, wie der Datenabruf sie nutzt: ISIN -> LEI ->
      // juengste Einreichung mit Fakten-JSON.
      const { holeLei } = await import('../providers/gleif')
      const { esefFilingsUrl, parseEsefFilings } = await import('../providers/esef')
      const lei = await holeLei('DE0007236101')
      if (lei === null) throw new Error('GLEIF kennt die ISIN nicht')
      const filings = parseEsefFilings(await json(esefFilingsUrl(lei.lei)))
      const mitJson = filings.find((filing) => filing.jsonUrl !== null)
      if (mitJson === undefined) throw new Error(`LEI ${lei.lei}: keine Einreichung mit Fakten-JSON`)
      return `${lei.name}: Einreichung bis ${mitJson.periodEnd} mit Fakten-JSON`
    }),
    finnhub.length > 0
      ? pruefe('Finnhub', 'Empfehlungen AAPL', async () => {
          const daten = await json(
            `https://finnhub.io/api/v1/stock/recommendation?symbol=AAPL&token=${finnhub}`,
          )
          if (!Array.isArray(daten) || daten.length === 0) throw new Error('keine Empfehlungen')
          const neueste = daten[0] as Record<string, unknown>
          return `${daten.length} Monate, zuletzt ${String(neueste['period'] ?? '?')}`
        })
      : Promise.resolve({
          quelle: 'Finnhub',
          ziel: 'Empfehlungen',
          ok: false,
          detail: 'uebersprungen, FINNHUB_API_KEY nicht gesetzt',
        }),
  )

  return Promise.all(proben)
}

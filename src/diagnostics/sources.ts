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
    for (const [ziel, instrument] of [
      ['AAPL (US)', { ticker: 'AAPL', venue: 'NASDAQ' as const }],
      ['SAP (DE)', { ticker: 'SAP', venue: 'XETRA' as const }],
    ] as const) {
      proben.push(
        pruefe('Twelve Data', ziel, async () =>
          reihenBefund(
            parseTwelveDataSeries(await json(twelveDataUrl(instrument, twelve, 30)), {
              ticker: instrument.ticker,
              currency: instrument.venue === 'XETRA' ? 'EUR' : 'USD',
            }).bars,
          ),
        ),
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

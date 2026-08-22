/**
 * Prueft, welche Kursquelle aus GitHub Actions heraus tatsaechlich
 * antwortet. Stooq tut es nicht: es liefert dort eine Bot-Abwehrseite
 * mit HTTP 200. Diese Frage laesst sich nicht aus der Dokumentation
 * beantworten, nur durch einen Abruf von genau dem Rechner, der es
 * spaeter tun soll.
 *
 * Getestet wird je Quelle ein US-Titel und ein deutscher Titel, weil
 * die Abdeckung sich genau dort unterscheidet.
 */

interface Probe {
  quelle: string
  titel: string
  url: string
  schluessel: string | null
  auswerten: (text: string) => { tage: number; von: string; bis: string; letzter: number }
}

function jsonBars(text: string): { tage: number; von: string; bis: string; letzter: number } {
  const daten: unknown = JSON.parse(text)
  const chart = (daten as { chart?: { result?: unknown[] } }).chart
  const ergebnis = chart?.result?.[0] as
    | { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }
    | undefined
  const zeiten = ergebnis?.timestamp ?? []
  const schluss = ergebnis?.indicators?.quote?.[0]?.close ?? []
  const paare = zeiten
    .map((t, i) => [t, schluss[i]] as const)
    .filter((paar): paar is readonly [number, number] => typeof paar[1] === 'number')
  const erster = paare[0]
  const letzter = paare[paare.length - 1]
  if (erster === undefined || letzter === undefined) throw new Error('keine Kurse enthalten')
  return {
    tage: paare.length,
    von: new Date(erster[0] * 1000).toISOString().slice(0, 10),
    bis: new Date(letzter[0] * 1000).toISOString().slice(0, 10),
    letzter: letzter[1],
  }
}

function csvBars(text: string): { tage: number; von: string; bis: string; letzter: number } {
  const zeilen = text.trim().split(/\r?\n/)
  const kopf = zeilen[0] ?? ''
  if (!kopf.toLowerCase().startsWith('date,')) {
    throw new Error(`kein CSV, Antwort beginnt mit: ${kopf.slice(0, 60)}`)
  }
  const daten = zeilen.slice(1).filter((zeile) => /^\d{4}-\d{2}-\d{2},/.test(zeile))
  const erste = daten[0]?.split(',')
  const letzte = daten[daten.length - 1]?.split(',')
  if (erste === undefined || letzte === undefined) throw new Error('keine Datenzeilen')
  return {
    tage: daten.length,
    von: erste[0] ?? '',
    bis: letzte[0] ?? '',
    letzter: Number(letzte[4] ?? 0),
  }
}

const twelve = process.env['TWELVEDATA_API_KEY']?.trim() ?? ''
const finnhub = process.env['FINNHUB_API_KEY']?.trim() ?? ''

const PROBEN: Probe[] = [
  {
    quelle: 'Stooq',
    titel: 'AAPL (US)',
    url: 'https://stooq.com/q/d/l/?s=aapl.us&i=d',
    schluessel: null,
    auswerten: csvBars,
  },
  {
    quelle: 'Stooq',
    titel: 'SAP (DE)',
    url: 'https://stooq.com/q/d/l/?s=sap.de&i=d',
    schluessel: null,
    auswerten: csvBars,
  },
  {
    quelle: 'Yahoo',
    titel: 'AAPL (US)',
    url: 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=2y&interval=1d',
    schluessel: null,
    auswerten: jsonBars,
  },
  {
    quelle: 'Yahoo',
    titel: 'SAP.DE (DE)',
    url: 'https://query1.finance.yahoo.com/v8/finance/chart/SAP.DE?range=2y&interval=1d',
    schluessel: null,
    auswerten: jsonBars,
  },
  {
    quelle: 'TwelveData',
    titel: 'AAPL (US)',
    url: `https://api.twelvedata.com/time_series?symbol=AAPL&interval=1day&outputsize=400&format=CSV&delimiter=,&apikey=${twelve}`,
    schluessel: twelve.length === 0 ? 'TWELVEDATA_API_KEY' : null,
    auswerten: (text) => {
      const zeilen = text.trim().split(/\r?\n/).filter((z) => /^\d{4}-\d{2}-\d{2};|^\d{4}-\d{2}-\d{2},/.test(z))
      const erste = zeilen[0]?.split(/[;,]/)
      const letzte = zeilen[zeilen.length - 1]?.split(/[;,]/)
      if (erste === undefined || letzte === undefined) {
        throw new Error(`keine Datenzeilen: ${text.slice(0, 80)}`)
      }
      return { tage: zeilen.length, von: letzte[0] ?? '', bis: erste[0] ?? '', letzter: Number(erste[4] ?? 0) }
    },
  },
  {
    quelle: 'Finnhub',
    titel: 'Empfehlungen AAPL',
    url: `https://finnhub.io/api/v1/stock/recommendation?symbol=AAPL&token=${finnhub}`,
    schluessel: finnhub.length === 0 ? 'FINNHUB_API_KEY' : null,
    auswerten: (text) => {
      const daten: unknown = JSON.parse(text)
      if (!Array.isArray(daten) || daten.length === 0) {
        throw new Error(`keine Empfehlungen: ${text.slice(0, 120)}`)
      }
      const neueste = daten[0] as Record<string, unknown>
      const summe =
        Number(neueste['strongBuy'] ?? 0) +
        Number(neueste['buy'] ?? 0) +
        Number(neueste['hold'] ?? 0) +
        Number(neueste['sell'] ?? 0) +
        Number(neueste['strongSell'] ?? 0)
      return {
        tage: daten.length,
        von: String(daten[daten.length - 1] ? (daten[daten.length - 1] as Record<string, unknown>)['period'] : '?'),
        bis: String(neueste['period'] ?? '?'),
        letzter: summe,
      }
    },
  },
]

async function main(): Promise<void> {
  console.log('Quelle       | Titel              | Ergebnis')
  console.log('-------------|--------------------|------------------------------------------')

  for (const probe of PROBEN) {
    if (probe.schluessel !== null) {
      console.log(
        `${probe.quelle.padEnd(12)} | ${probe.titel.padEnd(18)} | uebersprungen, ${probe.schluessel} fehlt`,
      )
      continue
    }
    try {
      const antwort = await fetch(probe.url, {
        headers: {
          // Ein Browser-aehnlicher User-Agent, weil einige Quellen
          // schlicht auf die Zeichenkette schauen.
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          Accept: '*/*',
        },
      })
      const text = await antwort.text()
      if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`)
      const werte = probe.auswerten(text)
      console.log(
        `${probe.quelle.padEnd(12)} | ${probe.titel.padEnd(18)} | OK ${String(werte.tage).padStart(4)} Werte, ${werte.von} .. ${werte.bis}, zuletzt ${werte.letzter}`,
      )
    } catch (fehler) {
      const grund = fehler instanceof Error ? fehler.message : String(fehler)
      console.log(`${probe.quelle.padEnd(12)} | ${probe.titel.padEnd(18)} | FEHLT: ${grund.slice(0, 90)}`)
    }
    await new Promise((r) => setTimeout(r, 800))
  }
}

main().catch((fehler: unknown) => {
  console.error(fehler)
  process.exitCode = 1
})

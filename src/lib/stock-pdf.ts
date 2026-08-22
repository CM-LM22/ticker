import type { PriceBar } from '../domain/price-series'
import type { StockBrief } from '../domain/stock-brief'
import { formatCompact, formatDay, formatPercent, formatPrice } from './format'
import { A4_PORTRAIT, helveticaWidth, renderSinglePagePdf, truncateToWidth } from './pdf'
import type { PdfLink, PdfRect, PdfStroke, PdfText } from './pdf'

/**
 * Der Ein-Seiten-Bericht je Titel als PDF: Kopf mit Kurs, 52-Wochen-
 * Verlauf als Linienzug, Quartalszahlen im Vorjahresvergleich, Konsens,
 * regelbasierte Einstufung mit Gruenden und der datenbasierte Ausblick.
 * Reines Rendering; alle Inhalte kommen fertig aus buildStockBrief.
 */

export interface KonsensBewegung {
  occurredAt: Date
  action: string
  gradeTo: string | null
}

export interface StockPdfInput {
  brief: StockBrief
  /** 52-Wochen-Fenster, aufsteigend nach Datum. Leer, wenn keine Kurse. */
  bars: readonly PriceBar[]
  asOf: Date
  isDemo: boolean
  /** Woertliche Auszuege aus dem juengsten Bericht, falls geholt. */
  auszug: {
    text: string
    guidance: string | null
    dokumentUrl: string
    periodEnd: string
  } | null
  /** Juengste Konsens-Bewegungen, neueste zuerst. */
  aktionen: readonly KonsensBewegung[]
  /** Adresse der App fuer den Zurueck-Link im PDF, wenn bekannt. */
  appUrl?: string | null
}

/** Zeilenumbruch nach gemessener Breite, fuer den Zitatblock. */
export function zeilenUmbruch(text: string, size: number, maxWidth: number): string[] {
  const zeilen: string[] = []
  for (const absatz of text.split('\n')) {
    if (absatz.trim().length === 0) {
      zeilen.push('')
      continue
    }
    let aktuelle = ''
    for (const wort of absatz.split(/\s+/)) {
      const kandidat = aktuelle.length === 0 ? wort : `${aktuelle} ${wort}`
      if (helveticaWidth(kandidat, size) <= maxWidth) {
        aktuelle = kandidat
      } else {
        if (aktuelle.length > 0) zeilen.push(aktuelle)
        aktuelle = helveticaWidth(wort, size) <= maxWidth ? wort : truncateToWidth(wort, size, maxWidth)
      }
    }
    if (aktuelle.length > 0) zeilen.push(aktuelle)
  }
  return zeilen
}

const LINKS = 40
const RECHTS = 555
const EINSTUFUNG_WORT: Record<NonNullable<StockBrief['einstufung']>, string> = {
  stark: 'Stark',
  solide: 'Solide',
  neutral: 'Neutral',
  schwach: 'Schwach',
  kritisch: 'Kritisch',
}

const DISCLAIMER =
  'Keine Anlageberatung, keine Kaufempfehlung. Regelbasierte Verdichtung oeffentlicher Unternehmensmeldungen, ohne Gewaehr. Massgeblich ist die Originalquelle.'

function rechtsBuendig(
  text: string,
  size: number,
  right: number,
  y: number,
  font: PdfText['font'],
): PdfText {
  return { x: right - helveticaWidth(text, size), y, size, font, text }
}

/** Schlusskurse als Linienzug in ein Rechteck einpassen. */
export function preisPfad(
  bars: readonly PriceBar[],
  rahmen: { x: number; y: number; width: number; height: number },
): PdfStroke[] {
  if (bars.length < 2) return []
  const closes = bars.map((bar) => bar.close)
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const spanne = max - min
  const yFor = (close: number): number =>
    spanne === 0 ? rahmen.y + rahmen.height / 2 : rahmen.y + ((close - min) / spanne) * rahmen.height
  const xFor = (index: number): number => rahmen.x + (index / (bars.length - 1)) * rahmen.width

  // Auf hoechstens ~160 Segmente eindampfen, damit der Content-Stream
  // klein bleibt; bei 250 Handelstagen sieht man den Unterschied nicht.
  const schritt = Math.max(1, Math.ceil(bars.length / 160))
  const strokes: PdfStroke[] = []
  let vorherX = xFor(0)
  let vorherY = yFor(closes[0] ?? 0)
  for (let index = schritt; index < bars.length; index += schritt) {
    const x = xFor(index)
    const y = yFor(closes[index] ?? 0)
    strokes.push({ x1: vorherX, y1: vorherY, x2: x, y2: y })
    vorherX = x
    vorherY = y
  }
  const letzter = closes[closes.length - 1]
  if (letzter !== undefined) {
    strokes.push({ x1: vorherX, y1: vorherY, x2: xFor(bars.length - 1), y2: yFor(letzter) })
  }
  return strokes
}

/**
 * Umsatz- und Ergebnisbalken je Quartal, chronologisch. Negative Werte
 * haengen unter der Nulllinie; der Massstab kommt aus dem Betragsmax.
 */
export function quartalsBalken(
  quartale: readonly { label: string; revenue: number | null; netIncome: number | null }[],
  rahmen: { x: number; y: number; width: number; height: number },
): { rects: PdfRect[]; texts: PdfText[]; strokes: PdfStroke[] } {
  const rects: PdfRect[] = []
  const texts: PdfText[] = []
  const strokes: PdfStroke[] = []
  const chronologisch = [...quartale].reverse()
  const werte = chronologisch.flatMap((zeile) => [zeile.revenue ?? 0, zeile.netIncome ?? 0])
  const min = Math.min(0, ...werte)
  const max = Math.max(0, ...werte)
  if (max === min) return { rects, texts, strokes }

  const skala = rahmen.height / (max - min)
  const nullY = rahmen.y + (0 - min) * skala
  const gruppe = rahmen.width / chronologisch.length
  const balken = Math.min(26, gruppe * 0.32)

  strokes.push({ x1: rahmen.x, y1: nullY, x2: rahmen.x + rahmen.width, y2: nullY })

  chronologisch.forEach((zeile, index) => {
    const mitte = rahmen.x + gruppe * index + gruppe / 2
    const paare: { wert: number | null; grau: number; dx: number }[] = [
      { wert: zeile.revenue, grau: 0.78, dx: -balken - 1 },
      { wert: zeile.netIncome, grau: 0.35, dx: 1 },
    ]
    for (const { wert, grau, dx } of paare) {
      if (wert === null) continue
      const hoehe = wert * skala
      rects.push({
        x: mitte + dx,
        y: hoehe >= 0 ? nullY : nullY + hoehe,
        width: balken,
        height: Math.abs(hoehe),
        grau,
      })
    }
    const label = truncateToWidth(zeile.label, 6.5, gruppe - 4)
    texts.push({
      x: mitte - helveticaWidth(label, 6.5) / 2,
      y: rahmen.y - 9,
      size: 6.5,
      font: 'regular',
      text: label,
    })
  })
  return { rects, texts, strokes }
}

export function renderStockPdf(input: StockPdfInput): Uint8Array {
  const { brief } = input
  const texts: PdfText[] = []
  const strokes: PdfStroke[] = []
  const rects: PdfRect[] = []
  const links: PdfLink[] = []
  let y = 800

  // Klickbarer Rueckweg in die App, ganz oben — aus dem PDF-Viewer
  // gibt es sonst keinen.
  if (input.appUrl != null && input.appUrl.length > 0) {
    const beschriftung = '← Zurueck zur Uebersicht'
    texts.push({ x: LINKS, y: 824, size: 8, font: 'regular', text: beschriftung })
    links.push({
      x: LINKS - 2,
      y: 821,
      width: helveticaWidth(beschriftung, 8) + 4,
      height: 12,
      url: input.appUrl,
    })
  }

  // Kopf: Ticker, Name, Handelsplatz, Stand.
  texts.push({ x: LINKS, y, size: 18, font: 'bold', text: brief.ticker })
  texts.push({
    x: LINKS + helveticaWidth(brief.ticker, 18) + 8,
    y,
    size: 11,
    font: 'regular',
    text: truncateToWidth(brief.name, 11, 330),
  })
  texts.push(rechtsBuendig(brief.venue, 9, RECHTS, y + 6, 'regular'))
  texts.push(
    rechtsBuendig(
      `Stand ${formatDay(input.asOf.toISOString().slice(0, 10))}` +
        (input.isDemo ? ' — Demodaten' : ''),
      9,
      RECHTS,
      y - 6,
      'regular',
    ),
  )
  y -= 20

  if (brief.price !== null) {
    const kurs = brief.price
    const zwoelf = kurs.returns['12M']
    texts.push({
      x: LINKS,
      y,
      size: 11,
      font: 'bold',
      text: formatPrice(kurs.last.close, kurs.currency),
    })
    texts.push({
      x: LINKS + 90,
      y,
      size: 9,
      font: 'regular',
      text: `${formatPercent(zwoelf)} in 12 Monaten · Schlusskurs vom ${formatDay(kurs.last.date)}`,
    })
  } else {
    texts.push({ x: LINKS, y, size: 9, font: 'regular', text: 'Keine Kursdaten vorhanden.' })
  }
  y -= 14
  strokes.push({ x1: LINKS, y1: y, x2: RECHTS, y2: y })
  y -= 16

  // 52-Wochen-Verlauf links, Kennzahlen rechts daneben.
  const chart = { x: LINKS, y: y - 88, width: 300, height: 80 }
  if (input.bars.length >= 2) {
    texts.push({ x: LINKS, y, size: 8, font: 'bold', text: '52 Wochen' })
    strokes.push(...preisPfad(input.bars, chart))
    const erster = input.bars[0]
    const letzter = input.bars[input.bars.length - 1]
    if (erster !== undefined && letzter !== undefined) {
      texts.push({ x: chart.x, y: chart.y - 10, size: 6.5, font: 'regular', text: formatDay(erster.date) })
      texts.push(
        rechtsBuendig(formatDay(letzter.date), 6.5, chart.x + chart.width, chart.y - 10, 'regular'),
      )
    }
  } else {
    texts.push({ x: LINKS, y, size: 8, font: 'regular', text: 'Kein Kursverlauf vorhanden.' })
  }

  const infoX = 370
  let infoY = y
  const kennzahl = (label: string, wert: string): void => {
    texts.push({ x: infoX, y: infoY, size: 8, font: 'regular', text: label })
    texts.push(rechtsBuendig(wert, 8, RECHTS, infoY, 'bold'))
    infoY -= 12
  }
  if (brief.price !== null) {
    const kurs = brief.price
    kennzahl('52W-Hoch', `${formatPrice(kurs.high52.value, kurs.currency)} (${formatDay(kurs.high52.date)})`)
    kennzahl('52W-Tief', `${formatPrice(kurs.low52.value, kurs.currency)} (${formatDay(kurs.low52.date)})`)
    kennzahl('Abstand zum Hoch', formatPercent(kurs.drawdownFromHighPct))
    kennzahl('Rendite 1M / 3M', `${formatPercent(kurs.returns['1M'])} / ${formatPercent(kurs.returns['3M'])}`)
    kennzahl('Rendite 6M / 12M', `${formatPercent(kurs.returns['6M'])} / ${formatPercent(kurs.returns['12M'])}`)
    if (kurs.volatilityPct !== null) {
      // Ohne Vorzeichen: Schwankung ist ein Betrag, kein Auf oder Ab.
      kennzahl('Schwankung p.a.', `${kurs.volatilityPct.toFixed(1).replace('.', ',')} %`)
    }
  }
  y = chart.y - 24

  // Quartalszahlen im Vorjahresvergleich.
  texts.push({ x: LINKS, y, size: 10, font: 'bold', text: 'Zahlen im Vorjahresvergleich' })
  y -= 14
  const spalten = { periode: LINKS, umsatzR: 250, dU: 258, ergebnisR: 400, dE: 408, margeR: RECHTS } as const
  texts.push({ x: spalten.periode, y, size: 7.5, font: 'bold', text: 'Periode' })
  texts.push(rechtsBuendig('Umsatz', 7.5, spalten.umsatzR, y, 'bold'))
  texts.push({ x: spalten.dU, y, size: 7.5, font: 'bold', text: 'z. Vorjahr' })
  texts.push(rechtsBuendig('Ergebnis', 7.5, spalten.ergebnisR, y, 'bold'))
  texts.push({ x: spalten.dE, y, size: 7.5, font: 'bold', text: 'z. Vorjahr' })
  texts.push(rechtsBuendig('Nettomarge', 7.5, spalten.margeR, y, 'bold'))
  strokes.push({ x1: LINKS, y1: y - 3, x2: RECHTS, y2: y - 3 })
  y -= 14

  const zeilen = [...brief.quartale, ...(brief.jahr === null ? [] : [brief.jahr])]
  if (zeilen.length === 0) {
    texts.push({
      x: LINKS,
      y,
      size: 8,
      font: 'regular',
      text:
        brief.luecken.find((text) => text.includes('Berichtszahlen') || text.includes('SEC')) ??
        'Keine Berichtszahlen vorhanden.',
    })
    y -= 12
  }
  for (const zeile of zeilen) {
    const fett = zeile.frame === 'year'
    const font: PdfText['font'] = fett ? 'bold' : 'regular'
    texts.push({ x: spalten.periode, y, size: 8, font, text: zeile.label })
    texts.push(rechtsBuendig(formatCompact(zeile.revenue, zeile.currency), 8, spalten.umsatzR, y, font))
    texts.push({ x: spalten.dU, y, size: 8, font, text: formatPercent(zeile.revenueYoYPct) })
    texts.push(rechtsBuendig(formatCompact(zeile.netIncome, zeile.currency), 8, spalten.ergebnisR, y, font))
    texts.push({ x: spalten.dE, y, size: 8, font, text: formatPercent(zeile.netIncomeYoYPct) })
    texts.push(
      rechtsBuendig(
        zeile.margePct === null ? '—' : `${zeile.margePct.toFixed(1).replace('.', ',')} %`,
        8,
        spalten.margeR,
        y,
        font,
      ),
    )
    y -= 12
  }
  y -= 8

  // Umsatz und Ergebnis je Quartal als Balken, wenn Zahlen da sind.
  if (brief.quartale.some((zeile) => zeile.revenue !== null || zeile.netIncome !== null)) {
    const chart = { x: LINKS + 30, y: y - 74, width: 320, height: 60 }
    const gezeichnet = quartalsBalken(brief.quartale, chart)
    rects.push(...gezeichnet.rects)
    strokes.push(...gezeichnet.strokes)
    texts.push(...gezeichnet.texts)
    // Legende rechts neben der Grafik.
    rects.push({ x: 380, y: y - 26, width: 8, height: 8, grau: 0.78 })
    texts.push({ x: 392, y: y - 25, size: 7, font: 'regular', text: 'Umsatz' })
    rects.push({ x: 380, y: y - 40, width: 8, height: 8, grau: 0.35 })
    texts.push({ x: 392, y: y - 39, size: 7, font: 'regular', text: 'Ergebnis' })
    y = chart.y - 22
  }

  // Woertliche Zitatbloecke mit Zeilenbudget.
  const zitatBlock = (titel: string, text: string, maxZeilen: number): void => {
    texts.push({ x: LINKS, y, size: 10, font: 'bold', text: titel })
    y -= 12
    const zitatZeilen = zeilenUmbruch(text, 7.5, RECHTS - LINKS)
    let gezeigt = 0
    for (const zeile of zitatZeilen) {
      if (gezeigt >= maxZeilen || y < 70) {
        texts.push({
          x: LINKS,
          y,
          size: 7.5,
          font: 'regular',
          text: '… (gekuerzt, weiter im Original)',
        })
        y -= 10
        break
      }
      texts.push({ x: LINKS, y, size: 7.5, font: 'regular', text: zeile })
      y -= zeile.length === 0 ? 5 : 9.5
      gezeigt += 1
    }
    y -= 6
  }

  // Die Geschichte hinter den Zahlen, wie das Management sie selbst
  // erzaehlt — woertlich, ohne den juristischen Standard-Vorspann.
  if (input.auszug !== null) {
    zitatBlock('Geschaeftsentwicklung — woertlich aus dem Bericht', input.auszug.text, 14)
    if (input.auszug.guidance !== null && input.auszug.guidance.length > 0) {
      zitatBlock('Prognose des Managements — woertlich', input.auszug.guidance, 9)
    } else {
      texts.push({ x: LINKS, y, size: 10, font: 'bold', text: 'Prognose des Managements' })
      y -= 11
      texts.push({
        x: LINKS,
        y,
        size: 7.5,
        font: 'regular',
        text: 'Kein eigener Prognose-Abschnitt im Bericht gefunden; siehe Originaldokument.',
      })
      y -= 14
    }
    texts.push({
      x: LINKS,
      y,
      size: 6.5,
      font: 'regular',
      text: truncateToWidth(
        `Woertliche Auszuege aus ${input.auszug.dokumentUrl}, automatisch ausgeschnitten — keine Zusammenfassung.`,
        6.5,
        RECHTS - LINKS,
      ),
    })
    y -= 16
  }

  // Analystenmeinungen: Konsens, Mehrheitslesart, juengste Bewegungen.
  texts.push({ x: LINKS, y, size: 10, font: 'bold', text: 'Analystenmeinungen' })
  y -= 13
  if (brief.konsens === null) {
    texts.push({ x: LINKS, y, size: 8, font: 'regular', text: 'Kein Analystenkonsens verfuegbar.' })
    y -= 12
  } else {
    const delta =
      brief.konsens.deltaKauf === null
        ? 'kein Vormonatsvergleich'
        : brief.konsens.deltaKauf === 0
          ? 'Kaufstimmen zum Vormonat unveraendert'
          : `${brief.konsens.deltaKauf > 0 ? '+' : ''}${brief.konsens.deltaKauf} Kaufstimmen zum Vormonat`
    texts.push({
      x: LINKS,
      y,
      size: 8,
      font: 'regular',
      text: `${brief.konsens.kauf} Kauf · ${brief.konsens.halten} Halten · ${brief.konsens.verkauf} Verkauf (Monat ${brief.konsens.period}, ${delta}).`,
    })
    y -= 11
    const gesamt = brief.konsens.kauf + brief.konsens.halten + brief.konsens.verkauf
    const lesart =
      brief.konsens.kauf > brief.konsens.halten + brief.konsens.verkauf
        ? `Die Mehrheit der ${gesamt} erfassten Analysten stuft den Titel als Kauf ein.`
        : brief.konsens.verkauf > brief.konsens.kauf
          ? `Unter den ${gesamt} erfassten Analysten ueberwiegen die Verkaufsstimmen.`
          : `Kein klares Mehrheitsbild unter den ${gesamt} erfassten Analysten.`
    texts.push({ x: LINKS, y, size: 8, font: 'regular', text: lesart })
    y -= 11
  }
  for (const bewegung of input.aktionen.slice(0, 3)) {
    const monat = `${String(bewegung.occurredAt.getUTCMonth() + 1).padStart(2, '0')}/${bewegung.occurredAt.getUTCFullYear()}`
    const wortB =
      bewegung.action === 'upgrade'
        ? 'Konsens verschiebt sich Richtung Kauf'
        : bewegung.action === 'downgrade'
          ? 'Konsens verschiebt sich weg vom Kauf'
          : 'Konsens-Verteilung veraendert'
    texts.push({
      x: LINKS,
      y,
      size: 7.5,
      font: 'regular',
      text: truncateToWidth(
        `· ${monat}: ${wortB}${bewegung.gradeTo === null ? '' : ` (neu: ${bewegung.gradeTo})`}`,
        7.5,
        RECHTS - LINKS,
      ),
    })
    y -= 10
  }
  y -= 8

  // Einstufung mit Gruenden.
  texts.push({ x: LINKS, y, size: 10, font: 'bold', text: 'Einstufung nach offenen Regeln' })
  y -= 15
  const wort = brief.einstufung === null ? 'Ohne Einstufung' : EINSTUFUNG_WORT[brief.einstufung]
  texts.push({ x: LINKS, y, size: 13, font: 'bold', text: wort })
  const punkteText =
    brief.punkte === null
      ? `Datenbasis ${Math.round(brief.datenbasisPct)} Prozent — zu duenn fuer eine Punktzahl.`
      : `${Math.round(brief.punkte)} von 100 Punkten · Datenbasis ${Math.round(brief.datenbasisPct)} Prozent`
  texts.push({ x: LINKS + helveticaWidth(wort, 13) + 10, y, size: 8, font: 'regular', text: punkteText })
  y -= 12
  texts.push({ x: LINKS, y, size: 8, font: 'regular', text: brief.einstufungSatz })
  y -= 14

  const spaltig = (titel: string, eintraege: readonly string[], x: number, breite: number): number => {
    let lokalY = y
    texts.push({ x, y: lokalY, size: 8, font: 'bold', text: titel })
    lokalY -= 11
    if (eintraege.length === 0) {
      texts.push({ x, y: lokalY, size: 7.5, font: 'regular', text: 'Keine.' })
      lokalY -= 10
    }
    for (const eintrag of eintraege) {
      texts.push({
        x,
        y: lokalY,
        size: 7.5,
        font: 'regular',
        text: truncateToWidth(`· ${eintrag}`, 7.5, breite),
      })
      lokalY -= 10
    }
    return lokalY
  }
  const spaltenBreite = (RECHTS - LINKS - 20) / 2
  const linksEnde = spaltig('Staerken', brief.staerken, LINKS, spaltenBreite)
  const rechtsEnde = spaltig('Schwaechen', brief.schwaechen, LINKS + spaltenBreite + 20, spaltenBreite)
  y = Math.min(linksEnde, rechtsEnde) - 10

  // Trendlesart aus den gespeicherten Daten — bewusst getrennt von der
  // woertlichen Management-Prognose weiter oben.
  texts.push({ x: LINKS, y, size: 10, font: 'bold', text: 'Trend aus den Daten' })
  y -= 13
  for (const satz of brief.ausblick) {
    texts.push({ x: LINKS, y, size: 8, font: 'regular', text: truncateToWidth(`· ${satz}`, 8, RECHTS - LINKS) })
    y -= 11
  }
  if (brief.quelleUrl !== null) {
    texts.push({
      x: LINKS,
      y,
      size: 7,
      font: 'regular',
      text: truncateToWidth(`Originalbericht: ${brief.quelleUrl}`, 7, RECHTS - LINKS),
    })
    y -= 11
  }
  y -= 6

  // Bekannte Luecken, damit die Seite nicht mehr verspricht, als da ist.
  if (brief.luecken.length > 0) {
    texts.push({ x: LINKS, y, size: 8, font: 'bold', text: 'Bekannte Luecken' })
    y -= 11
    for (const luecke of brief.luecken) {
      texts.push({ x: LINKS, y, size: 7.5, font: 'regular', text: truncateToWidth(`· ${luecke}`, 7.5, RECHTS - LINKS) })
      y -= 10
    }
  }

  strokes.push({ x1: LINKS, y1: 34, x2: RECHTS, y2: 34 })
  texts.push({ x: LINKS, y: 24, size: 6.5, font: 'regular', text: truncateToWidth(DISCLAIMER, 6.5, RECHTS - LINKS) })

  return renderSinglePagePdf({
    width: A4_PORTRAIT.width,
    height: A4_PORTRAIT.height,
    texts,
    strokes,
    rects,
    links,
  })
}

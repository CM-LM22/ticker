import type { ReportedPeriod } from '../domain/fundamentals'
import { htmlZuText } from './sec-mdna'

/**
 * Amtliche europaeische Jahresfinanzberichte im ESEF-Format, frei
 * bereitgestellt von filings.xbrl.org. Je Einreichung liegt neben dem
 * Berichtsdokument eine xBRL-JSON-Datei mit den extrahierten Fakten —
 * die Zahlen kommen also aus derselben maschinenlesbaren Quelle wie
 * bei der SEC, nur nach IFRS-Konzepten benannt.
 *
 * ESEF deckt Jahresberichte ab; Quartalszahlen veroeffentlichen
 * deutsche Konzerne nur als freie PDFs, die ohne fragile Scraper je
 * Firma nicht zuverlaessig lesbar sind. Jahreszahlen mit
 * Vorjahresvergleich sind ehrlicher als geratene Quartale.
 */

export const ESEF_BASIS = 'https://filings.xbrl.org'

export function esefFilingsUrl(lei: string): string {
  const filter = JSON.stringify([{ name: 'entity.identifier', op: 'eq', val: lei }])
  return `${ESEF_BASIS}/api/filings?filter=${encodeURIComponent(filter)}&sort=-period_end&page%5Bsize%5D=4`
}

export interface EsefFiling {
  periodEnd: string
  dateAdded: string | null
  jsonUrl: string | null
  reportUrl: string | null
  viewerUrl: string | null
}

function absolut(pfad: unknown): string | null {
  if (typeof pfad !== 'string' || pfad.length === 0) return null
  if (pfad.startsWith('http')) return pfad
  return `${ESEF_BASIS}${pfad.startsWith('/') ? '' : '/'}${pfad}`
}

export function parseEsefFilings(raw: unknown): EsefFiling[] {
  if (typeof raw !== 'object' || raw === null) return []
  const data = (raw as Record<string, unknown>)['data']
  if (!Array.isArray(data)) return []
  const filings: EsefFiling[] = []
  for (const eintrag of data) {
    if (typeof eintrag !== 'object' || eintrag === null) continue
    const attributes = (eintrag as Record<string, unknown>)['attributes']
    if (typeof attributes !== 'object' || attributes === null) continue
    const attr = attributes as Record<string, unknown>
    const periodEnd = attr['period_end']
    if (typeof periodEnd !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(periodEnd)) continue
    filings.push({
      periodEnd: periodEnd.slice(0, 10),
      dateAdded: typeof attr['date_added'] === 'string' ? attr['date_added'].slice(0, 10) : null,
      jsonUrl: absolut(attr['json_url']),
      reportUrl: absolut(attr['report_url']),
      viewerUrl: absolut(attr['viewer_url']),
    })
  }
  return filings
}

/** Umsatz- und Ergebniskonzepte nach IFRS, in Prioritaetsreihenfolge. */
const UMSATZ_KONZEPTE = ['ifrs-full:Revenue', 'ifrs-full:RevenueFromContractsWithCustomers']
const ERGEBNIS_KONZEPTE = [
  'ifrs-full:ProfitLoss',
  'ifrs-full:ProfitLossAttributableToOwnersOfParent',
]

interface Fakt {
  concept: string
  /** Periodenende (einschliesslich), YYYY-MM-DD. */
  periodEnd: string
  periodStart: string | null
  wert: number
  einheit: string
}

function tagDavor(isoTag: string): string {
  const datum = new Date(`${isoTag}T12:00:00Z`)
  datum.setUTCDate(datum.getUTCDate() - 1)
  return datum.toISOString().slice(0, 10)
}

/**
 * Fakten aus xBRL-JSON (OIM): nur Werte ohne zusaetzliche Dimensionen
 * (also Konzernsummen, keine Segmente) und nur Jahreszeitraeume.
 * OIM-Periodenenden sind exklusiv (Mitternacht des Folgetags).
 */
export function extrahiereFakten(raw: unknown): Fakt[] {
  if (typeof raw !== 'object' || raw === null) return []
  const facts = (raw as Record<string, unknown>)['facts']
  if (typeof facts !== 'object' || facts === null) return []

  const erlaubteDimensionen = new Set(['concept', 'entity', 'period', 'unit', 'language'])
  const fakten: Fakt[] = []
  for (const roh of Object.values(facts as Record<string, unknown>)) {
    if (typeof roh !== 'object' || roh === null) continue
    const fakt = roh as Record<string, unknown>
    const dimensions = fakt['dimensions']
    if (typeof dimensions !== 'object' || dimensions === null) continue
    const dims = dimensions as Record<string, unknown>
    if (Object.keys(dims).some((schluessel) => !erlaubteDimensionen.has(schluessel))) continue

    const concept = dims['concept']
    const period = dims['period']
    const unit = dims['unit']
    if (typeof concept !== 'string' || typeof period !== 'string') continue
    const wert = Number(fakt['value'])
    if (!Number.isFinite(wert)) continue

    const [start, ende] = period.split('/')
    if (start === undefined || ende === undefined) continue
    const startTag = start.slice(0, 10)
    const endeTag = ende.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startTag) || !/^\d{4}-\d{2}-\d{2}$/.test(endeTag)) continue

    fakten.push({
      concept,
      periodStart: startTag,
      periodEnd: tagDavor(endeTag),
      wert,
      einheit: typeof unit === 'string' ? unit : '',
    })
  }
  return fakten
}

function dauerTage(fakt: Fakt): number {
  if (fakt.periodStart === null) return 0
  return Math.round(
    (Date.parse(`${fakt.periodEnd}T00:00:00Z`) - Date.parse(`${fakt.periodStart}T00:00:00Z`)) /
      86_400_000,
  )
}

function ersterTreffer(fakten: Fakt[], konzepte: readonly string[], periodEnd: string): Fakt | null {
  for (const konzept of konzepte) {
    const treffer = fakten.find(
      (fakt) => fakt.concept === konzept && fakt.periodEnd === periodEnd,
    )
    if (treffer !== undefined) return treffer
  }
  return null
}

/**
 * Jahresperioden aus einer ESEF-Einreichung: das Berichtsjahr und die
 * mitgelieferten Vorjahresvergleiche. Waehrung aus der Einheit
 * (iso4217:EUR), sonst EUR.
 */
export function extraherePerioden(
  xbrlJson: unknown,
  quelle: { filedAt: string; sourceUrl: string | null },
): ReportedPeriod[] {
  const fakten = extrahiereFakten(xbrlJson).filter((fakt) => {
    const tage = dauerTage(fakt)
    return tage >= 330 && tage <= 380
  })

  const enden = [...new Set(fakten.map((fakt) => fakt.periodEnd))].sort().reverse()
  const perioden: ReportedPeriod[] = []
  for (const ende of enden) {
    const umsatz = ersterTreffer(fakten, UMSATZ_KONZEPTE, ende)
    const ergebnis = ersterTreffer(fakten, ERGEBNIS_KONZEPTE, ende)
    if (umsatz === null && ergebnis === null) continue
    const einheit = (umsatz ?? ergebnis)?.einheit ?? ''
    const currency = /iso4217:([A-Z]{3})/.exec(einheit)?.[1] ?? 'EUR'
    perioden.push({
      label: `GJ ${ende.slice(0, 4)}`,
      periodEnd: ende,
      periodStart: (umsatz ?? ergebnis)?.periodStart ?? null,
      frame: 'year',
      form: 'ESEF',
      revenue: umsatz?.wert ?? null,
      netIncome: ergebnis?.wert ?? null,
      epsDiluted: null,
      currency,
      filedAt: quelle.filedAt,
      accessionNumber: null,
      sourceUrl: quelle.sourceUrl,
    })
  }
  return perioden
}

const LAGEBERICHT_START =
  /(zusammengefasster\s+lagebericht|konzernlagebericht|wirtschaftsbericht|gesch(ae|ä)ftsverlauf\s+und\s+lage|ertragslage)/i

/**
 * Woertlicher Auszug aus dem Lagebericht eines deutschen
 * Jahresberichts — dieselbe Systematik wie beim MD&A, deutsche
 * Ueberschriften. Die letzte fruehe Fundstelle nach dem
 * Inhaltsverzeichnis ist nicht noetig: Es reicht die erste Stelle, an
 * der danach echte Absaetze folgen.
 */
export function extrahiereLagebericht(text: string, maxZeichen = 1400): string | null {
  const treffer = [...text.matchAll(new RegExp(LAGEBERICHT_START.source, 'gi'))]
  for (const fund of treffer) {
    const start = fund.index
    if (start === undefined) continue
    const ausschnitt = text.slice(start, start + 40_000)
    const zeilen = ausschnitt
      .split('\n')
      .map((zeile) => zeile.trim())
      .filter((zeile) => zeile.length > 0)
      .slice(1)

    const absaetze: string[] = []
    let gesamt = 0
    for (const zeile of zeilen) {
      if (zeile.length < 80 && !/[.]$/.test(zeile)) continue
      absaetze.push(zeile)
      gesamt += zeile.length
      if (gesamt >= maxZeichen) break
    }
    // Eine Inhaltsverzeichnis-Fundstelle hat keine echten Absaetze in
    // der Naehe; dann weiter zur naechsten.
    if (absaetze.length === 0 || (absaetze[0]?.length ?? 0) < 120) continue

    let ergebnis = absaetze.join('\n\n')
    if (ergebnis.length > maxZeichen) {
      const gekappt = ergebnis.slice(0, maxZeichen)
      const letzterPunkt = gekappt.lastIndexOf('.')
      ergebnis = letzterPunkt > maxZeichen / 2 ? gekappt.slice(0, letzterPunkt + 1) : `${gekappt} …`
    }
    return ergebnis
  }
  return null
}

/** Einreichungsliste eines Emittenten, juengste zuerst. */
export async function holeEsefFilings(lei: string): Promise<EsefFiling[]> {
  const antwort = await fetch(esefFilingsUrl(lei), {
    headers: { Accept: 'application/vnd.api+json' },
  })
  if (!antwort.ok) throw new Error(`filings.xbrl.org: HTTP ${antwort.status}`)
  return parseEsefFilings(await antwort.json())
}

/** Die Fakten einer Einreichung als Jahresperioden. */
export async function holeEsefPerioden(filing: EsefFiling): Promise<ReportedPeriod[]> {
  if (filing.jsonUrl === null) return []
  const antwort = await fetch(filing.jsonUrl, { headers: { Accept: 'application/json' } })
  if (!antwort.ok) throw new Error(`xBRL-JSON: HTTP ${antwort.status}`)
  return extraherePerioden(await antwort.json(), {
    filedAt: filing.dateAdded ?? filing.periodEnd,
    sourceUrl: filing.viewerUrl ?? filing.reportUrl,
  })
}

/** Lagebericht-Auszug aus dem Berichtsdokument, groessenbegrenzt. */
export async function holeEsefAuszug(
  reportUrl: string,
  maxBytes = 15_000_000,
): Promise<string | null> {
  const antwort = await fetch(reportUrl, { headers: { Accept: 'text/html,application/xhtml+xml' } })
  if (!antwort.ok) throw new Error(`Berichtsdokument: HTTP ${antwort.status}`)
  const html = await antwort.text()
  return extrahiereLagebericht(htmlZuText(html.slice(0, maxBytes)))
}

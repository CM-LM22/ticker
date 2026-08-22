import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { WATCHLIST } from '@/config/watchlist'
import { gesamteWatchlist } from '@/data/gesamt-watchlist'
import { hasDatabase } from '@/db/client'
import { ensureSchema } from '@/db/migrate'
import { addCustomTitle, removeCustomTitle } from '@/db/repository'
import { WatchlistEntrySchema } from '@/domain/instrument'
import { holeXetraTreffer } from '@/providers/alphavantage-suche'
import { ladeSucheIndex, venueForExchange } from '@/providers/sec-suche'

/**
 * Titel zur Watchlist hinzufuegen und selbst hinzugefuegte wieder
 * entfernen. Die Stammdaten eines neuen Titels kommen ausschliesslich
 * aus dem SEC-Verzeichnis; der Client schickt nur das Kuerzel.
 */
export const dynamic = 'force-dynamic'

const KoerperSchema = z.object({
  ticker: z.string().trim().min(1).max(12),
  markt: z.enum(['us', 'xetra']).optional(),
})

function fehler(status: number, text: string): NextResponse {
  return NextResponse.json({ ok: false, fehler: text }, { status })
}

/**
 * XETRA-Zweig: die Stammdaten kommen aus der Alpha-Vantage-Symbolsuche
 * (fast immer aus deren Query-Cache, weil die Suche gerade eben lief).
 * Ohne SEC-Registrierung: keine CIK, keine Berichtszahlen; Kurse
 * kommen taeglich ueber Alpha Vantage. Das steht dem Titel als
 * bekannte Luecke an, statt still zu fehlen.
 */
async function xetraHinzufuegen(ticker: string): Promise<NextResponse> {
  const alpha = process.env['ALPHA_VANTAGE_API_KEY']?.trim() ?? ''
  if (alpha.length === 0) return fehler(503, 'ALPHA_VANTAGE_API_KEY fehlt.')

  const treffer = await holeXetraTreffer(ticker, alpha)
  const eintrag = treffer.find((kandidat) => kandidat.ticker === ticker)
  if (eintrag === undefined) {
    return fehler(404, `${ticker} kennt die XETRA-Suche nicht.`)
  }

  const neu = WatchlistEntrySchema.parse({
    ticker,
    name: eintrag.name,
    venue: 'XETRA',
    expectedCoverage: 'none',
  })
  await ensureSchema()
  await addCustomTitle(neu)
  console.info(`watchlist: ${ticker} hinzugefuegt (XETRA, ${eintrag.name})`)
  return NextResponse.json({ ok: true, ticker, name: eintrag.name, venue: 'XETRA' })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!hasDatabase()) {
    return fehler(503, 'Keine Datenbank angebunden; eigene Titel brauchen eine.')
  }

  const koerper = KoerperSchema.safeParse(await request.json().catch(() => null))
  if (!koerper.success) return fehler(400, 'Erwartet: { ticker }')
  const ticker = koerper.data.ticker.toUpperCase()

  const bestand = await gesamteWatchlist()
  if (bestand.some((entry) => entry.ticker === ticker)) {
    return fehler(409, `${ticker} ist schon in der Watchlist.`)
  }

  if (koerper.data.markt === 'xetra') return xetraHinzufuegen(ticker)

  const userAgent = process.env['SEC_USER_AGENT']?.trim() ?? ''
  if (!userAgent.includes('@')) return fehler(503, 'SEC_USER_AGENT fehlt.')

  const index = await ladeSucheIndex(userAgent)
  const eintrag = index.find((kandidat) => kandidat.ticker === ticker)
  if (eintrag === undefined) {
    return fehler(404, `${ticker} steht nicht im SEC-Verzeichnis.`)
  }
  const venue = venueForExchange(eintrag.exchange)
  if (venue === null) {
    return fehler(
      422,
      `Handelsplatz ${eintrag.exchange === '' ? 'unbekannt' : eintrag.exchange} wird nicht unterstuetzt (nur Nasdaq und NYSE).`,
    )
  }

  const neu = WatchlistEntrySchema.parse({
    ticker,
    name: eintrag.name,
    venue,
    cik: eintrag.cik,
    // Erwartung, keine Messung: ob der Emittent 10-Q oder 6-K
    // einreicht, zeigt der erste Abruf; die Erwartung steuert nur,
    // dass Berichtszahlen ueberhaupt versucht werden.
    expectedCoverage: 'sec_domestic',
  })

  await ensureSchema()
  await addCustomTitle(neu)
  console.info(`watchlist: ${ticker} hinzugefuegt (${venue}, ${eintrag.name})`)
  return NextResponse.json({ ok: true, ticker, name: eintrag.name, venue })
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  if (!hasDatabase()) return fehler(503, 'Keine Datenbank angebunden.')

  const koerper = KoerperSchema.safeParse(await request.json().catch(() => null))
  if (!koerper.success) return fehler(400, 'Erwartet: { ticker }')
  const ticker = koerper.data.ticker.toUpperCase()

  if (WATCHLIST.some((entry) => entry.ticker === ticker)) {
    return fehler(422, `${ticker} gehoert zum festen Grundstock und laesst sich nicht entfernen.`)
  }

  await ensureSchema()
  const entfernt = await removeCustomTitle(ticker)
  if (!entfernt) return fehler(404, `${ticker} ist kein selbst hinzugefuegter Titel.`)
  console.info(`watchlist: ${ticker} entfernt`)
  return NextResponse.json({ ok: true, ticker })
}

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { WATCHLIST } from '@/config/watchlist'
import { loadCikIndex, measureCoverage } from '@/diagnostics/coverage'
import type { CoverageRow } from '@/diagnostics/coverage'
import { checkConfiguration } from '@/diagnostics/config'
import { probeSources } from '@/diagnostics/sources'

/**
 * Misst, was von hier aus erreichbar ist. Schreibt nichts.
 *
 * Frueher lag das in zwei GitHub-Workflows, von denen einer sein
 * Ergebnis ins Repository committet hat. Beides war falsch am Platz:
 * Die Frage lautet "was erreicht diese Anwendung", und die beantwortet
 * nur ein Abruf von genau hier.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BATCH = 8

function message(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : String(fehler)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams
  const teil = params.get('teil') ?? 'quellen'

  if (teil === 'quellen') {
    // Die Konfigurationspruefung zuerst und ohne Netz: sie beantwortet
    // "habe ich alles eingetragen" auch dann, wenn keine Quelle
    // antwortet, und liefert nur wahr oder falsch, nie einen Wert.
    const konfiguration = checkConfiguration()
    try {
      return NextResponse.json({ ok: true, teil, konfiguration, proben: await probeSources() })
    } catch (fehler) {
      return NextResponse.json(
        { ok: true, teil, konfiguration, proben: [], fehler: message(fehler) },
        { status: 200 },
      )
    }
  }

  if (teil !== 'abdeckung') {
    return NextResponse.json({ ok: false, fehler: `Unbekannter Teil: ${teil}` }, { status: 400 })
  }

  const userAgent = process.env['SEC_USER_AGENT']?.trim() ?? ''
  if (!userAgent.includes('@')) {
    return NextResponse.json(
      { ok: false, fehler: 'SEC_USER_AGENT fehlt oder enthaelt keine Kontakt-E-Mail.' },
      { status: 503 },
    )
  }

  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0)
  const asOf = new Date()
  const zeilen: CoverageRow[] = []

  try {
    const index = await loadCikIndex(userAgent)
    let position = offset
    while (position < WATCHLIST.length && zeilen.length < BATCH) {
      const entry = WATCHLIST[position]
      if (entry === undefined) break
      zeilen.push(await measureCoverage(entry, userAgent, index, asOf))
      position += 1
    }
    const done = position >= WATCHLIST.length
    return NextResponse.json({
      ok: true,
      teil,
      zeilen,
      naechsterOffset: done ? null : position,
      done,
      gesamt: WATCHLIST.length,
    })
  } catch (fehler) {
    return NextResponse.json({ ok: false, fehler: message(fehler) }, { status: 500 })
  }
}

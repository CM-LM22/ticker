import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session'

/**
 * Alles ausser der Anmeldung selbst und den statischen Dateien laeuft
 * durch dieses Gate. Wer kein gueltiges Cookie hat, sieht nichts:
 * keine Kurse, keine Watchlist, keine einzige Seite.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
}

const OFFEN = new Set(['/login', '/api/login'])

export async function middleware(request: NextRequest): Promise<NextResponse | Response> {
  const { pathname, search } = request.nextUrl

  // Zuerst der Cron: er ruft die Adresse auf, die Vercel ihm gibt, und
  // darf weder an der Umleitung noch am Passwort haengen bleiben. Er
  // weist sich mit CRON_SECRET aus; ohne das Secret gibt es diesen Weg
  // nicht.
  const cronSecret = process.env['CRON_SECRET']?.trim()
  if (
    pathname === '/api/refresh' &&
    cronSecret !== undefined &&
    cronSecret.length > 0 &&
    request.headers.get('authorization') === `Bearer ${cronSecret}`
  ) {
    return NextResponse.next()
  }

  // Jede Vercel-Auslieferung ist ein eingefrorener Schnappschuss mit
  // eigener Adresse. Wer eine alte Deployment-URL aus dem Dashboard
  // oeffnet, sieht den damaligen Stand — inklusive Demodaten — ohne es
  // zu merken. Deshalb leiten alle Produktions-Nebenadressen auf die
  // Hauptadresse um, die immer auf den neuesten Stand zeigt.
  const kanonisch = process.env['VERCEL_PROJECT_PRODUCTION_URL']?.trim()
  const host = request.headers.get('host')
  if (
    process.env['VERCEL_ENV'] === 'production' &&
    kanonisch !== undefined &&
    kanonisch.length > 0 &&
    host !== null &&
    host !== kanonisch
  ) {
    const ziel = new URL(`${pathname}${search}`, `https://${kanonisch}`)
    return NextResponse.redirect(ziel, 308)
  }

  if (OFFEN.has(pathname)) return NextResponse.next()


  const password = process.env['APP_PASSWORD']?.trim()

  if (password === undefined || password.length === 0) {
    // In der Entwicklung waere ein Gate ohne Passwort nur laestig.
    if (process.env.NODE_ENV !== 'production') return NextResponse.next()
    // In der Produktion wird nicht durchgewunken, sondern geschlossen.
    // Ein unbemerkt offenes Dashboard ist schlimmer als ein kaputtes.
    return new Response(
      'Passwortschutz ist nicht eingerichtet. APP_PASSWORD in den Umgebungsvariablen setzen.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    )
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (await verifySessionToken(password, token, Date.now())) return NextResponse.next()

  const login = request.nextUrl.clone()
  login.pathname = '/login'
  login.search = ''
  if (pathname !== '/') login.searchParams.set('weiter', `${pathname}${search}`)
  return NextResponse.redirect(login)
}

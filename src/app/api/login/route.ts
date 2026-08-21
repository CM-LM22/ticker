import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  safeRedirectPath,
  timingSafeEqual,
} from '@/lib/session'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData()
  const eingabe = String(form.get('passwort') ?? '')
  const weiter = safeRedirectPath(String(form.get('weiter') ?? '/'))
  const password = process.env['APP_PASSWORD']?.trim() ?? ''

  if (password.length === 0 || !timingSafeEqual(eingabe, password)) {
    const login = new URL('/login', request.url)
    login.searchParams.set('fehler', '1')
    if (weiter !== '/') login.searchParams.set('weiter', weiter)
    // 303 sorgt dafuer, dass der Browser die Weiterleitung mit GET
    // holt und ein Neuladen nicht die Passworteingabe wiederholt.
    return NextResponse.redirect(login, 303)
  }

  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  const response = NextResponse.redirect(new URL(weiter, request.url), 303)
  response.cookies.set({
    name: SESSION_COOKIE,
    value: await createSessionToken(password, expiresAt),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return response
}

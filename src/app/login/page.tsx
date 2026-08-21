import { Disclaimer } from '@/components/Disclaimer'

export const metadata = { title: 'Anmeldung · Ticker' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ weiter?: string; fehler?: string }>
}) {
  const { weiter, fehler } = await searchParams

  return (
    <main className="login">
      <h1>Ticker</h1>
      <p className="lede">Diese Uebersicht ist privat. Bitte Passwort eingeben.</p>

      <form method="post" action="/api/login">
        <input type="hidden" name="weiter" value={weiter ?? '/'} />
        <label htmlFor="passwort">Passwort</label>
        <input
          id="passwort"
          name="passwort"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
        />
        <button type="submit">Anmelden</button>
      </form>

      {fehler !== undefined && (
        <p className="login-error" role="alert">
          Passwort falsch.
        </p>
      )}

      <Disclaimer />
    </main>
  )
}

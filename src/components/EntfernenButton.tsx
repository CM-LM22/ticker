'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Entfernt einen selbst hinzugefuegten Titel aus der Watchlist. Nur
 * fuer solche gerendert; der feste Grundstock hat den Knopf nicht.
 */
export function EntfernenButton({ ticker }: { ticker: string }) {
  const router = useRouter()
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function entfernen(): Promise<void> {
    setLaeuft(true)
    setFehler(null)
    try {
      const antwort = await fetch('/api/watchlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      })
      const daten = (await antwort.json()) as { ok: boolean; fehler?: string }
      if (!daten.ok) {
        setFehler(daten.fehler ?? 'Entfernen fehlgeschlagen.')
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      setFehler('Entfernen fehlgeschlagen, bitte nochmal versuchen.')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <span className="entfernen">
      <button type="button" disabled={laeuft} onClick={() => void entfernen()}>
        {laeuft ? 'Wird entfernt …' : 'Aus der Watchlist entfernen'}
      </button>
      {fehler !== null && <span className="login-error"> {fehler}</span>}
    </span>
  )
}

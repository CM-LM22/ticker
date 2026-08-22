'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Antwort {
  ok: boolean
  verarbeitet?: number
  naechsterOffset?: number | null
  done?: boolean
  gesamt?: number
  fehler?: string
  ergebnisse?: { ticker: string; bars: number; periods: number; note: string | null }[]
}

/**
 * Stoesst den Abruf an und ruft so lange nach, bis die Watchlist durch
 * ist. Der Endpunkt arbeitet stapelweise, damit kein einzelner Aufruf
 * ins Zeitlimit der serverlosen Funktion laeuft.
 */
export function RefreshButton() {
  const router = useRouter()
  const [laeuft, setLaeuft] = useState(false)
  const [fortschritt, setFortschritt] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [hinweise, setHinweise] = useState<string[]>([])

  async function aktualisieren(): Promise<void> {
    setLaeuft(true)
    setFehler(null)
    setHinweise([])
    let offset = 0
    let gesamt = 0
    const gesammelt: string[] = []

    try {
      // Obergrenze als Notbremse: lieber abbrechen als endlos kreisen,
      // falls der Endpunkt keinen Fortschritt mehr meldet.
      for (let runde = 0; runde < 60; runde += 1) {
        const antwort: Antwort = await fetch(`/api/refresh?offset=${offset}&limit=5`, {
          method: 'POST',
        }).then((r) => r.json() as Promise<Antwort>)

        if (!antwort.ok) {
          setFehler(antwort.fehler ?? 'Unbekannter Fehler')
          return
        }

        gesamt += antwort.verarbeitet ?? 0
        for (const ergebnis of antwort.ergebnisse ?? []) {
          if (ergebnis.note !== null) gesammelt.push(`${ergebnis.ticker}: ${ergebnis.note}`)
        }
        setFortschritt(`${gesamt} von ${antwort.gesamt ?? '?'} Titeln`)

        if (antwort.done === true || antwort.naechsterOffset == null) break
        offset = antwort.naechsterOffset
      }

      setHinweise(gesammelt)
      setFortschritt(`fertig, ${gesamt} Titel`)
      router.refresh()
    } catch (ursache) {
      setFehler(ursache instanceof Error ? ursache.message : String(ursache))
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <div className="refresh">
      <button type="button" onClick={() => void aktualisieren()} disabled={laeuft}>
        {laeuft ? 'Wird geholt …' : 'Daten aktualisieren'}
      </button>
      {fortschritt !== null && <span className="muted"> {fortschritt}</span>}
      {fehler !== null && <p className="login-error">{fehler}</p>}
      {hinweise.length > 0 && (
        <details className="refresh-notes">
          <summary>{hinweise.length} Titel mit Hinweis</summary>
          <ul>
            {hinweise.map((hinweis) => (
              <li key={hinweis}>{hinweis}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

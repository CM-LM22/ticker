'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { SPRACHE_COOKIE, texte } from '@/lib/sprache'
import type { Sprache } from '@/lib/sprache'

type Thema = 'auto' | 'hell' | 'dunkel'

function themaAnwenden(thema: Thema): void {
  const wurzel = document.documentElement
  if (thema === 'auto') wurzel.removeAttribute('data-theme')
  else wurzel.setAttribute('data-theme', thema === 'hell' ? 'light' : 'dark')
}

/**
 * Die zwei Schalter oben rechts: Sprache (Cookie, Seite laedt Inhalte
 * neu) und Erscheinungsbild (Auto folgt dem Geraet, sonst fest hell
 * oder dunkel; gemerkt im Browser).
 */
export function KopfSchalter({ sprache }: { sprache: Sprache }) {
  const router = useRouter()
  const t = texte(sprache)
  const [thema, setThema] = useState<Thema>('auto')

  useEffect(() => {
    try {
      const gemerkt = localStorage.getItem('thema')
      if (gemerkt === 'hell' || gemerkt === 'dunkel') setThema(gemerkt)
    } catch {
      // Ohne Speicher bleibt es bei Auto.
    }
  }, [])

  function spracheWechseln(): void {
    const neu = sprache === 'de' ? 'en' : 'de'
    document.cookie = `${SPRACHE_COOKIE}=${neu};path=/;max-age=31536000;samesite=lax`
    router.refresh()
  }

  function themaWechseln(): void {
    const reihenfolge: Thema[] = ['auto', 'hell', 'dunkel']
    const neu = reihenfolge[(reihenfolge.indexOf(thema) + 1) % reihenfolge.length] ?? 'auto'
    setThema(neu)
    themaAnwenden(neu)
    try {
      if (neu === 'auto') localStorage.removeItem('thema')
      else localStorage.setItem('thema', neu)
    } catch {
      // Nicht speicherbar: gilt dann nur fuer diese Ansicht.
    }
  }

  const themaWort =
    thema === 'auto' ? t.themaAuto : thema === 'hell' ? t.themaHell : t.themaDunkel
  const themaZeichen = thema === 'auto' ? '◐' : thema === 'hell' ? '☀' : '☾'

  return (
    <span className="kopf-schalter">
      <button type="button" onClick={spracheWechseln} aria-label="Sprache wechseln">
        {sprache === 'de' ? 'EN' : 'DE'}
      </button>
      <button type="button" onClick={themaWechseln} aria-label="Erscheinungsbild wechseln">
        {themaZeichen} {themaWort}
      </button>
    </span>
  )
}

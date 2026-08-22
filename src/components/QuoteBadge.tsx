'use client'

import { useEffect, useState } from 'react'
import { formatNumber, formatPercent } from '@/lib/format'

interface Quote {
  ticker: string
  price: number
  changePct: number | null
  currency: string
}

/**
 * Aktueller Kurs eines einzelnen Titels, gespeist aus demselben
 * /api/quotes wie die Uebersicht. Der Endpunkt haelt den Zwischenspeicher,
 * dieser Aufruf hier kostet also kein zusaetzliches Kontingent.
 */
export function QuoteBadge({ ticker }: { ticker: string }) {
  const [quote, setQuote] = useState<Quote | null>(null)

  useEffect(() => {
    let aktiv = true
    const holen = async (): Promise<void> => {
      try {
        const antwort = (await fetch('/api/quotes').then((r) => r.json())) as {
          quotes: Quote[]
        }
        if (!aktiv) return
        setQuote(antwort.quotes.find((eintrag) => eintrag.ticker === ticker) ?? null)
      } catch {
        // still bleiben, der gespeicherte Schlusskurs steht ja daneben
      }
    }
    void holen()
    const takt = setInterval(() => void holen(), 60_000)
    return () => {
      aktiv = false
      clearInterval(takt)
    }
  }, [ticker])

  if (quote === null) return null
  return (
    <span className="quote-badge">
      <span className="live-dot" aria-hidden="true" />
      {formatNumber(quote.price, 2)} {quote.currency}
      {quote.changePct !== null && (
        <span className={quote.changePct >= 0 ? 'up' : 'down'}>
          {' '}
          {formatPercent(quote.changePct)}
        </span>
      )}
    </span>
  )
}

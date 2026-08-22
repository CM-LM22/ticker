import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import { alsSprache, SPRACHE_COOKIE } from '@/lib/sprache'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ticker',
  description: 'Benachrichtigungen zu Quartalszahlen und Analystenratings',
}

// Setzt ein gemerktes Erscheinungsbild vor dem ersten Zeichnen, damit
// die Seite nicht kurz in der falschen Farbe aufblitzt.
const THEMA_SCRIPT = `try{var t=localStorage.getItem('thema');if(t==='hell')document.documentElement.setAttribute('data-theme','light');else if(t==='dunkel')document.documentElement.setAttribute('data-theme','dark');}catch(e){}`

export default async function RootLayout({ children }: { children: ReactNode }) {
  const sprache = alsSprache((await cookies()).get(SPRACHE_COOKIE)?.value)
  return (
    <html lang={sprache}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEMA_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

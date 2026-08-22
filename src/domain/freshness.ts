/**
 * Entscheidet, ob ein erneuter Abruf noetig ist.
 *
 * Der Grund fuer diese Datei: Die Gratis-Tarife sind knapp (Twelve Data
 * erlaubt 8 Abrufe je Minute und 800 am Tag), und ein abgebrochener
 * Lauf soll beim naechsten Druck auf den Knopf nur die Luecken fuellen,
 * statt alles noch einmal zu holen. Rein und ohne Uhr: der Stichtag
 * kommt herein, damit die Regeln testbar bleiben.
 */

const DAY_MS = 86_400_000

/**
 * Kurse gelten als frisch, wenn der neueste gespeicherte Handelstag
 * hoechstens zwei Kalendertage zurueckliegt. Zwei Tage, nicht einer:
 * am Sonntag ist der Freitagsschluss der aktuellste, den es gibt.
 */
export function kurseSindFrisch(neuesterTag: string | null, heute: Date): boolean {
  if (neuesterTag === null) return false
  const tag = new Date(`${neuesterTag}T00:00:00Z`)
  if (Number.isNaN(tag.getTime())) return false
  // In Kalendertagen rechnen, nicht in Stunden: der Handelstag ist ein
  // Datum ohne Uhrzeit, und Sonntagmittag ist der Freitag zwei Tage
  // her, egal wie spaet es ist.
  const heuteTag = Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth(), heute.getUTCDate())
  return heuteTag - tag.getTime() <= 2 * DAY_MS
}

/**
 * Berichtszahlen und Konsensstaende aendern sich selten; einmal am Tag
 * nachsehen reicht. Massgeblich ist der letzte erfolgreiche Abruf,
 * nicht das Alter der Daten: ein Unternehmen ohne neue Zahlen ist kein
 * Grund, die SEC im Minutentakt zu fragen.
 */
export function abrufIstFrisch(letzterErfolg: Date | null, jetzt: Date): boolean {
  if (letzterErfolg === null) return false
  return jetzt.getTime() - letzterErfolg.getTime() <= 20 * 60 * 60 * 1000
}

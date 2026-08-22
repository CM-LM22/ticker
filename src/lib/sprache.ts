/**
 * Zweisprachige Oberflaeche, bewusst als flaches Woerterbuch: keine
 * i18n-Bibliothek, keine Platzhaltersprache. Die Sprache liegt im
 * Cookie "sprache"; Serverseiten lesen es ueber next/headers, die
 * Client-Bausteine bekommen sie als Prop.
 *
 * Uebersetzt ist die Bedienoberflaeche. Die aus den Daten erzeugten
 * Saetze (Einstufung, Trend, Hinweise der Abrufe) und der
 * Ein-Seiten-Bericht bleiben vorerst deutsch; die woertlichen Zitate
 * stehen ohnehin in der Sprache des Originalberichts.
 */

export type Sprache = 'de' | 'en'

export const SPRACHE_COOKIE = 'sprache'

export function alsSprache(wert: string | undefined): Sprache {
  return wert === 'en' ? 'en' : 'de'
}

const DE = {
  suchePlatzhalter: 'Titel suchen …',
  sucheLabel: 'Titel suchen',
  tabAlle: 'Alle',
  tabNasdaq: 'Nasdaq',
  tabDax: 'DAX',
  kurseUm: 'Kurse',
  uhr: 'Uhr',
  stand: 'Stand',
  spalteTitel: 'Titel',
  spalteKurs: 'Kurs',
  spalteHeute: 'heute',
  spalte52w: '52 Wochen',
  spalte12m: '12 Mon.',
  spalteBand: 'im Band',
  spalteZahlen: 'naechste Zahlen',
  spaltePunkte: 'Punkte',
  nichtSchaetzbar: 'nicht schaetzbar',
  keinTreffer: 'Kein Titel passt zu dieser Suche.',
  neuHinzufuegen: 'Neu hinzufuegen',
  neuErklaerung:
    'US-Titel aus dem offiziellen SEC-Verzeichnis, deutsche Titel von der Tradegate-Boerse — beides ohne Abruflimit, die Suche laeuft automatisch. Nach dem Hinzufuegen werden die Daten sofort geholt.',
  keinSecTreffer: 'Kein weiterer Treffer im SEC-Verzeichnis.',
  hinzufuegen: 'Hinzufuegen',
  xetraSuchen: 'Notbehelf: Alpha-Vantage-Suche (XETRA)',
  xetraSucht: 'Sucht …',
  xetraKosten: 'Verbraucht einen von 25 Alpha-Vantage-Tagesabrufen, deshalb erst auf Klick.',
  keinXetraTreffer: 'Kein XETRA-Treffer fuer diese Suche.',
  berichteLink: 'Reports',
  tabXetra: 'Xetra',
  xetraLeer: 'Noch keine eigenen Xetra-Titel. Oben im Suchfeld einen Titel suchen und hinzufuegen — entfernen geht hier in der Zeile.',
  entfernen: 'Entfernen',
  reportOriginal: 'Report (Original)',
  zurueckZurApp: 'Zurueck zur Uebersicht',
  analystenLink: 'Analysten',
  diagnoseLink: 'Diagnose',
  abmelden: 'Abmelden',
  aktualisieren: 'Daten aktualisieren',
  wirdGeholt: 'Wird geholt …',
  zurueck: '← Uebersicht',
  einSeiten: 'Summary (PDF)',
  themaAuto: 'Auto',
  themaHell: 'Hell',
  themaDunkel: 'Dunkel',
}

export type Texte = typeof DE

const EN: Texte = {
  suchePlatzhalter: 'Search stocks …',
  sucheLabel: 'Search stocks',
  tabAlle: 'All',
  tabNasdaq: 'Nasdaq',
  tabDax: 'DAX',
  kurseUm: 'Quotes',
  uhr: '',
  stand: 'As of',
  spalteTitel: 'Stock',
  spalteKurs: 'Price',
  spalteHeute: 'today',
  spalte52w: '52 weeks',
  spalte12m: '12 mo.',
  spalteBand: 'in range',
  spalteZahlen: 'next earnings',
  spaltePunkte: 'Score',
  nichtSchaetzbar: 'not estimable',
  keinTreffer: 'No stock matches this search.',
  neuHinzufuegen: 'Add new',
  neuErklaerung:
    'US stocks from the official SEC directory, German stocks from the Tradegate exchange — both without request limits, searched automatically. Data is fetched right after adding.',
  keinSecTreffer: 'No further match in the SEC directory.',
  hinzufuegen: 'Add',
  xetraSuchen: 'Fallback: Alpha Vantage search (XETRA)',
  xetraSucht: 'Searching …',
  xetraKosten: 'Uses one of 25 daily Alpha Vantage requests, so it only runs on click.',
  keinXetraTreffer: 'No XETRA match for this search.',
  berichteLink: 'Reports',
  tabXetra: 'Xetra',
  xetraLeer: 'No own Xetra stocks yet. Search above and add one — remove it right here in the row.',
  entfernen: 'Remove',
  reportOriginal: 'Report (original)',
  zurueckZurApp: 'Back to overview',
  analystenLink: 'Analysts',
  diagnoseLink: 'Diagnostics',
  abmelden: 'Sign out',
  aktualisieren: 'Refresh data',
  wirdGeholt: 'Fetching …',
  zurueck: '← Overview',
  einSeiten: 'Summary (PDF)',
  themaAuto: 'Auto',
  themaHell: 'Light',
  themaDunkel: 'Dark',
}

export function texte(sprache: Sprache): Texte {
  return sprache === 'en' ? EN : DE
}

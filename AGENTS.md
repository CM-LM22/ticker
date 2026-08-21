# Arbeitsregeln

Verbindlich fuer jede Sitzung an diesem Repository, auch fuer Menschen.

## Produkt

Die App meldet Quartalszahlen-Ankuendigungen und Analystenratings zu einer
festen Watchlist. Sie ist keine Anlageberatung, gibt keine Empfehlungen und
handelt nicht. Jede Oberflaeche und jeder Alert traegt den Disclaimer.

## Geld

Solange nicht ausdruecklich etwas anderes entschieden wird, gilt: **nur
Gratis-Tarife**. Kein Datenabo, bevor die App laeuft und der Mangel in der
Praxis sichtbar ist. Wer einen Anbieter vorschlaegt, nennt gemessene Zahlen,
keine Angaben von dessen Website. Der Aufruestpfad ist entschieden und steht
in `docs/decisions.md`; er wird nicht neu diskutiert, sondern nur ausgeloest.

## Datengrenzen

- Jede fremde Antwort wird mit Zod geparst, bevor sie den Rest des Codes
  erreicht. Kein `as`, kein `any`, kein ungeprueftes `JSON.parse`.
- Fehlerhafte Datensaetze lassen den Lauf nicht platzen: einzelne Titel
  duerfen scheitern, der Lauf protokolliert und macht weiter.
- Die Rohantwort wird gekuerzt mitgespeichert (`event.raw`). Ohne sie ist
  ein Parserfehler nach dem Ereignis nicht mehr rekonstruierbar.

## SEC EDGAR

- `User-Agent` mit Projektname **und** Kontakt-E-Mail ist Pflicht. Ohne ihn
  antwortet EDGAR mit HTTP 403.
- Hoechstens 10 Anfragen pro Sekunde. Im Code bleiben wir darunter.
- Adressiert wird ueber die zehnstellige CIK, nicht ueber das Kuerzel.

## Idempotenz

Jedes Ereignis bekommt seinen Schluessel aus `src/domain/idempotency.ts`.
Doppelte Alerts sind der haeufigste Fehlerfall dieser Art von App. Der
Schluessel ist die erste Verteidigungslinie, der Unique-Index auf `event.id`
die zweite. Beide bleiben.

Ratings kommen als Momentaufnahme, nie als Strom. Der Strom entsteht durch
`diffRatings`. Der erste Snapshot eines Titels loest niemals Alerts aus.

## Tests

- Domaenenlogik ist rein und wird mit Vitest getestet. Kein Netz, keine Uhr,
  keine Datenbank in `src/domain/`.
- Zeit kommt als Parameter herein, nicht aus `new Date()` im Inneren.
- Anbieter werden in Tests durch die Attrappen aus `src/providers/fakes/`
  ersetzt. Tests rufen niemals echte Endpunkte auf.

## Betrieb

- Secrets nur in GitHub-Actions-Secrets und in Vercel, niemals im Repository.
  `.env.example` enthaelt Namen, keine Werte.
- Das Repository ist oeffentlich, Actions-Minuten sind damit unbegrenzt
  frei und der Poller laeuft im 15-Minuten-Takt. Wer das Repository auf
  privat stellt, muss den Takt auf 30 Minuten senken, sonst reissen die
  2.000 Freiminuten.
- Oeffentlich heisst auch: die Watchlist ist lesbar. Nichts ins
  Repository schreiben, was nicht jeder sehen darf.
- Postgres ist die Queue. Kein zusaetzlicher Dienst ohne zwingenden Grund;
  jeder weitere Gratis-Tarif ist ein weiteres Kontingent, das auslaufen kann.

## Zugang zur Oberflaeche

Die gesamte Oberflaeche liegt hinter einem Passwort-Gate
(`src/middleware.ts`). Wer eine neue Route hinzufuegt, prueft, ob sie in
die Ausnahmeliste gehoert; im Zweifel gehoert sie es nicht. Ohne
`APP_PASSWORD` schliesst die Anwendung in der Produktion, statt offen zu
stehen. Diese Richtung nie umdrehen.

## Schichten

`Ingestion -> Normalisierung -> Matching -> Zustellung`. Jede Schicht kennt
nur die naechste. Anbieterspezifisches bleibt in `src/providers/`; die
Domaene weiss nicht, woher ihre Daten kommen.

## Slices

- **0 Geruest** (fertig): Domaenenmodell, Anbieter-Interfaces, Schema, Tests.
- **1 EDGAR-Poller**: Ereignisspeicher, Deduplizierung, Uebersichtsseite.
- **2 Telegram** mit Zustell-Log.
- **3 Earnings-Termine** aus dem Free Tier, der den Abdeckungstest besteht.
- **4 Ratings-Snapshot** mit Diff.

Kein Slice beginnt, bevor der vorige laeuft.

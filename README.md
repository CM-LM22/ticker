# Ticker

Benachrichtigt ueber Quartalszahlen-Ankuendigungen und Analystenratings zu
einer festen Watchlist aus 20 Nasdaq- und 20 DAX-Titeln.

Stand: **Slice 0 und 5**, plus Ein-Seiten-PDF der Berichte und
dateibasierter Analysten-Push (Telegram, sobald die Secrets stehen).
Domaenenmodell, Anbieter-Interfaces, Kurs- und Bilanzauswertung,
Terminschaetzung und Oberflaeche stehen. Die Oberflaeche nutzt den
eingefrorenen Snapshot in `data/`, sonst Demodaten.

> Keine Anlageberatung, keine Kaufempfehlung, kein automatischer Handel.

## Loslegen

```sh
npm install
npm test          # Domaenenlogik, ohne Netz
npm run typecheck
npm run dev       # Uebersichtsseite unter http://localhost:3000
```

Die Uebersicht verlinkt **Geschäftsberichte als PDF** (`/berichte.pdf`,
eine A4-Seite) und **Analystenmeldungen**. Push fuer neue Rating-Aktionen
laeuft ueber Telegram, sobald die Secrets gesetzt sind; der erste Abruf
loest bewusst keine Alerts aus.

## Zugang

Die Oberflaeche liegt hinter einem Passwort. Gesetzt wird es ueber
`APP_PASSWORD`, lokal in `.env.local`, im Betrieb in den
Umgebungsvariablen von Vercel:

```sh
APP_PASSWORD="langes-zufaelliges-passwort"
```

Ohne die Variable ist in der Produktion keine Seite erreichbar; das ist
Absicht. In der Entwicklung laesst die Middleware ohne Passwort durch.
Ein Passwortwechsel meldet alle Browser ab.

## Abdeckungstests

Beantworten empirisch, was kostenlos ueberhaupt zu bekommen ist. Erst
EDGAR, dann Kurse und Bilanzzahlen; der zweite Test braucht die CIKs aus
dem ersten:

```sh
export SEC_USER_AGENT="ticker-alerts/0.1 (deine@adresse.de)"
npm run coverage:edgar   # -> docs/coverage.md
npm run coverage:data    # -> docs/data-coverage.md
```

Ohne User-Agent mit Kontakt-E-Mail antwortet EDGAR mit HTTP 403.
Alternativ laufen beide als Workflow *Datenabdeckung messen* in GitHub
Actions.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/domain/` | Ereignismodell, Idempotency-Key, Ratings-Diff, Matching, 52-Wochen-Auswertung, Bilanzkennzahlen, Terminschaetzung, Punktzahl. Rein, ohne I/O. |
| `src/providers/` | Anbieter-Interfaces, Stooq, SEC-XBRL, Yahoo-Ratings, Telegram, Attrappen. |
| `src/demo/` | Erfundene Daten fuer die Oberflaeche, bis ein Snapshot vorliegt. |
| `src/lib/` | Anzeigeformate, Chart-Geometrie, Sitzungs-Token, Ein-Seiten-PDF. |
| `src/middleware.ts` | Passwort-Gate vor allen Routen. |
| `src/config/watchlist.ts` | Die 40 beobachteten Titel. |
| `src/db/schema.sql` | Postgres-Schema inklusive Queue-Semantik. Noch nicht migriert. |
| `scripts/edgar-coverage.ts` | Abdeckungstest gegen EDGAR. |
| `scripts/data-coverage.ts` | Abdeckungstest fuer Kurse und Bilanzzahlen. |
| `scripts/fetch-snapshot.ts` | Kurse und Berichtszahlen nach `data/snapshot.json`. |
| `scripts/poll-ratings.ts` | Analystenhandlungen nach `data/ratings-state.json`, optional Telegram. |
| `docs/decisions.md` | Getroffene Entscheidungen mit Begruendung. |
| `AGENTS.md` | Arbeitsregeln. |

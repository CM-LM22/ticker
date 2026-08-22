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

## Daten holen

Die Anwendung holt ihre Daten selbst. In der Uebersicht sitzt der Knopf
**Daten aktualisieren**; er ruft `POST /api/refresh` stapelweise auf, bis
die Watchlist durch ist. Zusaetzlich stoesst Vercel Cron den Endpunkt
einmal taeglich an.

Ein Lauf holt alles: Tageskurse, Berichtszahlen aus XBRL und
oeffentliche Analystenhandlungen. Am Ende geht, sofern eingerichtet, ein
Telegram-Push mit den neuen Meldungen raus. Der erste Lauf speichert nur
den Stand und meldet nichts.

Dafuer braucht es in Vercel unter *Settings, Environment Variables*:

| Variable | wofuer |
| --- | --- |
| `DATABASE_URL` | Neon Postgres, der Speicher |
| `TWELVEDATA_API_KEY` | Kurse |
| `SEC_USER_AGENT` | Berichtszahlen, Form `projekt/0.1 (mail@example.com)` |
| `FINNHUB_API_KEY` | Live-Kurse und Analystenkonsens, kostenloser Schluessel |
| `ALPHA_VANTAGE_API_KEY` | Tageskurse der DAX-Titel (XETRA, Euro), kostenloser Schluessel |
| `CRON_SECRET` | nur damit Vercel Cron ohne Anmeldung durchkommt |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Push bei neuen Analystenmeldungen, optional |

Fehlt `DATABASE_URL`, antwortet der Endpunkt mit 503 und die Oberflaeche
zeigt weiter den letzten Snapshot beziehungsweise Demodaten.

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

## Diagnose

Die Seite `/diagnose` misst, was die Anwendung von ihrem eigenen
Standort aus erreicht: welche Kursquelle antwortet und welche
Watchlist-Titel wirklich bei der SEC gefuehrt werden. Sie schreibt
nichts, sie misst nur.

Das gehoert bewusst in die Anwendung und nicht in einen Workflow: Ob
eine Quelle liefert, haengt an der Adresse, von der gefragt wird. Stooq
und Yahoo sperren geteilte Cloud-Adressen; die Messung aus einem
GitHub-Runner beantwortet deshalb die falsche Frage.

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
| `src/diagnostics/` | Erreichbarkeits- und Abdeckungsmessung hinter `/diagnose`. |
| `src/db/` | Neon-Zugriff, Schema und Speicherschicht. |
| `scripts/fetch-snapshot.ts` | Kurse und Berichtszahlen nach `data/snapshot.json`. |
| `scripts/poll-ratings.ts` | Analystenhandlungen nach `data/ratings-state.json`, optional Telegram. |
| `docs/decisions.md` | Getroffene Entscheidungen mit Begruendung. |
| `AGENTS.md` | Arbeitsregeln. |

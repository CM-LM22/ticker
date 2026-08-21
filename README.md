# Ticker

Benachrichtigt ueber Quartalszahlen-Ankuendigungen und Analystenratings zu
einer festen Watchlist aus 20 Nasdaq- und 20 DAX-Titeln.

Stand: **Slice 0**. Geruest, Domaenenmodell und Anbieter-Interfaces stehen.
Es wird noch keine externe Schnittstelle aufgerufen und keine Datenbank
verbunden.

> Keine Anlageberatung, keine Kaufempfehlung, kein automatischer Handel.

## Loslegen

```sh
npm install
npm test          # Domaenenlogik, ohne Netz
npm run typecheck
npm run dev       # Uebersichtsseite unter http://localhost:3000
```

## Abdeckungstest

Beantwortet, welche Titel der Watchlist ueberhaupt kostenlos ueber SEC EDGAR
zu erreichen sind:

```sh
SEC_USER_AGENT="ticker-alerts/0.1 (deine@adresse.de)" npm run coverage:edgar
```

Ergebnis in `docs/coverage.md`. Ohne User-Agent mit Kontakt-E-Mail antwortet
EDGAR mit HTTP 403. Alternativ laeuft der Test als Workflow
*EDGAR-Abdeckungstest* in GitHub Actions.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/domain/` | Ereignismodell, Idempotency-Key, Ratings-Diff, Matching. Rein, ohne I/O. |
| `src/providers/` | Anbieter-Interfaces samt Faehigkeitsbeschreibung und Attrappen. |
| `src/config/watchlist.ts` | Die 40 beobachteten Titel. |
| `src/db/schema.sql` | Postgres-Schema inklusive Queue-Semantik. Noch nicht migriert. |
| `scripts/edgar-coverage.ts` | Abdeckungstest gegen EDGAR. |
| `docs/decisions.md` | Getroffene Entscheidungen mit Begruendung. |
| `AGENTS.md` | Arbeitsregeln. |

-- Schema fuer Neon Postgres. In Slice 0 nur geschrieben, nicht migriert:
-- es gibt bis Slice 1 keine Datenbankverbindung.
--
-- Postgres ist hier zugleich die Queue. Kein Message Broker, weil ein
-- 30-Minuten-Takt mit ein paar Dutzend Ereignissen pro Tag keinen
-- rechtfertigt und jeder zusaetzliche Dienst ein weiteres Gratis-Kontingent
-- waere, das auslaufen kann.

CREATE TABLE IF NOT EXISTS instrument (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticker      text NOT NULL,
    name        text NOT NULL,
    venue       text NOT NULL CHECK (venue IN ('NASDAQ', 'NYSE', 'XETRA')),
    isin        text,
    -- Zehnstellig mit fuehrenden Nullen, so adressiert die SEC-API.
    cik         char(10),
    -- US-Kuerzel, falls es vom lokalen abweicht (DBK -> DB).
    sec_ticker_hint text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (venue, ticker)
);

CREATE UNIQUE INDEX IF NOT EXISTS instrument_cik_idx ON instrument (cik) WHERE cik IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS instrument_isin_idx ON instrument (isin) WHERE isin IS NOT NULL;

CREATE TABLE IF NOT EXISTS watchlist (
    instrument_id bigint PRIMARY KEY REFERENCES instrument (id) ON DELETE CASCADE,
    active        boolean NOT NULL DEFAULT true,
    added_at      timestamptz NOT NULL DEFAULT now()
);

-- Ereignisse. Der Primaerschluessel ist der Idempotency-Key aus
-- src/domain/idempotency.ts. Er ist die eigentliche Absicherung gegen
-- doppelte Alerts; die Pruefung in der Anwendung ist nur die erste
-- Verteidigungslinie und faellt bei zwei parallelen Laeufen aus.
CREATE TABLE IF NOT EXISTS event (
    id              char(32) PRIMARY KEY,
    source          text NOT NULL,
    source_event_id text NOT NULL,
    kind            text NOT NULL CHECK (kind IN ('filing', 'earnings_schedule', 'rating_change')),
    instrument_id   bigint REFERENCES instrument (id) ON DELETE SET NULL,
    ticker          text NOT NULL,
    cik             char(10),
    occurred_at     timestamptz NOT NULL,
    ingested_at     timestamptz NOT NULL DEFAULT now(),
    payload         jsonb NOT NULL,
    -- Rohantwort der Quelle, gekuerzt. Ohne sie ist ein Parserfehler
    -- nach dem Ereignis nicht mehr nachvollziehbar.
    raw             jsonb,

    -- Queue-Zustand
    status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'skipped')),
    attempts        smallint NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    locked_until    timestamptz,
    last_error      text,

    -- Zweite Absicherung: dieselbe Fremd-ID derselben Quelle nur einmal.
    UNIQUE (source, source_event_id)
);

CREATE INDEX IF NOT EXISTS event_queue_idx
    ON event (next_attempt_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS event_instrument_idx ON event (instrument_id, occurred_at DESC);

-- Zustell-Log, getrennt vom Ereignis. Ein fehlgeschlagener Telegram-Versand
-- soll wiederholbar sein, ohne das Ereignis anzufassen, und jede
-- Zustellung soll auch nachtraeglich belegbar bleiben.
CREATE TABLE IF NOT EXISTS event_delivery (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id            char(32) NOT NULL REFERENCES event (id) ON DELETE CASCADE,
    channel             text NOT NULL,
    status              text NOT NULL CHECK (status IN ('sent', 'failed')),
    provider_message_id text,
    error               text,
    attempted_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_delivery_event_idx ON event_delivery (event_id, attempted_at DESC);

-- Ratings kommen nur als Momentaufnahme. Wir heben jede auf und bilden
-- den Ereignisstrom aus der Differenz zweier aufeinanderfolgender.
-- content_hash verhindert, dass unveraenderte Abrufe die Tabelle fluten.
CREATE TABLE IF NOT EXISTS rating_snapshot (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider      text NOT NULL,
    instrument_id bigint NOT NULL REFERENCES instrument (id) ON DELETE CASCADE,
    fetched_at    timestamptz NOT NULL DEFAULT now(),
    content_hash  char(32) NOT NULL,
    payload       jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS rating_snapshot_latest_idx
    ON rating_snapshot (provider, instrument_id, fetched_at DESC);

-- Fortschrittsmarken je Quelle, damit ein Lauf dort weitermacht, wo der
-- vorige aufgehoert hat (ETag, letzte Accession-Number, Zeitstempel).
CREATE TABLE IF NOT EXISTS provider_cursor (
    provider   text NOT NULL,
    key        text NOT NULL,
    cursor     text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, key)
);

-- Laufprotokoll. Ohne es faellt ein stillstehender Cron erst auf, wenn
-- Zahlen ausbleiben, die man ohnehin nicht erwartet hat.
CREATE TABLE IF NOT EXISTS poll_run (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider       text NOT NULL,
    started_at     timestamptz NOT NULL DEFAULT now(),
    finished_at    timestamptz,
    status         text NOT NULL DEFAULT 'running'
                   CHECK (status IN ('running', 'ok', 'partial', 'failed')),
    items_seen     integer NOT NULL DEFAULT 0,
    events_created integer NOT NULL DEFAULT 0,
    error          text
);

CREATE INDEX IF NOT EXISTS poll_run_recent_idx ON poll_run (provider, started_at DESC);

-- Anspruch auf faellige Ereignisse. SKIP LOCKED sorgt dafuer, dass zwei
-- gleichzeitig laufende Cron-Jobs sich nicht gegenseitig blockieren und
-- kein Ereignis zweimal zugestellt wird. GitHub Actions startet
-- verspaetete Laeufe durchaus ueberlappend.
--
--   UPDATE event SET status = 'processing',
--                    attempts = attempts + 1,
--                    locked_until = now() + interval '5 minutes'
--   WHERE id IN (
--       SELECT id FROM event
--       WHERE status = 'pending' AND next_attempt_at <= now()
--       ORDER BY next_attempt_at
--       LIMIT 20
--       FOR UPDATE SKIP LOCKED
--   )
--   RETURNING *;

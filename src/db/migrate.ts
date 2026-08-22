import { getSql } from './client'

/**
 * Legt an, was noch nicht da ist. Wird vom Aktualisierungsendpunkt vor
 * dem Schreiben aufgerufen, damit es keinen separaten Migrationsschritt
 * beim Deployen braucht.
 *
 * Bewusst nur additiv: Diese Funktion loescht nichts und aendert keine
 * Spalten. Sobald das Schema sich wirklich bewegt, kommt ein richtiges
 * Migrationswerkzeug dazu.
 */
export async function ensureSchema(): Promise<void> {
  const sql = getSql()

  await sql`
    CREATE TABLE IF NOT EXISTS price_bar (
      ticker   text        NOT NULL,
      day      date        NOT NULL,
      open     numeric(14, 4) NOT NULL,
      high     numeric(14, 4) NOT NULL,
      low      numeric(14, 4) NOT NULL,
      close    numeric(14, 4) NOT NULL,
      currency char(3)     NOT NULL,
      source   text        NOT NULL,
      PRIMARY KEY (ticker, day)
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS reported_period (
      ticker            text NOT NULL,
      period_end        date NOT NULL,
      frame             text NOT NULL CHECK (frame IN ('quarter', 'year')),
      label             text NOT NULL,
      period_start      date,
      form              text NOT NULL,
      revenue           numeric(20, 2),
      net_income        numeric(20, 2),
      eps_diluted       numeric(12, 4),
      currency          char(3) NOT NULL,
      filed_at          date NOT NULL,
      accession_number  text,
      source_url        text,
      PRIMARY KEY (ticker, period_end, frame)
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS refresh_run (
      id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ticker      text NOT NULL,
      finished_at timestamptz NOT NULL DEFAULT now(),
      ok          boolean NOT NULL,
      bars        integer NOT NULL DEFAULT 0,
      periods     integer NOT NULL DEFAULT 0,
      note        text
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS refresh_run_recent_idx ON refresh_run (ticker, finished_at DESC)
  `

  // Analystenhandlungen. Der Primaerschluessel ist die Fremd-ID der
  // Quelle: doppelte Meldungen prallen an der Datenbank ab, auch wenn
  // zwei Abrufe gleichzeitig laufen. Das ist die zweite
  // Verteidigungslinie hinter der Pruefung in der Anwendung.
  await sql`
    CREATE TABLE IF NOT EXISTS analyst_action (
      source_event_id text PRIMARY KEY,
      ticker          text NOT NULL,
      firm            text NOT NULL,
      action          text NOT NULL,
      grade_from      text,
      grade_to        text,
      occurred_at     timestamptz NOT NULL,
      ingested_at     timestamptz NOT NULL DEFAULT now(),
      notified        boolean NOT NULL DEFAULT false
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS analyst_action_recent_idx
      ON analyst_action (occurred_at DESC)
  `

  // Merkposten je Quelle. initialized trennt den Erstlauf von allen
  // weiteren: ohne diese Unterscheidung waere der erste Abruf ein
  // Alarmsturm aus jahrealten Meldungen.
  await sql`
    CREATE TABLE IF NOT EXISTS poll_state (
      key         text PRIMARY KEY,
      initialized boolean NOT NULL DEFAULT false,
      fetched_at  timestamptz,
      note        text
    )
  `

  // Analystenkonsens als Monatsstand je Titel. Die Veraenderung
  // zwischen zwei Staenden wird als Meldung in analyst_action gelegt;
  // diese Tabelle haelt nur den Verlauf fuer die Anzeige.
  await sql`
    CREATE TABLE IF NOT EXISTS analyst_trend (
      ticker      text NOT NULL,
      period      char(7) NOT NULL,
      strong_buy  integer NOT NULL,
      buy         integer NOT NULL,
      hold        integer NOT NULL,
      sell        integer NOT NULL,
      strong_sell integer NOT NULL,
      fetched_at  timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (ticker, period)
    )
  `
}

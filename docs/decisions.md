# Entscheidungen

Chronologisch. Was hier steht, wird nicht neu diskutiert, sondern nur
geaendert, wenn ein Messwert dagegen spricht.

## E1 Zuerst eine vollstaendig kostenfreie Version

Kein Datenabo, bevor die App laeuft und der Mangel in der Praxis sichtbar
ist. Begruendung: Welche Luecke wirklich weh tut, zeigt sich erst im
Betrieb, nicht in einer Anbieterliste.

## E2 SEC EDGAR als Fundament

Kostenlos, Atom-Feeds nahezu in Echtzeit, 10 Anfragen pro Sekunde,
User-Agent mit Kontakt-E-Mail zwingend. Relevante Formulare: 8-K Item 2.02,
10-Q, 10-K fuer US-Inlandsemittenten; 6-K und 20-F fuer Foreign Private
Issuers.

## E3 Europaeische Titel nur ueber ihre US-Notierung

Konzerne mit US-Notierung reichen 6-K und 20-F bei der SEC ein. Reine
EU-Titel ohne US-Notierung sind kostenlos nicht abzudecken. Bewusst
akzeptierte Luecke.

**Nachtrag zur DAX-Auswahl:** Von den 20 aufgenommenen DAX-Titeln sind nach
Recherchestand nur vier SEC-registriert: SAP, Deutsche Bank, Fresenius
Medical Care und Qiagen. Die uebrigen 16 haben ihre US-Notierung zwischen
2007 und 2014 aufgegeben und sind bei der SEC abgemeldet. Die Luecke ist
damit groesser als die Formulierung "einige EU-Titel" vermuten laesst. Der
Abdeckungstest misst das nach; bis dahin steht in `watchlist.ts` nur eine
Erwartung.

## E4 Aufruestpfad steht fest, ist aber nicht ausgeloest

EODHD Fundamentals, 59,99 EUR/Monat, deckt Europa vollstaendig ab. Finnhub
und FMP wurden verworfen, weil Europa dort zu teuer oder erst in der
hoechsten Stufe enthalten ist. Eine kostenlose offizielle EU-Quelle
existiert nicht. Ausgeloest wird der Pfad erst, wenn der Betrieb zeigt,
dass die Luecke stoert.

## E5 GitHub Actions als Scheduler, 15-Minuten-Takt

**Korrigiert am 21.08.2026.** Die urspruengliche Rechnung ging von einem
privaten Repository mit 2.000 Freiminuten aus und kam deshalb auf einen
30-Minuten-Takt. `CM-LM22/ticker` ist aber oeffentlich, und fuer
oeffentliche Repositories sind Actions-Minuten auf den
Standard-Runnern unbegrenzt frei. Die Minutenrechnung ist damit
gegenstandslos.

Entschieden: Das Repository bleibt oeffentlich, der Poller laeuft im
15-Minuten-Takt. Bewusst in Kauf genommen wird, dass die Watchlist
oeffentlich lesbar ist. Sobald sie persoenliche Zuege bekommt, ist das
neu abzuwaegen; die Umstellung auf privat dauert zehn Sekunden, holt
aber nichts zurueck, was bis dahin geklont wurde.

Vercel Hobby scheidet weiterhin aus: nur ein Cronlauf pro Tag.

Zwei Vorbehalte, die zum Betrieb gehoeren:
- Geplante Workflows starten unter Last regelmaessig 5 bis 15 Minuten
  verspaetet. Die Zusage lautet also "innerhalb einer halben bis dreiviertel
  Stunde", nicht "in Echtzeit".
- GitHub deaktiviert Cron-Workflows nach 60 Tagen ohne Repository-Aktivitaet.

In CI laeuft trotzdem nur Typpruefung und Test, kein `next build`. Nicht
mehr aus Minutengruenden, sondern weil auf Vercel ohnehin gebaut wird und
ein zweiter Build nichts pruefen wuerde, was der erste nicht prueft.

Was bei einem oeffentlichen Repository zusaetzlich gilt: Secrets bleiben
verborgen, werden in Logs geschwaerzt und stehen Pull Requests aus
fremden Forks nicht zur Verfuegung. `workflow_dispatch` laesst sich nur
mit Schreibrechten ausloesen. Der Abdeckungstest ist also nicht von
aussen anstossbar.

## E6 Postgres ist die Queue

Kein Message Broker. Anspruch auf faellige Ereignisse ueber
`FOR UPDATE SKIP LOCKED`, Zustandsspalten auf `event`, Zustell-Log in
`event_delivery`. Begruendung: ein paar Dutzend Ereignisse pro Tag
rechtfertigen keinen weiteren Dienst, und jeder weitere Gratis-Tarif ist
ein weiteres Kontingent, das auslaufen kann.

## E7 Ratings sind ein Snapshot, kein Strom

Kostenlose Anbieter liefern nur den aktuellen Stand. Den Ereignisstrom
erzeugen wir selbst: pollen, gegen den letzten Stand diffen, Differenz als
Ereignis. Zwei Regeln sind fest verdrahtet und in Tests festgehalten:

- Der erste Snapshot eines Titels loest nie einen Alert aus.
- Fallengelassene Ratings werden standardmaessig **nicht** gemeldet. Die
  meisten Free Tiers liefern ein rollierendes Fenster; ein Haus verschwindet
  daraus, weil sein Rating alt wird, nicht weil es die Abdeckung eingestellt
  hat. Wer `emitDrops` einschaltet, bekommt falsche Alerts.

## E8 Kein ORM in Slice 0

`src/db/schema.sql` ist die Quelle der Wahrheit. Begruendung: In Slice 0
gibt es keine Datenbankverbindung, an der sich ein ORM bewaehren koennte,
und die Queue-Abfrage mit `FOR UPDATE SKIP LOCKED` schreibt man ohnehin von
Hand. Ob in Slice 1 Drizzle oder das nackte Postgres-Protokoll dazukommt,
entscheidet sich dort, wo es Konsequenzen hat.

## E9 Keine erfundenen Kennnummern

`isin` und `cik` bleiben in `src/config/watchlist.ts` leer, bis sie
gemessen sind. Eine falsche Kennnummer matcht still auf den falschen Titel
und ist schlimmer als eine fehlende, die laut scheitert. Die CIK traegt der
Abdeckungstest nach.

## E10 Zod 3

`zod@^3.25`, klassische API. Kein technischer Grund gegen Zod 4, nur der
Wunsch nach einer Abhaengigkeit weniger, die sich unter uns bewegt, solange
das Datenmodell entsteht.

## E11 Der Abdeckungstest laeuft nicht in der Entwicklungsumgebung

Die Sandbox, in der Slice 0 entstanden ist, hat keinen Netzzugang zu
`sec.gov`. Der Test ist deshalb als Skript plus Actions-Workflow gebaut und
nicht als einmalige Handmessung: er ist reproduzierbar, versioniert und
laeuft dort, wo Egress erlaubt ist.

## E12 Aus der Alert-App wird ein Research-Dashboard

Gewuenscht sind Kurse, 52-Wochen-Verlauf, Termine, Zusammenfassungen der
letzten Berichte und daraus abgeleitet eine Einschaetzung, welche Titel
interessant sind. Das ist eine Erweiterung des Produkts, nicht nur ein
weiterer Slice: die Alerts bleiben, aber der Schwerpunkt verschiebt sich
von "melde mir Ereignisse" zu "zeig mir den Stand".

Folge fuer die Reihenfolge: Kurse und Kennzahlen sind wertvoller, wenn
man sie sieht, als wenn sie im Hintergrund alarmieren. Deshalb kommt die
Ansicht vor der Zustellung.

## E13 Kurse ueber Stooq

Tages-CSV, kein Schluessel, keine Anmeldung, amerikanische und deutsche
Titel. Damit sind auch die 16 DAX-Titel ohne SEC-Registrierung mit
Kursen abgedeckt, wenn auch ohne Bilanzzahlen.

Verworfen: Alpha Vantage im Gratis-Tarif mit 25 Abrufen pro Tag, das
reicht bei 40 Titeln nicht fuer einen einzigen vollstaendigen Lauf. Die
inoffizielle Yahoo-Schnittstelle waere ergiebiger, ist aber
undokumentiert und kann jederzeit verschwinden; als Ausweichquelle
vorgemerkt, nicht als Fundament.

Die Faehigkeitsbeschreibung von Stooq steht auf `vendor_claim`, bis
`npm run coverage:data` gemessen hat, wie viele der 40 Titel wirklich
geliefert werden. Erst dann `measured`.

## E14 Bilanzzahlen ueber die XBRL-Schnittstelle der SEC

Wer bei der SEC einreicht, liefert seine Zahlen maschinenlesbar mit.
`companyfacts` gibt Umsatz, Nettoergebnis und Ergebnis je Aktie ohne
Schluessel und ohne Kontingent heraus. Das ist die kostenlose Antwort auf
"Zusammenfassung der letzten Berichte" und gilt fuer alle 24 Titel mit
SEC-Registrierung.

Zwei Grenzen, die bleiben: Es gilt, was das Unternehmen selbst getaggt
hat, und Konzepte heissen je nach Taxonomie anders. Deshalb die
Prioritaetslisten in `src/providers/sec-xbrl.ts`. Kumulierte Halbjahres-
und Neunmonatswerte werden an ihrer Dauer erkannt und aussortiert; ohne
das vergleicht man Neunmonats- mit Quartalsumsatz.

## E15 Zahlentermine werden geschaetzt, nicht gekauft

Ein verlaesslicher Earnings-Kalender ist kostenlos schwer zu bekommen.
Der Einreichungsverlauf bei EDGAR ist es nicht. Unternehmen berichten
Jahr fuer Jahr zu erstaunlich aehnlichen Kalenderterminen, deshalb
schaetzt `estimateNextEarnings` den naechsten Termin aus dem Vorjahres-
termin plus einem Jahr.

Entscheidend ist die Selbstpruefung: dieselbe Regel wird rueckwirkend auf
die bekannten Termine angewendet und der Fehler gemessen. Angezeigt wird
nicht nur ein Datum, sondern ein Korridor und die gemessene
Treffsicherheit. Eine ausgewiesene Schaetzung ist ehrlicher als ein
Termin, der so tut, als sei er bestaetigt.

Damit wird Slice 3 kleiner: ein bezahlter Kalender muss nur noch besser
sein als diese Schaetzung, nicht besser als nichts.

## E16 Die Punktzahl ist eine Rangfolge, keine Empfehlung

`screen()` verdichtet sechs gewichtete Signale zu einer Zahl von 0 bis
100. Drei Regeln machen den Unterschied zwischen einer nachvollziehbaren
Rangfolge und einem Orakel:

- Jedes Signal zeigt Rohwert, Gewicht, Normierung und Begruendung an.
  Wer die Zahl nicht nachrechnen kann, soll ihr nicht glauben muessen.
- Fehlende Daten zaehlen nicht als null. Ein Titel ohne Bilanzzahlen ist
  kein schlechter Titel, sondern ein unbekannter. Stattdessen wird
  `coverage` ausgewiesen und ueberall mit angezeigt.
- Zwei Kennzahlen bekommen bewusst kein Gewicht: die Position im
  52-Wochen-Band und der Abstand zum Hoch. Beide sind zweideutig. Nah am
  Tief ist ein Schnaeppchen oder ein Warnzeichen, und welches von beidem,
  entscheidet keine Formel.

Die Auswahl der Kriterien ist eine Setzung, keine Erkenntnis. Der
Disclaimer bleibt.

## E17 Demodaten sind erkennbar erfunden

Solange keine Datenbank angebunden ist, speist sich die Oberflaeche aus
`src/demo/`. Die Reihen entstehen aus einem festen Zufallsgenerator, sind
also reproduzierbar, und jede Seite sagt oben an, dass sie erfunden sind.

Bewusst nachgebildet wird auch die Luecke: Titel ohne SEC-Registrierung
bekommen in der Demo Kurse, aber keine Bilanzzahlen und keinen
Termin. Eine Demo, die vollstaendiger aussieht als die Wirklichkeit,
waere die schlechtere Demo.

## E18 Passwortschutz in der Anwendung, nicht bei Vercel

Die Oberflaeche soll oeffentlich erreichbar, aber nicht oeffentlich
lesbar sein. Vercel bietet auf dem Hobby-Tarif nur *Vercel
Authentication*, und das schuetzt allein Preview-Deployments und die
technischen Deployment-URLs; die Produktionsdomain bleibt offen. Echter
Passwortschutz beginnt bei Enterprise beziehungsweise einem Zusatzpaket
fuer 150 Dollar im Monat. Fuer ein privates Dashboard ist das keine
Option.

Gebaut wurde daher das, was Vercel fuer diesen Fall selbst empfiehlt: ein
Gate in der Anwendung. Eine Middleware vor allen Routen, Passwort in
`APP_PASSWORD`, nach der Eingabe ein signiertes Cookie.

Entscheidungen im Detail:

- **Der Signaturschluessel ist das Passwort selbst.** Damit gibt es nur
  ein Geheimnis zu verwalten, und ein Passwortwechsel macht alle
  bestehenden Sitzungen ungueltig, ohne dass es dafuer einen zweiten
  Schalter braucht.
- **Ohne `APP_PASSWORD` wird in der Produktion geschlossen**, nicht
  durchgewunken: HTTP 503 mit Klartexthinweis. Ein unbemerkt offenes
  Dashboard ist schlimmer als ein sichtbar kaputtes. In der Entwicklung
  laesst die Middleware durch, dort waere das Gate nur laestig.
- **Vergleiche laufen ohne Zeitunterschied**, sowohl fuer das Passwort
  als auch fuer die Signatur.
- **Weiterleitungsziele werden geprueft.** Ohne das waere
  `/login?weiter=//fremde.seite` eine offene Weiterleitung.

Bewusst nicht gebaut: eine Sperre nach zu vielen Fehlversuchen. Auf einer
Plattform ohne gemeinsamen Zustand zwischen Aufrufen waere ein Zaehler im
Speicher wirkungslos, und ein Zaehler in Postgres kostet bei jedem
Seitenaufruf eine Abfrage. Der Ersatz ist ein langes, zufaelliges
Passwort; der Hinweis steht in `.env.example`.

Unberuehrt davon bleibt E5: Das Repository ist oeffentlich, die Website
ist es nicht. Das sind zwei Schalter.

## E19 Ein-Seiten-PDF und Analysten-Push ohne Datenbank

Gewuenscht sind die juengsten Geschaeftsberichte aller Watchlist-Titel
auf einer PDF-Seite und eine Push-Nachricht, sobald zu einem Titel eine
neue Analystenmeldung erscheint.

Berichtszahlen kommen aus dem vorhandenen Snapshot (SEC XBRL). Titel
ohne SEC-Registrierung stehen als Luecke, nicht als Null. Das PDF ist
eine Seite A4; die HTML-Ansicht `/berichte` ist dieselbe Tabelle.

Volltexte von Sell-Side-Research sind kostenpflichtig und bleiben draussen.
Kostenlos sichtbar sind veroeffentlichte Rating-Aktionen. Quelle ist die
undokumentierte Upgrade-Historie von Yahoo Finance (E13: Ausweichquelle,
`vendor_claim`). Der erste erfolgreiche Abruf speichert nur den Stand.

Zustellung ueber Telegram, sobald `TELEGRAM_BOT_TOKEN` und
`TELEGRAM_CHAT_ID` gesetzt sind. Ohne Secrets erscheinen die Meldungen
nur in der Oberflaeche. Der Stand liegt in `data/ratings-state.json`,
analog zum Kurssnapshot, bis Slice 1 die Queue in Postgres hat. Das
ersetzt Slice 1 und 2 nicht; es ist der kleinstmoegliche Weg, die
Ansicht und den Push jetzt zu haben.

## E20 Kostenlose Kursquellen ohne Schluessel scheitern an der Cloud-IP

**Gemessen am 22.08.2026** im Workflow *Kursquellen pruefen*, aus einem
GitHub-Actions-Runner heraus:

| Quelle | AAPL (US) | SAP (DE) |
| --- | --- | --- |
| Stooq | HTML-Bot-Sperre statt CSV, HTTP 200 | dasselbe |
| Yahoo Chart v8 | HTTP 429 | HTTP 429 |

Yahoo antwortete auch mit browseraehnlichem User-Agent mit 429, und zwar
bei der zweiten Anfrage ueberhaupt. Das ist keine Frequenzbremse,
sondern eine Sperre der geteilten Cloud-Adressbereiche. Stooq liefert
eine JavaScript-Abfrageseite mit HTTP 200 — wer nur den Statuscode
prueft, speichert HTML als Kurse.

Damit ist E13 ueberholt: Stooq als Fundament faellt aus. Der
Stooq-Adapter bleibt im Code, er ist getestet und funktioniert von
einer nicht gesperrten Adresse aus.

Was daraus folgt:

- **Kurse brauchen einen Anbieter mit Schluessel.** Ein Schluessel ist
  genau das, was einen Abruf von einer geteilten Adresse legitimiert.
  Naechster Kandidat: Twelve Data, Gratis-Tarif mit 800 Abrufen pro Tag
  und 8 pro Minute. Ob der Gratis-Tarif auch XETRA abdeckt, ist offen
  und wird gemessen, nicht geglaubt.
- **Die SEC ist davon nicht betroffen.** Sie stellt ihre Daten
  ausdruecklich zur maschinellen Nutzung bereit und verlangt statt
  eines Schluessels einen User-Agent mit Kontakt-E-Mail. Der
  Bilanzteil sollte also laufen, sobald SEC_USER_AGENT gesetzt ist.
- **Der Umweg ueber eine andere Adresse bleibt offen.** Vercel-Funktionen
  laufen in anderen Netzen als Actions-Runner. Ob Yahoo von dort
  antwortet, laesst sich pruefen, sobald die App deployt ist.

Die Lehre ist nicht neu, aber sie hat sich bezahlt gemacht: Der Parser
hat die Bot-Seite abgefangen, statt sie als Kurse zu speichern. Der
erste Datenlauf hat 40 leere Eintraege mit Begruendung erzeugt und
keine einzige erfundene Zahl.

## E21 Das Backend ist die Anwendung, nicht GitHub Actions

**Korrigiert am 22.08.2026 auf Einwand hin, und der Einwand war richtig.**

Daten in eine JSON-Datei zu holen und ins Repository zu committen war ein
Notbehelf: Die Entwicklungsumgebung hatte keinen Netzzugang, Actions
schon. Als Dauerloesung ist es falsch. Der Zustand lag in der
Versionsverwaltung statt in einer Datenbank, jeder Lauf erzeugte einen
Commit, und anstossen konnte ihn nur, wer Actions bedienen kann.

Neu: `POST /api/refresh` in der Anwendung holt die Daten und schreibt
sie nach Neon Postgres. Angestossen wird er per Knopf in der Oberflaeche
oder taeglich von Vercel Cron. GitHub Actions macht wieder das, wofuer
es da ist: Typpruefung und Tests.

**Kein FastAPI, und zwar aus einem Grund, nicht aus Bequemlichkeit.**
Die Domaenenlogik steht in TypeScript und ist getestet: Zod an jeder
Datengrenze, 52-Wochen-Auswertung, Ratings-Diff, Terminschaetzung. Ein
Python-Backend muesste das nachbauen oder als Weiterleiter danebenstehen
— zwei Sprachen, zwei Abhaengigkeitsbaeume, zwei Deployments fuer
dieselbe Arbeit. Next.js Route Handler laufen serverseitig; was fehlte,
war kein Framework, sondern ein Endpunkt und ein Speicher.

Entscheidungen im Detail:

- **Stapelweise statt am Stueck.** Der Endpunkt verarbeitet fuenf Titel
  je Aufruf und meldet, wo er stehengeblieben ist. Damit haengt er nicht
  am Zeitlimit serverloser Funktionen, das je nach Tarif anders
  ausfaellt. Die Oberflaeche ruft nach, bis `done` kommt.
- **Fehler je Titel, nicht je Lauf.** Ein Titel ohne Kurse haelt die
  anderen 39 nicht auf; der Grund landet in `refresh_run` und wird in
  der Oberflaeche angezeigt.
- **Rueckfallkette Datenbank, Snapshot, Demodaten.** Faellt die
  Datenbank aus, zeigt die App den letzten Snapshot statt einer
  Fehlerseite. Veraltet mit sichtbarem Stand schlaegt leer.
- **Cron kommt ohne Cookie.** Vercel Cron weist sich mit `CRON_SECRET`
  aus. Ist das Secret nicht gesetzt, gibt es diesen Weg nicht — der
  Endpunkt bleibt dann hinter dem Passwort, statt offen zu stehen.
- **Neon ueber HTTP.** Serverlose Funktionen leben eine Anfrage lang;
  ein Verbindungspool waere dort sinnlos und wuerde die
  Verbindungsgrenze sprengen.

Der Snapshot-Workflow behaelt seinen Handstart als Notausgang, verliert
aber seinen Zeitplan. Der Ratings-Poller laeuft vorerst weiter ueber
Actions; er gehoert beim naechsten Schritt auf denselben Weg.

## E22 Ein Datenpfad, ein Speicher, ein Ausloeser

Nach E21 gab es zwei Wege nebeneinander: Kurse und Berichtszahlen ueber
`/api/refresh` in die Datenbank, Analystenmeldungen weiter ueber einen
Actions-Workflow in eine committete JSON-Datei. Zwei Speicher, zwei
Ausloeser, zwei Rueckfallebenen — und die Oberflaeche musste beide
kennen. Das ist zusammengelegt.

Alles laeuft jetzt ueber denselben Endpunkt und dieselbe Datenbank:

| war | ist |
| --- | --- |
| `scripts/fetch-snapshot.ts` + `snapshot.yml` + `data/snapshot.json` | `/api/refresh` -> `price_bar`, `reported_period` |
| `scripts/poll-ratings.ts` + `ratings.yml` + `data/ratings-state.json` | `/api/refresh` -> `analyst_action`, `poll_state` |
| Rueckfall Datenbank, Snapshot, Demodaten | Rueckfall Datenbank, Demodaten |

Vier Punkte, die beim Zusammenlegen wichtig waren:

- **Der Erstlauf darf nicht alarmieren, auch stapelweise nicht.** Die
  Marke `initialized` wird erst vom letzten Stapel eines Laufs gesetzt.
  Wuerde schon der erste sie setzen, gaelten die Titel der folgenden
  Stapel als neu und der Erstlauf loeste doch einen Alarmsturm aus.
- **Die Datenbank ist die Ausgangspost.** Neue Meldungen liegen mit
  `notified = false` in `analyst_action`. Zugestellt wird aus der
  Tabelle, nicht aus dem Arbeitsspeicher des Aufrufs. Bricht ein Lauf
  ab oder scheitert Telegram, bleibt die Meldung liegen und geht beim
  naechsten Mal raus, statt verloren zu gehen.
- **Doppelte Meldungen prallen am Primaerschluessel ab.** `ON CONFLICT
  DO NOTHING` auf der Fremd-ID ist die zweite Verteidigungslinie hinter
  `selectNewAnalystActions`. Die reine Funktion bleibt, damit die
  Erstlauf-Regel getestet ist und nicht in SQL verschwindet.
- **Gefragt wird nur nach den IDs des aktuellen Abrufs**, nicht nach der
  ganzen Historie. Das bleibt auch nach Jahren eine kleine Abfrage.

Was in GitHub Actions bleibt: Typpruefung und Tests, der EDGAR-Abdeckungs-
test und die Quellenmessung. Alle drei messen oder pruefen, keiner holt
Betriebsdaten. Das ist die Trennlinie.

## E23 In GitHub bleibt nur, was den Code prueft

E22 hat den Datenpfad zusammengelegt, aber zwei Workflows uebersehen:
den EDGAR-Abdeckungstest und die Quellenmessung. Beide holten Daten aus
dem Netz, einer committete sein Ergebnis zurueck ins Repository. Nach
derselben Regel gehoerten auch sie in die Anwendung.

Sie sind jetzt die Seite `/diagnose` mit dem Endpunkt `/api/diagnose`.
Der misst zweierlei und schreibt nichts:

- **Erreichbarkeit der Quellen.** Stooq, Yahoo, Twelve Data, Finnhub und
  die SEC, je mit einem US- und einem deutschen Titel.
- **SEC-Abdeckung je Watchlist-Titel**, stapelweise zu acht, mit
  Gegenueberstellung von gemessener und erwarteter Einstufung.

Der eigentliche Grund fuer den Umzug ist nicht Ordnungsliebe: Ob eine
Quelle antwortet, haengt an der Adresse, von der gefragt wird. Die
Messung aus einem GitHub-Runner beantwortete die falsche Frage. Was
zaehlt, ist, was *diese Anwendung* von *ihrem* Standort aus erreicht —
und das kann nur ein Abruf von genau dort beantworten. Der Befund aus
E20 gilt fuer Actions-Runner; fuer Vercel ist er offen, und `/diagnose`
ist der Knopf, der ihn beantwortet.

Damit steht in `.github/workflows` genau eine Datei: `ci.yml` mit
Typpruefung und Tests. Das Verzeichnis `scripts/` ist entfallen.

Die Trennlinie, ab jetzt verbindlich: **GitHub prueft den Code, die
Anwendung holt die Daten.** Kein Workflow ruft eine externe
Datenquelle auf, und keiner schreibt ins Repository zurueck.

## E24 Live-Kurse, Analystenkonsens und Frische-Regeln

Ausbau zur Google-Finance-aehnlichen Ansicht, im vorhandenen Design.

**Live-Kurse ueber Finnhub.** /api/quotes holt aktuelle Kurse fuer alle
US-notierten Titel (60 Abrufe je Minute im Gratis-Tarif), haelt sie 60
Sekunden im Speicher und teilt einen laufenden Abruf zwischen
gleichzeitigen Browsern: zehn offene Tabs zahlen einmal auf das
Minutenbudget ein, nicht zehnmal. Die Uebersicht fragt jede Minute nach
und zeigt Kurs und Tagesveraenderung; ohne Schluessel bleiben die
gespeicherten Schlusskurse stehen, und der Grund steht dabei.

**Analystenkonsens statt toter Yahoo-Quelle.** Yahoo blockt auch
Vercel-Adressen (gemessen); der Poller des Parallel-Laufs ist damit
ersatzlos gestrichen. Finnhub liefert kostenlos die Verteilung der
Empfehlungen je Monat. Die Verschiebung zwischen zwei Staenden wird als
Meldung durch dieselbe Leitung geschickt wie alles andere:
Erstlauf-Schutz, Deduplizierung ueber die Fremd-ID (die die Verteilung
selbst enthaelt), Zustell-Log, Telegram. Einzelurteile mit Haus und
Kursziel bleiben aussen vor: sie sind das bezahlte Produkt der Banken.

**Frische-Regeln gegen die Ratenlimits.** Twelve Data erlaubt 8 Abrufe
je Minute und 800 am Tag. Deshalb: Kurse gelten als frisch, wenn der
neueste Handelstag hoechstens zwei Kalendertage zurueckliegt (am Sonntag
ist der Freitagsschluss der aktuellste, den es gibt); Berichtszahlen und
Konsens werden hoechstens einmal in 20 Stunden geholt. Ein zweiter Druck
auf den Knopf fuellt nur Luecken. Zwischen zwei Twelve-Data-Abrufen
liegen 8 Sekunden, egal wie die Stapel geschnitten sind.

**XETRA-Rueckfall.** Liefert Twelve Data einen XETRA-Titel nicht und
gibt es eine US-Notierung, wird die geholt und unter dem eigenen Kuerzel
gespeichert, mit Hinweis und Waehrung. Dollar-Kurse sind besser als
keine. Die 16 DAX-Titel ohne US-Notierung bleiben ohne Kurse; das ist
die gemessene Grenze der Gratisquellen.

**Cron-Kette.** Der taegliche Anstoss bekommt einen langen Lauf
(maxDuration 300) und haengt sich per after() selbst ein naechstes
Kettenglied an, bis die Watchlist durch ist, mit Notbremse gegen
Endlosschleifen. Der Knopf in der Oberflaeche treibt weiterhin kurze
Stapel.

**Behobener Konstruktionsfehler.** Der Lauf blieb frueher nach zwei
Stapeln stehen: companyfacts der SEC (zweistellige Megabyte je Titel)
ging komplett durch Zod, fuenfmal je Aufruf, fuer drei am Ende genutzte
Konzepte. Jetzt wird der Rumpf grob geprueft und nur validiert, was
verwendet wird.

## E25 DAX-Titel kommen ueber Alpha Vantage ins System

Die 16 DAX-Titel ohne US-Notierung standen ohne jede Quelle da: Stooq
und Yahoo sperren Cloud-Adressen (gemessen), Twelve Data fuehrt XETRA
im Gratis-Tarif nicht, Finnhub auch nicht. Die Loesung ist eine Quelle,
die frueh verworfen worden war — und die Ablehnung war richtig
begruendet, nur zu breit angewendet: Alpha Vantage erlaubt 25 Abrufe am
Tag, zu wenig fuer 40 Titel. Fuer die DAX-Haelfte allein reicht es
exakt, denn die Frische-Regel begrenzt jeden Titel ohnehin auf einen
Abruf am Tag.

- XETRA-Titel laufen ueber das dokumentierte Suffix .DEX, Kurse in
  Euro. Beim ersten Abruf die volle Historie, danach das kompakte
  100-Tage-Fenster zum Auffuellen. 15 Sekunden Abstand zwischen
  Abrufen (Minutenlimit 5).
- Reihenfolge je XETRA-Titel: Alpha Vantage, dann Twelve Data XETR,
  dann US-Notierung. Jeder Rueckfall steht als Hinweis am Titel.
- Alpha Vantage meldet Tageslimit und Bezahlgrenzen mit HTTP 200 und
  einem Textfeld; der Parser behandelt beide als Absage mit Wortlaut,
  nicht als leere Reihe.
- Der Schluessel ist kostenlos (alphavantage.co). Ohne ihn bleibt der
  bisherige Zustand: Striche statt erfundener Zahlen.
- 'vendor_claim', bis die Diagnose den ersten .DEX-Abruf von Vercel aus
  gemessen hat; die Probe ist eingebaut.

Zwei Zukunftspfade sind als Proben in der Diagnose, bewusst noch
nirgends verdrahtet:

- **Tradegate** (ohne Schluessel, per ISIN) koennte Live-Kurse
  deutscher Titel liefern — das letzte Stueck Echtzeit, das den
  DAX-Titeln fehlt.
- **ESEF ueber filings.xbrl.org**: EU-Konzerne muessen ihre
  Jahresabschluesse als XBRL einreichen, das Register ist offen. Das
  ist der einzige sichtbare kostenlose Weg zu Berichtszahlen der 16 —
  amtlich, aber nur jaehrlich, und die Zuordnung laeuft ueber LEIs.
  Erst messen, dann bauen.

## E26 Live-Kurse fuer die DAX-Titel ueber Tradegate

Die Diagnose hat zweierlei gemessen: Alpha Vantage liefert XETRA
(SAP.DEX, 188,12 EUR, 100 Tage) — damit haben alle DAX-Titel
Tageskurse. Und Tradegate antwortet von Vercel aus ohne Schluessel
(SAP per ISIN, 186,70). Damit bekommen die deutschen Titel auch
Live-Kurse; /api/quotes bedient jetzt beide Haelften: Finnhub fuer
US-Titel, Tradegate fuer XETRA.

Dafuer war eine dokumentierte Ausnahme von E9 noetig: die ISINs der 20
XETRA-Titel stehen jetzt in der Watchlist. E9 verbietet erfundene
Kennnummern, weil eine falsche still auf den falschen Titel matcht.
Die Absicherung ist deshalb nicht Sorgfalt beim Abtippen, sondern ein
Wachhund zur Laufzeit: Ein Tradegate-Kurs wird nur angezeigt, wenn er
hoechstens 15 Prozent vom gespeicherten Euro-Tagesschluss (Alpha
Vantage) abweicht. Zeigt eine ISIN auf ein anderes Unternehmen, faellt
sein Kurs fast sicher durch diese Pruefung — dann lieber kein Kurs als
ein falscher. Ohne gespeicherten Schluss (etwa vor dem ersten
Datenlauf) werden deutsche Live-Kurse gar nicht erst gezeigt.

Tradegate ist undokumentiert und liefert Zahlen im deutschen Format
("1.234,56") als Zeichenketten; der Parser behandelt beides defensiv.
Die Tagesveraenderung kommt aus dem delta-Feld der Quelle, falls
lesbar, sonst bleibt sie leer.

## E26 Zwei taegliche Cron-Laeufe statt einem

Der Hobby-Tarif erlaubt zwei Cron-Jobs. Beide werden genutzt:

- **04:10 UTC**: nach dem US-Handelsschluss und unmittelbar nach dem
  Tagesreset von Alpha Vantage (Mitternacht US-Ostkueste). Holt die
  US-Schlusskurse des Tages und hat das volle XETRA-Kontingent.
- **06:20 UTC**: vor dem europaeischen Morgen, als Nachzuegler-Lauf
  fuer alles, was der erste nicht geschafft hat.

Dank der Frische-Regeln kostet ein Lauf, der nichts zu tun hat, nur
Sekunden und keinerlei Kontingent. Der Anlass war konkret: zwei
parallel gedrueckte Browser-Laeufe hatten das Alpha-Vantage-Tageslimit
verbraucht, bevor die 16 DAX-Titel ohne US-Notierung durch waren, und
der naechste Lauf haette bis 06:20 auf sich warten lassen.

## E27 Alpha Vantage nur noch mit outputsize=compact

Der Gratis-Tarif von Alpha Vantage lehnt outputsize=full fuer
TIME_SERIES_DAILY inzwischen als Premium-Funktion ab — als HTTP 200
mit Hinweistext, in den Vercel-Logs vom 22.08.2026 gemessen. Genau
daran scheiterte jeder Erstabruf der 16 DAX-Titel ohne US-Notierung:
die Logik "erster Abruf = volle Historie" lief immer in die Ablehnung.

Beschluss: immer compact (die letzten 100 Handelstage). Das reicht
fuer Verlauf, Frische und alle Renditen bis drei Monate; die
52-Wochen-Spanne dieser Titel waechst mit jedem Cron-Lauf um einen Tag
nach, bis sie nach gut einem Jahr vollstaendig ist. Eine ehrlich
unvollstaendige Spanne ist besser als gar keine Kurse.

## E28 Ein-Seiten-Bericht je Titel als PDF

Je Titel gibt es unter /titel/[ticker]/bericht.pdf eine einzelne
A4-Seite: Kurs und 52-Wochen-Verlauf, die letzten vier Quartale und
das juengste Geschaeftsjahr im Vorjahresvergleich, der
Analystenkonsens mit Vormonatsbewegung, die regelbasierte Einstufung
(stark/solide/neutral/schwach/kritisch aus der Screening-Punktzahl,
mit Staerken, Schwaechen und Datenbasis) und ein datenbasierter
Ausblick (Richtung von Umsatz und Marge, Konsensverschiebung,
geschaetzter naechster Termin). Der Link zum Originalbericht bei der
SEC steht dabei; was fehlt, steht unter "Bekannte Luecken" auf der
Seite statt stillschweigend zu fehlen.

Bewusst kein erzeugter Prosatext: Der Ausblick nennt nur, was aus den
gespeicherten Zahlen ableitbar ist. Was das Management schreibt, steht
im verlinkten Original — Prosa erfinden wir nicht. Die Einstufung ist
ausdruecklich keine Anlageberatung; der Massstab (Schwellen 75/60/45/
30, Gewichte der Signale) liegt offen im Code und auf der Seite.

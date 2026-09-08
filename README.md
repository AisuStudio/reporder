# Reporder

Sprechen, fotografieren, fertig. Reporder schneidet eine Begehung als durchgehende
Tonaufnahme mit. Jedes Foto trägt den Zeitcode der Aufnahme, gesprochene Marker
(„Erster Stock, Zimmer 3") gliedern den Bericht. Am Ende steht ein Protokoll, in dem
jedes Foto bei dem Satz steht, der gerade gesprochen wurde.

**Die Idee:** Wer eine Mängelliste oder ein Beweisprotokoll aufnimmt, muss heute
gleichzeitig fotografieren, schreiben und schnell sein. Hinterher weiß niemand mehr, was
wohin gehört. Reporder trennt das: vor Ort nur sprechen und auslösen, die Zuordnung
macht die Zeitachse.

Erste Nutzerin ist eine Architektin. Derselbe Ablauf passt für Galabau, Gutachten,
Hausverwaltung, Reportage. Was sich ändert, ist nur die Vorlage für die Gliederung.

Regeln für die Arbeit am Code: [`AGENTS.md`](AGENTS.md). Die Marktrecherche liegt bewusst
außerhalb des Repositories.

## Ausprobieren

```bash
python3 -m http.server 8792 --directory .
```

Dann `http://localhost:8792` öffnen. Kein Build-Schritt, keine Abhängigkeiten. Mikrofon
und Kamera brauchen `localhost` oder HTTPS.

## Tests

```bash
npm test
```

Läuft mit dem eingebauten Runner von Node, ohne weiteres Werkzeug.

## Grundsätze

**Die Zeitachse ist die Aufnahmezeit.** Fotos, Marker und Text tragen Millisekunden seit
Aufnahmestart, nicht die Uhrzeit. Die Zuordnung Foto zu Satz ist damit exakt, nicht
geschätzt.

**Die Sitzung gehört der Nutzerin.** Fotos und Audio bleiben Originaldateien, das Protokoll
ist eine versionierte JSON-Datei. Der Export ist ein Ordner, lesbar ohne Reporder.

**Kein Server, kein Konto.** Alles läuft im Browser und bleibt auf dem Gerät. Später kann
die Nutzerin ihren eigenen Cloud-Speicher anbinden; Reporder betreibt keinen.

**Transkription danach, nicht live.** Vor Ort zählt nur, dass die Aufnahme läuft.

## Fahrplan

| Phase | Inhalt | Stand |
|---|---|---|
| 1 | PWA: Aufnahme, Foto mit Zeitcode, Marker, Bericht, Drucken | gebaut, im Test |
| 2 | Transkription nach der Aufnahme, Marker aus dem Transkript | offen |
| 3 | Export als ZIP (Protokoll, Ton, Fotos) — gebaut; eigener Cloud-Speicher der Nutzerin | teilweise |
| 4 | Native Hülle (Capacitor) für Aufnahme bei gesperrtem Bildschirm | offen |
| 5 | Raumscan über RoomPlan auf iPhone Pro, Fotos am Grundriss | offen |

## Aufbau

| Datei | Zweck |
|---|---|
| `index.html` | Startseite und Liste der Sitzungen |
| `record.html`, `record.js` | Der Aufnahmeschirm |
| `report.html`, `report.js` | Bericht: Gliederung, Zuordnung, Druck |
| `session.js` | Sitzungsformat, Versionierung, Migration |
| `templates.js` | Vorlagen für die Gliederung und ihre Marker |
| `storage.js` | IndexedDB |
| `zip.js` | ZIP-Schreiber ohne Abhängigkeiten für den Export |
| `styles.css` | Gestaltung: MnS-System (Rubik, Koralle) |
| `sw.js`, `manifest.webmanifest` | Installierbar, offline |
| `*.test.js` | Tests — `npm test` |

## Stand

Prototyp, Phase 1 in Arbeit. Ungelöst: Aufnahme bei gesperrtem Bildschirm (braucht die
native Hülle), Transkription, Cloud. Ohne Test mit einer echten Begehung bleibt alles eine
Behauptung.

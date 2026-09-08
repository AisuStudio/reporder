// Templates: how a recording is structured into sections, and which spoken
// phrases open a new one. This is data, not code in the recording screen —
// a new trade is a new template with test cases for its markers (AGENTS.md).
//
// A template has ordered levels (e.g. floor → room). A marker of level n opens
// a new section and resets every deeper level. Detection is deliberately
// conservative: the phrase has to sit at the start of what was said, so
// "hier im Bad ist die Fuge kaputt" is a finding, not a new room.

const ORDINALS = {
  erste: 1, zweite: 2, dritte: 3, vierte: 4, fünfte: 5, fuenfte: 5, sechste: 6,
  siebte: 7, achte: 8, neunte: 9, zehnte: 10,
};

function ordinal(word) {
  const w = word.toLowerCase().replace(/[rsn]$/, '');
  if (ORDINALS[w] != null) return ORDINALS[w];
  const n = parseInt(word, 10);
  return Number.isFinite(n) ? n : null;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** A marker pattern: regex plus a function turning the match into a title. */
const m = (level, re, title) => ({ level, re, title });

export const TEMPLATES = {
  site: {
    id: 'site',
    name: 'Bau · Begehung',
    levels: ['Ort', 'Geschoss', 'Raum'],
    hint: 'Ort: „Nachbarhaus", „Garage", „Garten", „Haus 2". Geschoss: „Erdgeschoss", „Erster Stock". Raum: „Zimmer 3", „Bad".',
    markers: [
      // Level 0 — the place: a building, a part of the site, the neighbour.
      m(0, /\b(nachbarhaus|nachbargebäude|nachbargrundstück|nebengebäude|hauptgebäude|haupthaus|anbau|neubau|altbau|bestand|garage|carport|garten|hof|innenhof|hinterhof|vorgarten|außenanlagen|außenanlage|außenbereich|baustelle|grundstück|zufahrt|parkplatz|straße|gehweg|dach)\b/i, (x) => cap(x[1])),
      m(0, /\b(haus|gebäude|bauteil|block|halle|wohnung|einheit|bauabschnitt)\s+(?:(?:nummer|nr\.?)\s*)?([a-z]|\d{1,3}[a-z]?)\b/i, (x) => `${cap(x[1])} ${x[2].toUpperCase()}`),
      // Level 1 — the floor.
      m(1, /\b(erdgeschoss|parterre)\b/i, () => 'Erdgeschoss'),
      m(1, /\b(kellergeschoss|keller|untergeschoss|tiefgarage|souterrain)\b/i, (x) => cap(x[1])),
      m(1, /\b(dachgeschoss|dachboden|spitzboden|staffelgeschoss)\b/i, (x) => cap(x[1])),
      m(1, /\b(erste[rsn]?|zweite[rsn]?|dritte[rsn]?|vierte[rsn]?|fünfte[rsn]?|fuenfte[rsn]?|sechste[rsn]?|siebte[rsn]?|achte[rsn]?|neunte[rsn]?|zehnte[rsn]?|\d{1,2})\.?\s+(stockwerk|stock|obergeschoss|etage|og)\b/i,
        (x) => { const n = ordinal(x[1]); return n == null ? null : `${n}. Obergeschoss`; }),
      // Level 2 — the room.
      m(2, /\b(zimmer|raum|büro|badezimmer|bad|küche|flur|diele|treppenhaus|toilette|wc|abstellraum|technikraum|hausanschlussraum|heizungsraum|balkon|terrasse|loggia|schlafzimmer|wohnzimmer|kinderzimmer|besprechungsraum|lager|waschküche|aufzug|eingang|windfang)\b\s*(?:(?:nummer|nr\.?)\s*)?([a-z]?\d+[a-z]?)?/i,
        (x) => (x[2] ? `${cap(x[1])} ${x[2].toUpperCase()}` : cap(x[1]))),
    ],
  },

  landscape: {
    id: 'landscape',
    name: 'Galabau',
    levels: ['Bereich', 'Fläche'],
    hint: 'Sag z. B. „Vorgarten", „Innenhof", „Beet 2", „Rasenfläche", „Weg".',
    markers: [
      m(0, /\b(vorgarten|hinterhof|innenhof|garten|parkplatz|zufahrt|spielplatz|eingangsbereich|eingang|nordseite|südseite|ostseite|westseite|dachgarten)\b/i, (x) => cap(x[1])),
      m(0, /\bbereich\s+([\wäöüß-]+)/i, (x) => `Bereich ${cap(x[1])}`),
      m(1, /\b(beet|rasenfläche|rasen|hecke|weg|mauer|treppe|pflanzfläche|baum|zaun|terrasse|fläche|teich|bewässerung|beleuchtung)\b\s*(\d+)?/i,
        (x) => (x[2] ? `${cap(x[1])} ${x[2]}` : cap(x[1]))),
    ],
  },

  general: {
    id: 'general',
    name: 'Allgemein',
    levels: ['Abschnitt'],
    hint: 'Sag z. B. „Abschnitt 2", „Punkt Bühne", „neuer Abschnitt".',
    markers: [
      m(0, /\b(abschnitt|punkt|thema|kapitel|station|ort)\s+([\wäöüß\d.-]+)/i, (x) => `${cap(x[1])} ${x[2]}`),
      m(0, /\b(neuer|nächster|naechster)\s+(abschnitt|punkt)\b/i, () => 'Abschnitt'),
    ],
  },
};

export const DEFAULT_TEMPLATE = 'site';

export function getTemplate(id) {
  return TEMPLATES[id] || TEMPLATES[DEFAULT_TEMPLATE];
}

/** How many words may precede the marker phrase ("weiter im ersten Stock"),
 *  and how many may follow it before it stops being a marker and becomes a
 *  finding ("hier im Bad ist die Fuge gerissen"). A phrase that starts the
 *  utterance is always a marker, whatever follows. */
const LEAD_WORDS = 3;
const TRAIL_WORDS = 2;

const wordCount = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/**
 * Find a section marker in a spoken segment. Returns { level, title } or null.
 */
export function detectMarker(text, template) {
  if (!text) return null;
  const t = String(text).trim();
  let best = null;
  for (const marker of template.markers) {
    const x = marker.re.exec(t);
    if (!x) continue;
    const before = wordCount(t.slice(0, x.index).replace(/[,.;:!?]/g, ' '));
    const after = wordCount(t.slice(x.index + x[0].length).replace(/[,.;:!?]/g, ' '));
    const isMarker = before === 0 || (before <= LEAD_WORDS && after <= TRAIL_WORDS);
    if (!isMarker) continue;
    const title = marker.title(x);
    if (!title) continue;
    // Prefer the marker that starts earliest; on a tie, the shallower level
    // (a floor beats a room named in the same breath).
    if (!best || x.index < best.index || (x.index === best.index && marker.level < best.level)) {
      best = { level: marker.level, title, index: x.index };
    }
  }
  return best ? { level: best.level, title: best.title } : null;
}

/** A spoken marker this close after a pressed one names it instead of opening a second section. */
export const NAME_WINDOW_MS = 8000;

/** Display label for a marker without a name yet. */
export function unnamedLabel(template, level) {
  return `${template.levels[Math.min(level, template.levels.length - 1)]} · ohne Namen`;
}

/**
 * Give pressed-but-unnamed markers their name from what was said right after
 * the press. Works on live segments today and on a full transcript later.
 * Mutates `markers`; returns how many got a name.
 */
export function nameMarkersFromSegments(markers, segments, template, { windowMs = NAME_WINDOW_MS } = {}) {
  let named = 0;
  const sorted = [...segments].sort((a, b) => a.t - b.t);
  for (const mk of markers) {
    if (mk.title) continue;
    const seg = sorted.find((sg) => sg.t >= mk.t && sg.t <= mk.t + windowMs && sg.text?.trim());
    if (!seg) continue;
    const hit = mk.kind === 'note' ? null : detectMarker(seg.text, template);
    if (hit) {
      mk.title = hit.title;
      mk.level = hit.level;
    } else {
      mk.title = seg.text.trim().split(/\s+/).slice(0, mk.kind === 'note' ? 12 : 4).join(' ');
    }
    named++;
  }
  return named;
}

/**
 * Build the outline of a session: sections in time order, each with its
 * items (text segments and photos). Manual markers and spoken markers are
 * merged; a photo with a `sectionKey` override goes where the user put it.
 *
 * segments: [{ t, text }]      markers: [{ id, t, title, level }]
 * photos:   [{ id, t, sectionKey? }]
 */
export function outline({ segments = [], markers = [], photos = [], template }) {
  const tpl = template || getTemplate(DEFAULT_TEMPLATE);
  const depth = tpl.levels.length;

  const events = [];
  for (const mk of markers) {
    if (!Number.isFinite(mk.t) || mk.kind === 'note') continue;
    const level = Math.min(Math.max(0, mk.level ?? depth - 1), depth - 1);
    events.push({ t: mk.t, level, title: mk.title || unnamedLabel(tpl, level), source: 'manual', markerId: mk.id, unnamed: !mk.title });
  }
  // Every press, section or note, may have been named by the phrase after it.
  const pressed = markers.filter((mk) => Number.isFinite(mk.t)).map((mk) => ({ t: mk.t, unnamed: !mk.title, title: mk.title }));
  for (const seg of segments) {
    const hit = detectMarker(seg.text, tpl);
    if (!hit) continue;
    // Said right after a press: that is the press's name, not a second section —
    // unless the press already carries a different name.
    const namesAPress = pressed.some((e) => seg.t >= e.t && seg.t <= e.t + NAME_WINDOW_MS && (e.unnamed || e.title === hit.title));
    if (namesAPress) continue;
    events.push({ t: seg.t, level: hit.level, title: hit.title, source: 'spoken' });
  }
  events.sort((a, b) => a.t - b.t || a.level - b.level);

  const sections = [{ key: 'start', path: [], level: -1, t: 0, items: [] }];
  let path = new Array(depth).fill(null);
  for (const ev of events) {
    const level = ev.level;
    path = path.slice(0, level).concat([ev.title], new Array(depth - level - 1).fill(null));
    sections.push({
      key: `s-${ev.t}-${level}`,
      path: path.filter(Boolean),
      level,
      t: ev.t,
      source: ev.source,
      markerId: ev.markerId,
      unnamed: ev.unnamed || false,
      items: [],
    });
  }

  const sectionAt = (t) => {
    let s = sections[0];
    for (const sec of sections) if (sec.t <= t) s = sec; else break;
    return s;
  };
  const byKey = new Map(sections.map((s) => [s.key, s]));

  for (const seg of segments) {
    sectionAt(seg.t).items.push({ kind: 'text', t: seg.t, text: seg.text, id: seg.id });
  }
  for (const p of photos) {
    const target = (p.sectionKey && byKey.get(p.sectionKey)) || sectionAt(p.t);
    target.items.push({ kind: 'photo', t: p.t, id: p.id });
  }
  for (const mk of markers) {
    if (mk.kind !== 'note' || !Number.isFinite(mk.t)) continue;
    sectionAt(mk.t).items.push({ kind: 'note', t: mk.t, id: mk.id, title: mk.title });
  }
  for (const s of sections) s.items.sort((a, b) => a.t - b.t);

  // The implicit lead-in section only shows if something happened there.
  if (sections[0].items.length === 0 && sections.length > 1) sections.shift();
  return sections;
}

/** Title of a section for display: "1. Obergeschoss · Zimmer 3", or "Vorlauf". */
export function sectionTitle(section) {
  return section.path.length ? section.path.join(' · ') : 'Vorlauf';
}

// The session file. This is the user's data: evidence photos and a protocol
// that must still open in five years, with or without Reporder. Reading and
// migrating lives here and nowhere else (AGENTS.md).
//
// Media (audio, photos) are kept as original files outside this JSON; the
// JSON only references them by id. Every timed thing carries `t` in
// milliseconds since the recording started, pauses excluded.

export const FORMAT = 'reporder-session';
export const VERSION = 1;

export function newId(prefix = 'id') {
  const rand = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 10);
  return `${prefix}-${rand}`;
}

/** A fresh, empty session. `now` is injectable for tests. */
export function createSession({ title = '', template = 'site', now = new Date() } = {}) {
  return {
    format: FORMAT,
    version: VERSION,
    id: newId('s'),
    title,
    template,
    createdAt: now.toISOString(),
    durationMs: 0,
    audio: null,          // { type: 'audio/webm', chunks: 12 } once recorded
    segments: [],         // { id, t, text, source: 'live' | 'manual' | 'transcript' }
    markers: [],          // { id, t, title ('' until named), level, kind: 'section' | 'note' }
    levels: null,         // { stepMs, values: [0..100] } loudness sampled while recording
    photos: [],           // { id, t, type: 'image/jpeg', width, height, sectionKey?, note? }
    notes: '',
  };
}

function assertTime(t) {
  if (!Number.isFinite(t) || t < 0) throw new Error(`invalid timecode: ${t}`);
  return Math.round(t);
}

export function addPhoto(session, { id = newId('p'), t, type = 'image/jpeg', width = 0, height = 0 }) {
  const photo = { id, t: assertTime(t), type, width, height };
  session.photos.push(photo);
  return photo;
}

/**
 * A marker may be pressed without a name; the name comes from what is said next.
 * kind 'section' opens a new section (floor, room); kind 'note' is an event
 * inside the current section ("Anderes") and structures nothing.
 */
export function addMarker(session, { id = newId('m'), t, title = '', level = 0, kind = 'section' }) {
  if (kind !== 'section' && kind !== 'note') throw new Error(`unknown marker kind: ${kind}`);
  const marker = { id, t: assertTime(t), title: String(title ?? '').trim(), level, kind };
  session.markers.push(marker);
  return marker;
}

export function addSegment(session, { id = newId('t'), t, text, source = 'live' }) {
  const segment = { id, t: assertTime(t), text: String(text ?? ''), source };
  session.segments.push(segment);
  return segment;
}

/** Moving a photo is a change to the data, not to the event: `t` stays. */
export function setPhotoSection(session, photoId, sectionKey) {
  const photo = session.photos.find((p) => p.id === photoId);
  if (!photo) throw new Error(`unknown photo: ${photoId}`);
  if (sectionKey) photo.sectionKey = sectionKey; else delete photo.sectionKey;
  return photo;
}

/** The entry under a photo: finding, measure, who is responsible. Data, not event. */
export function setPhotoNote(session, photoId, note) {
  const photo = session.photos.find((p) => p.id === photoId);
  if (!photo) throw new Error(`unknown photo: ${photoId}`);
  const text = String(note ?? '').trim();
  if (text) photo.note = text; else delete photo.note;
  return photo;
}

/**
 * Bring any older session up to the current version. Throws on foreign
 * formats and on files written by a newer Reporder than this one — better
 * to refuse than to silently drop fields the user cannot see.
 */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('not a session');
  if (raw.format !== FORMAT) throw new Error(`not a Reporder session (format: ${raw.format})`);
  const version = Number(raw.version);
  if (!Number.isFinite(version)) throw new Error('session has no version');
  if (version > VERSION) throw new Error(`session version ${version} is newer than this Reporder (${VERSION})`);

  let s = structuredClone(raw);
  // Future migrations go here, one step each: if (s.version === 1) { ...; s.version = 2; }

  // Defaults for fields a v1 writer may have left out.
  s.title ??= '';
  s.template ??= 'site';
  s.durationMs ??= 0;
  s.audio ??= null;
  s.segments ??= [];
  s.markers ??= [];
  s.photos ??= [];
  s.notes ??= '';
  s.levels ??= null;
  for (const m of s.markers) m.kind ??= 'section';
  return s;
}

export function serialize(session) {
  return JSON.stringify(session, null, 2);
}

export function parse(text) {
  return migrate(JSON.parse(text));
}

/** Append one loudness sample (0..100) taken while recording. */
export function pushLevel(session, value, stepMs = 250) {
  if (!session.levels) session.levels = { stepMs, values: [] };
  session.levels.values.push(Math.max(0, Math.min(100, Math.round(value))));
  return session.levels.values.length;
}

/**
 * The session as it goes into the exported folder: the same JSON, with a
 * `file` next to every photo and the audio, so the folder explains itself.
 */
export function exportManifest(session) {
  const out = structuredClone(session);
  out.exportedAt = new Date().toISOString();
  for (const p of out.photos) p.file = photoFileName(p);
  if (out.audio) out.audio.file = audioFileName(out);
  return out;
}

/** File name a photo gets in the exported folder. */
export function photoFileName(photo) {
  const ext = photo.type === 'image/png' ? 'png' : 'jpg';
  return `photos/${photo.id}.${ext}`;
}

/** File name the audio gets in the exported folder. */
export function audioFileName(session) {
  const type = session.audio?.type || '';
  const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
  return `audio.${ext}`;
}

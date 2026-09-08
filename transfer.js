// Opening a session that was exported: a ZIP (session.json + media) or a
// bare session.json. The file is the user's; what comes back must be exactly
// what went out. Refuses foreign or newer files (session.js decides).

import { readZip } from './zip.js';
import { parse, photoFileName, audioFileName } from './session.js';
import { getSession, putSession, putMedia, deleteSession } from './storage.js';

const dec = new TextDecoder();

/** Parse a File/Blob into { session, media: Map<name, Uint8Array> }. */
export async function unpack(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) {
    const session = parse(dec.decode(bytes));
    return { session, media: new Map() };
  }
  const entries = await readZip(bytes);
  // Accept an archive whose files sit in one top-level folder, too.
  const strip = entries.every((e) => e.name.includes('/')) && new Set(entries.map((e) => e.name.split('/')[0])).size === 1
    ? entries[0].name.split('/')[0] + '/' : '';
  const media = new Map(entries.map((e) => [e.name.startsWith(strip) ? e.name.slice(strip.length) : e.name, e.data]));
  const json = media.get('session.json');
  if (!json) throw new Error('Im ZIP fehlt session.json.');
  media.delete('session.json');
  return { session: parse(dec.decode(json)), media };
}

/**
 * Store an unpacked session. `onExists` is asked when the id is already in
 * the database and must return 'replace', 'copy' or 'cancel'.
 */
export async function importSession({ session, media }, { onExists } = {}) {
  const existing = await getSession(session.id);
  if (existing) {
    const choice = onExists ? await onExists(existing) : 'cancel';
    if (choice === 'cancel') return null;
    if (choice === 'copy') session.id = `${session.id}-kopie-${Date.now().toString(36)}`;
    else await deleteSession(session.id);
  }
  // Strip the export-only fields; the live session does not carry file names.
  delete session.exportedAt;
  for (const p of session.photos) {
    const name = p.file || photoFileName(p);
    delete p.file;
    const data = media.get(name);
    if (data) await putMedia(session.id, p.id, new Blob([data], { type: p.type || 'image/jpeg' }), { kind: 'photo' });
  }
  if (session.audio) {
    const name = session.audio.file || audioFileName(session);
    delete session.audio.file;
    const data = media.get(name);
    if (data) {
      await putMedia(session.id, 'audio-00000', new Blob([data], { type: session.audio.type }), { kind: 'audio', index: 0 });
      session.audio.chunks = 1;
    } else {
      session.audio = null;
    }
  }
  await putSession(session);
  return session;
}

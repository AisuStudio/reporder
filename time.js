// Time formatting. All timecodes in Reporder are milliseconds since the
// recording started (pauses excluded), never wall-clock time — see AGENTS.md.

const pad = (n) => String(n).padStart(2, '0');

/** "MM:SS" below one hour, "H:MM:SS" from one hour on. */
export function formatTimecode(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Human duration for lists: "45 s", "8 min", "1 h 12 min". */
export function formatDuration(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (total < 60) return `${total} s`;
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** German date and time from an ISO string, e.g. "8.9.2026, 09:41". */
export function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('de-DE', {
    day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** File-name-safe stamp from an ISO date: "2026-09-08_0941". */
export function fileStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'session';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

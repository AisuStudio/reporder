// A ZIP writer with no dependencies. "Stored" entries only: photos and
// audio are already compressed, and the protocol JSON is small. Runs in the
// browser and in Node (tests). Not ZIP64: fine below 4 GB per archive.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes, crc = 0) {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const day = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time: time & 0xffff, date: day & 0xffff };
}

const enc = new TextEncoder();

async function toBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (typeof data === 'string') return enc.encode(data);
  if (data && typeof data.arrayBuffer === 'function') return new Uint8Array(await data.arrayBuffer());
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  throw new Error('unsupported zip entry data');
}

/**
 * Build a ZIP from entries [{ name, data, mtime? }] where data is a string,
 * Uint8Array, ArrayBuffer or Blob. Returns { parts, size }: `parts` is an
 * array of Uint8Array/Blob you can hand to `new Blob(parts)` — big media
 * blobs are passed through untouched instead of being copied.
 */
export async function buildZip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = enc.encode(entry.name);
    const bytes = await toBytes(entry.data);
    const crc = crc32(bytes);
    const { time, date } = dosDateTime(entry.mtime);
    const size = bytes.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);        // version needed
    local.setUint16(6, 0x0800, true);    // flags: UTF-8 names
    local.setUint16(8, 0, true);         // method: stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, entry.data instanceof Blob ? entry.data : bytes);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);            // made by
    c.setUint16(6, 20, true);            // version needed
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, time, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, size, true);
    c.setUint32(24, size, true);
    c.setUint16(28, name.length, true);
    c.setUint16(30, 0, true);            // extra
    c.setUint16(32, 0, true);            // comment
    c.setUint16(34, 0, true);            // disk
    c.setUint16(36, 0, true);            // internal attrs
    c.setUint32(38, 0, true);            // external attrs
    c.setUint32(42, offset, true);       // local header offset
    central.push(new Uint8Array(c.buffer), name);

    offset += 30 + name.length + size;
  }

  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true);
  eocd.setUint16(6, 0, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);
  eocd.setUint16(20, 0, true);

  parts.push(...central, new Uint8Array(eocd.buffer));
  return { parts, size: offset + centralSize + 22 };
}

/** Node/test helper: the whole archive as one Uint8Array. */
export async function zipBytes(entries) {
  const { parts, size } = await buildZip(entries);
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) { const b = await toBytes(p); out.set(b, o); o += b.length; }
  return out;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, zipBytes } from './zip.js';

test('crc32 matches the reference value', () => {
  assert.equal(crc32(new TextEncoder().encode('hello')), 0x3610a686);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('the archive has the right signatures and counts', async () => {
  const bytes = await zipBytes([
    { name: 'session.json', data: '{"a":1}' },
    { name: 'photos/p-1.jpg', data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
  ]);
  const dv = new DataView(bytes.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  const eocd = bytes.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50);
  assert.equal(dv.getUint16(eocd + 10, true), 2);
});

test('unzip accepts the archive and restores every byte', async (t) => {
  let hasUnzip = true;
  try { execFileSync('unzip', ['-v'], { stdio: 'ignore' }); } catch { hasUnzip = false; }
  if (!hasUnzip) { t.skip('no unzip on this machine'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'reporder-zip-'));
  const file = join(dir, 'x.zip');
  const audio = new Uint8Array(5000).map((_, i) => (i * 7) & 0xff);
  writeFileSync(file, await zipBytes([
    { name: 'session.json', data: '{"format":"reporder-session"}', mtime: new Date('2026-09-08T10:00:00') },
    { name: 'audio.webm', data: audio },
    { name: 'photos/p-zimmer3.jpg', data: 'jpeg bytes here' },
  ]));
  execFileSync('unzip', ['-t', file], { stdio: 'ignore' });
  const listing = execFileSync('unzip', ['-Z1', file]).toString();
  assert.deepEqual(listing.trim().split('\n'), ['session.json', 'audio.webm', 'photos/p-zimmer3.jpg']);
  const back = execFileSync('unzip', ['-p', file, 'audio.webm']);
  assert.deepEqual(new Uint8Array(back), audio);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTimecode, formatDuration, fileStamp } from './time.js';

test('timecode shows minutes and seconds below an hour', () => {
  assert.equal(formatTimecode(0), '00:00');
  assert.equal(formatTimecode(61_000), '01:01');
  assert.equal(formatTimecode(3_599_999), '59:59');
});

test('timecode adds the hour once the recording passes sixty minutes', () => {
  assert.equal(formatTimecode(3_600_000), '1:00:00');
  assert.equal(formatTimecode(5_025_000), '1:23:45');
});

test('timecode tolerates garbage without throwing', () => {
  assert.equal(formatTimecode(-5), '00:00');
  assert.equal(formatTimecode(undefined), '00:00');
  assert.equal(formatTimecode('abc'), '00:00');
});

test('duration reads like a person would say it', () => {
  assert.equal(formatDuration(45_000), '45 s');
  assert.equal(formatDuration(8 * 60_000), '8 min');
  assert.equal(formatDuration(72 * 60_000), '1 h 12 min');
  assert.equal(formatDuration(120 * 60_000), '2 h');
});

test('file stamp is safe for file names', () => {
  assert.match(fileStamp('2026-09-08T09:41:00'), /^2026-09-08_\d{4}$/);
  assert.equal(fileStamp('nope'), 'session');
});

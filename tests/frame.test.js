import test from 'node:test';
import assert from 'node:assert/strict';

import { packFrame, parseFrame, blockCount, HEADER_SIZE, MAGIC_QR, MAGIC_SPECTRA } from '../src/lib/frame.js';

test('a frame round-trips through pack and parse', () => {
  const data = new Uint8Array(64).map((_, i) => (i * 7) & 0xff);
  const frame = packFrame({
    magic: MAGIC_QR, transferId: 0x1234, k: 40, blockSize: 64,
    totalLength: 2500, checksum: 0xdeadbeef, symbolId: 7, data,
  });
  assert.equal(frame.length, HEADER_SIZE + 64);
  const parsed = parseFrame(frame);
  assert.equal(parsed.magic, MAGIC_QR);
  assert.equal(parsed.transferId, 0x1234);
  assert.equal(parsed.k, 40);
  assert.equal(parsed.symbolId, 7);
  assert.deepEqual(parsed.data, data);
});

test('both transport magics are accepted, and identified', () => {
  for (const magic of [MAGIC_QR, MAGIC_SPECTRA]) {
    const frame = packFrame({ magic, transferId: 1, k: 2, blockSize: 8, totalLength: 9, checksum: 3, symbolId: 0, data: new Uint8Array(8) });
    assert.equal(parseFrame(frame).magic, magic);
  }
});

test('a corrupted header is rejected, and unknown magics too', () => {
  const frame = packFrame({ magic: MAGIC_QR, transferId: 1, k: 4, blockSize: 32, totalLength: 100, checksum: 5, symbolId: 0, data: new Uint8Array(32) });
  const bad = frame.slice();
  bad[6] ^= 0xff;
  assert.throws(() => parseFrame(bad), /checksum/);
  const wrong = new Uint8Array(HEADER_SIZE);
  assert.throws(() => parseFrame(wrong), /not a Helioprism frame/);
});

test('blockCount is sane', () => {
  assert.equal(blockCount(0, 1400), 1);
  assert.equal(blockCount(1401, 1400), 2);
});

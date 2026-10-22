import test from 'node:test';
import assert from 'node:assert/strict';

import {
  packFrame,
  parseFrame,
  blockCount,
  HEADER_SIZE,
  MAGIC_QR,
  MAGIC_SPECTRA,
  FountainCollector,
} from '../src/lib/frame.js';

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

test('frames with impossible sizes are rejected', () => {
  const data = new Uint8Array(32);
  const mk = (over) =>
    packFrame({ magic: MAGIC_QR, transferId: 1, k: 2, blockSize: 32, totalLength: 40, checksum: 1, symbolId: 0, data, ...over });

  // totalLength larger than k * blockSize can never be a real transfer
  assert.throws(() => parseFrame(mk({ totalLength: 5000 })), /inconsistent/);

  // a header claiming more payload than the frame carries
  assert.throws(() => parseFrame(mk().subarray(0, 30)), /truncated/);

  // a crafted header asking for an enormous allocation
  const huge = packFrame({
    magic: MAGIC_QR, transferId: 1, k: 65535, blockSize: 65535,
    totalLength: 200 * 1024 * 1024, checksum: 1, symbolId: 0, data: new Uint8Array(65535),
  });
  assert.throws(() => parseFrame(huge), /oversized/);
});

test('the collector will not absorb a frame from a different transport', () => {
  const data = new Uint8Array(32);
  const mk = (magic) =>
    parseFrame(packFrame({ magic, transferId: 7, k: 1, blockSize: 32, totalLength: 32, checksum: 1, symbolId: 0, data }));
  const collector = new FountainCollector();
  collector.add(mk(MAGIC_QR));
  assert.equal(collector.magic, MAGIC_QR);
  const r = collector.add(mk(MAGIC_SPECTRA));
  assert.equal(r.restarted, true);
  assert.equal(collector.magic, MAGIC_SPECTRA);
});

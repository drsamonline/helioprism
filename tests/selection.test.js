import test from 'node:test';
import assert from 'node:assert/strict';

import { select, byMagic, reason, TRANSPORTS } from '../src/transports/index.js';

test('auto-selects QR for small payloads and the colour transport for large', () => {
  assert.equal(select(1000).id, 'qr');
  assert.equal(select(10 * 1024).id, 'qr');
  assert.equal(select(5 * 1024 * 1024).id, 'spectra');
});

test('an explicit choice overrides auto', () => {
  assert.equal(select(1000, 'spectra').id, 'spectra');
  assert.equal(select(5 * 1024 * 1024, 'qr').id, 'qr');
});

test('frames are routed by magic byte', () => {
  assert.equal(byMagic(TRANSPORTS.qr.magic).id, 'qr');
  assert.equal(byMagic(TRANSPORTS.spectra.magic).id, 'spectra');
  assert.equal(byMagic(0x00), null);
});

test('the reason text is populated', () => {
  assert.match(reason(1000), /QR/);
  assert.match(reason(5 * 1024 * 1024), /colour/);
});

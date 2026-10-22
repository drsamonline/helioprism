import test from 'node:test';
import assert from 'node:assert/strict';

import { MAX_CONTAINER } from '../src/lib/frame.js';
import { arithEncode, arithDecode } from '../src/lib/spectra/arith.js';
import { Order1MatchModel } from '../src/lib/spectra/predict.js';

const APP_MAX_TOTAL = 20 * 1024 * 1024;

test('the decoder cap is never smaller than the sender limit', () => {
  // A payload the app accepts must always be openable — this was a real bug when
  // the arithmetic decoder defaulted to 16 MB against a 20 MB app limit.
  assert.ok(MAX_CONTAINER >= APP_MAX_TOTAL, `cap ${MAX_CONTAINER} < app limit ${APP_MAX_TOTAL}`);
});

test('the arithmetic decoder enforces its byte cap', () => {
  const bytes = crypto.getRandomValues(new Uint8Array(64 * 1024));
  const enc = arithEncode(bytes, new Order1MatchModel(null));
  assert.throws(() => arithDecode(enc, new Order1MatchModel(null), 1024), /too large/);
  assert.deepEqual(arithDecode(enc, new Order1MatchModel(null)), bytes);
});

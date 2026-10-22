import test from 'node:test';
import assert from 'node:assert/strict';

import { LTDecoder, encodeSymbol, splitBlocks, indicesFor, degreeFor } from '../src/lib/fountain.js';

test('LT decoder rebuilds from any enough symbols, with a systematic prefix', () => {
  const blockSize = 128;
  const payload = crypto.getRandomValues(new Uint8Array(blockSize * 12));
  const blocks = splitBlocks(payload, blockSize);
  const k = blocks.length;
  const dec = new LTDecoder(k, blockSize, payload.length);
  let used = 0;
  for (let id = 0; id < k * 3 && !dec.complete; id++) {
    dec.addSymbol(id, encodeSymbol(id, blocks));
    used++;
  }
  assert.equal(dec.complete, true);
  assert.deepEqual(dec.payload(), payload);
  assert.ok(used < k * 1.5, `overhead too high: ${used} for k=${k}`);
});

test('the first k symbols are the raw blocks (systematic)', () => {
  const k = 8;
  for (let id = 0; id < k; id++) {
    assert.equal(degreeFor(id, k), 1);
    assert.deepEqual(indicesFor(id, k), [id]);
  }
});

test('symbols are deterministic and in range', () => {
  const k = 40;
  for (const id of [0, 5, 41, 999]) {
    assert.deepEqual(indicesFor(id, k), indicesFor(id, k));
    const d = degreeFor(id, k);
    assert.ok(d >= 1 && d <= k);
  }
});

test('an incomplete transfer refuses to assemble', () => {
  const dec = new LTDecoder(10, 32, 320);
  assert.throws(() => dec.payload(), /incomplete/);
});

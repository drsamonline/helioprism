// Spectra transport, end to end: files -> transport.render -> colour pixels ->
// transport.decodeFrame (through a fake worker) -> collector -> files.

import test from 'node:test';
import assert from 'node:assert/strict';

import { mockCanvas } from './mock-canvas.js';
import * as spectra from '../src/transports/spectra.js';
import { decodeSpectraCode } from '../src/lib/spectra/spectra-decode.js';

const enc = (s) => new TextEncoder().encode(s);

/** Stands in for the Web Worker: same request/response shape, run inline. */
const fakeDecoder = {
  async call(_type, { data, width, height }) {
    const image = { data: new Uint8ClampedArray(data), width, height };
    const { payload } = decodeSpectraCode(image);
    return { payload };
  },
};

test('Spectra transport round-trips files', async () => {
  const files = [
    { name: 'note.txt', type: 'text/plain', bytes: enc('Helioprism over colour. '.repeat(40)) },
    { name: 'blob.bin', type: 'application/octet-stream', bytes: crypto.getRandomValues(new Uint8Array(9000)) },
  ];
  const session = await spectra.encode(files, 'balanced');
  assert.ok(session.stream.k >= 2, `expected a multi-frame payload, k=${session.stream.k}`);

  const collector = spectra.createCollector();
  const size = 1400;
  let rendered = 0;
  for (let id = 0; id < session.stream.k * 3 + 10 && !collector.complete; id++) {
    const { ctx, image } = mockCanvas(size);
    spectra.render(ctx, session, id, size);
    const frame = await spectra.decodeFrame(image(), fakeDecoder);
    assert.ok(frame, `colour frame ${id} failed to decode`);
    collector.add(frame);
    rendered++;
  }
  assert.equal(collector.complete, true, `did not complete after ${rendered} symbols`);
  const out = await spectra.decodeContainer(collector.assemble());
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].bytes, files[0].bytes);
  assert.deepEqual(out[1].bytes, files[1].bytes);
});

test('the colour transport carries more per frame than QR', async () => {
  const files = [{ name: 'a.txt', type: 'text/plain', bytes: enc('x'.repeat(1000)) }];
  const s = await spectra.encode(files, 'balanced');
  assert.ok(s.stream.blockSize > 5000, `blockSize ${s.stream.blockSize}`);
});

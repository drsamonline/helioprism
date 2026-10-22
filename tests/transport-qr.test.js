// QR transport, end to end: files -> transport.render -> QR pixels ->
// transport.decodeFrame -> collector -> files.

import test from 'node:test';
import assert from 'node:assert/strict';

import { mockCanvas } from './mock-canvas.js';
import * as qr from '../src/transports/qr.js';

const enc = (s) => new TextEncoder().encode(s);

test('QR transport round-trips a text file and a binary file', async () => {
  const files = [
    { name: 'note.txt', type: 'text/plain', bytes: enc('Helioprism over QR. '.repeat(60)) },
    { name: 'blob.bin', type: 'application/octet-stream', bytes: crypto.getRandomValues(new Uint8Array(1500)) },
  ];
  const session = await qr.encode(files, 'balanced');
  assert.ok(session.stream.k >= 1);

  const collector = qr.createCollector();
  const size = 1200;
  let rendered = 0;
  for (let id = 0; id < session.stream.k * 3 + 10 && !collector.complete; id++) {
    const { ctx, image } = mockCanvas(size);
    qr.render(ctx, session, id, size);
    const frame = qr.decodeFrame(image());
    assert.ok(frame, `QR frame ${id} failed to decode`);
    collector.add(frame);
    rendered++;
  }
  assert.equal(collector.complete, true, `did not complete after ${rendered} symbols`);
  const out = await qr.decodeContainer(collector.assemble());
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].bytes, files[0].bytes);
  assert.deepEqual(out[1].bytes, files[1].bytes);
});

test('QR transport works in the robust density too', async () => {
  const files = [{ name: 'a.txt', type: 'text/plain', bytes: enc('small payload. '.repeat(20)) }];
  const session = await qr.encode(files, 'robust');
  const collector = qr.createCollector();
  for (let id = 0; id < session.stream.k * 3 + 6 && !collector.complete; id++) {
    const { ctx, image } = mockCanvas(1000);
    qr.render(ctx, session, id, 1000);
    collector.add(qr.decodeFrame(image()));
  }
  assert.equal(collector.complete, true);
  assert.deepEqual((await qr.decodeContainer(collector.assemble()))[0].bytes, files[0].bytes);
});

test('a plain compatibility QR decodes as text', () => {
  const { ctx, image } = mockCanvas(600);
  qr.renderPlain(ctx, enc('https://drsamonline.github.io/'), 600);
  const raw = qr.decodeRaw(image());
  assert.ok(raw);
  assert.equal(raw.text, 'https://drsamonline.github.io/');
  assert.equal(raw.frame, null);
});

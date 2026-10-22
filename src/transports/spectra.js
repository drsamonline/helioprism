// Spectra transport: SpectraCode colour matrices.
//
// The high-capacity option. A file is compressed with an order-1 arithmetic
// coder (plus a match model), Reed-Solomon protected, and painted as colour
// cells — five bits per cell instead of QR's one.

import { drawSpectraCode, payloadToSymbols, specByName, DENSITIES } from '../lib/spectra/spectracode.js';
import { arithEncode, arithDecode } from '../lib/spectra/arith.js';
import { Order1MatchModel } from '../lib/spectra/predict.js';
import { packFiles, unpackFiles } from '../lib/container.js';
import {
  packFrame,
  parseFrame,
  FountainCollector,
  MAGIC_SPECTRA,
  splitBlocks,
  encodeSymbol,
  blockCount,
  HEADER_SIZE,
  MAX_CONTAINER,
} from '../lib/frame.js';
import { crc32, generateUUID } from '../lib/utils.js';

export const id = 'spectra';
export const label = 'SpectraCode';
export const blurb = 'Colour matrix — several KB per frame, for larger files';
export const magic = MAGIC_SPECTRA;

export const PRESETS = {
  robust: { density: 'robust', label: 'Robust — easiest to scan' },
  balanced: { density: 'standard', label: 'Balanced — the default' },
};
export const DEFAULT_PRESET = 'balanced';

/** Symbol bytes that fit one SpectraCode at this density. */
export function symbolBytes(preset = DEFAULT_PRESET) {
  const spec = specByName((PRESETS[preset] ?? PRESETS[DEFAULT_PRESET]).density);
  return spec.payloadCapacity - HEADER_SIZE;
}

/** Rough guide: pick this transport above this many bytes. */
export const preferAbove = 256 * 1024;

function compress(container) {
  return arithEncode(container, new Order1MatchModel(null));
}
function decompress(bytes) {
  // Match the cap the app enforces, so a payload the sender accepted always opens.
  return arithDecode(bytes, new Order1MatchModel(null), MAX_CONTAINER);
}

export async function encode(files, preset = DEFAULT_PRESET) {
  const container = compress(packFiles(files));
  const blockSize = symbolBytes(preset);
  const uuid = generateUUID();
  const stream = {
    magic,
    transferId: (uuid[0] << 8) | uuid[1],
    k: blockCount(container.length, blockSize),
    blockSize,
    totalLength: container.length,
    checksum: crc32(container),
  };
  return {
    container,
    stream,
    blocks: splitBlocks(container, blockSize),
    spec: specByName((PRESETS[preset] ?? PRESETS[DEFAULT_PRESET]).density),
  };
}

/** Draw frame `symbolId` on a 2D canvas context (a SpectraCode). */
export function render(ctx, session, symbolId, size) {
  const data = encodeSymbol(symbolId, session.blocks);
  const frame = packFrame({ ...session.stream, symbolId, data });
  const surface = canvasSurface(ctx);
  drawSpectraCode(surface, payloadToSymbols(frame, session.spec), size, session.spec);
  return frame.length;
}

function canvasSurface(ctx) {
  return {
    fillRect(x, y, w, h, [r, g, b]) {
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, w, h);
    },
    fillCircle(cx, cy, radius, [r, g, b]) {
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    },
  };
}

/**
 * Decode one camera image into a frame, or null. The heavy optical decode runs
 * in the transport's worker; `decoder` is a WorkerClient provided by the app.
 */
export async function decodeFrame(image, decoder) {
  try {
    const res = await decoder.call(
      'decode',
      { data: image.data.buffer, width: image.width, height: image.height },
      { transfer: [image.data.buffer] },
    );
    return parseFrame(new Uint8Array(res.payload));
  } catch {
    return null;
  }
}

export function createCollector() {
  return new FountainCollector();
}

/** Container bytes -> files. */
export async function decodeContainer(bytes) {
  return unpackFiles(decompress(bytes));
}

export const densities = DENSITIES;

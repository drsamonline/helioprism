// QR transport: monochrome animated QR codes.
//
// The universal option — any camera reads it, and a tiny file can be sent as a
// single plain QR that any third-party scanner understands. Lower capacity than
// the colour transport, but far more tolerant of cheap optics.

import { drawQR, decodeImage, decodeRaw as decodeRawQr } from '../lib/qr/qr.js';
import { packFiles, unpackFiles, gzip, gunzip } from '../lib/container.js';
import {
  packFrame,
  parseFrame,
  FountainCollector,
  MAGIC_QR,
  MAGICS,
  splitBlocks,
  encodeSymbol,
  blockCount,
} from '../lib/frame.js';
import { crc32, generateUUID } from '../lib/utils.js';

export const id = 'qr';
export const label = 'QR';
export const blurb = 'Monochrome QR — any camera reads it, and any scanner reads a tiny file';
export const magic = MAGIC_QR;

/** Symbol payload per frame; smaller scans more reliably. */
export const PRESETS = {
  robust: { blockSize: 800, label: 'Robust — easiest to scan' },
  balanced: { blockSize: 1400, label: 'Balanced — the default' },
  dense: { blockSize: 1800, label: 'Dense — fewest frames' },
};
export const DEFAULT_PRESET = 'balanced';
export const presetBlockSize = (name) => (PRESETS[name] ?? PRESETS[DEFAULT_PRESET]).blockSize;

/** Rough guide: this transport is the right pick below this many bytes. */
export const preferBelow = 256 * 1024;

/** Encode files into a stream session. */
export async function encode(files, preset = DEFAULT_PRESET) {
  const container = await gzip(packFiles(files));
  const blockSize = presetBlockSize(preset);
  const uuid = generateUUID();
  const stream = {
    magic,
    transferId: (uuid[0] << 8) | uuid[1],
    k: blockCount(container.length, blockSize),
    blockSize,
    totalLength: container.length,
    checksum: crc32(container),
  };
  return { container, stream, blocks: splitBlocks(container, blockSize) };
}

/** Draw frame `symbolId` on a 2D canvas context. */
export function render(ctx, session, symbolId, size) {
  const data = encodeSymbol(symbolId, session.blocks);
  const frame = packFrame({ ...session.stream, symbolId, data });
  drawQR(ctx, frame, size, { margin: 4 });
  return frame.length;
}

/** Decode one camera image into a frame, or null. */
export function decodeFrame(image) {
  const bytes = decodeImage(image);
  if (!bytes) return null;
  try {
    return parseFrame(bytes);
  } catch {
    return null;
  }
}

/**
 * Decode a camera image as either a framed transfer or a plain compatibility QR.
 * @returns {{frame:object|null, text:string|null}|null}
 */
export function decodeRaw(image) {
  const r = decodeRawQr(image);
  if (!r) return null;
  // A payload that begins with a Helioprism magic byte is a frame. If it fails to
  // parse it is corrupt, not plain text — do not fall through and mistake it for
  // a text file.
  if (MAGICS.has(r.bytes[0])) {
    try {
      return { frame: parseFrame(r.bytes), text: null };
    } catch {
      return null;
    }
  }
  return { frame: null, text: r.text };
}

/** Draw a plain QR carrying raw text — readable by any scanner. */
export function renderPlain(ctx, bytes, size) {
  drawQR(ctx, bytes, size, { margin: 6 });
}

export function createCollector() {
  return new FountainCollector();
}

/** Container bytes -> files. */
export async function decodeContainer(bytes) {
  return unpackFiles(await gunzip(bytes));
}

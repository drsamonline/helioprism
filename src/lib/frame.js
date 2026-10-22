// Shared frame format for both transports.
//
// Every on-screen frame in a Helioprism transfer carries the same header plus
// one fountain symbol. The magic byte says which physical layer carried it, so a
// receiver can auto-detect the transport from any single frame.
//
//   0     magic (0xB7 QR, 0xB2 colour)
//   1     version
//   2-3   transferId      u16
//   4-5   k               u16   source blocks
//   6-7   blockSize       u16   bytes per symbol
//   8-11  totalLength     u32   compressed container length
//   12-15 checksum        u32   CRC-32 of the container
//   16-19 symbolId        u32   fountain symbol id (0,1,2,... forever)
//   20-21 headerCRC       u16   CRC-16 of bytes 0..19

import { crc16, crc32 } from './utils.js';
import { LTDecoder, splitBlocks, encodeSymbol, blockCount } from './fountain.js';

export const MAGIC_QR = 0xb7;
export const MAGIC_SPECTRA = 0xb2;
export const MAGICS = new Set([MAGIC_QR, MAGIC_SPECTRA]);
export const VERSION = 1;
export const HEADER_SIZE = 22;

export { splitBlocks, encodeSymbol, blockCount };

export const frameBytes = (blockSize) => HEADER_SIZE + blockSize;

/** Pack one fountain symbol into a frame. */
export function packFrame({ magic, transferId, k, blockSize, totalLength, checksum, symbolId, data }) {
  const out = new Uint8Array(HEADER_SIZE + data.length);
  const view = new DataView(out.buffer);
  out[0] = magic;
  out[1] = VERSION;
  view.setUint16(2, transferId & 0xffff, false);
  view.setUint16(4, k, false);
  view.setUint16(6, blockSize, false);
  view.setUint32(8, totalLength, false);
  view.setUint32(12, checksum, false);
  view.setUint32(16, symbolId, false);
  view.setUint16(20, crc16(out.subarray(0, 20)), false);
  out.set(data, HEADER_SIZE);
  return out;
}

/**
 * Parse a decoded frame. Accepts either transport's magic so the receiver can
 * auto-detect.
 * @throws if the bytes are not a valid frame
 */
export function parseFrame(bytes) {
  if (bytes.length < HEADER_SIZE) throw new Error('frame truncated');
  if (!MAGICS.has(bytes[0])) throw new Error('not a Helioprism frame');
  if (bytes[1] !== VERSION) throw new Error(`unsupported frame version ${bytes[1]}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (crc16(bytes.subarray(0, 20)) !== view.getUint16(20, false)) {
    throw new Error('frame header failed its checksum');
  }
  const k = view.getUint16(4, false);
  const blockSize = view.getUint16(6, false);
  if (k === 0 || blockSize === 0) throw new Error('frame has an empty grid');
  return {
    magic: bytes[0],
    transferId: view.getUint16(2, false),
    k,
    blockSize,
    totalLength: view.getUint32(8, false),
    checksum: view.getUint32(12, false),
    symbolId: view.getUint32(16, false),
    data: bytes.slice(HEADER_SIZE, HEADER_SIZE + blockSize),
  };
}

/**
 * Rateless collector shared by both transports: absorbs fountain symbols from
 * any frame until the container is rebuilt, then verifies CRC-32.
 */
export class FountainCollector {
  constructor() {
    this.reset();
  }

  reset() {
    this.magic = null;
    this.transferId = null;
    this.decoder = null;
    this.checksum = 0;
    this.symbols = 0;
  }

  get count() {
    return this.decoder ? this.decoder.k : 0;
  }

  get received() {
    return this.decoder ? this.decoder.resolved : 0;
  }

  get complete() {
    return this.decoder ? this.decoder.complete : false;
  }

  get progress() {
    return this.decoder ? this.decoder.progress : 0;
  }

  /** Absorb one decoded frame. */
  add(frame) {
    if (
      !this.decoder ||
      this.transferId !== frame.transferId ||
      this.decoder.k !== frame.k ||
      this.decoder.blockSize !== frame.blockSize ||
      this.decoder.length !== frame.totalLength
    ) {
      this.magic = frame.magic;
      this.transferId = frame.transferId;
      this.decoder = new LTDecoder(frame.k, frame.blockSize, frame.totalLength);
      this.checksum = frame.checksum;
      this.symbols = 0;
      this.decoder.addSymbol(frame.symbolId, frame.data);
      this.symbols++;
      return { fresh: true, restarted: true };
    }
    const fresh = this.decoder.addSymbol(frame.symbolId, frame.data);
    if (fresh) this.symbols++;
    return { fresh, restarted: false };
  }

  /** Rebuild the container and verify its checksum. */
  assemble() {
    if (!this.complete) throw new Error('transfer incomplete');
    const out = this.decoder.payload();
    if (crc32(out) !== this.checksum) throw new Error('checksum mismatch — rescan the code');
    return out;
  }
}

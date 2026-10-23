// Shared frame format for both transports — delegated to the shared `frame-kit`.
//
// Every on-screen frame in a Helioprism transfer carries the same 22-byte
// self-describing header plus one fountain symbol. The magic byte says which
// physical layer carried it, so a receiver can auto-detect the transport from any
// single frame.
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
//
// The header, its strict validation and the rateless collector used to live
// here; they are now extracted once into `drsamonline/frame-kit`, vendored beside
// this file as `frame-kit.js`. Everything here is a thin adapter over the kit, so
// the repo keeps the same public API while the framing lives in one place.

import './frame-kit.js'; // side-effect: defines globalThis.Frame
import { LTDecoder, splitBlocks, encodeSymbol, blockCount } from './fountain.js';

const Frame = globalThis.Frame;

export const MAGIC_QR = 0xb7;
export const MAGIC_SPECTRA = 0xb2;
export const MAGICS = new Set([MAGIC_QR, MAGIC_SPECTRA]);
export const VERSION = Frame.VERSION;
export const HEADER_SIZE = Frame.HEADER_SIZE;

// A frame is untrusted input: bound what a header may claim, so a corrupt or
// crafted frame cannot make the receiver allocate a huge decoder.
export const MAX_CONTAINER = Frame.MAX_CONTAINER;

export { splitBlocks, encodeSymbol, blockCount };

export const frameBytes = (blockSize) => Frame.frameBytes(blockSize);

/** Pack one fountain symbol into a frame. */
export function packFrame({ magic, transferId, k, blockSize, totalLength, checksum, symbolId, data }) {
  return Frame.pack({ magic, transferId, k, blockSize, totalLength, payloadCRC: checksum, symbolId, data });
}

/**
 * Parse a decoded frame. Accepts either transport's magic so the receiver can
 * auto-detect.
 * @throws if the bytes are not a valid frame
 */
export function parseFrame(bytes) {
  const f = Frame.parse(bytes, { magics: MAGICS, label: 'Helioprism' });
  return {
    magic: f.magic,
    transferId: f.transferId,
    k: f.k,
    blockSize: f.blockSize,
    totalLength: f.totalLength,
    checksum: f.payloadCRC,
    payloadCRC: f.payloadCRC,
    symbolId: f.symbolId,
    data: f.data,
  };
}

/**
 * Rateless collector shared by both transports: absorbs fountain symbols from
 * any frame until the container is rebuilt, then verifies CRC-32. The logic now
 * lives in `frame-kit`; this binds it to the repo's LT decoder.
 */
export class FountainCollector extends Frame.FountainCollector {
  constructor() {
    super(LTDecoder);
  }
}

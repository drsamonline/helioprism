// Transport registry and selection engine.
//
// Helioprism carries the same rateless frame stream over two physical layers.
// The magic byte in each frame identifies the layer, so a receiver can
// auto-detect; the sender picks a layer up front by payload size (or by the
// user's explicit choice).

import * as qr from './qr.js';
import * as spectra from './spectra.js';

export const TRANSPORTS = { qr, spectra };
export const list = [qr, spectra];

/**
 * Pick a transport for a payload.
 * @param {number} totalBytes payload size (uncompressed)
 * @param {string|null} force explicit transport id, or null for auto
 */
export function select(totalBytes, force = null) {
  if (force && TRANSPORTS[force]) return TRANSPORTS[force];
  return totalBytes <= qr.preferBelow ? qr : spectra;
}

/** Which transport carried a frame, by its magic byte. */
export function byMagic(magic) {
  if (magic === qr.magic) return qr;
  if (magic === spectra.magic) return spectra;
  return null;
}

/** Human-readable reason for an auto choice. */
export function reason(totalBytes, force = null) {
  if (force) return `forced to ${TRANSPORTS[force].label}`;
  return totalBytes <= qr.preferBelow
    ? 'small payload — QR is the most widely readable'
    : 'large payload — the colour transport carries more per frame';
}

// Multi-file container, shared by both transports.
//
//   "BTF1" | count u16 | per file: nameLen u16, name, typeLen u16, type, size u32
//   | concatenated file bytes
//
// The transports differ only in how they compress these bytes (gzip for QR,
// an arithmetic coder for the colour transport) and in the physical layer.

const MAGIC = Uint8Array.of(0x42, 0x54, 0x46, 0x31); // "BTF1"
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Build the uncompressed container for a list of files. */
export function packFiles(files) {
  const heads = [];
  let blobLen = 0;
  for (const f of files) {
    const name = encoder.encode(f.name);
    const type = encoder.encode(f.type || 'application/octet-stream');
    const head = new Uint8Array(2 + name.length + 2 + type.length + 4);
    const view = new DataView(head.buffer);
    view.setUint16(0, name.length, false);
    head.set(name, 2);
    view.setUint16(2 + name.length, type.length, false);
    head.set(type, 4 + name.length);
    view.setUint32(4 + name.length + type.length, f.bytes.length, false);
    heads.push(head);
    blobLen += f.bytes.length;
  }
  let headLen = 4 + 2;
  for (const h of heads) headLen += h.length;
  const out = new Uint8Array(headLen + blobLen);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint16(4, files.length, false);
  let p = 6;
  for (const h of heads) {
    out.set(h, p);
    p += h.length;
  }
  for (const f of files) {
    out.set(f.bytes, p);
    p += f.bytes.length;
  }
  return out;
}

/** Reverse {@link packFiles}. */
export function unpackFiles(container) {
  for (let i = 0; i < 4; i++) {
    if (container[i] !== MAGIC[i]) throw new Error('not a Helioprism payload');
  }
  const view = new DataView(container.buffer, container.byteOffset, container.byteLength);
  const count = view.getUint16(4, false);
  let p = 6;
  const meta = [];
  for (let i = 0; i < count; i++) {
    const nameLen = view.getUint16(p, false);
    p += 2;
    const name = decoder.decode(container.subarray(p, p + nameLen));
    p += nameLen;
    const typeLen = view.getUint16(p, false);
    p += 2;
    const type = decoder.decode(container.subarray(p, p + typeLen));
    p += typeLen;
    const size = view.getUint32(p, false);
    p += 4;
    meta.push({ name, type, size });
  }
  const files = [];
  for (const m of meta) {
    files.push({ ...m, bytes: container.slice(p, p + m.size) });
    p += m.size;
  }
  return files;
}

/** Drain a ReadableStream of Uint8Array chunks into one array. */
export async function collectStream(stream) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

/** gzip / gunzip helpers (used by the QR transport). */
export async function gzip(bytes) {
  if (typeof CompressionStream === 'undefined') return bytes;
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return collectStream(cs.readable);
}

export async function gunzip(bytes) {
  if (typeof DecompressionStream === 'undefined') return bytes;
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return collectStream(ds.readable);
}

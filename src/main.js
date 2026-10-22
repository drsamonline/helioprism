// Helioprism — application shell.
//
// Sender:  files -> container -> fountain symbols -> frames on screen.
// Receiver: camera -> a transport's decoder -> fountain collector -> files.
//
// The same frame stream rides over two physical layers; the magic byte in each
// frame identifies it, so the receiver auto-detects.

import { WorkerClient } from './workers/worker-rpc.js';
import * as qr from './transports/qr.js';
import * as spectra from './transports/spectra.js';
import { select, reason } from './transports/index.js';
import { formatSize, guessType } from './lib/utils.js';

const MAX_TOTAL = 20 * 1024 * 1024;
const PLAIN_MAX = 1200;
const TEXT_EXT = /\.(txt|md|json|csv|html|css|js|ts|xml|yml|yaml|log|url|vcf|ics)$/i;

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = new TextEncoder();

const spectraDecoder = new WorkerClient(new URL('./workers/spectracode-decoder-worker.js', import.meta.url));

const state = {
  files: [],
  preset: 'balanced',
  force: null,
  plain: false,
  // sender
  transport: null,
  session: null,
  symbolId: 0,
  sending: false,
  playTimer: null,
  wakeLock: null,
  // receiver
  activeTransport: null,
  collector: null,
  scanning: false,
  stream: null,
  received: [],
  resultUrls: [],
};

// ------------------------------------------------------------------- chrome

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  $('backBtn').hidden = id === 'screen-home';
  window.scrollTo({ top: 0 });
}

let toastTimer;
function toast(message, tone = '') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast show ${tone}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 3400);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

$('backBtn').addEventListener('click', () => {
  stopSending();
  stopReceiving();
  show('screen-home');
});
$('goSend').addEventListener('click', () => show('screen-send'));
$('goReceive').addEventListener('click', startReceiving);

// ------------------------------------------------------------------- sender

$('pickBtn').addEventListener('click', () => $('fileInput').click());
$('dropzone').addEventListener('click', (e) => {
  if (e.target.id !== 'pickBtn') $('fileInput').click();
});
$('fileInput').addEventListener('change', (e) => setFiles([...e.target.files]));

['dragover', 'dragleave', 'drop'].forEach((type) => {
  const dz = $('dropzone');
  dz.addEventListener(type, (e) => {
    e.preventDefault();
    dz.classList.toggle('hover', type === 'dragover');
    if (type === 'drop') setFiles([...e.dataTransfer.files]);
  });
});

function setFiles(list) {
  const total = list.reduce((n, f) => n + f.size, 0);
  if (total > MAX_TOTAL) {
    toast(`That is ${formatSize(total)} — the limit is ${formatSize(MAX_TOTAL)}`, 'err');
    return;
  }
  state.files = list;
  renderFileList();
  updateNote();
}

function totalBytes() {
  return state.files.reduce((n, f) => n + f.size, 0);
}

function renderFileList() {
  const box = $('fileList');
  if (!state.files.length) {
    box.innerHTML = '';
    $('startSend').disabled = true;
    return;
  }
  const total = totalBytes();
  box.innerHTML =
    `<div class="muted">${state.files.length} file(s) &middot; ${formatSize(total)}</div>` +
    state.files
      .slice(0, 6)
      .map((f) => `<div class="file-row"><span class="name">${escapeHtml(f.name)}</span><span class="size">${formatSize(f.size)}</span></div>`)
      .join('');
  $('startSend').disabled = false;
}

/** The transport that would actually be used right now. */
function effectiveTransport() {
  return select(totalBytes(), state.force);
}

/**
 * Rebuild the density options for the effective transport, so we never offer a
 * density a transport does not have (SpectraCode has no "dense", and picking it
 * used to be silently ignored).
 */
function syncPresets() {
  const t = effectiveTransport();
  const keys = Object.keys(t.PRESETS);
  const wanted = keys.includes(state.preset)
    ? state.preset
    : keys.includes('balanced')
      ? 'balanced'
      : keys[0];
  const sel = $('presetSelect');
  sel.innerHTML = keys.map((k) => `<option value="${k}">${t.PRESETS[k].label}</option>`).join('');
  sel.value = wanted;
  state.preset = wanted;
}

function updateNote() {
  syncPresets();
  if (!state.files.length) {
    $('transportNote').textContent = '';
    return;
  }
  if (state.plain && !plainEligible()) {
    $('transportNote').textContent = 'Compatibility mode needs one small text file (≤ 1.2 KB).';
    return;
  }
  if (state.plain) {
    $('transportNote').textContent = 'Compatibility mode — one plain QR, readable by any scanner.';
    return;
  }
  const t = effectiveTransport();
  $('transportNote').textContent = `Transport: ${t.label} — ${reason(totalBytes(), state.force)}.`;
}

$('transportSelect').addEventListener('change', (e) => {
  state.force = e.target.value || null;
  updateNote();
});
$('presetSelect').addEventListener('change', (e) => (state.preset = e.target.value));
$('plainMode').addEventListener('change', (e) => {
  state.plain = e.target.checked;
  updateNote();
});

function plainEligible() {
  if (state.files.length !== 1) return false;
  const f = state.files[0];
  if (f.size > PLAIN_MAX) return false;
  return (f.type && f.type.startsWith('text/')) || TEXT_EXT.test(f.name);
}

$('startSend').addEventListener('click', startSending);
$('stopSend').addEventListener('click', () => {
  stopSending();
  show('screen-send');
});

async function startSending() {
  if (!state.files.length) return;
  if (state.plain && !plainEligible()) {
    toast('Compatibility mode needs one small text file (≤ 1.2 KB)', 'warn');
    return;
  }

  const files = await Promise.all(
    state.files.map(async (f) => ({ name: f.name, type: f.type || guessType(f.name), bytes: new Uint8Array(await f.arrayBuffer()) })),
  );

  show('screen-show');
  const canvas = $('qrCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const size = canvas.width;

  if (state.plain) {
    state.transport = qr;
    state.session = { plain: true, text: files[0].bytes };
    qr.renderPlain(ctx, files[0].bytes, size);
    $('sendBar').style.width = '100%';
    $('sendPct').textContent = '';
    $('sendMeta').textContent = 'Plain QR — any scanner can read this';
    return;
  }

  try {
    state.transport = select(totalBytes(), state.force);
    state.session = await state.transport.encode(files, state.preset);
    state.symbolId = 0;

    const { stream } = state.session;
    const perFrame = stream.blockSize;
    $('sendStats').hidden = false;
    $('sendStats').innerHTML = `
      <div><dt>Transport</dt><dd>${state.transport.label}</dd></div>
      <div><dt>Payload</dt><dd>${formatSize(stream.totalLength)}</dd></div>
      <div><dt>Blocks</dt><dd>${stream.k}</dd></div>
      <div><dt>Per frame</dt><dd>${formatSize(perFrame)}</dd></div>`;

    state.sending = true;
    keepAwake(true);
    runSendLoop(ctx, size);
    toast(`Transmitting over ${state.transport.label} — keep the screen visible`, 'warn');
  } catch (err) {
    toast(`Could not prepare: ${err.message}`, 'err');
    show('screen-send');
  }
}

function runSendLoop(ctx, size) {
  const tick = () => {
    if (!state.sending) return;
    const id = state.symbolId++;
    try {
      state.transport.render(ctx, state.session, id, size);
    } catch (err) {
      toast(`Render failed: ${err.message}`, 'err');
      state.sending = false;
      return;
    }
    const k = state.session.stream.k;
    const pct = Math.min(100, Math.round((id / (k * 1.15)) * 100));
    $('sendBar').style.width = `${pct}%`;
    $('sendPct').textContent = `${pct}%`;
    $('sendMeta').textContent = `Symbol ${id + 1} · ${k} blocks to collect`;
    setTimeout(() => requestAnimationFrame(tick), Math.round(1000 / 8));
  };
  tick();
}

function stopSending() {
  state.sending = false;
  keepAwake(false);
}

async function keepAwake(on) {
  try {
    if (on) state.wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
    else {
      await state.wakeLock?.release();
      state.wakeLock = null;
    }
  } catch {
    state.wakeLock = null;
  }
}

// ----------------------------------------------------------------- receiver

$('stopRecv').addEventListener('click', () => {
  stopReceiving();
  show('screen-home');
});

async function startReceiving() {
  if (state.scanning) return;
  show('screen-receive');
  $('results').hidden = true;
  $('saveAll').hidden = true;
  state.received = [];
  state.activeTransport = null;
  state.collector = null;
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  } catch (err) {
    toast(`Camera unavailable: ${err.message}`, 'err');
    show('screen-home');
    return;
  }
  $('video').srcObject = state.stream;
  await $('video').play().catch(() => {});
  state.scanning = true;
  keepAwake(true);
  scanLoop();
}

let scanCanvas = null;
function grab(w, h) {
  const video = $('video');
  if (!scanCanvas) scanCanvas = document.createElement('canvas');
  if (scanCanvas.width !== w || scanCanvas.height !== h) {
    scanCanvas.width = w;
    scanCanvas.height = h;
  }
  const ctx = scanCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** QR at a few scales, so a code that is too close or too far still decodes. */
function tryQr(vw, vh) {
  for (const scale of [1, 0.65, 0.4]) {
    const r = qr.decodeRaw(grab(Math.round(vw * scale), Math.round(vh * scale)));
    if (r) return r;
  }
  return null;
}

function decodeQrFrame(vw, vh) {
  const r = tryQr(vw, vh);
  return r ? r.frame : null;
}

async function scanLoop() {
  let misses = 0;
  while (state.scanning) {
    const video = $('video');
    if (!video.videoWidth) {
      await sleep(100);
      continue;
    }
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    try {
      if (await ingest(vw, vh)) return;
      misses = 0;
    } catch {
      if (++misses % 8 === 0) $('recvMeta').textContent = 'Searching — fill the frame with the code';
    }
    await sleep(60);
  }
}

async function ingest(vw, vh) {
  if (!state.activeTransport) {
    // Auto-detect: QR first (cheap), then the colour transport.
    const raw = tryQr(vw, vh);
    if (raw && raw.frame) {
      state.activeTransport = qr;
      state.collector = qr.createCollector();
      return absorb(raw.frame);
    }
    if (raw && raw.text) {
      // plain compatibility QR
      finishPlain(raw.text);
      return true;
    }
    const sf = await spectra.decodeFrame(grab(vw, vh), spectraDecoder);
    if (sf) {
      state.activeTransport = spectra;
      state.collector = spectra.createCollector();
      return absorb(sf);
    }
    throw new Error('no frame');
  }

  const frame =
    state.activeTransport === qr
      ? decodeQrFrame(vw, vh)
      : await spectra.decodeFrame(grab(vw, vh), spectraDecoder);
  if (!frame) throw new Error('no frame');
  return absorb(frame);
}

async function absorb(frame) {
  const { fresh, restarted } = state.collector.add(frame);
  if (restarted) toast('Transfer detected — collecting symbols…', 'warn');
  const c = state.collector;
  if (fresh) {
    const pct = Math.round(c.progress * 100);
    $('recvBar').style.width = `${pct}%`;
    $('recvPct').textContent = `${pct}%`;
    $('recvMeta').textContent = `${state.activeTransport.label} · ${c.received} / ${c.count} blocks`;
  }
  if (!c.complete) return false;
  await finishReceive();
  return true;
}

async function finishReceive() {
  const container = state.collector.assemble();
  const files = await state.activeTransport.decodeContainer(container);
  state.received = files;
  $('recvMeta').textContent = 'Transfer complete';
  $('recvPct').textContent = '100%';
  $('recvBar').style.width = '100%';
  renderResults(files);
  stopReceiving();
  toast(`Received ${files.length} file(s) over ${state.activeTransport.label}`, 'ok');
}

function finishPlain(text) {
  const bytes = enc.encode(text);
  const name = /^https?:\/\//i.test(text.trim()) ? 'link.txt' : 'note.txt';
  state.received = [{ name, type: 'text/plain', bytes }];
  $('recvMeta').textContent = 'Plain QR received';
  $('recvPct').textContent = '100%';
  $('recvBar').style.width = '100%';
  renderResults(state.received);
  stopReceiving();
  toast('Read a plain QR', 'ok');
}

function renderResults(files) {
  const box = $('results');
  box.hidden = false;
  // Release the previous transfer's blob URLs before making new ones.
  for (const url of state.resultUrls) URL.revokeObjectURL(url);
  state.resultUrls = [];
  box.innerHTML = files
    .map((f) => {
      const url = URL.createObjectURL(new Blob([f.bytes], { type: f.type }));
      state.resultUrls.push(url);
      return `<div class="result-row"><span class="name">${escapeHtml(f.name)}</span><span class="size">${formatSize(f.bytes.length)}</span><a href="${url}" download="${escapeHtml(f.name)}">Save</a></div>`;
    })
    .join('');
  $('saveAll').hidden = files.length < 2;
}

$('saveAll').addEventListener('click', () => {
  state.received.forEach((f, i) => {
    setTimeout(() => {
      const a = document.createElement('a');
      const url = URL.createObjectURL(new Blob([f.bytes], { type: f.type }));
      a.href = url;
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, i * 250);
  });
});

function stopReceiving() {
  state.scanning = false;
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
  $('video').srcObject = null;
  keepAwake(false);
}

// --------------------------------------------------------------------- PWA

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// Line the density picker up with the transport that will be used by default.
syncPresets();

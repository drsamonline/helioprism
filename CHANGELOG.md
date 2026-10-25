# Changelog

## 1.0.1 — 2026-10-25

- **Licence: PolyForm Noncommercial 1.0.0.** Every repository now carries the canonical text
  from polyformproject.org with the Required Notice line, and the four places a repo states
  its licence agree: LICENSE, the SPDX headers, the README and package.json.
- **The public demo is the app.** A build now fails if `docs/play/index.html` is not the app,
  because a demo running older code is two code paths for one program.


All notable changes to Helioprism are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-22

First release. One app, two optical transports.

### Added
- **Shared frame + fountain layer** (`src/lib/frame.js`, `fountain.js`): one
  rateless LT frame format carrying a per-transport magic byte, so a receiver can
  auto-detect which physical layer carried a frame.
- **QR transport** (`src/transports/qr.js`): monochrome animated QR, gzip
  container, plus a plain compatibility mode any third-party scanner can read.
- **SpectraCode transport** (`src/transports/spectra.js`): colour matrix,
  order-1 arithmetic coder with a match model, Reed-Solomon, full optical
  decoder running in a worker.
- **Selection engine** (`src/transports/index.js`): auto-pick by payload size, or
  choose a transport explicitly.
- **App** with a transport picker, live progress and PWA install.
- **Tests** (21): frame format, fountain codes, selection, and end-to-end
  loopbacks for both transports — including a mock canvas so each transport's real
  `render()` and `decodeFrame()` are exercised without a browser.
- Dual licence (PolyForm Noncommercial + commercial-by-invoice), `NOTICE`, badged
  README, landing page, `tools/build.mjs`, and ci / pages / build-apps workflows.

### Fixed
- `parseFrame` bounds an untrusted header (payload length, `k * blockSize`, a
  64 MB cap), and `FountainCollector` also compares the magic byte so a frame
  from the other transport can never be absorbed into the current decoder.
- `qr.decodeRaw` no longer mistakes a corrupt frame for a plain-text QR.
- The QR receiver tries three decode scales again (it had regressed to one).
- The density picker lists only the densities the chosen transport supports.
- Result blob URLs are revoked; the SpectraCode decode cap matches the app limit.

### Notes
- The QR transport inherits the fixes found while building BlinkTransfer v3
  (systematic fountain prefix, Robust-Soliton clamp, exact QR module tiling).
- The colour transport inherits BlinkCode AI's match-model compression, rateless
  frames, optical robustness and bicubic perceptual reconstruction.

[1.0.0]: https://github.com/drsamonline/helioprism/releases/tag/v1.0.0

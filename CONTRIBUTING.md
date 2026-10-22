# Contributing to Helioprism

Thanks for wanting to help.

## Getting set up

```bash
git clone https://github.com/drsamonline/helioprism.git
cd helioprism
npm install
npm test        # both transports, end to end
npm run lint
npm run dev     # http://localhost:3000
```

## Ground rules

- Run `npm test` and `npm run lint` before opening a PR; both must pass.
- Keep the two transports **distinct** — QR stays the simple, universal one; the
  colour transport stays the high-capacity one. Don't converge them.
- Anything in `src/lib/` or `src/transports/` needs a test.
- Don't add a runtime dependency without a good reason; the app is deliberately
  light.

## Ways to help

- **Real-device reports** are the most valuable: this phone, this lighting, this
  distance. Screenshots and short clips help most.
- **New transports** are welcome as a module in `src/transports/` implementing the
  same interface (`encode`, `render`, `decodeFrame`, `createCollector`,
  `decodeContainer`).

## Licence of contributions

By contributing you agree that your contributions are licensed under the same
terms as the project (see `LICENSE`).

## Code of conduct

Participation is covered by our [Code of Conduct](CODE_OF_CONDUCT.md).

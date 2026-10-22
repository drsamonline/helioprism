#!/usr/bin/env node
// Static build: bundles the app and its worker into docs/play/ with esbuild.
// Run with `npm run build`.

import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const out = join(root, 'docs', 'play');

await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'workers'), { recursive: true });

await build({
  entryPoints: [join(root, 'src', 'main.js'), join(root, 'src', 'workers', 'spectracode-decoder-worker.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  target: ['es2020'],
  outbase: join(root, 'src'),
  outdir: out,
  logLevel: 'info',
});

for (const f of ['index.html', 'styles.css', 'sw.js']) {
  await cp(join(root, 'src', f), join(out, f));
}
for (const f of ['manifest.json', 'icon-192.svg', 'icon-512.svg']) {
  await cp(join(root, 'public', f), join(out, f));
}

console.log(`Built -> ${out}`);

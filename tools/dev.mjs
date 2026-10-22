#!/usr/bin/env node
// Dev server: rebuilds on change and serves docs/play/ at http://localhost:3000
// Run with `npm run dev`.

import { context } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const out = join(root, 'docs', 'play');
const PORT = Number(process.argv[2] || 3000);

await mkdir(join(out, 'workers'), { recursive: true });
for (const f of ['index.html', 'styles.css', 'sw.js']) {
  await cp(join(root, 'src', f), join(out, f));
}
for (const f of ['manifest.json', 'icon-192.svg', 'icon-512.svg']) {
  await cp(join(root, 'public', f), join(out, f));
}

const ctx = await context({
  entryPoints: [join(root, 'src', 'main.js'), join(root, 'src', 'workers', 'spectracode-decoder-worker.js')],
  bundle: true,
  format: 'esm',
  outbase: join(root, 'src'),
  outdir: out,
  logLevel: 'info',
});
await ctx.watch();
await ctx.serve({ servedir: out, port: PORT });
console.log(`Helioprism dev server on http://localhost:${PORT}`);

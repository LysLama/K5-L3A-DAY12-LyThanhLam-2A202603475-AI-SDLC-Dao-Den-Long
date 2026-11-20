import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

fs.mkdirSync(path.resolve('dist-headless'), { recursive: true });

await build({
  entryPoints: ['src/headless/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist-headless/cli.mjs',
  logLevel: 'silent'
});

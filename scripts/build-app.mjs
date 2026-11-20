import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

fs.mkdirSync(path.resolve('dist-app'), { recursive: true });

await build({
  entryPoints: ['src/app/run.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist-app/run.mjs',
  logLevel: 'silent'
});

await build({
  entryPoints: ['src/app/soakCli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist-app/soak.mjs',
  logLevel: 'silent'
});

if (fs.existsSync('src/app/benchCli.ts')) {
  await build({
    entryPoints: ['src/app/benchCli.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    external: ['electron'],
    outfile: 'dist-app/bench.mjs',
    logLevel: 'silent'
  });
}

if (fs.existsSync('src/app/electronBench.ts')) {
  await build({
    entryPoints: ['src/app/electronBench.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['electron'],
    outfile: 'dist-app/electron-bench.cjs',
    logLevel: 'silent'
  });
}

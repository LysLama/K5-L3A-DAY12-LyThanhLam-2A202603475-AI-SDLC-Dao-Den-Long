import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve('.');
const distDir = path.join(rootDir, 'dist');
const runMjs = path.join(rootDir, 'dist-app', 'run.mjs');
const releaseDir = path.join(rootDir, 'release-dist');
const stageDir = path.join(releaseDir, 'dao-den-long-v1.0.0-web');
const zipPath = path.join(releaseDir, 'dao-den-long-v1.0.0-web.zip');

if (!fs.existsSync(path.join(distDir, 'index.html')) || !fs.existsSync(runMjs)) {
  throw new Error('Missing dist/index.html or dist-app/run.mjs. Run "npm run build" first.');
}

fs.rmSync(stageDir, { recursive: true, force: true });
fs.rmSync(zipPath, { force: true });
fs.mkdirSync(path.join(stageDir, 'dist-app'), { recursive: true });

fs.cpSync(distDir, path.join(stageDir, 'dist'), { recursive: true });
fs.copyFileSync(runMjs, path.join(stageDir, 'dist-app', 'run.mjs'));
for (const docFile of ['game.contract.json', 'LICENSE', 'CREDITS.md', 'CHANGELOG.md']) {
  const src = path.join(rootDir, docFile);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(stageDir, docFile));
}

fs.writeFileSync(
  path.join(stageDir, 'README-RUN.md'),
  `# Đảo Đèn Lồng — Bình Minh (v1.0.0 Portable Package)

## Chạy nhanh (yêu cầu Node.js >= 20, không cần cài npm packages)
\`\`\`bash
node dist-app/run.mjs
\`\`\`
Sau đó mở \`http://127.0.0.1:4173\` (tự mở trình duyệt mặc định).

## Xuất bảng xếp hạng JSON
\`\`\`bash
node dist-app/run.mjs --export-leaderboard leaderboard-export.json
\`\`\`
`,
  'utf8'
);

if (process.platform === 'win32') {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${stageDir}/*' -DestinationPath '${zipPath}' -Force`
    ],
    { stdio: 'inherit' }
  );
} else {
  execFileSync('zip', ['-r', zipPath, '.'], { cwd: stageDir, stdio: 'inherit' });
}

fs.rmSync(stageDir, { recursive: true, force: true });
const bytes = fs.statSync(zipPath).size;
console.log(`Packaged ${zipPath} (${(bytes / 1024).toFixed(1)} KB)`);

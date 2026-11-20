import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendLeaderboardEntryFile,
  getLeaderboardPath,
  readLeaderboardEntries
} from './leaderboardStore';

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon'
};

interface RunCliArgs {
  exportLeaderboard?: string;
  leaderboardFile?: string;
  port: number;
  noOpen: boolean;
  distDir: string;
}

function parseRunArgs(argv: string[]): RunCliArgs {
  const defaultDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const args: RunCliArgs = {
    port: Number.parseInt(process.env.PORT ?? '4173', 10) || 4173,
    noOpen: false,
    distDir: fs.existsSync(defaultDist) ? defaultDist : path.resolve('dist')
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--no-open') {
      args.noOpen = true;
    } else if (flag === '--export-leaderboard') {
      const target = argv[++i];
      if (!target) throw new Error('Missing output path for --export-leaderboard');
      args.exportLeaderboard = target;
    } else if (flag === '--leaderboard-file') {
      const target = argv[++i];
      if (!target) throw new Error('Missing path for --leaderboard-file');
      args.leaderboardFile = target;
    } else if (flag === '--port') {
      const raw = argv[++i];
      const portNum = raw !== undefined ? Number.parseInt(raw, 10) : NaN;
      if (!Number.isInteger(portNum) || portNum < 0 || portNum > 65535) {
        throw new Error(`Invalid --port: ${raw}`);
      }
      args.port = portNum;
    } else if (flag === '--dist-dir') {
      const dir = argv[++i];
      if (!dir) throw new Error('Missing directory for --dist-dir');
      args.distDir = path.resolve(dir);
    } else {
      throw new Error(`Unknown flag: ${flag}`);
    }
  }
  return args;
}

function openBrowser(url: string): void {
  try {
    if (process.platform === 'win32') {
      execFile('cmd.exe', ['/c', 'start', '', url], { windowsHide: true }, () => {});
    } else if (process.platform === 'darwin') {
      execFile('open', [url], () => {});
    } else {
      execFile('xdg-open', [url], () => {});
    }
  } catch {
    // ignore browser spawn failures
  }
}

export function startGameServer(opts: {
  distDir: string;
  leaderboardFile: string;
  port: number;
  host?: string;
}): Promise<{ server: http.Server; port: number; url: string }> {
  const host = opts.host ?? '127.0.0.1';
  const resolvedDist = path.resolve(opts.distDir);

  const server = http.createServer((req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0];

    if (urlPath === '/api/leaderboard') {
      if (req.method === 'GET') {
        const entries = readLeaderboardEntries(opts.leaderboardFile);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ entries }));
        return;
      }
      if (req.method === 'POST') {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
              name?: string;
              score?: number;
              nights_won?: number;
              seed?: number;
              achieved_at?: string;
            };
            const updated = appendLeaderboardEntryFile(opts.leaderboardFile, {
              name: String(body.name ?? ''),
              score: Number(body.score ?? 0),
              nights_won: Number(body.nights_won ?? 0),
              seed: Number(body.seed ?? 0),
              achieved_at: typeof body.achieved_at === 'string' ? body.achieved_at : undefined
            });
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ entries: updated }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: (err as Error).message }));
          }
        });
        return;
      }
      res.writeHead(405);
      res.end();
      return;
    }

    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const candidate = path.resolve(resolvedDist, rel);
    const filePath = candidate.startsWith(resolvedDist) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(resolvedDist, 'index.html');

    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Missing built web assets in dist/. Run npm run build first.');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_MAP[ext] ?? 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : opts.port;
      resolve({ server, port: actualPort, url: `http://${host}:${actualPort}` });
    });
  });
}

async function main(): Promise<void> {
  const args = parseRunArgs(process.argv.slice(2));
  const lbPath = getLeaderboardPath(args.leaderboardFile);

  if (args.exportLeaderboard !== undefined) {
    const entries = readLeaderboardEntries(lbPath);
    const outPath = path.resolve(args.exportLeaderboard);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({ entries }, null, 2) + '\n', 'utf8');
    process.exit(0);
  }

  let actualPort = args.port;
  try {
    const started = await startGameServer({
      distDir: args.distDir,
      leaderboardFile: lbPath,
      port: actualPort
    });
    console.log(`Dao Den Long running at ${started.url}`);
    console.log(`Leaderboard disk file: ${lbPath}`);
    if (!args.noOpen) {
      openBrowser(started.url);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE' && actualPort !== 0) {
      const fallback = await startGameServer({
        distDir: args.distDir,
        leaderboardFile: lbPath,
        port: 0
      });
      console.log(`Dao Den Long running at ${fallback.url}`);
      console.log(`Leaderboard disk file: ${lbPath}`);
      if (!args.noOpen) {
        openBrowser(fallback.url);
      }
      return;
    }
    throw err;
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});

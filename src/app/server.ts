import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { appendLeaderboardEntryFile, readLeaderboardEntries } from './leaderboardStore';

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

export type CustomApiHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  urlPath: string
) => boolean | Promise<boolean>;

export function startGameServer(opts: {
  distDir: string;
  leaderboardFile: string;
  port: number;
  host?: string;
  customApiHandler?: CustomApiHandler;
}): Promise<{ server: http.Server; port: number; url: string }> {
  const host = opts.host ?? '127.0.0.1';
  const resolvedDist = path.resolve(opts.distDir);

  const server = http.createServer(async (req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0];

    if (opts.customApiHandler) {
      const handled = await opts.customApiHandler(req, res, urlPath);
      if (handled) return;
    }

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
    const filePath =
      candidate.startsWith(resolvedDist) &&
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isFile()
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

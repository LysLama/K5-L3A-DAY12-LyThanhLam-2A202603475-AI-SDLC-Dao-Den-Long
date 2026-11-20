import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';
import { computeBenchMetrics, type BenchMetricsInput } from '../shared/benchStats';
import { getLeaderboardPath } from './leaderboardStore';
import { startGameServer } from './server';

function parseNumFlag(raw: string | undefined, name: string, min: number): number {
  if (raw === undefined || !/^-?\d+(?:\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid number for ${name}: ${raw ?? '(missing)'}`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) {
    throw new Error(`${name} must be >= ${min}, got ${n}`);
  }
  return n;
}

function readJsonBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function formatOsLabel(): string {
  const p = process.platform;
  const name = p === 'win32' ? 'Windows' : p === 'darwin' ? 'macOS' : 'Linux';
  return `${name} ${os.release()} (${process.arch})`;
}

async function main(): Promise<void> {
  const tProcessStart = Date.now();
  const argv = process.argv.slice(2);
  let seed = 42;
  let duration = 30;
  let out = '';

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--seed') {
      seed = Math.trunc(parseNumFlag(argv[++i], '--seed', -2147483648));
    } else if (flag === '--duration') {
      duration = parseNumFlag(argv[++i], '--duration', 1);
    } else if (flag === '--out') {
      out = argv[++i] ?? '';
    } else {
      throw new Error(`Unknown flag: ${flag}`);
    }
  }
  if (!out) throw new Error('Missing required --out <bench.json>');

  const appDir = path.dirname(fileURLToPath(import.meta.url));
  const distDir = path.resolve(appDir, '..', 'dist');
  const electronScript = path.join(appDir, 'electron-bench.cjs');
  if (!fs.existsSync(distDir) || !fs.existsSync(electronScript)) {
    throw new Error('Missing built artifacts (run npm run build first).');
  }

  let firstFrameAtMs: number | null = null;
  let benchPayload: Omit<BenchMetricsInput, 'loadMs' | 'peakMemMb' | 'os'> | null = null;
  let resolveDone!: () => void;
  const donePromise = new Promise<void>((res) => {
    resolveDone = res;
  });

  const { server, url } = await startGameServer({
    distDir,
    leaderboardFile: getLeaderboardPath(),
    port: 0,
    customApiHandler: async (req, res, urlPath) => {
      if (req.method === 'POST' && urlPath === '/api/bench-ready') {
        if (firstFrameAtMs === null) firstFrameAtMs = Date.now();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        return true;
      }
      if (req.method === 'POST' && urlPath === '/api/bench-done') {
        const raw = await readJsonBody(req);
        benchPayload = JSON.parse(raw) as Omit<BenchMetricsInput, 'loadMs' | 'peakMemMb' | 'os'>;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        resolveDone();
        return true;
      }
      return false;
    }
  });

  const peakFile = path.join(os.tmpdir(), `ddl-bench-mem-${process.pid}-${Date.now()}.json`);
  const electronBinary = electronPath as unknown as string;
  const targetUrl = `${url}/?bench=1&seed=${seed}&duration=${duration}`;
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DDL_BENCH_URL: targetUrl,
    DDL_BENCH_MEM_OUT: peakFile
  };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const child = spawn(electronBinary, [electronScript], {
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderrBuf = '';
  child.stderr.on('data', (c: Buffer) => {
    stderrBuf += c.toString('utf8');
  });

  try {
    const exitPromise = new Promise<number>((resolve) => {
      child.on('exit', (code) => resolve(code ?? 1));
    });

    const timeoutMs = (duration + 40) * 1000;
    await Promise.race([
      donePromise,
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(`Benchmark timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
      exitPromise.then((code) => {
        if (!benchPayload) {
          throw new Error(`Electron exited early with code ${code}: ${stderrBuf}`);
        }
      })
    ]);

    const code = await exitPromise;
    if (code !== 0 && !benchPayload) {
      throw new Error(`Electron bench exited with code ${code}: ${stderrBuf}`);
    }
    const payload = benchPayload as Omit<BenchMetricsInput, 'loadMs' | 'peakMemMb' | 'os'> | null;
    if (!payload) {
      throw new Error('Missing benchmark payload from renderer');
    }

    let peakMemMb: number | null = null;
    if (fs.existsSync(peakFile)) {
      try {
        const memJson = JSON.parse(fs.readFileSync(peakFile, 'utf8')) as { peak_mem_mb?: number };
        if (typeof memJson.peak_mem_mb === 'number') peakMemMb = memJson.peak_mem_mb;
      } catch {
        // leave null
      }
    }

    const loadMs = firstFrameAtMs !== null ? firstFrameAtMs - tProcessStart : 0;
    const output = computeBenchMetrics({
      ...payload,
      loadMs,
      peakMemMb,
      os: formatOsLabel()
    });

    const outPath = path.resolve(out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
    console.log(
      `Bench complete: avg_fps=${output.avg_fps}, p1_low_fps=${output.p1_low_fps}, frame_ms_p95=${output.frame_ms_p95}, load_ms=${output.load_ms}, peak_mem_mb=${output.peak_mem_mb}, vsync_off=${output.vsync_off}`
    );
  } finally {
    try {
      if (!child.killed) child.kill();
    } catch {
      // ignore
    }
    try {
      if (fs.existsSync(peakFile)) fs.unlinkSync(peakFile);
    } catch {
      // ignore
    }
    server.close();
  }
}

void execFile;
main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});

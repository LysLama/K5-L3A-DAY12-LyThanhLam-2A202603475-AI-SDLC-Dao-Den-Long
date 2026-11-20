import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLeaderboardPath, readLeaderboardEntries } from './leaderboardStore';
import { startGameServer } from './server';

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

  try {
    const started = await startGameServer({
      distDir: args.distDir,
      leaderboardFile: lbPath,
      port: args.port
    });
    console.log(`Dao Den Long running at ${started.url}`);
    console.log(`Leaderboard disk file: ${lbPath}`);
    if (!args.noOpen) openBrowser(started.url);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE' && args.port !== 0) {
      const fallback = await startGameServer({
        distDir: args.distDir,
        leaderboardFile: lbPath,
        port: 0
      });
      console.log(`Dao Den Long running at ${fallback.url}`);
      console.log(`Leaderboard disk file: ${lbPath}`);
      if (!args.noOpen) openBrowser(fallback.url);
      return;
    }
    throw err;
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});

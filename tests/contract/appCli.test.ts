import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const RUN_CLI = path.resolve('dist-app/run.mjs');
const SOAK_CLI = path.resolve('dist-app/soak.mjs');

const tempDirs: string[] = [];
function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-app-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Contract v1.3 app CLIs (run_cmd & soak_cmd)', () => {
  it('exports empty {"entries": []} cleanly when no leaderboard file exists yet', () => {
    const dir = makeTempDir();
    const lbFile = path.join(dir, 'nested', 'leaderboard.json');
    const outFile = path.join(dir, 'exported.json');

    execFileSync('node', [RUN_CLI, '--export-leaderboard', outFile], {
      env: { ...process.env, DDL_LEADERBOARD_PATH: lbFile }
    });

    const parsed = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    expect(parsed).toEqual({ entries: [] });
  });

  it('persists leaderboard entries posted to live run_cmd HTTP server onto disk and exports sorted Top 10 after restart', async () => {
    const dir = makeTempDir();
    const lbFile = path.join(dir, 'leaderboard.json');
    const outFile = path.join(dir, 'out.json');

    const child = spawn('node', [RUN_CLI, '--port', '0', '--no-open'], {
      env: { ...process.env, DDL_LEADERBOARD_PATH: lbFile },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let serverUrl = '';
    try {
      serverUrl = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for run.mjs URL')), 5000);
        let buf = '';
        child.stdout.on('data', (chunk) => {
          buf += chunk.toString('utf8');
          const match = /http:\/\/127\.0\.0\.1:\d+/.exec(buf);
          if (match) {
            clearTimeout(timeout);
            resolve(match[0]);
          }
        });
        child.on('exit', (code) => {
          clearTimeout(timeout);
          reject(new Error(`run.mjs exited early with code ${code}: ${buf}`));
        });
      });

      const postScore = async (payload: Record<string, unknown>) => {
        const res = await fetch(`${serverUrl}/api/leaderboard`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        expect(res.status).toBe(200);
      };

      await postScore({ name: 'SecondTie', score: 900, nights_won: 2, seed: 11, achieved_at: '2026-11-20T10:00:00+07:00' });
      await postScore({ name: 'FirstTie', score: 900, nights_won: 3, seed: 12, achieved_at: '2026-11-20T09:00:00+07:00' });
      await postScore({ name: 'TopChamp', score: 1500, nights_won: 3, seed: 42 });
    } finally {
      child.kill();
    }

    execFileSync('node', [RUN_CLI, '--export-leaderboard', outFile], {
      env: { ...process.env, DDL_LEADERBOARD_PATH: lbFile }
    });

    const exported = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    expect(exported.entries).toHaveLength(3);
    expect(exported.entries.map((e: { name: string }) => e.name)).toEqual([
      'TopChamp',
      'FirstTie',
      'SecondTie'
    ]);
    expect(exported.entries[0].achieved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('runs soak_cmd across multiple rotating nights with 0 crashes and bounded RSS memory', () => {
    const dir = makeTempDir();
    const outFile = path.join(dir, 'soak.json');

    execFileSync('node', [SOAK_CLI, '--seed', '7', '--nights', '3', '--out', outFile]);
    const soak = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    expect(soak.nights).toBe(3);
    expect(soak.crashes).toBe(0);
    expect(soak.results).toHaveLength(3);
    expect(typeof soak.mem_start_mb).toBe('number');
    expect(typeof soak.mem_end_mb).toBe('number');
    expect(soak.mem_end_mb).toBeLessThanOrEqual(soak.mem_start_mb * 1.2);
  });
});

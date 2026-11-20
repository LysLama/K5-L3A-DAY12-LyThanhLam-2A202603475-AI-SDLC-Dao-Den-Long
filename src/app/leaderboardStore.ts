import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  addLeaderboardEntry,
  sortAndTrimLeaderboard,
  type LeaderboardEntry
} from '../shared/leaderboard';

export function getLeaderboardPath(overridePath?: string): string {
  if (overridePath) return path.resolve(overridePath);
  if (process.env.DDL_LEADERBOARD_PATH) {
    return path.resolve(process.env.DDL_LEADERBOARD_PATH);
  }
  return path.join(os.homedir(), '.dao-den-long', 'leaderboard.json');
}

export function readLeaderboardEntries(filePath: string): LeaderboardEntry[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as { entries?: LeaderboardEntry[] } | LeaderboardEntry[];
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.entries)
        ? parsed.entries
        : [];
    return sortAndTrimLeaderboard(list);
  } catch {
    return [];
  }
}

export function writeLeaderboardEntries(
  filePath: string,
  entries: readonly LeaderboardEntry[]
): LeaderboardEntry[] {
  const sorted = sortAndTrimLeaderboard(entries);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ entries: sorted }, null, 2) + '\n', 'utf8');
  return sorted;
}

export function appendLeaderboardEntryFile(
  filePath: string,
  candidate: Omit<LeaderboardEntry, 'achieved_at'> & { achieved_at?: string }
): LeaderboardEntry[] {
  const current = readLeaderboardEntries(filePath);
  const updated = addLeaderboardEntry(current, candidate);
  return writeLeaderboardEntries(filePath, updated);
}

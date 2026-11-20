import {
  addLeaderboardEntry,
  sortAndTrimLeaderboard,
  validatePlayerName,
  type LeaderboardEntry
} from '../shared/leaderboard';

const LB_STORAGE_KEY = 'ddl_leaderboard_v1';

export type { LeaderboardEntry };
export { validatePlayerName };

function readLocalCache(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LB_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LeaderboardEntry[];
    return Array.isArray(parsed) ? sortAndTrimLeaderboard(parsed) : [];
  } catch {
    return [];
  }
}

function writeLocalCache(entries: readonly LeaderboardEntry[]): void {
  try {
    localStorage.setItem(LB_STORAGE_KEY, JSON.stringify(sortAndTrimLeaderboard(entries)));
  } catch {
    // ignore storage limits
  }
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/leaderboard');
    if (res.ok) {
      const json = (await res.json()) as { entries?: LeaderboardEntry[] };
      if (Array.isArray(json.entries)) {
        const sorted = sortAndTrimLeaderboard(json.entries);
        writeLocalCache(sorted);
        return sorted;
      }
    }
  } catch {
    // fallback cleanly when served purely statically
  }
  return readLocalCache();
}

export async function saveLeaderboardScore(candidate: {
  name: string;
  score: number;
  nights_won: number;
  seed: number;
}): Promise<LeaderboardEntry[]> {
  const check = validatePlayerName(candidate.name);
  if (!check.valid) {
    throw new Error(check.error ?? 'Tên không hợp lệ');
  }

  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...candidate, name: check.normalized })
    });
    if (res.ok) {
      const json = (await res.json()) as { entries?: LeaderboardEntry[] };
      if (Array.isArray(json.entries)) {
        const sorted = sortAndTrimLeaderboard(json.entries);
        writeLocalCache(sorted);
        return sorted;
      }
    } else {
      const errJson = (await res.json().catch(() => ({}))) as { error?: string };
      if (errJson.error) throw new Error(errJson.error);
    }
  } catch (err) {
    if (err instanceof Error && err.message !== 'Failed to fetch') {
      throw err;
    }
  }

  const updated = addLeaderboardEntry(readLocalCache(), {
    ...candidate,
    name: check.normalized
  });
  writeLocalCache(updated);
  return updated;
}

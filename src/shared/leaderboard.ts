export interface LeaderboardEntry {
  name: string;
  score: number;
  nights_won: number;
  achieved_at: string;
  seed: number;
}

const VALID_NAME_RE = /^[\p{L}0-9_]{3,12}$/u;

export function validatePlayerName(raw: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const normalized = raw.trim();
  if (normalized.length < 3 || normalized.length > 12) {
    return {
      valid: false,
      normalized,
      error: 'Tên phải dài từ 3 đến 12 ký tự.'
    };
  }
  if (!VALID_NAME_RE.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Tên chỉ được dùng chữ cái, chữ số hoặc dấu gạch dưới (_).'
    };
  }
  return { valid: true, normalized };
}

export function formatIsoWithTimezone(date: Date = new Date()): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const hh = String(Math.floor(absMin / 60)).padStart(2, '0');
  const mm = String(absMin % 60).padStart(2, '0');
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${hh}:${mm}`
  );
}

export function sortAndTrimLeaderboard(
  entries: readonly LeaderboardEntry[]
): LeaderboardEntry[] {
  return [...entries]
    .filter(
      (e) =>
        e &&
        typeof e.name === 'string' &&
        typeof e.score === 'number' &&
        Number.isFinite(e.score) &&
        typeof e.nights_won === 'number' &&
        typeof e.achieved_at === 'string' &&
        typeof e.seed === 'number'
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = Date.parse(a.achieved_at);
      const tb = Date.parse(b.achieved_at);
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) {
        return ta - tb;
      }
      return a.achieved_at.localeCompare(b.achieved_at);
    })
    .slice(0, 10);
}

export function addLeaderboardEntry(
  entries: readonly LeaderboardEntry[],
  candidate: Omit<LeaderboardEntry, 'achieved_at'> & { achieved_at?: string }
): LeaderboardEntry[] {
  const check = validatePlayerName(candidate.name);
  if (!check.valid) {
    throw new Error(check.error ?? 'Invalid player name');
  }
  const entry: LeaderboardEntry = {
    name: check.normalized,
    score: Math.max(0, Math.round(candidate.score)),
    nights_won: Math.max(0, Math.min(3, Math.trunc(candidate.nights_won))),
    achieved_at: candidate.achieved_at ?? formatIsoWithTimezone(),
    seed: Math.trunc(candidate.seed)
  };
  return sortAndTrimLeaderboard([...entries, entry]);
}

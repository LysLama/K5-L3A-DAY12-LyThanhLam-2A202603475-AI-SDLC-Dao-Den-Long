import { describe, expect, it } from 'vitest';
import {
  addLeaderboardEntry,
  formatIsoWithTimezone,
  sortAndTrimLeaderboard,
  validatePlayerName,
  type LeaderboardEntry
} from '../../src/shared/leaderboard';

describe('leaderboard shared logic (TICKET-04)', () => {
  it('validates 3-12 character names ([A-Za-z0-9_] + accented Vietnamese letters) and rejects invalid/XSS inputs', () => {
    expect(validatePlayerName('May_01')).toEqual({ valid: true, normalized: 'May_01' });
    expect(validatePlayerName('Mây_2026')).toEqual({ valid: true, normalized: 'Mây_2026' });
    expect(validatePlayerName('  ABC  ')).toEqual({ valid: true, normalized: 'ABC' });

    expect(validatePlayerName('ab').valid).toBe(false);
    expect(validatePlayerName('abcdefghijklm').valid).toBe(false); // 13 chars
    expect(validatePlayerName('<script>').valid).toBe(false);
    expect(validatePlayerName('bad name').valid).toBe(false);
  });

  it('formats ISO 8601 timestamps with explicit timezone offset', () => {
    const iso = formatIsoWithTimezone(new Date('2026-11-20T12:00:00Z'));
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
  });

  it('sorts descending by score, breaks ties by earliest achieved_at across timezones, and caps at top 10', () => {
    const base: LeaderboardEntry[] = [];
    for (let i = 1; i <= 11; i++) {
      base.push({
        name: `Player_${i}`,
        score: i * 100,
        nights_won: 3,
        achieved_at: `2026-11-20T0${i % 9}:00:00+07:00`,
        seed: 100 + i
      });
    }
    // Equal top score 1100, achieved earlier via UTC Z (08:00Z = 15:00+07) vs earlier local (+07)
    base.push({
      name: 'EarlierTie',
      score: 1100,
      nights_won: 3,
      achieved_at: '2026-11-19T18:00:00Z', // 2026-11-20T01:00:00+07 (earlier than 02:00+07)
      seed: 999
    });
    base.push({
      name: 'LaterTie',
      score: 1100,
      nights_won: 3,
      achieved_at: '2026-11-20T12:00:00+07:00', // 05:00Z
      seed: 888
    });

    const sorted = sortAndTrimLeaderboard(base);
    expect(sorted).toHaveLength(10);
    expect(sorted[0].name).toBe('EarlierTie');
    expect(sorted[1].name).toBe('Player_11'); // 02:00+07 is earlier than 12:00+07 (05:00Z)!
    expect(sorted[2].name).toBe('LaterTie');
    expect(sorted.at(-1)?.score).toBe(400);
  });

  it('rejects invalid name in addLeaderboardEntry while appending valid scores', () => {
    expect(() =>
      addLeaderboardEntry([], { name: 'x', score: 100, nights_won: 1, seed: 42 })
    ).toThrow();

    const updated = addLeaderboardEntry([], {
      name: 'Lam_2026',
      score: 1250,
      nights_won: 3,
      achieved_at: '2026-11-20T20:10:00+07:00',
      seed: 42
    });
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      name: 'Lam_2026',
      score: 1250,
      nights_won: 3,
      seed: 42
    });
  });
});

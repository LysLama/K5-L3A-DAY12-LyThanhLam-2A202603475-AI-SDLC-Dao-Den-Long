import { describe, expect, it } from 'vitest';
import { runSoak } from '../../src/sim/soak';

describe('runSoak multi-night headless soak runner (TICKET-04)', () => {
  it('rotates Nights 1 -> 2 -> 3 to natural completion with deterministic results and zero crashes', () => {
    const out1 = runSoak({
      seed: 7,
      nights: 3,
      getRssMb: () => 120
    });
    const out2 = runSoak({
      seed: 7,
      nights: 3,
      getRssMb: () => 120
    });

    expect(out1.nights).toBe(3);
    expect(out1.crashes).toBe(0);
    expect(out1.results).toHaveLength(3);
    for (const r of out1.results) {
      expect(['won', 'lost']).toContain(r);
    }
    expect(out1.results).toEqual(out2.results);
    expect(out1.mem_start_mb).toBe(120);
    expect(out1.mem_end_mb).toBe(120);
    expect(out1.duration_s).toBeGreaterThanOrEqual(0);
  });
});

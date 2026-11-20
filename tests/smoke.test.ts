import { describe, it, expect } from 'vitest';
import contract from '../game.contract.json';

describe('contract smoke', () => {
  it('declares v1.1 contract with normalized Night 1-3 tuning', () => {
    expect(contract.contract_version).toBe('1.1');
    expect(contract.tuning.lantern_count_night1).toBe(5);
    expect(contract.tuning.dash_speed).toBe(14.0);
    expect(contract.tuning.night2_duration_s).toBe(330);
    expect(contract.tuning.night3_duration_s).toBe(360);
  });
});

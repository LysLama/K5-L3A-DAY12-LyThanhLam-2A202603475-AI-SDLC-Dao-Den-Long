import { describe, it, expect } from 'vitest';
import contract from '../game.contract.json';

describe('contract smoke', () => {
  it('declares v1.2 contract with Night 1-3 fuel, capacity, and dawn_survived tuning', () => {
    expect(contract.contract_version).toBe('1.2');
    expect(contract.tuning.lantern_count_night1).toBe(5);
    expect(contract.tuning.dash_speed).toBe(14.0);
    expect(contract.tuning.night1_duration_s).toBe(240);
    expect(contract.tuning.night2_duration_s).toBe(270);
    expect(contract.tuning.night3_duration_s).toBe(300);
    expect(contract.tuning.fuel_max).toBe(100);
    expect(contract.tuning.relight_cost).toBe(5);
    expect(contract.tuning.win_ratio).toBe(0.6);
    expect(contract.tuning.capacity_max).toBe(20);
  });
});

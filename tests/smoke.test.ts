import { describe, it, expect } from 'vitest';
import contract from '../game.contract.json';

describe('contract smoke', () => {
  it('declares v1.0 contract and Night 1 lantern count 5', () => {
    expect(contract.contract_version).toBe('1.0');
    expect(contract.tuning.lantern_count_night1).toBe(5);
  });
});

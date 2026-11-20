import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AtmosphereManager } from '../../src/client/atmosphere';

describe('Vietnamese tropical critters & dynamic weather manager', () => {
  it('populates distinct insect and weather densities per night and tilts Night 3 storm rain with wind', () => {
    const s1 = new THREE.Scene();
    const atm1 = new AtmosphereManager(s1, 1);
    const out1 = atm1.update({
      dt: 0.016,
      elapsedSec: 2.0,
      focusPos: [0, 0, 0],
      windActive: false,
      windWarning: false,
      windDirDeg: 0,
      reduceMotion: false,
      benchMode: false
    });
    expect(atm1.getActiveCounts().rain).toBeGreaterThanOrEqual(120);
    expect(atm1.getActiveCounts().critters).toBeGreaterThanOrEqual(18);
    expect(atm1.getActiveCounts().fireflies).toBeGreaterThanOrEqual(30);
    expect(atm1.getActiveCounts().mist).toBeGreaterThanOrEqual(16);
    expect(out1.lightningBoost).toBe(0);

    const s3 = new THREE.Scene();
    const atm3 = new AtmosphereManager(s3, 3);
    atm3.update({
      dt: 0.016,
      elapsedSec: 7.5,
      focusPos: [0, 0, 28],
      windActive: true,
      windWarning: false,
      windDirDeg: 90,
      reduceMotion: false,
      benchMode: false
    });
    expect(atm3.getActiveCounts().rain).toBeGreaterThan(atm1.getActiveCounts().rain);
    expect(atm3.getActiveCounts().leaves).toBeGreaterThan(atm1.getActiveCounts().leaves);
  });

  it('suppresses lightning under reduceMotion and disables all decorative atmosphere during benchMode', () => {
    const scene = new THREE.Scene();
    const atm = new AtmosphereManager(scene, 3);

    // Check full cycle of elapsedSec with reduceMotion=true -> lightning never fires
    for (let t = 0; t < 20; t += 0.05) {
      const res = atm.update({
        dt: 0.05,
        elapsedSec: t,
        focusPos: [0, 0, 0],
        windActive: true,
        windWarning: false,
        windDirDeg: 45,
        reduceMotion: true,
        benchMode: false
      });
      expect(res.lightningBoost).toBe(0);
    }

    // Check benchMode=true turns every batch count to 0 cleanly
    const benchRes = atm.update({
      dt: 0.016,
      elapsedSec: 10,
      focusPos: [0, 0, 0],
      windActive: false,
      windWarning: false,
      windDirDeg: 0,
      reduceMotion: false,
      benchMode: true
    });
    expect(benchRes.lightningBoost).toBe(0);
    expect(atm.getActiveCounts()).toEqual({ rain: 0, fireflies: 0, critters: 0, leaves: 0, mist: 0 });
  });
});

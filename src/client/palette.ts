export const PALETTE = {
  // Sky & Fog
  skyDeep: 0x0e1430,
  skyMid: 0x1b2350,
  fog: 0x13193b,

  // Terrain & Architecture
  grass: 0x2f5d50,
  grassHex: '#2F5D50',
  sand: 0xc9b48a,
  sandHex: '#C9B48A',
  wood: 0x6b4a2f,
  woodHex: '#6B4A2F',
  water: 0x12384a,
  waterHex: '#12384A',

  // Lanterns & Warm Glow
  lanternWarm: 0xffb347,
  lanternCore: 0xffe9b0,
  lanternUnlit: 0x5b5f6e,

  // Fireflies & Sparkles
  moteGlow: 0xfff6c2,
  moteGold: 0xffe58a,

  // Bóng Mực (Shades)
  shadeBody: 0x120a1a,
  shadeEye: 0x7a3cff,
  shadeEyeCb: 0x00b3ff,
  shadeStun: 0x3a3450,

  // Mây (Player)
  mayCloak: 0xe8e2d0,
  mayScarf: 0xc8102e,

  // Accents & Entities
  goldUi: 0xf2c14e,
  goldUiHex: '#F2C14E',
  drifterSteel: 0x8fa3b8,
  dangerHex: '#FF5A5F',
  danger: 0xff5a5f,
  dangerCbHex: '#FFFFFF',
  dangerCb: 0xffffff,
  textLightHex: '#F5F1E6'
} as const;

/**
 * Computes exact scene ambient intensity mandated by TICKET-02:
 * starts at 0.15 in pitch darkness and brightens linearly up to 0.70 when all lanterns are lit.
 */
export function computeAmbientIntensity(litCount: number, totalCount: number): number {
  const ratio = totalCount > 0 ? Math.max(0, Math.min(1, litCount / totalCount)) : 0;
  return 0.15 + 0.55 * ratio;
}

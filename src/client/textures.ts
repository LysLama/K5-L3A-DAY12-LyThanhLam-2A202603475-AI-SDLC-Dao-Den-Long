import * as THREE from 'three';
import { DEFAULT_LANTERN_POSITIONS, ISLAND_RADIUS } from '../sim/constants';

export function createGlowTexture(innerRgba = 'rgba(255,255,255,1)', midRgba = 'rgba(255,195,90,0.65)'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, innerRgba);
  grad.addColorStop(0.28, midRgba);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createIslandGroundTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;

  // Base radial mossy earth -> twilight stone edge
  const bg = ctx.createRadialGradient(cx, cy, 18, cx, cy, size * 0.5);
  bg.addColorStop(0, '#363a61');
  bg.addColorStop(0.35, '#2b3052');
  bg.addColorStop(0.82, '#232642');
  bg.addColorStop(1, '#1a1c33');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  const toPx = (worldCoord: number) => cx + (worldCoord / ISLAND_RADIUS) * (size * 0.48);

  // Five radial stone pathways leading from center plaza to L1..L5
  for (const lantern of DEFAULT_LANTERN_POSITIONS) {
    const lx = toPx(lantern.pos[0]);
    const lz = toPx(lantern.pos[2]);
    ctx.save();
    ctx.strokeStyle = 'rgba(130, 122, 168, 0.28)';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(lx, lz);
    ctx.stroke();

    // Stepping stone highlights along each path
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const t = i / (steps + 0.5);
      const sx = cx + (lx - cx) * t;
      const sy = cy + (lz - cy) * t;
      ctx.fillStyle = 'rgba(166, 156, 204, 0.22)';
      ctx.beginPath();
      ctx.ellipse(sx, sy, 6, 4.5, t * 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Concentric plaza stone ring around spawn
  ctx.strokeStyle = 'rgba(255, 198, 112, 0.24)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, (4.5 / ISLAND_RADIUS) * (size * 0.48), 0, Math.PI * 2);
  ctx.stroke();

  // Subtle deterministic organic speckles for ground richness
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 450; i++) {
    const r = Math.sqrt(rand()) * (size * 0.47);
    const a = rand() * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const rad = 1 + rand() * 2.6;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(92, 114, 158, 0.14)' : 'rgba(20, 16, 42, 0.2)';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

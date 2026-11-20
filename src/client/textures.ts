import * as THREE from 'three';
import { getMapConfig } from '../sim/maps';
import type { NightId } from '../sim/types';
import { PALETTE } from './palette';

export function createGlowTexture(
  innerRgba = 'rgba(255,255,255,1)',
  midRgba = 'rgba(255,179,71,0.65)'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, innerRgba);
  grad.addColorStop(0.28, midRgba);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createIslandGroundTexture(
  night: NightId = 1,
  discRadius = 40,
  discCenterX = 0,
  spawnLocal: [number, number] = [0, 0]
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  // Base moss-emerald grass -> coastal sandy rim -> deep lagoon water border
  const bg = ctx.createRadialGradient(cx, cy, 18, cx, cy, size * 0.5);
  bg.addColorStop(0, '#366859');
  bg.addColorStop(0.62, PALETTE.grassHex);
  bg.addColorStop(0.86, '#567a64');
  bg.addColorStop(0.95, PALETTE.sandHex);
  bg.addColorStop(1, PALETTE.waterHex);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  const toPxX = (worldX: number) => cx + ((worldX - discCenterX) / discRadius) * (size * 0.5);
  const toPxY = (worldZ: number) => cy + (worldZ / discRadius) * (size * 0.5);
  const mapCfg = getMapConfig(night);

  const sxCenter = toPxX(spawnLocal[0]);
  const szCenter = toPxY(spawnLocal[1]);

  // Draw warm sandy pathways toward lanterns belonging to this disc
  for (const lantern of mapCfg.lanterns) {
    const dxDisc = lantern.pos[0] - discCenterX;
    const dzDisc = lantern.pos[2];
    if (Math.hypot(dxDisc, dzDisc) > discRadius + 1) continue;

    const lx = toPxX(lantern.pos[0]);
    const lz = toPxY(lantern.pos[2]);

    ctx.save();
    ctx.strokeStyle = 'rgba(201, 180, 138, 0.36)';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sxCenter, szCenter);
    ctx.lineTo(lx, lz);
    ctx.stroke();

    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const t = i / (steps + 0.5);
      const px = sxCenter + (lx - sxCenter) * t;
      const py = szCenter + (lz - szCenter) * t;
      ctx.fillStyle = 'rgba(201, 180, 138, 0.45)';
      ctx.beginPath();
      ctx.ellipse(px, py, 5.5, 4, t * 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Subtle stone dais ring under each lantern
    ctx.strokeStyle = 'rgba(242, 193, 78, 0.25)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(lx, lz, (2.2 / discRadius) * (size * 0.5), 0, Math.PI * 2);
    ctx.stroke();
  }

  // Spawn courtyard ring
  ctx.strokeStyle = 'rgba(201, 180, 138, 0.48)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(sxCenter, szCenter, (3.8 / discRadius) * (size * 0.5), 0, Math.PI * 2);
  ctx.stroke();

  // Organic deterministic grass & pebble speckles
  let seed = 1337 + night * 97 + Math.round(discCenterX);
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 420; i++) {
    const r = Math.sqrt(rand()) * (size * 0.46);
    const a = rand() * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const rad = 1 + rand() * 2.4;
    ctx.fillStyle =
      rand() > 0.55 ? 'rgba(65, 118, 100, 0.28)' : 'rgba(26, 48, 42, 0.22)';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBambooBridgeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = PALETTE.woodHex;
  ctx.fillRect(0, 0, 256, 128);

  // Bamboo slat cross-bars
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = x % 32 === 0 ? 'rgba(201, 180, 138, 0.22)' : 'rgba(35, 22, 12, 0.35)';
    ctx.fillRect(x, 0, 4, 128);
  }
  // Longitudinal side rails
  ctx.fillStyle = 'rgba(201, 180, 138, 0.38)';
  ctx.fillRect(0, 6, 256, 8);
  ctx.fillRect(0, 114, 256, 8);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}

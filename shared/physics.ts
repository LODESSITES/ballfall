import { K, type Box, type V3 } from './data';
export const dirFrom = (yaw: number, pitch: number): V3 => { const c = Math.cos(pitch); return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c }; };
const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Colisão bola x caixas (mesma função no cliente e no servidor). Retorna estado de chão e vy corrigida. */
export function resolve(p: V3, vy: number, boxes: Box[], half: number) {
  let ground = false;
  if (p.y <= 0) { p.y = 0; if (vy < 0) vy = 0; ground = true; }
  for (const b of boxes) {
    const top = b.y + b.h, x0 = b.x - b.w / 2 - K.R, x1 = b.x + b.w / 2 + K.R, z0 = b.z - b.d / 2 - K.R, z1 = b.z + b.d / 2 + K.R;
    if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1 && p.y < top && p.y + K.H > b.y) {
      if (p.y >= top - 0.35) { p.y = top; if (vy < 0) vy = 0; ground = true; }
      else if (vy > 0 && p.y + K.H <= b.y + 0.4) { p.y = b.y - K.H; vy = 0; }
      else { const a = [x1 - p.x, p.x - x0, z1 - p.z, p.z - z0], m = Math.min(...a);
        if (m === a[0]) p.x = x1; else if (m === a[1]) p.x = x0; else if (m === a[2]) p.z = z1; else p.z = z0; }
    }
  }
  p.x = cl(p.x, -half + K.R, half - K.R); p.z = cl(p.z, -half + K.R, half - K.R);
  return { ground, vy };
}
export function rayBox(o: V3, d: V3, b: Box): number {
  const mn = [b.x - b.w / 2, b.y, b.z - b.d / 2], mx = [b.x + b.w / 2, b.y + b.h, b.z + b.d / 2], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
  let t0 = 0, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-9) { if (oo[i] < mn[i] || oo[i] > mx[i]) return Infinity; continue; }
    let a = (mn[i] - oo[i]) / dd[i], c = (mx[i] - oo[i]) / dd[i]; if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) return Infinity;
  }
  return t0;
}
export function raySphere(o: V3, d: V3, c: V3, r: number): number {
  const x = o.x - c.x, y = o.y - c.y, z = o.z - c.z, b = x * d.x + y * d.y + z * d.z, k = x * x + y * y + z * z - r * r, disc = b * b - k;
  if (disc < 0) return Infinity; const t = -b - Math.sqrt(disc); return t >= 0 ? t : Infinity;
}

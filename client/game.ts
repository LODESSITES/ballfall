// Renderização 3D (Three.js), controle em primeira pessoa e bolas com rosto.
import * as THREE from 'three';
import { MAPS, WEAPONS, K, EMOTES, TEAM_COLORS, type MapDef } from '../shared/data';
import { resolve } from '../shared/physics';
import type { Net } from './net';

let ac: AudioContext | null = null; export const audio = { vol: 0.5 };
export function beep(f: number, d = .08, type: OscillatorType = 'square', v = .12, slide = 0) {
  if (audio.vol <= 0) return;
  try { ac ??= new AudioContext(); const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime; o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + d);
    g.gain.setValueAtTime(v * audio.vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g).connect(ac.destination); o.start(); o.stop(t + d); } catch { /* sem áudio */ }
}

type FS = 'n' | 'b' | 'h' | 'd' | 'w';
function drawFace(c: HTMLCanvasElement, variant: number, st: FS) {
  const g = c.getContext('2d')!; g.clearRect(0, 0, 256, 192); g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#222'; g.fillStyle = '#fff';
  const eye = (x: number) => { g.beginPath();
    if (st === 'b') { g.moveTo(x - 22, 80); g.lineTo(x + 22, 80); g.stroke(); }
    else if (st === 'd') { g.moveTo(x - 18, 62); g.lineTo(x + 18, 98); g.moveTo(x + 18, 62); g.lineTo(x - 18, 98); g.stroke(); }
    else if (st === 'w') { g.arc(x, 92, 22, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    else if (st === 'h') { g.moveTo(x - 18, 62); g.lineTo(x + 14, 80); g.lineTo(x - 18, 98); g.stroke(); }
    else { g.arc(x, 80, 26, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#222'; g.beginPath(); g.arc(x + 4, 84, 12, 0, 7); g.fill(); g.fillStyle = '#fff'; } };
  eye(88); eye(168); g.beginPath();
  if (st === 'h') { g.moveTo(88, 150); g.quadraticCurveTo(128, 124, 168, 150); g.stroke(); }
  else if (st === 'd') { g.moveTo(98, 148); g.lineTo(158, 148); g.stroke(); }
  else if (variant === 1 || st === 'w') { g.arc(128, 126, 34, 0, Math.PI); g.closePath(); g.fillStyle = '#7a1f3d'; g.fill(); g.stroke(); }
  else if (variant === 2) { g.arc(128, 148, 12, 0, 7); g.stroke(); }
  else if (variant === 3) { g.moveTo(88, 132); g.quadraticCurveTo(108, 162, 128, 136); g.quadraticCurveTo(148, 162, 168, 132); g.stroke(); }
  else { g.arc(128, 112, 40, .15 * Math.PI, .85 * Math.PI); g.stroke(); }
}
function sprite(draw: (g: CanvasRenderingContext2D) => void, w: number, h: number, sx: number, sy: number) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true })); s.scale.set(sx, sy, 1); return s;
}
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

class Avatar {
  g = new THREE.Group(); mat: THREE.MeshStandardMaterial; canvas = document.createElement('canvas'); tex: THREE.CanvasTexture; fs: FS = 'x' as FS; variant: number;
  tgt = new THREE.Vector3(); yaw = 0; cur = 0; alive = true; hp = 100; hurt = 0; sc = 1; blinkAt = performance.now() + 2000; blinkEnd = 0; happyEnd = 0; bubble: THREE.Sprite; bubEnd = 0; body: THREE.Mesh;
  constructor(name: string, color: number, variant: number, tc: string) {
    this.variant = variant; this.canvas.width = 256; this.canvas.height = 192; this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshStandardMaterial({ color, roughness: .35 });
    this.body = new THREE.Mesh(new THREE.SphereGeometry(.6, 28, 20), this.mat); this.body.position.y = .6;
    this.body.add(new THREE.Mesh(new THREE.SphereGeometry(.603, 20, 14, Math.PI * 1.5 - .5, 1, Math.PI / 2 - .4, .8), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true })));
    this.g.add(this.body);
    const lb = sprite(g => { g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.lineWidth = 7; g.strokeStyle = '#000b'; g.strokeText(name, 128, 42); g.fillStyle = tc; g.fillText(name, 128, 42); }, 256, 64, 2, .5); lb.position.y = 1.75; this.g.add(lb);
    this.bubble = sprite(g => { g.font = '84px serif'; g.textAlign = 'center'; g.fillText('😀', 64, 90); }, 128, 128, 1, 1); this.bubble.visible = false; this.bubble.position.y = 2.4; this.g.add(this.bubble);
    this.face('n');
  }
  setEmoji(e: string) { const m = this.bubble.material as THREE.SpriteMaterial, c = m.map!.image as HTMLCanvasElement, g = c.getContext('2d')!; g.clearRect(0, 0, 128, 128); g.font = '84px serif'; g.textAlign = 'center'; g.fillText(e, 64, 90); m.map!.needsUpdate = true; this.bubble.visible = true; this.bubEnd = performance.now() + 2400; }
  face(s: FS) { if (s !== this.fs) { this.fs = s; drawFace(this.canvas, this.variant, s); this.tex.needsUpdate = true; } }
  update(dt: number, now: number) {
    this.g.position.lerp(this.tgt, 1 - Math.exp(-14 * dt));
    this.cur += Math.atan2(Math.sin(this.yaw - this.cur), Math.cos(this.yaw - this.cur)) * (1 - Math.exp(-14 * dt)); this.g.rotation.y = this.cur;
    if (now > this.blinkAt) { this.blinkEnd = now + 130; this.blinkAt = now + 2500 + Math.random() * 3000; }
    this.hurt = Math.max(0, this.hurt - dt * 3); this.mat.emissive.setRGB(this.hurt * .8, 0, 0);
    this.face(!this.alive ? 'd' : this.hurt > .3 ? 'h' : now < this.happyEnd ? 'w' : now < this.blinkEnd ? 'b' : 'n');
    this.sc += ((this.alive ? 1 : .05) - this.sc) * (1 - Math.exp(-8 * dt)); this.g.scale.setScalar(this.sc); if (!this.alive) this.body.rotation.z += dt * 9; else this.body.rotation.z = 0;
    if (this.bubble.visible) { if (now > this.bubEnd) this.bubble.visible = false; else this.bubble.position.y = 2.4 + Math.sin(now / 150) * .08; }
  }
}

export class Game {
  r: THREE.WebGLRenderer; scene = new THREE.Scene(); cam = new THREE.PerspectiveCamera(75, 1, .05, 220); world = new THREE.Group(); map!: MapDef;
  av = new Map<string, Avatar>(); roster = new Map<string, any>(); teams = 0; myId = '';
  me = { x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, ground: true }; kick = 0; camY = K.EYE;
  keys = new Set<string>(); lmb = false; ads = false; locked = false; frozen = true; blocked = false; alive = false; slot = 0; ammo = 0; reloading = false; sens = 1;
  lastSend = 0; lastFire = 0; fx: { o: THREE.Object3D; t: number; life: number; puff?: boolean }[] = []; vm = new THREE.Group(); vmMat = new THREE.MeshStandardMaterial({ color: 0x2ee6a6 });
  running = false; last = 0; onLock: (b: boolean) => void = () => {};
  constructor(private canvas: HTMLCanvasElement, private net: Net) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true }); this.r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8888aa, 1.6)); const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(20, 40, 10); this.scene.add(sun, this.world, this.cam);
    this.cam.rotation.order = 'YXZ'; this.vm.position.set(.3, -.28, -.6);
    const body = new THREE.Mesh(new THREE.BoxGeometry(.09, .11, .38), this.vmMat), barrel = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .3, 12), this.vmMat);
    body.position.z = -.1; barrel.rotation.x = Math.PI / 2; barrel.position.set(0, .02, -.38); this.vm.add(body, barrel); this.cam.add(this.vm);
    addEventListener('resize', () => this.resize()); this.resize();
    const typing = () => document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement;
    document.addEventListener('keydown', e => {
      if (typing() || !this.running) return; this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
      if (!this.blocked && /^Digit[1-8]$/.test(e.code)) this.swap(+e.code.slice(5) - 1);
      if (e.code === 'KeyR' && !this.blocked) this.net.send({ t: 'reload' });
    });
    document.addEventListener('keyup', e => this.keys.delete(e.code));
    document.addEventListener('mousedown', e => { if (!this.locked) return; if (e.button === 0) this.lmb = true; if (e.button === 2) this.ads = true; });
    document.addEventListener('mouseup', e => { if (e.button === 0) this.lmb = false; if (e.button === 2) this.ads = false; });
    document.addEventListener('mousemove', e => { if (!this.locked) return; const s = .0022 * this.sens * (this.ads ? .6 : 1); this.me.yaw -= e.movementX * s; this.me.pitch = Math.max(-1.5, Math.min(1.5, this.me.pitch - e.movementY * s)); });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; if (!this.locked) { this.lmb = false; this.ads = false; this.keys.clear(); } this.onLock(this.locked); });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('click', () => this.lock());
  }
  lock() { if (this.running && !this.locked && !this.blocked) this.canvas.requestPointerLock(); }
  resize() { this.r.setSize(innerWidth, innerHeight, false); this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); }
  swap(s: number) { this.slot = s; this.setVm(s); this.net.send({ t: 'switch', slot: s }); }
  setVm(s: number) { this.vmMat.color.setHex(WEAPONS[s].c); this.vm.scale.set(s === 3 || s === 6 ? 1.5 : 1, s === 3 || s === 6 ? 1.5 : 1, s === 4 ? 1.3 : 1); }

  start(mapId: string, myId: string) {
    this.stop(); const m = this.map = MAPS[mapId]; this.myId = myId; this.scene.background = new THREE.Color(m.sky); this.scene.fog = new THREE.Fog(m.sky, 45, 120);
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; g.fillStyle = hex(m.floor[0]); g.fillRect(0, 0, 64, 64); g.fillStyle = hex(m.floor[1]); g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(m.half / 2, m.half / 2); t.colorSpace = THREE.SRGBColorSpace;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(m.half * 2, m.half * 2), new THREE.MeshStandardMaterial({ map: t })); fl.rotation.x = -Math.PI / 2; this.world.add(fl);
    const edge = new THREE.LineBasicMaterial({ color: 0x1b1147 });
    for (const b of m.boxes) { const geo = new THREE.BoxGeometry(b.w, b.h, b.d), me = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: b.c, roughness: .6 })); me.position.set(b.x, b.y + b.h / 2, b.z); me.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edge)); this.world.add(me); }
    const H = m.half; for (const [x, z, w, d] of [[0, -H - 1, H * 2 + 4, 2], [0, H + 1, H * 2 + 4, 2], [-H - 1, 0, 2, H * 2], [H + 1, 0, 2, H * 2]]) { const w1 = new THREE.Mesh(new THREE.BoxGeometry(w, 6, d), new THREE.MeshStandardMaterial({ color: 0x6d4aff })); w1.position.set(x, 3, z); this.world.add(w1); }
    this.running = true; this.frozen = true; this.alive = false; this.last = performance.now(); this.setVm(0); this.slot = 0; requestAnimationFrame(t => this.loop(t));
  }
  stop() { this.running = false; if (document.pointerLockElement) document.exitPointerLock(); this.world.clear(); for (const a of this.av.values()) this.scene.remove(a.g); this.av.clear(); for (const f of this.fx) this.scene.remove(f.o); this.fx = []; }
  tp(m: any) { Object.assign(this.me, { x: m.x, y: m.y, z: m.z, vx: 0, vz: 0, vy: 0 }); if (m.yaw !== undefined) { this.me.yaw = m.yaw; this.me.pitch = 0; } }

  applySnap(s: any) {
    const seen = new Set<string>(); this.alive = !!s.me.al; this.slot = s.me.slot; this.ammo = s.me.am; this.reloading = !!s.me.rl;
    for (const p of s.pl) {
      const id = p[0] as string; seen.add(id); if (id === this.myId) continue;
      let a = this.av.get(id); const r = this.roster.get(id); if (!a && r) { a = new Avatar(r.n, r.c, r.f, this.teams ? hex(TEAM_COLORS[r.tm]) : '#fff'); a.g.position.set(p[1], p[2], p[3]); this.scene.add(a.g); this.av.set(id, a); }
      if (!a) continue; a.tgt.set(p[1], p[2], p[3]); a.yaw = p[4]; if (p[6] < a.hp) a.hurt = 1; a.hp = p[6]; a.alive = !!p[8];
    }
    for (const [id, a] of this.av) if (!seen.has(id)) { this.scene.remove(a.g); this.av.delete(id); }
  }
  onShot(m: any) {
    const w = WEAPONS[m.w], mine = m.id === this.myId, o = new THREE.Vector3(...(m.o as [number, number, number]));
    if (mine) o.copy(new THREE.Vector3(.3, -.2, -.8).applyMatrix4(this.cam.matrixWorld)); else { o.y -= .3; const d = o.distanceTo(this.cam.position); beep(w.snd, .06, 'square', .1 / (1 + d / 6)); }
    for (const h of m.h) {
      const e = new THREE.Vector3(h[0], h[1], h[2]), geo = new THREE.BufferGeometry().setFromPoints([o, e]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: w.c, transparent: true })); this.scene.add(line); this.fx.push({ o: line, t: performance.now(), life: 120 });
      const puff = new THREE.Mesh(new THREE.SphereGeometry(.14, 8, 6), new THREE.MeshBasicMaterial({ color: w.c, transparent: true })); puff.position.copy(e); this.scene.add(puff); this.fx.push({ o: puff, t: performance.now(), life: 220, puff: true });
    }
  }
  emote(id: string, e: number) { this.av.get(id)?.setEmoji(EMOTES[e][0]); }
  celebrate(id: string) { const a = this.av.get(id); if (a) a.happyEnd = performance.now() + 1500; }

  loop(now: number) {
    if (!this.running) return; requestAnimationFrame(t => this.loop(t));
    const dt = Math.min(.05, (now - this.last) / 1000); this.last = now; this.update(dt, now);
    for (const a of this.av.values()) a.update(dt, now);
    this.fx = this.fx.filter(f => { const k = (now - f.t) / f.life; if (k >= 1) { this.scene.remove(f.o); return false; } const m = (f.o as any).material; m.opacity = 1 - k; if (f.puff) f.o.scale.setScalar(1 + k * 2); return true; });
    this.r.render(this.scene, this.cam);
  }
  update(dt: number, now: number) {
    const m = this.me, k = this.keys, can = this.locked && this.alive && !this.frozen;
    const f = can ? (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) : 0, s = can ? (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) : 0;
    const crouch = can && (k.has('ControlLeft') || k.has('KeyC')), L = Math.hypot(f, s) || 1, sy = Math.sin(m.yaw), cy = Math.cos(m.yaw);
    const sp = (crouch ? K.CROUCH : k.has('ShiftLeft') ? K.RUN : K.WALK) * (this.ads ? .7 : 1), a = 1 - Math.exp(-(m.ground ? 16 : 3) * dt);
    m.vx += ((-sy * f + cy * s) / L * sp - m.vx) * a; m.vz += ((-cy * f - sy * s) / L * sp - m.vz) * a;
    if (can && k.has('Space') && m.ground && !crouch) { m.vy = K.JUMP; m.ground = false; }
    m.vy -= K.GRAV * dt; m.x += m.vx * dt; m.z += m.vz * dt; m.y += m.vy * dt;
    const r = resolve(m, m.vy, this.map.boxes, this.map.half); m.ground = r.ground; m.vy = r.vy;
    this.camY += ((crouch ? K.EYE - .35 : K.EYE) - this.camY) * (1 - Math.exp(-12 * dt)); this.kick *= Math.exp(-10 * dt);
    this.cam.position.set(m.x, m.y + this.camY, m.z); this.cam.rotation.set(m.pitch + this.kick * .012, m.yaw, 0);
    this.cam.fov += ((this.ads ? 55 : 75) - this.cam.fov) * (1 - Math.exp(-14 * dt)); this.cam.updateProjectionMatrix();
    this.vm.position.z = -.6 + this.kick * .02; this.vm.position.x += ((this.ads ? 0 : .3) - this.vm.position.x) * (1 - Math.exp(-14 * dt));
    if (this.alive && !this.frozen && now - this.lastSend > 50) { this.lastSend = now; this.net.send({ t: 'state', x: +m.x.toFixed(2), y: +m.y.toFixed(2), z: +m.z.toFixed(2), yaw: +m.yaw.toFixed(3), pitch: +m.pitch.toFixed(3) }); }
    const w = WEAPONS[this.slot];
    if (can && this.lmb && !this.blocked && now - this.lastFire >= 60000 / w.rpm && this.ammo > 0 && !this.reloading) {
      if (!w.auto) this.lmb = false; // armas não automáticas: um clique = um tiro
      this.lastFire = now; this.net.send({ t: 'fire', yaw: +m.yaw.toFixed(3), pitch: +m.pitch.toFixed(3), ads: this.ads }); this.kick += w.recoil; beep(w.snd, .07, 'square', .14, -w.snd * .4);
    } else if (can && this.lmb && this.ammo <= 0 && !this.reloading) this.net.send({ t: 'reload' });
  }
}

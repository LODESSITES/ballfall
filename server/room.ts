// Sala + partida AUTORITATIVA: o servidor é dono de vida, munição, dano, eliminações, placar e bots.
import type { WebSocket } from 'ws';
import { MODES, MAPS, WEAPONS, K, QUICK, type ModeId, type Diff, type V3, type MapDef } from '../shared/data';
import { resolve, dirFrom, rayBox, raySphere } from '../shared/physics';
import { newGuard, pass, type Guard } from './chat';
import type { Slot } from './allocator';

export interface Bot { diff: Diff; react: number; err: number; turn: number; speed: number; fireMul: number; pref: number; phase: number; seen: number; wp: V3 | null; wpAt: number; hiding: boolean }
export interface P {
  id: string; token: string; name: string; color: number; face: number; ws: WebSocket | null; room: Room | null; team: number; bot: Bot | null;
  x: number; y: number; z: number; yaw: number; pitch: number; hp: number; shield: number; alive: boolean; respawnAt: number;
  kills: number; deaths: number; streak: number; rk: number; ammo: number[]; slot: number; reloading: number; reloadEnd: number; nextFire: number;
  lastDmg: number; lastState: number; budget: number; vbudget: number; strikes: number; discAt: number; rematch: boolean; emoteAt: number; guard: Guard; lastCreate: number;
}
export const mkPlayer = (id: string, token: string, name: string, color: number, face: number): P => ({
  id, token, name, color, face, ws: null, room: null, team: 0, bot: null, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, hp: 100, shield: 50, alive: false, respawnAt: 0,
  kills: 0, deaths: 0, streak: 0, rk: 0, ammo: WEAPONS.map(w => w.mag), slot: 0, reloading: -1, reloadEnd: 0, nextFire: 0,
  lastDmg: 0, lastState: Date.now(), budget: 5, vbudget: 2.5, strikes: 0, discAt: 0, rematch: false, emoteAt: 0, guard: newGuard(), lastCreate: 0 });

export interface RoomOpts { name: string; mode: ModeId; map: string; priv: boolean; mid: boolean; rounds: number; time: number; bots: number; diff: Diff; code: string }
const DIFF: Record<Diff, Pick<Bot, 'react' | 'err' | 'turn' | 'speed' | 'fireMul'>> = {
  dummy: { react: 1e9, err: 1, turn: 1, speed: 0, fireMul: 0 }, easy: { react: 800, err: .14, turn: 2.2, speed: 4.2, fireMul: .5 },
  medium: { react: 450, err: .07, turn: 3.5, speed: 5.5, fireMul: .75 }, hard: { react: 230, err: .035, turn: 5, speed: 7, fireMul: 1 } };
const BOT_NAMES = ['Bolinha', 'Pipoca', 'Quico', 'Gominha', 'Bolt', 'Mochi', 'Nuvem', 'Jujuba', 'Zeca', 'Pingo'];
const PREFS = [7, 12, 20]; // rusher / strafer / atirador de longe
const num = (v: unknown) => (Number.isFinite(+(v as number)) ? +(v as number) : 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const MEMBER_TIMEOUT = 30_000;

export class Room {
  id: string; o: RoomOpts; map: MapDef; cap: number; T: number; training: boolean; slot: Slot; chat: Slot;
  players = new Map<string, P>(); host = ''; st: 'waiting' | 'starting' | 'running' | 'finished' = 'waiting';
  phaseEnd = 0; roundEnd = 0; round = 1; trk = [0, 0]; wins: Record<string, number> = {}; banner = ''; botN = 0; firstCd = false; results = new Map<string, unknown>(); rewarded = false;
  constructor(id: string, o: RoomOpts, slot: Slot, chat: Slot) {
    this.id = id; this.o = o; this.slot = slot; this.chat = chat; this.map = MAPS[o.map]; const m = MODES[o.mode]; this.cap = m.cap; this.T = m.teams; this.training = m.training;
    const n = o.mode === 'solo' ? 2 : Math.min(o.bots, this.training ? 4 : this.cap - 1);
    for (let i = 0; i < n; i++) this.addBot(o.mode === 'solo' ? 'dummy' : o.diff);
  }
  humans() { return [...this.players.values()].filter(p => !p.bot); }
  total() { return this.players.size; }
  hasBot() { return [...this.players.values()].some(p => p.bot); }
  canJoin() {
    if (this.st === 'finished' || this.humans().length >= this.cap) return false;
    if (!this.training && this.total() >= this.cap && !this.hasBot()) return false;
    return !(this.st === 'running' && !this.o.mid) && !(this.st === 'starting' && this.round > 1 && !this.o.mid);
  }
  closable() { return this.humans().length === 0; }
  info() { return { id: this.id, name: this.o.name, mode: this.o.mode, label: MODES[this.o.mode].label, map: this.map.name, n: this.total(), cap: this.cap, st: this.st, priv: this.o.priv, mid: this.o.mid, full: !this.canJoin() }; }
  hostile = (a: P, b: P) => a !== b && (this.T === 0 || a.team !== b.team);

  // ---------- rede ----------
  send(p: P, m: unknown) { if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(m)); }
  bc(m: unknown, only?: (p: P) => boolean) { const s = JSON.stringify(m); for (const p of this.humans()) if (p.ws && p.ws.readyState === 1 && (!only || only(p))) p.ws.send(s); }
  toast(text: string) { this.bc({ t: 'toast', text }); }
  roster() { this.bc({ t: 'roster', host: this.host, pl: [...this.players.values()].map(p => ({ id: p.id, n: p.bot ? `${p.name} (bot)` : p.name, c: p.color, f: p.face, tm: p.team, b: p.bot ? 1 : 0 })) }); }
  joinedMsg(p: P) { return { t: 'joined', you: p.id, team: p.team, room: { id: this.id, name: this.o.name, mode: this.o.mode, label: MODES[this.o.mode].label, map: this.o.map, cap: this.cap, teams: this.T, code: this.o.priv ? this.o.code : '', rounds: this.o.rounds, host: this.host, training: this.training, slot: this.slot.id } }; }
  phase(p?: P) { const m = { t: 'phase', st: this.st, round: this.round, rounds: this.o.rounds, banner: this.banner }; p ? this.send(p, m) : this.bc(m); }

  // ---------- membros ----------
  addBot(diff: Diff) {
    const i = this.botN++, d = DIFF[diff];
    const b = mkPlayer('b' + this.id + i, '', BOT_NAMES[i % BOT_NAMES.length], Math.floor(Math.random() * 0xffffff), Math.floor(Math.random() * 4));
    b.bot = { diff, ...d, pref: PREFS[i % 3], phase: Math.random() * 6, seen: 0, wp: null, wpAt: 0, hiding: false };
    b.team = this.T ? this.pickTeam() : 0; this.players.set(b.id, b);
  }
  pickTeam() { const c = [0, 0]; for (const p of this.players.values()) c[p.team]++; return c[0] <= c[1] ? 0 : 1; }
  dropBot() {
    const c = [0, 0]; for (const p of this.players.values()) c[p.team]++;
    const bots = [...this.players.values()].filter(p => p.bot).sort((a, b) => c[b.team] - c[a.team]);
    if (bots[0]) this.players.delete(bots[0].id);
  }
  add(p: P) {
    if (!this.training && this.total() >= this.cap) this.dropBot(); // jogador real substitui um bot
    p.room = this; p.rematch = false; p.discAt = 0; p.kills = p.deaths = p.streak = p.rk = 0; p.alive = false;
    p.team = this.T ? this.pickTeam() : 0; this.players.set(p.id, p); if (!this.host) this.host = p.id;
    this.send(p, this.joinedMsg(p)); this.roster(); this.phase(p);
    if (this.st === 'starting') this.respawn(p); else if (this.st === 'running') p.respawnAt = Date.now();
    this.toast(`${p.name} entrou`);
  }
  remove(p: P) {
    this.players.delete(p.id); p.room = null; p.alive = false;
    if (p.id === this.host) { const h = this.humans()[0]; this.host = h ? h.id : ''; if (h) this.toast(`${h.name} agora é o anfitrião`); }
    this.roster(); this.toast(`${p.name} saiu`);
  }
  rejoin(p: P) { p.discAt = 0; this.send(p, this.joinedMsg(p)); this.roster(); this.phase(p); const r = this.results.get(p.id); if (r) this.send(p, r); }
  hostStart(p: P) {
    if (p.id !== this.host || this.st !== 'waiting') return;
    if (this.total() < 2 && !this.training) return this.send(p, { t: 'toast', text: 'Chame mais jogadores para começar.' });
    this.countdown(5000, '', true);
  }

  // ---------- fluxo da partida ----------
  countdown(ms: number, banner: string, first = false) { this.st = 'starting'; this.phaseEnd = Date.now() + ms; this.banner = banner; this.firstCd = first; for (const p of this.players.values()) this.respawn(p); this.phase(); }
  beginRound() {
    this.st = 'running'; this.roundEnd = Date.now() + this.o.time * 1000; this.trk = [0, 0]; this.banner = '';
    for (const p of this.players.values()) { p.rk = 0; p.nextFire = 0; }
    this.phase();
  }
  limitReached() { const kl = this.o.mode === '1v1' ? 7 : this.T ? 20 : 12; return this.T ? Math.max(...this.trk) >= kl : [...this.players.values()].some(p => p.rk >= kl); }
  endRound() {
    let key: string | null = null;
    if (this.T) { if (this.trk[0] !== this.trk[1]) key = 't' + (this.trk[0] > this.trk[1] ? 0 : 1); }
    else { let best = 0, tie = false; for (const p of this.players.values()) { if (p.rk > best) { best = p.rk; key = p.id; tie = false; } else if (p.rk === best && best > 0) tie = true; } if (tie) key = null; }
    if (key) this.wins[key] = (this.wins[key] || 0) + 1;
    if (this.round >= this.o.rounds) return this.finish();
    this.round++; this.countdown(5000, key ? 'Ponto para ' + this.label(key) : 'Rodada empatada');
  }
  label(key: string) { return key[0] === 't' ? (key === 't0' ? 'Coral' : 'Anil') : this.players.get(key)?.name ?? '?'; }
  finish() {
    this.st = 'finished'; this.banner = '';
    const top = Object.entries(this.wins).sort((a, b) => b[1] - a[1]); const win = top.length && (top.length < 2 || top[0][1] > top[1][1]) ? top[0][0] : null;
    const board = [...this.players.values()].map(p => ({ id: p.id, n: p.name, tm: p.team, k: p.kills, d: p.deaths })).sort((a, b) => b.k - a.k);
    const first = !this.rewarded; this.rewarded = true; // recompensa calculada UMA vez por partida (anti-duplicação)
    for (const h of this.humans()) {
      const won = win !== null && (win[0] === 't' ? win === 't' + h.team : win === h.id);
      const coins = this.training || !first ? 0 : Math.min(150, h.kills * 2 + (won ? 20 : 5));
      const m = { t: 'result', win: win === null ? null : won, winner: win ? this.label(win) : '', board, coins, xp: coins * 2 };
      this.results.set(h.id, m); this.send(h, m);
    }
    this.phase();
  }
  rematch(p: P) {
    if (this.st !== 'finished') return; p.rematch = true; this.toast(`${p.name} quer jogar de novo`);
    const hs = this.humans().filter(h => h.ws);
    if (hs.every(h => h.rematch)) {
      this.wins = {}; this.round = 1; this.rewarded = false; this.results.clear();
      for (const q of this.players.values()) { q.kills = q.deaths = q.streak = 0; q.rematch = false; }
      this.countdown(5000, 'Revanche!', true);
    }
  }

  // ---------- ciclo (20 Hz) ----------
  tick(now: number, dt: number) {
    for (const p of this.humans()) if (!p.ws && p.discAt && now - p.discAt > MEMBER_TIMEOUT) this.remove(p);
    if (this.st === 'waiting') { if (this.humans().length && (this.training || this.total() >= this.cap)) this.countdown(this.training ? 3000 : 5000, '', true); }
    else if (this.st === 'starting') {
      if (this.firstCd && !this.training && this.total() < this.cap) { this.st = 'waiting'; this.phase(); }
      else if (now >= this.phaseEnd) this.beginRound();
    } else if (this.st === 'running') {
      for (const p of this.players.values()) {
        if (p.reloading >= 0 && now >= p.reloadEnd) { p.ammo[p.reloading] = WEAPONS[p.reloading].mag; p.reloading = -1; }
        if (p.bot) this.think(p, dt, now);
        if (!p.alive) { if (now >= p.respawnAt) this.respawn(p); }
        else if (now - p.lastDmg > 6000) { if (p.shield < 50) p.shield = Math.min(50, p.shield + 15 * dt); else if (p.hp < 100) p.hp = Math.min(100, p.hp + 6 * dt); }
      }
      if (now >= this.roundEnd || this.limitReached()) this.endRound();
    }
    if (this.st !== 'waiting' || this.humans().length) this.snap(now);
  }
  snap(now: number) {
    const left = this.st === 'running' ? Math.max(0, Math.ceil((this.roundEnd - now) / 1000)) : this.st === 'starting' ? Math.max(0, Math.ceil((this.phaseEnd - now) / 1000)) : 0;
    const pl = [...this.players.values()].map(p => [p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch), Math.round(p.hp), Math.round(p.shield), p.alive ? 1 : 0, p.kills, p.deaths, p.team, p.rk]);
    for (const h of this.humans()) this.send(h, { t: 'snap', st: this.st, left, round: this.round, trk: this.trk, pl, me: { hp: Math.round(h.hp), sh: Math.round(h.shield), slot: h.slot, am: h.ammo[h.slot], mag: WEAPONS[h.slot].mag, rl: h.reloading >= 0 ? 1 : 0, al: h.alive ? 1 : 0 } });
  }

  // ---------- jogador ----------
  respawn(p: P) {
    const cand = this.map.spawns.filter(s => !this.T || s.t === p.team); let best = cand[0], bs = -1;
    for (const s of cand) { let m = 1e9; for (const q of this.players.values()) if (q.alive && this.hostile(p, q)) m = Math.min(m, Math.hypot(q.x - s.x, q.z - s.z)); m += Math.random() * 6; if (m > bs) { bs = m; best = s; } }
    p.x = best.x; p.y = 0; p.z = best.z; p.yaw = best.yaw; p.pitch = 0; p.hp = 100; p.shield = 50; p.alive = true; p.ammo = WEAPONS.map(w => w.mag); p.slot = 0; p.reloading = -1;
    p.budget = 5; p.vbudget = 2.5; p.lastState = Date.now(); p.lastDmg = 0; p.nextFire = 0;
    if (!p.bot) this.send(p, { t: 'tp', x: p.x, y: 0, z: p.z, yaw: p.yaw });
  }
  inWall(x: number, y: number, z: number) {
    for (const b of this.map.boxes) if (x > b.x - b.w / 2 - K.R + .25 && x < b.x + b.w / 2 + K.R - .25 && z > b.z - b.d / 2 - K.R + .25 && z < b.z + b.d / 2 + K.R - .25 && y < b.y + b.h - .4 && y + K.H > b.y + .05) return true;
    return false;
  }
  /** Valida movimento: orçamento de distância (anti speed-hack/teleporte), subida (anti-fly), limites e paredes. */
  state(p: P, m: any, now: number) {
    const el = Math.min(1, (now - p.lastState) / 1000); p.lastState = now;
    if (!p.alive || this.st === 'waiting' || this.st === 'finished') return;
    const x = num(m.x), y = num(m.y), z = num(m.z);
    p.budget = Math.min(5, p.budget + K.RUN * 1.35 * el); p.vbudget = Math.min(2.5, p.vbudget + 12 * el);
    const dist = Math.hypot(x - p.x, z - p.z), dy = y - p.y, h = this.map.half;
    if (dist > p.budget || dy > p.vbudget || Math.abs(x) > h || Math.abs(z) > h || y < -1 || y > 20 || (this.st === 'starting' && dist > .05) || this.inWall(x, y, z)) {
      p.strikes++; this.send(p, { t: 'tp', x: p.x, y: p.y, z: p.z, yaw: p.yaw }); return;
    }
    p.budget -= dist; if (dy > 0) p.vbudget -= dy;
    p.x = x; p.y = Math.max(0, y); p.z = z; p.yaw = num(m.yaw); p.pitch = Math.max(-1.5, Math.min(1.5, num(m.pitch)));
  }
  swap(p: P, slot: number) { if (slot >= 0 && slot < WEAPONS.length && p.alive) { p.slot = slot | 0; p.reloading = -1; p.nextFire = Date.now() + 250; } }
  reload(p: P, now: number) { const w = WEAPONS[p.slot]; if (p.reloading < 0 && p.ammo[p.slot] < w.mag && p.alive) { p.reloading = p.slot; p.reloadEnd = now + w.reload * 1000; } }
  fire(p: P, m: any, now: number) {
    if (this.st !== 'running' || !p.alive || p.reloading >= 0 || now < p.nextFire) return;
    const w = WEAPONS[p.slot];
    if (p.ammo[p.slot] <= 0 && !p.bot) return this.reload(p, now);
    p.nextFire = now + 60000 / (w.rpm * (p.bot ? p.bot.fireMul : 1)); if (!p.bot) p.ammo[p.slot]--;
    const yaw = num(m.yaw), pitch = Math.max(-1.5, Math.min(1.5, num(m.pitch)));
    const o = { x: p.x, y: p.y + K.EYE, z: p.z }, hs: number[][] = [], sp = w.spread * (m.ads ? .5 : 1); // o espalhamento é sorteado no SERVIDOR
    for (let i = 0; i < w.pel; i++) {
      const d = dirFrom(yaw + (Math.random() - .5) * 2 * sp, pitch + (Math.random() - .5) * 2 * sp);
      let tw = w.range; for (const b of this.map.boxes) { const t = rayBox(o, d, b); if (t < tw) tw = t; }
      let tv = Infinity, vic: P | null = null;
      for (const q of this.players.values()) { if (!q.alive || !this.hostile(p, q)) continue; const t = raySphere(o, d, { x: q.x, y: q.y + K.HIT_Y, z: q.z }, K.HIT_R); if (t < tv && t <= tw) { tv = t; vic = q; } }
      const T = vic ? tv : tw, pt = { x: o.x + d.x * T, y: o.y + d.y * T, z: o.z + d.z * T };
      if (w.splash) { for (const q of this.players.values()) { if (!q.alive || (q !== p && !this.hostile(p, q))) continue; const dd = Math.hypot(q.x - pt.x, q.y + .6 - pt.y, q.z - pt.z); if (dd < w.splash) this.hurt(q, w.dmg * (1 - dd / w.splash * .7) * (q === p ? .5 : 1), p, now); } }
      else if (vic) this.hurt(vic, w.dmg, p, now);
      hs.push([r2(pt.x), r2(pt.y), r2(pt.z)]);
    }
    this.bc({ t: 'shot', id: p.id, w: p.slot, o: [r2(o.x), r2(o.y), r2(o.z)], h: hs });
  }
  hurt(v: P, d: number, by: P, now: number) {
    if (!v.alive) return; v.lastDmg = now;
    const ab = Math.min(v.shield, d); v.shield -= ab; v.hp -= d - ab;
    this.send(by, { t: 'hit', v: v.id, k: v.hp <= 0 ? 1 : 0 }); this.send(v, { t: 'dmg', d: Math.round(d) });
    if (v.hp <= 0) this.kill(v, by, now);
  }
  kill(v: P, by: P, now: number) {
    v.alive = false; v.hp = 0; v.deaths++; v.streak = 0; v.respawnAt = now + 3000;
    if (by !== v) { by.kills++; by.streak++; by.rk++; if (this.T) this.trk[by.team]++; }
    this.bc({ t: 'kill', k: by.id, v: v.id, kn: by.name, vn: v.name, w: by.slot, s: by === v ? 0 : by.streak });
  }
  emote(p: P, e: number, now: number) { if (now - p.emoteAt < 1500 || !(e >= 0 && e < 10)) return; p.emoteAt = now; this.bc({ t: 'emote', id: p.id, e: e | 0 }); }
  say(p: P, m: any) { // canal "all" (sala inteira) ou "team"; só quem está NESTA sala recebe
    const raw = m.q !== undefined ? QUICK[m.q | 0] : String(m.text ?? ''); const txt = raw ? pass(p.guard, raw, Date.now()) : null;
    if (!txt) return this.send(p, { t: 'toast', text: 'Mensagem não enviada. Vá com calma!' });
    const team = m.ch === 'team' && this.T > 0;
    this.bc({ t: 'chat', id: p.id, n: p.name, ch: team ? 'team' : 'all', tm: p.team, x: txt }, q => !team || q.team === p.team);
  }

  // ---------- bots ----------
  los(a: P, b: P) { const o = { x: a.x, y: a.y + K.EYE, z: a.z }, c = { x: b.x, y: b.y + .6, z: b.z }, dx = c.x - o.x, dy = c.y - o.y, dz = c.z - o.z, L = Math.hypot(dx, dy, dz) || 1, d = { x: dx / L, y: dy / L, z: dz / L }; for (const bx of this.map.boxes) if (rayBox(o, d, bx) < L) return false; return true; }
  cover(b: P, t: P): V3 | null {
    let best: V3 | null = null, bd = 16;
    for (const bx of this.map.boxes) { if (bx.h < 1) continue; const d = Math.hypot(bx.x - b.x, bx.z - b.z); if (d < bd) { const vx = bx.x - t.x, vz = bx.z - t.z, L = Math.hypot(vx, vz) || 1, r = Math.max(bx.w, bx.d) / 2 + 1.2; bd = d; best = { x: bx.x + vx / L * r, y: 0, z: bx.z + vz / L * r }; } }
    return best;
  }
  think(b: P, dt: number, now: number) {
    const c = b.bot!; if (!b.alive || this.st !== 'running' || c.diff === 'dummy') return;
    let t: P | null = null, bd = 1e9;
    for (const q of this.players.values()) if (q.alive && this.hostile(b, q)) { const d = Math.hypot(q.x - b.x, q.z - b.z); if (d < bd) { bd = d; t = q; } }
    let mx = 0, mz = 0;
    if (b.hp < 35) c.hiding = true; else if (b.hp >= 60) c.hiding = false;
    if (!t) { // patrulha
      if (!c.wp || now > c.wpAt || Math.hypot(c.wp.x - b.x, c.wp.z - b.z) < 1.5) { const h = this.map.half - 4; c.wp = { x: (Math.random() * 2 - 1) * h, y: 0, z: (Math.random() * 2 - 1) * h }; c.wpAt = now + 5000; }
      mx = c.wp.x - b.x; mz = c.wp.z - b.z; b.yaw = Math.atan2(-mx, -mz);
    } else {
      const dx = t.x - b.x, dz = t.z - b.z; let dy = Math.atan2(-dx, -dz) - b.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); b.yaw += Math.max(-c.turn * dt, Math.min(c.turn * dt, dy));
      const see = this.los(b, t); c.seen = see ? c.seen || now : 0;
      const nx = dx / (bd || 1), nz = dz / (bd || 1), s = Math.sin(now / 700 + c.phase);
      if (c.hiding && c.diff !== 'easy') { const cv = this.cover(b, t); if (cv && Math.hypot(cv.x - b.x, cv.z - b.z) > 1) { mx = cv.x - b.x; mz = cv.z - b.z; } else if (!cv) { mx = -nx; mz = -nz; } }
      else { const f = bd > c.pref + 3 ? 1 : bd < c.pref - 3 ? -1 : 0; mx = nx * f - nz * s * .8; mz = nz * f + nx * s * .8; }
      const w = WEAPONS[0];
      if (see && !c.hiding && bd < w.range && c.seen && now - c.seen > c.react) {
        const ty = t.y + .6, oy = b.y + K.EYE, e = c.err, hd = Math.hypot(dx, dz) || 1;
        this.fire(b, { yaw: Math.atan2(-dx, -dz) + (Math.random() - .5) * 2 * e, pitch: Math.atan2(ty - oy, hd) + (Math.random() - .5) * 2 * e }, now); // erro de mira = sem mira perfeita
      }
    }
    const L = Math.hypot(mx, mz); if (L > .01) { b.x += mx / L * c.speed * dt; b.z += mz / L * c.speed * dt; }
    resolve(b, 0, this.map.boxes, this.map.half); b.y = 0;
  }
}

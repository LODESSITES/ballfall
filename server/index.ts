// Hub: conexões WebSocket, diretório de salas, alocação, matchmaking, denúncias e rate limit.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { config } from './config';
import { ServerAllocator, ChatServerAllocator } from './allocator';
import { Room, mkPlayer, type P, type RoomOpts } from './room';
import { MODES, MAPS, type ModeId, type Diff } from '../shared/data';
import { clean } from './chat';

const alloc = new ServerAllocator(), chatAlloc = new ChatServerAllocator();
const rooms = new Map<string, Room>(), players = new Map<string, P>(), reports = new Map<string, Set<string>>();
const conns = new WeakMap<WebSocket, { p: P | null; tok: number; t: number; drops: number }>(), ipCount = new Map<string, number>();
const send = (ws: WebSocket | null, m: unknown) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
const toast = (p: P, text: string) => send(p.ws, { t: 'toast', text });
const san = (s: unknown, n: number, d: string) => clean(String(s ?? '')).replace(/[<>&"'`]/g, '').trim().slice(0, n) || d;
const rid = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const listable = (r: Room) => !r.training;

function findCompatible(mode: ModeId, excl?: string) {
  return [...rooms.values()].filter(r => listable(r) && !r.o.priv && r.o.mode === mode && r.id !== excl && r.canJoin()).sort((a, b) => b.total() - a.total())[0];
}
function leave(p: P) { if (p.room) { p.room.remove(p); p.room = null; } }
function enter(p: P, r: Room) { if (p.room && p.room !== r) leave(p); if (p.room !== r) r.add(p); }

function createRoom(p: P, raw: any, hidden = false): Room | null {
  if (Date.now() - p.lastCreate < 3000) { toast(p, 'Calma! Espere um instante para criar outra partida.'); return null; }
  p.lastCreate = Date.now();
  const mode: ModeId = raw.mode in MODES ? raw.mode : '1v1', m = MODES[mode];
  const o: RoomOpts = {
    name: san(raw.name, 24, `Sala de ${p.name}`), mode, map: raw.map in MAPS ? raw.map : 'arena', priv: !!raw.priv || hidden, mid: raw.mid !== false,
    rounds: Math.max(1, Math.min(9, +raw.rounds || 1)), time: Math.max(60, Math.min(600, +raw.time || 180)),
    bots: Math.max(0, Math.min(m.training ? 4 : m.cap - 1, +raw.bots || (mode === 'bots' ? 3 : 0))),
    diff: (['easy', 'medium', 'hard'].includes(raw.diff) ? raw.diff : 'medium') as Diff, code: String(raw.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || rid().slice(0, 5),
  };
  const slot = alloc.reserve(m.cap); // tenta slot 1, se cheio tenta o próximo...
  if (!slot) { toast(p, 'Todas as arenas estão lotadas agora. Tente de novo em instantes.'); return null; }
  const r = new Room(rid(), o, slot, chatAlloc.reserve(m.cap)); rooms.set(r.id, r); return r;
}
function join(p: P, id: string, code: string, fallback: boolean) {
  const r = rooms.get(id);
  if (r && r.o.priv && r.o.code !== (code || '').toUpperCase()) return toast(p, 'Código incorreto. Confira e tente de novo.');
  if (r && r.canJoin()) return enter(p, r);
  if (!fallback) return toast(p, r ? 'Essa partida já está cheia ou começou.' : 'Essa partida não existe mais.');
  send(p.ws, { t: 'searching', text: 'Procurando outra partida disponível…' });
  const mode = r?.o.mode ?? '1v1', alt = findCompatible(mode, id);
  if (alt) return enter(p, alt);
  const n = createRoom(p, { mode, map: r?.o.map, name: 'Partida rápida' }); if (n) enter(p, n);
}
function quick(p: P, mode: ModeId) {
  send(p.ws, { t: 'searching', text: 'Procurando uma partida para você…' });
  const r = findCompatible(mode in MODES ? mode : '1v1');
  if (r) return enter(p, r);
  const n = createRoom(p, { mode, map: ['arena', 'fabrica', 'cidade'][Math.floor(Math.random() * 3)], name: 'Partida rápida' }); if (n) enter(p, n);
}

function onMsg(ws: WebSocket, c: { p: P | null }, m: any) {
  if (m.t === 'hello') {
    let p = typeof m.token === 'string' ? players.get(m.token) : undefined;
    if (p) { if (p.ws && p.ws !== ws) p.ws.close(); p.ws = ws; p.discAt = 0; } else { const token = randomUUID(); p = mkPlayer(randomUUID().slice(0, 8), token, 'x', 0, 0); players.set(token, p); p.ws = ws; }
    p.name = san(m.name, 16, 'Bola'); p.color = (+m.color >>> 0) & 0xffffff; p.face = Math.max(0, Math.min(3, +m.face | 0));
    c.p = p; send(ws, { t: 'welcome', id: p.id, token: p.token, resumed: !!p.room });
    if (p.room) p.room.rejoin(p); return;
  }
  const p = c.p; if (!p) return; const r = p.room;
  switch (m.t) {
    case 'state': r?.state(p, m, Date.now()); break;
    case 'fire': r?.fire(p, m, Date.now()); break;
    case 'switch': r?.swap(p, +m.slot); break;
    case 'reload': r?.reload(p, Date.now()); break;
    case 'chat': r?.say(p, m); break;
    case 'emote': r?.emote(p, +m.e, Date.now()); break;
    case 'start': r?.hostStart(p); break;
    case 'rematch': r?.rematch(p); break;
    case 'leave': leave(p); send(ws, { t: 'left' }); break;
    case 'list': send(ws, { t: 'rooms', rooms: [...rooms.values()].filter(listable).map(x => x.info()) }); break;
    case 'quick': quick(p, m.mode); break;
    case 'join': join(p, String(m.id), String(m.code ?? ''), !!m.fallback); break;
    case 'joinCode': { const x = [...rooms.values()].find(y => y.o.priv && y.o.code === String(m.code ?? '').toUpperCase() && !y.training); x ? join(p, x.id, x.o.code, false) : toast(p, 'Código não encontrado.'); break; }
    case 'create': { const n = createRoom(p, m.o ?? {}, !!MODES[(m.o?.mode as ModeId)]?.training); if (n) enter(p, n); break; }
    case 'report': { const t = String(m.target); if (r && r.players.has(t) && t !== p.id) { const s = reports.get(t) ?? new Set(); s.add(p.id); reports.set(t, s); console.warn(`[report] ${t} por ${s.size} jogador(es)`); toast(p, 'Denúncia enviada. Obrigado!'); } break; } // não guarda texto de chat
  }
}

// ---------- HTTP (estáticos + saúde + admin) e WebSocket ----------
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const DIST = path.resolve('dist');
const server = http.createServer((req, res) => {
  const u = new URL(req.url ?? '/', 'http://x');
  if (u.pathname === '/api/health') { res.setHeader('content-type', 'application/json'); return void res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...players.values()].filter(p => p.ws).length })); }
  if (u.pathname === '/admin/fail') { // ex.: chamado por um monitor/webhook quando um App ID Photon falha
    if (!config.adminKey || u.searchParams.get('key') !== config.adminKey) { res.statusCode = 403; return void res.end('no'); }
    const id = u.searchParams.get('id') ?? ''; const ok = alloc.fail(id) || chatAlloc.fail(id); return void res.end(JSON.stringify({ ok, game: alloc.stats(), chat: chatAlloc.stats() }));
  }
  let f = path.join(DIST, u.pathname === '/' ? 'index.html' : path.normalize(u.pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
  if (!fs.existsSync(f)) { res.setHeader('content-type', 'text/plain; charset=utf-8'); return void res.end('Ball Fall (servidor ok). Em desenvolvimento, abra http://localhost:5173'); }
  res.setHeader('content-type', MIME[path.extname(f)] ?? 'application/octet-stream'); fs.createReadStream(f).pipe(res);
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', (ws, req) => {
  console.log('[ws] nova conexão de', req.socket.remoteAddress);
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
  if ((ipCount.get(ip) ?? 0) >= config.maxConnPerIp) return ws.close(1013, 'busy');
  ipCount.set(ip, (ipCount.get(ip) ?? 0) + 1);
  const c = { p: null as P | null, tok: 80, t: Date.now(), drops: 0 }; conns.set(ws, c);
  ws.on('message', raw => {
    const now = Date.now(); c.tok = Math.min(80, c.tok + (now - c.t) * 0.06); c.t = now; // ~60 msg/s sustentado, rajada 80
    if (c.tok < 1) { if (++c.drops > 300) ws.close(1008, 'rate'); return; } c.tok--;
    let m: any; try { m = JSON.parse(raw.toString()); } catch { return; } if (m && typeof m.t === 'string') onMsg(ws, c, m);
  });
  ws.on('close', () => { ipCount.set(ip, Math.max(0, (ipCount.get(ip) ?? 1) - 1)); const p = c.p; if (p && p.ws === ws) { p.ws = null; p.discAt = Date.now(); } });
  ws.on('error', () => ws.close());
});

let last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  for (const r of rooms.values()) {
    r.tick(now, dt);
    if (r.closable()) { rooms.delete(r.id); alloc.release(r.slot, r.cap); chatAlloc.release(r.chat, r.cap); } // espaço volta a ficar disponível
  }
  for (const [k, p] of players) if (!p.ws && !p.room && now - p.discAt > 60_000) players.delete(k);
}, 50);
server.listen(config.port, '0.0.0.0', () => console.log(`Ball Fall server em http://localhost:${config.port}  (slots de jogo: ${config.gameSlots.length}, chat: ${config.chatShards.length})`));

// Ponto de entrada do cliente: telas (menu, navegar, criar, sala de espera, resultado), HUD, chat, emotes
// e ligação entre o servidor autoritativo (Net) e o motor 3D (Game).
import { Game, audio, beep } from './game';
import { Net } from './net';
import { MODES, MAPS, WEAPONS, EMOTES, QUICK, TEAM_COLORS, TEAM_NAMES, type ModeId } from '../shared/data';

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const hex = (n: number) => '#' + (n & 0xffffff).toString(16).padStart(6, '0');
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const load = <T,>(k: string, d: T): T => { try { return { ...d, ...JSON.parse(localStorage.getItem(k) ?? '{}') }; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* armazenamento indisponível */ } };

// ---------- perfil local (cosmético; moedas/XP reais exigiriam um backend com banco de dados) ----------
const prefs = load('bf_prefs', { name: 'Bola' + Math.floor(Math.random() * 900 + 100), color: 0xff5d73, face: 0, sens: 1, vol: 0.5, muted: [] as string[] });
const prof = load('bf_prof', { xp: 0, coins: 0, games: 0, wins: 0, kills: 0 });
audio.vol = prefs.vol;
const level = () => 1 + Math.floor(prof.xp / 100);

const net = new Net();
net.hello = () => ({ name: prefs.name, color: prefs.color, face: prefs.face });
const game = new Game($('c') as HTMLCanvasElement, net);
game.sens = prefs.sens;

const ui = $('ui'), modal = $('modal'), busyEl = $('busy'), netEl = $('net');
let myId = '', room: any = null, phase = 'none', roster = new Map<string, any>(), lastSnap: any = null, gotResult = false, wantBrowse = false;
let browseTimer = 0, screen = 'none';

// ---------- utilidades de interface ----------
function busy(text: string | null) { busyEl.classList.toggle('hide', !text); busyEl.innerHTML = text ? `<div class="spin"></div><div>${esc(text)}</div>` : ''; }
function toast(text: string) { const d = document.createElement('div'); d.textContent = text; $('toast').append(d); setTimeout(() => d.remove(), 3500); }
function ball(c: number) { return `<span class="ball" style="--c:${hex(c)}"><i></i><i></i></span>`; }
function showModal(html: string) { modal.innerHTML = `<div class="panel">${html}</div>`; modal.classList.remove('hide'); }
function closeModal() { modal.classList.add('hide'); modal.innerHTML = ''; }
function setScreen(name: string, html: string) { screen = name; ui.innerHTML = html; ui.scrollTop = 0; clearInterval(browseTimer); }
function hideScreen() { screen = 'none'; ui.innerHTML = ''; clearInterval(browseTimer); }
function hud(on: boolean) { $('hud').classList.toggle('hide', !on); $('chat').classList.toggle('hide', !on); }

// ---------- telas ----------
function home() {
  game.stop(); hud(false); room = null; phase = 'none'; busy(null);
  const modes = (['1v1', '2v2', '3v3', '4v4', '5v5', 'ffa'] as ModeId[]).map(m => `<option value="${m}">${MODES[m].label}</option>`).join('');
  setScreen('home', `<div class="wrap">
  <div class="top"><h1>Ball <b>Fall</b> <em>●</em></h1>
    <div class="card me">${ball(prefs.color)}<div><b>${esc(prefs.name)}</b><br><small>Nível ${level()} · 🪙 ${prof.coins}</small><br><small><span class="dot on"></span>Online</small></div></div></div>
  <div class="layout"><div>
    <div class="grid">
      <div class="card" style="grid-column:span 2"><label>Modo da partida rápida</label><div class="row"><select id="qm">${modes}</select><button class="btn big mint" data-a="quick" style="grid-column:auto">▶ Jogar</button></div></div>
      <button class="btn sky" data-a="browse">🔎 Navegar por partidas</button>
      <button class="btn" data-a="create">➕ Criar partida</button>
      <button class="btn grape" data-a="solo">🎯 Treinar</button>
      <button class="btn coral" data-a="bots">🤖 Jogar contra bots</button>
      <button class="btn ghost soon" data-a="soon">👥 Amigos</button>
      <button class="btn ghost" data-a="inv">🎒 Inventário</button>
      <button class="btn ghost" data-a="emotes">😂 Emotes</button>
      <button class="btn ghost soon" data-a="soon">🛍️ Loja cosmética</button>
      <button class="btn ghost" data-a="settings">⚙️ Configurações</button>
      <button class="btn ghost" data-a="profile">👤 Perfil do jogador</button>
      <button class="btn ghost" data-a="exit">🚪 Sair</button>
    </div>
    <label>Dificuldade dos bots</label><select id="df"><option value="easy">Fácil</option><option value="medium" selected>Médio</option><option value="hard">Difícil</option></select>
  </div>
  <div class="card"><h2>Amigos</h2><small>Lista de amigos, convites e grupos chegam em uma próxima versão (exigem contas e um banco de dados). Por enquanto, convide amigos com uma <b>partida privada + código</b>.</small>
    <h2 style="margin-top:18px">Entrar com código</h2><div class="row"><input id="jc" maxlength="8" placeholder="CÓDIGO"><button class="btn mint" data-a="joincode">Entrar</button></div></div></div></div>`);
}

function browse() {
  setScreen('browse', `<div class="wrap"><div class="top"><h1 style="font-size:40px">Navegar</h1><div class="row" style="flex:none"><button class="btn sky" data-a="refresh">🔄 Atualizar lista</button><button class="btn ghost" data-a="home">← Voltar</button></div></div>
  <div class="card"><table><thead><tr><th>Sala</th><th>Modo</th><th>Mapa</th><th>Jogadores</th><th>Status</th><th></th></tr></thead><tbody id="rl"><tr><td colspan="6">Carregando…</td></tr></tbody></table></div></div>`);
  net.send({ t: 'list' }); browseTimer = window.setInterval(() => net.send({ t: 'list' }), 4000);
}
const STATUS: Record<string, [string, string]> = { waiting: ['Aguardando', 'g'], starting: ['Iniciando', 'w'], running: ['Em andamento', 'r'], finished: ['Encerrando', 'r'] };
function renderRooms(rooms: any[]) {
  const el = document.getElementById('rl'); if (!el) return;
  el.innerHTML = rooms.length ? rooms.map(r => { const [lb, cl] = STATUS[r.st] ?? ['—', '']; return `<tr><td>${r.priv ? '🔒 ' : ''}${esc(r.name)}</td><td>${esc(r.label)}</td><td>${esc(r.map)}</td>
    <td>${r.n}/${r.cap} ${r.full ? '<span class="tag r">Cheia</span>' : ''}</td><td><span class="tag ${cl}">${lb}</span></td>
    <td><button class="btn mint" style="padding:8px 14px;font-size:15px" data-a="join" data-id="${esc(r.id)}" data-p="${r.priv ? 1 : 0}">Entrar</button></td></tr>`; }).join('')
    : '<tr><td colspan="6">Nenhuma partida pública agora. Crie a sua ou use “Jogar”!</td></tr>';
}

function create() {
  const opt = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  setScreen('create', `<div class="wrap" style="max-width:640px"><div class="top"><h1 style="font-size:40px">Criar partida</h1><button class="btn ghost" data-a="home" style="flex:none">← Voltar</button></div><div class="card">
  <label>Nome da sala</label><input id="c_name" maxlength="24" value="Sala de ${esc(prefs.name)}">
  <div class="row"><div><label>Modo</label><select id="c_mode">${opt({ '1v1': '1x1', '2v2': '2x2', '3v3': '3x3', '4v4': '4x4', '5v5': '5x5', ffa: 'Todos contra todos' })}</select></div>
  <div><label>Mapa</label><select id="c_map">${opt(Object.fromEntries(Object.values(MAPS).map(m => [m.id, m.name])))}</select></div></div>
  <div class="row"><div><label>Visibilidade</label><select id="c_priv"><option value="0">Pública</option><option value="1">Privada (com código)</option></select></div>
  <div><label>Código (se privada)</label><input id="c_code" maxlength="8" placeholder="automático"></div></div>
  <div class="row"><div><label>Rodadas</label><select id="c_rounds">${opt({ 1: '1', 3: '3', 5: '5' })}</select></div>
  <div><label>Tempo da rodada</label><select id="c_time">${opt({ 120: '2 min', 180: '3 min', 300: '5 min' })}</select></div>
  <div><label>Bots (0–4)</label><input id="c_bots" type="number" min="0" max="4" value="0"></div></div>
  <div class="row"><div><label>Dificuldade dos bots</label><select id="c_diff">${opt({ easy: 'Fácil', medium: 'Médio', hard: 'Difícil' })}</select></div>
  <div><label>Entrada durante a partida</label><select id="c_mid"><option value="1">Permitida</option><option value="0">Não permitida</option></select></div></div>
  <small>Amigos: compartilhe o código de uma sala privada. Convites automáticos chegam com o sistema de contas.</small><br><br>
  <button class="btn mint" data-a="docreate" style="width:100%;text-align:center">Criar e entrar</button></div></div>`);
}

function lobby() {
  if (!room) return;
  const list = [...roster.values()].map(p => `<tr><td>${ball(p.c)}</td><td>${esc(p.n)}${p.id === myId ? ' <small>(você)</small>' : ''}</td><td>${room.teams ? `<span class="tag" style="background:${hex(TEAM_COLORS[p.tm])}">${TEAM_NAMES[p.tm]}</span>` : ''}</td></tr>`).join('');
  const host = (roster as any).host === myId;
  setScreen('lobby', `<div class="wrap" style="max-width:640px"><div class="top"><h1 style="font-size:38px">${esc(room.name)}</h1></div><div class="card">
  <p><span class="tag">${esc(room.label)}</span> <span class="tag">${esc(MAPS[room.map]?.name ?? '')}</span> <span class="tag w">${roster.size}/${room.cap} jogadores</span>${room.code ? ` <span class="tag g">Código: <b>${esc(room.code)}</b></span>` : ''}</p>
  <p>${room.training ? 'Preparando o treino…' : roster.size < room.cap ? 'Aguardando jogadores. Quando a sala encher, a contagem começa sozinha.' : 'Sala completa!'}</p>
  <table style="margin:10px 0">${list}</table>
  <div class="row">${host && !room.training ? '<button class="btn mint" data-a="start">Começar agora</button>' : ''}<button class="btn coral" data-a="leave">Sair da sala</button></div></div></div>`);
}

function result(m: any) {
  document.exitPointerLock?.(); hud(false);
  const title = m.win === null ? 'Empate' : m.win ? 'Vitória! 🏆' : 'Derrota';
  if (!gotResult) { gotResult = true; prof.games++; if (m.win) prof.wins++; prof.coins += m.coins | 0; prof.xp += m.xp | 0; prof.kills += (m.board.find((b: any) => b.id === myId)?.k | 0); save('bf_prof', prof); }
  const rows = m.board.map((b: any) => `<tr${b.id === myId ? ' style="background:#ffffff18"' : ''}><td>${esc(b.n)}</td><td>${b.k}</td><td>${b.d}</td></tr>`).join('');
  setScreen('result', `<div class="wrap" style="max-width:560px"><div class="top"><h1 style="font-size:52px">${title}</h1></div><div class="card">
  ${m.winner ? `<p>Vencedor: <b>${esc(m.winner)}</b></p>` : ''}<p>Recompensa: 🪙 +${m.coins | 0} · ⭐ +${m.xp | 0} XP</p>
  <table><thead><tr><th>Jogador</th><th>Elim.</th><th>Mortes</th></tr></thead><tbody>${rows}</tbody></table><br>
  <div class="row"><button class="btn mint" data-a="rematch">🔁 Jogar novamente</button><button class="btn sky" data-a="tobrowse">Voltar ao navegador</button><button class="btn ghost" data-a="leave">Sair</button></div></div></div>`);
}

// ---------- ações (delegação de cliques) ----------
const val = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
const randMap = () => Object.keys(MAPS)[Math.floor(Math.random() * Object.keys(MAPS).length)];
const actions: Record<string, (el: HTMLElement) => void> = {
  home, browse, create, refresh: () => net.send({ t: 'list' }), soon: () => toast('Em breve! Essa função chega em uma próxima versão.'),
  quick: () => { busy('Procurando uma partida para você…'); net.send({ t: 'quick', mode: val('qm') || '1v1' }); },
  solo: () => { busy('Preparando o treino…'); net.send({ t: 'create', o: { mode: 'solo', map: randMap(), name: 'Treino' } }); },
  bots: () => { busy('Chamando os bots…'); net.send({ t: 'create', o: { mode: 'bots', map: randMap(), name: 'Treino com bots', bots: 3, diff: val('df') || 'medium' } }); },
  docreate: () => { busy('Criando sua partida…'); net.send({ t: 'create', o: { name: val('c_name'), mode: val('c_mode'), map: val('c_map'), priv: val('c_priv') === '1', code: val('c_code'), rounds: +val('c_rounds'), time: +val('c_time'), bots: +val('c_bots'), diff: val('c_diff'), mid: val('c_mid') === '1' } }); },
  join: el => {
    const id = el.dataset.id!;
    if (el.dataset.p === '1') { showModal(`<h2>Sala privada</h2><label>Código da sala</label><input id="pc" maxlength="8" placeholder="CÓDIGO"><br><br><div class="row"><button class="btn mint" data-a="joinpriv" data-id="${esc(id)}">Entrar</button><button class="btn ghost" data-a="closemodal">Cancelar</button></div>`); return; }
    busy('Entrando na partida…'); net.send({ t: 'join', id, code: '', fallback: true });
  },
  joinpriv: el => { const code = val('pc'); closeModal(); busy('Entrando na partida…'); net.send({ t: 'join', id: el.dataset.id, code, fallback: false }); },
  joincode: () => { const code = val('jc'); if (!code) return toast('Digite o código da sala.'); busy('Procurando a sala…'); net.send({ t: 'joinCode', code }); },
  closemodal: closeModal, start: () => net.send({ t: 'start' }), rematch: () => { net.send({ t: 'rematch' }); toast('Aguardando os outros jogadores…'); },
  leave: () => { wantBrowse = false; net.send({ t: 'leave' }); }, tobrowse: () => { wantBrowse = true; net.send({ t: 'leave' }); },
  resume: () => game.lock(),
  exit: () => { net.stop(); setScreen('bye', '<div class="wrap"><h1>Até logo! 👋</h1><p>Você saiu do Ball Fall.</p><button class="btn mint" data-a="reload">Voltar a jogar</button></div>'); },
  reload: () => location.reload(),
  profile: () => {
    const sw = [0xff5d73, 0xffd23f, 0x2ee6a6, 0x4dabff, 0x9b5de5, 0xff9f1c, 0xf15bb5, 0x80ed99].map(c => `<span class="sw${c === prefs.color ? ' on' : ''}" style="background:${hex(c)}" data-a="color" data-c="${c}"></span>`).join('');
    showModal(`<h2>Perfil</h2><div class="me">${ball(prefs.color)}<small>Nível ${level()} · ${prof.games} partidas · ${prof.wins} vitórias · ${prof.kills} eliminações</small></div>
    <label>Nome</label><input id="pn" maxlength="16" value="${esc(prefs.name)}"><label>Cor da bola</label><div>${sw}</div>
    <label>Rosto</label><select id="pf">${['Feliz', 'Bravo', 'Surpreso', 'Sapeca'].map((n, i) => `<option value="${i}"${i === prefs.face ? ' selected' : ''}>${n}</option>`).join('')}</select><br><br>
    <div class="row"><button class="btn mint" data-a="saveprofile">Salvar</button><button class="btn ghost" data-a="closemodal">Fechar</button></div>`);
  },
  color: el => { prefs.color = +el.dataset.c!; document.querySelectorAll('.sw').forEach(s => s.classList.toggle('on', s === el)); },
  saveprofile: () => { prefs.name = val('pn').replace(/[<>&"'`]/g, '').trim().slice(0, 16) || prefs.name; prefs.face = +val('pf'); save('bf_prefs', prefs); closeModal(); home(); },
  settings: () => showModal(`<h2>Configurações</h2><label>Sensibilidade do mouse</label><input id="ss" type="range" min="0.3" max="2.5" step="0.1" value="${prefs.sens}"><label>Volume</label><input id="sv" type="range" min="0" max="1" step="0.05" value="${prefs.vol}">
    <small>Controles: WASD mover · Espaço pular · Shift correr · Ctrl agachar · Mouse atirar/mirar · 1–8 armas · R recarregar · Tab placar · Enter chat · G emotes</small><br><br>
    <button class="btn mint" data-a="savesettings">Salvar</button>`),
  savesettings: () => { prefs.sens = +val('ss'); prefs.vol = +val('sv'); game.sens = prefs.sens; audio.vol = prefs.vol; save('bf_prefs', prefs); closeModal(); },
  inv: () => showModal(`<h2>Inventário</h2><p>Armas (a raridade é só visual — nenhuma é melhor por isso):</p>${WEAPONS.map(w => `<p><span class="sw" style="background:${hex(w.c)};width:18px;height:18px"></span> <b>${w.name}</b> <span class="tag">${w.rar}</span> <small>dano ${w.dmg} · alcance ${w.range}</small></p>`).join('')}<button class="btn ghost" data-a="closemodal">Fechar</button>`),
  emotes: () => showModal(`<h2>Emotes</h2><p>Durante a partida, aperte <b>G</b>. Emotes são só visuais e não dão vantagem.</p><p style="font-size:30px">${EMOTES.map(e => e[0]).join(' ')}</p><button class="btn ghost" data-a="closemodal">Fechar</button>`),
  mute: el => { const id = el.dataset.id!; if (!prefs.muted.includes(id)) prefs.muted.push(id); save('bf_prefs', prefs); toast('Jogador silenciado.'); renderSb(); },
  report: el => { net.send({ t: 'report', target: el.dataset.id }); },
};
document.addEventListener('click', e => { const el = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null; if (el) actions[el.dataset.a!]?.(el); });

// ---------- HUD, placar, chat, emotes ----------
let sbOpen = false, chatOpen = false, emOpen = false;
const pauseEl = $('pause');
function updatePause() {
  const show = game.running && phase !== 'finished' && !game.locked && !game.blocked && !sbOpen && screen === 'none';
  pauseEl.classList.toggle('hide', !show);
  if (show) pauseEl.innerHTML = '<h2>Pausado</h2><p>Clique na tela para continuar jogando.</p><div class="row"><button class="btn mint" data-a="resume">Continuar</button><button class="btn coral" data-a="leave">Sair da partida</button></div>';
}
game.onLock = updatePause;

function renderSb() {
  if (!sbOpen || !lastSnap) return;
  const rows = lastSnap.pl.map((p: any) => ({ id: p[0], k: p[9], d: p[10], tm: p[11] })).sort((a: any, b: any) => b.k - a.k);
  $('sb').innerHTML = `<h2>Placar${room?.teams ? ` — <span style="color:${hex(TEAM_COLORS[0])}">${TEAM_NAMES[0]} ${lastSnap.trk[0]}</span> × <span style="color:${hex(TEAM_COLORS[1])}">${lastSnap.trk[1]} ${TEAM_NAMES[1]}</span>` : ''}</h2>
  <table><thead><tr><th>Jogador</th><th>Elim.</th><th>Mortes</th><th></th></tr></thead><tbody>${rows.map((r: any) => { const n = roster.get(r.id); return `<tr><td>${n ? ball(n.c).replace('class="ball"', 'class="ball" data-s') : ''} ${esc(n?.n ?? '?')}${room?.teams ? ` <span class="tag" style="background:${hex(TEAM_COLORS[r.tm] ?? 0)}">${TEAM_NAMES[r.tm] ?? ''}</span>` : ''}</td><td>${r.k}</td><td>${r.d}</td>
  <td>${r.id !== myId && !n?.b ? `<button class="btn ghost" style="padding:4px 8px;font-size:12px" data-a="mute" data-id="${esc(r.id)}">🔇</button><button class="btn ghost" style="padding:4px 8px;font-size:12px" data-a="report" data-id="${esc(r.id)}">🚩</button>` : ''}</td></tr>`; }).join('')}</tbody></table>`;
}
function setSb(on: boolean) { sbOpen = on; $('sb').classList.toggle('hide', !on); if (on) { document.exitPointerLock?.(); renderSb(); } else game.lock(); updatePause(); }

function openChat(on: boolean) {
  chatOpen = on; game.blocked = on || emOpen; $('cin').classList.toggle('hide', !on);
  const inp = $('ctx') as HTMLInputElement;
  if (on) { document.exitPointerLock?.(); inp.value = ''; inp.focus(); ($('cch') as HTMLSelectElement).querySelector('option[value=team]')!.toggleAttribute('disabled', !room?.teams); }
  else { inp.blur(); game.lock(); }
  updatePause();
}
function openEmotes(on: boolean) {
  emOpen = on; game.blocked = on || chatOpen; $('em').classList.toggle('hide', !on);
  if (on) { document.exitPointerLock?.(); $('em').innerHTML = EMOTES.map((e, i) => `<div data-e="${i}" style="cursor:pointer">${e[0]}<small>${(i + 1) % 10}·${e[1]}</small></div>`).join(''); } else game.lock();
  updatePause();
}
$('em').addEventListener('click', e => { const t = (e.target as HTMLElement).closest('[data-e]') as HTMLElement | null; if (t) { net.send({ t: 'emote', e: +t.dataset.e! }); openEmotes(false); } });
$('qk').innerHTML = QUICK.map((q, i) => `<button data-q="${i}">${esc(q)}</button>`).join('');
$('qk').addEventListener('click', e => { const q = (e.target as HTMLElement).dataset.q; if (q !== undefined) { net.send({ t: 'chat', q: +q, ch: ($('cch') as HTMLSelectElement).value }); openChat(false); } });
function logLine(html: string, ms = 9000) { const d = document.createElement('div'); d.innerHTML = html; $('log').append(d); while ($('log').children.length > 7) $('log').firstChild!.remove(); setTimeout(() => d.remove(), ms); }

document.addEventListener('keydown', e => {
  if (!game.running) return;
  if (e.code === 'Tab') { e.preventDefault(); if (!sbOpen) setSb(true); return; }
  const typing = document.activeElement instanceof HTMLInputElement;
  if (e.code === 'Enter') {
    e.preventDefault();
    if (chatOpen) { const t = ($('ctx') as HTMLInputElement).value.trim(); if (t) net.send({ t: 'chat', text: t, ch: ($('cch') as HTMLSelectElement).value }); openChat(false); } else if (!emOpen) openChat(true);
    return;
  }
  if (e.code === 'Escape') { if (chatOpen) openChat(false); if (emOpen) openEmotes(false); return; }
  if (typing) return;
  if (e.code === 'KeyG' && !chatOpen) openEmotes(!emOpen);
  else if (emOpen && /^Digit[0-9]$/.test(e.code)) { const n = (+e.code.slice(5) + 9) % 10; net.send({ t: 'emote', e: n }); openEmotes(false); }
});
document.addEventListener('keyup', e => { if (e.code === 'Tab' && sbOpen) setSb(false); });

// ---------- mensagens do servidor ----------
net.onState = s => {
  if (s === 'RECONNECTING') { netEl.textContent = 'Reconectando…'; netEl.classList.remove('hide'); }
  else if (s === 'ERROR') { netEl.innerHTML = 'Sem conexão com o servidor. Ele está rodando? <a href="" style="color:#fff">Tentar de novo</a>'; netEl.classList.remove('hide'); busy('Não consegui falar com o servidor do jogo. Confira se ele está ligado (npm run dev) e tente de novo.'); }
  else netEl.classList.add('hide');
};
let killT = 0;
net.onMsg = m => {
  switch (m.t) {
    case 'welcome': busy(null); myId = m.id; if (!m.resumed && screen === 'none') home(); break;
    case 'toast': busy(null); toast(m.text); break;
    case 'searching': busy(m.text); break;
    case 'rooms': renderRooms(m.rooms); break;
    case 'left': home(); if (wantBrowse) { wantBrowse = false; browse(); } break;
    case 'joined': {
      busy(null); room = m.room; myId = m.you; roster = new Map(); gotResult = false; phase = 'waiting';
      game.teams = room.teams; game.roster = roster; game.start(room.map, myId); hud(true); $('log').innerHTML = ''; $('kf').innerHTML = '';
      (game as any).slot = 0; lobby(); break;
    }
    case 'roster': {
      roster = new Map(m.pl.map((p: any) => [p.id, p])); (roster as any).host = m.host; game.roster = roster;
      if (screen === 'lobby') lobby(); break;
    }
    case 'phase': {
      phase = m.st; if (m.st === 'starting') gotResult = false;
      $('ann').textContent = m.banner || ''; $('rd').textContent = room?.rounds > 1 ? `Rodada ${m.round}/${m.rounds}` : '';
      if (m.st === 'waiting') { if (screen !== 'lobby') lobby(); } else if (m.st !== 'finished' && (screen === 'lobby' || screen === 'result')) { hideScreen(); hud(true); game.lock(); }
      updatePause(); break;
    }
    case 'snap': {
      lastSnap = m; game.applySnap(m); game.frozen = m.st !== 'running';
      $('hpb').style.width = m.me.hp + '%'; $('shb').style.width = m.me.sh * 2 + '%';
      $('am').textContent = m.me.rl ? '…' : String(m.me.am); $('mg').textContent = ' / ' + m.me.mag; $('wn').textContent = WEAPONS[m.me.slot].name;
      $('slots').innerHTML = WEAPONS.map((_, i) => `<span class="${i === m.me.slot ? 'on' : ''}">${i + 1}</span>`).join('');
      $('tm').textContent = m.st === 'running' ? fmt(m.left) : '--:--';
      $('cd').textContent = m.st === 'starting' && m.left > 0 ? String(m.left) : '';
      const mine = m.pl.find((p: any) => p[0] === myId);
      $('sc').textContent = room?.teams ? `${TEAM_NAMES[0]} ${m.trk[0]} × ${m.trk[1]} ${TEAM_NAMES[1]}` : `Elim.: ${mine?.[9] ?? 0}`;
      if (sbOpen) renderSb(); break;
    }
    case 'shot': game.onShot(m); break;
    case 'tp': game.tp(m); break;
    case 'hit': { const h = $('hitm'); h.style.opacity = '1'; setTimeout(() => (h.style.opacity = '0'), 120); beep(m.k ? 1100 : 800, .06, 'triangle', .12); break; }
    case 'dmg': { const v = $('vig'); v.style.opacity = String(Math.min(.9, m.d / 40)); setTimeout(() => (v.style.opacity = '0'), 160); beep(160, .12, 'sawtooth', .12, -60); break; }
    case 'kill': {
      const mineK = m.k === myId, d = document.createElement('div'); d.innerHTML = `${mineK ? '⭐ ' : ''}<b>${esc(m.kn)}</b> ✦ ${esc(WEAPONS[m.w]?.name ?? '')} ➜ ${esc(m.vn)}`; $('kf').append(d); setTimeout(() => d.remove(), 5000);
      game.celebrate(m.k);
      if (mineK && m.k !== m.v) { $('ann').textContent = m.s > 1 ? `Sequência de ${m.s}! 🔥` : `Você eliminou ${m.vn}!`; clearTimeout(killT); killT = window.setTimeout(() => ($('ann').textContent = ''), 1600); beep(660, .1, 'triangle', .14); setTimeout(() => beep(990, .12, 'triangle', .14), 90); }
      break;
    }
    case 'emote': { game.emote(m.id, m.e); if (m.id === myId) toast(`Você: ${EMOTES[m.e][0]} ${EMOTES[m.e][1]}`); break; }
    case 'chat': {
      if (prefs.muted.includes(m.id)) break;
      const col = room?.teams ? hex(TEAM_COLORS[m.tm] ?? 0xffffff) : '#ffd23f';
      logLine(`${m.ch === 'team' ? '<small>[Equipe]</small> ' : ''}<b style="color:${col}">${esc(m.n)}</b>: ${esc(m.x)}`); break;
    }
    case 'result': result(m); break;
  }
};

busy('Conectando…');
net.connect();

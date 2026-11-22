// Dados compartilhados entre cliente e servidor (modos, armas, mapas, constantes de física).
export type V3 = { x: number; y: number; z: number };
export interface Box { x: number; y: number; z: number; w: number; h: number; d: number; c: number } // x,z = centro; y = base
export type ModeId = '1v1' | '2v2' | '3v3' | '4v4' | '5v5' | 'ffa' | 'solo' | 'bots';
export type Diff = 'dummy' | 'easy' | 'medium' | 'hard';

export const MODES: Record<ModeId, { label: string; cap: number; teams: number; training: boolean }> = {
  '1v1': { label: '1x1', cap: 2, teams: 2, training: false },
  '2v2': { label: '2x2', cap: 4, teams: 2, training: false },
  '3v3': { label: '3x3', cap: 6, teams: 2, training: false },
  '4v4': { label: '4x4', cap: 8, teams: 2, training: false },
  '5v5': { label: '5x5', cap: 10, teams: 2, training: false },
  ffa: { label: 'Todos contra todos', cap: 8, teams: 0, training: false },
  solo: { label: 'Treino individual', cap: 1, teams: 0, training: true },
  bots: { label: 'Treino contra bots', cap: 1, teams: 0, training: true },
};
export const K = { RUN: 9, WALK: 6, CROUCH: 3, JUMP: 8, GRAV: 22, EYE: 1, R: 0.5, H: 1.2, HIT_R: 0.65, HIT_Y: 0.6 };
export const TEAM_COLORS = [0xff5d73, 0x4dabff];
export const TEAM_NAMES = ['Coral', 'Anil'];

export interface Weapon { id: string; name: string; dmg: number; range: number; rpm: number; mag: number; reload: number; pel: number;
  spread: number; recoil: number; splash: number; auto: boolean; rar: string; c: number; snd: number }
// Raridade é só visual (cosmética). Nenhuma arma é paga/melhor por raridade.
export const WEAPONS: Weapon[] = [
  { id: 'blaster', name: 'Blaster de energia', dmg: 18, range: 70, rpm: 400, mag: 24, reload: 1.6, pel: 1, spread: .012, recoil: 1, splash: 0, auto: true, rar: 'comum', c: 0x2ee6a6, snd: 620 },
  { id: 'tinta', name: 'Lançador de tinta', dmg: 11, range: 45, rpm: 620, mag: 40, reload: 2, pel: 1, spread: .03, recoil: .8, splash: 0, auto: true, rar: 'comum', c: 0xff4fd8, snd: 480 },
  { id: 'bolha', name: 'Canhão de bolhas', dmg: 34, range: 40, rpm: 110, mag: 8, reload: 2.2, pel: 1, spread: .01, recoil: 2, splash: 2.2, auto: false, rar: 'raro', c: 0x7bdff2, snd: 300 },
  { id: 'confete', name: 'Espingarda de confete', dmg: 8, range: 20, rpm: 70, mag: 6, reload: 2.4, pel: 8, spread: .09, recoil: 3, splash: 0, auto: false, rar: 'raro', c: 0xffd23f, snd: 220 },
  { id: 'arco', name: 'Arco magnético', dmg: 75, range: 100, rpm: 45, mag: 3, reload: 2.5, pel: 1, spread: .002, recoil: 2.5, splash: 0, auto: false, rar: 'épico', c: 0xb388ff, snd: 760 },
  { id: 'ricochete', name: 'Pistola de ricochete', dmg: 22, range: 55, rpm: 250, mag: 12, reload: 1.3, pel: 1, spread: .015, recoil: 1, splash: 0, auto: false, rar: 'comum', c: 0xff9f1c, snd: 540 },
  { id: 'bomba', name: 'Lançador de bolas explosivas', dmg: 65, range: 45, rpm: 50, mag: 4, reload: 3, pel: 1, spread: .01, recoil: 3.5, splash: 4, auto: false, rar: 'épico', c: 0xff5d73, snd: 140 },
  { id: 'gelo', name: 'Raio congelante', dmg: 6, range: 22, rpm: 900, mag: 60, reload: 2.2, pel: 1, spread: .02, recoil: .4, splash: 0, auto: true, rar: 'raro', c: 0xa0e7ff, snd: 900 },
];
export const QUICK = ['Boa partida!', 'Bela jogada!', 'Preciso de ajuda!', 'Cuidado!', 'Vamos juntos!', 'Valeu!'];
export const EMOTES: [string, string][] = [['😂', 'Risada'], ['💃', 'Dança'], ['👋', 'Aceno'], ['😜', 'Provocação'], ['👏', 'Palmas'], ['🎉', 'Comemoração'], ['😢', 'Tristeza'], ['😵‍💫', 'Confusão'], ['🏆', 'Vitória'], ['🤝', 'Boa partida']];

// ---------- Mapas (4 quadrantes simétricos => justos para 1x1 e times) ----------
export interface MapDef { id: string; name: string; half: number; sky: number; floor: [number, number]; boxes: Box[]; spawns: { x: number; z: number; t: number; yaw: number }[] }
const B = (x: number, y: number, z: number, w: number, h: number, d: number, c: number): Box => ({ x, y, z, w, h, d, c });
const quad = (bs: Box[]): Box[] => bs.flatMap(b => [b, { ...b, x: -b.x }, { ...b, z: -b.z }, { ...b, x: -b.x, z: -b.z }]);
const house = (cx: number, cz: number, w: number, d: number, c: number, h = 3): Box[] => { const pw = (w - 2) / 2; return [
  B(cx, 0, cz + d / 2, w, h, .5, c), B(cx + w / 2, 0, cz, .5, h, d, c), B(cx - w / 2, 0, cz, .5, 1, d, c), B(cx - w / 2, 2.2, cz, .5, h - 2.2, d, c),
  B(cx - 1 - pw / 2, 0, cz - d / 2, pw, h, .5, c), B(cx + 1 + pw / 2, 0, cz - d / 2, pw, h, .5, c), B(cx, h, cz, w + .6, .3, d + .6, 0xffffff)]; };
const spawns = (half: number) => [0, 1].flatMap(t => [-12, -8, -4, 0, 4, 8, 12, -10, -2, 2].map(x => ({ x, z: t ? half - 5 : -(half - 5), t, yaw: t ? 0 : Math.PI })));

export const MAPS: Record<string, MapDef> = {
  arena: { id: 'arena', name: 'Arena dos Brinquedos', half: 32, sky: 0x8fd3ff, floor: [0xffe28a, 0xffb3c7], spawns: spawns(32), boxes: [
    B(0, 0, 0, 8, 1.2, 8, 0x4cc9f0), B(0, 1.2, 0, 3, .8, 3, 0xf72585),
    ...quad([B(10, 0, 8, 3, 1.8, 3, 0xff8fab), B(14, 0, 13, 2, 1, 2, 0x8be9fd), B(6, 0, 15, 4, 1.2, 2, 0xffd23f),
      B(23, 0, 21, 8, 2, 8, 0x9b5de5), B(17.5, 0, 21, 3, 1, 4, 0xf15bb5),
      B(24, 0, 4, 10, 2.6, 1, 0x00bbf9), B(24, 0, 9, 10, 2.6, 1, 0x00bbf9), B(24, 2.6, 6.5, 10, .4, 6.5, 0xfee440)])] },
  fabrica: { id: 'fabrica', name: 'Fábrica de Doces', half: 34, sky: 0xffc8dd, floor: [0xcdb4db, 0xffafcc], spawns: spawns(34), boxes: [
    B(0, 0, 15, 16, .15, 3, 0x555a6e), B(0, 0, -15, 16, .15, 3, 0x555a6e), // esteiras (ainda estáticas)
    ...quad([B(10, 0, 10, 6, 2.4, 6, 0xff5d8f), B(27, 0, 9, 5, 2.4, 5, 0x80ed99), B(9.5, 0, 19, 2, .9, 3, 0xffd166),
      B(18, 1.2, 19, 14, .4, 3, 0xc77dff), B(24.5, 0, 19, 1.5, 1.2, 3, 0xc77dff), B(31, 0, 26, 3, 1.2, 3, 0xf9c74f)])] },
  cidade: { id: 'cidade', name: 'Cidade das Bolas', half: 36, sky: 0xbde0fe, floor: [0x9aa5b1, 0x8b97a3], spawns: spawns(36), boxes: [
    ...quad([...house(14, 14, 8, 6, 0xff9f1c), ...house(28, 26, 6, 6, 0x2ec4b6), B(22, 0, 6, 3, 1.1, 1.6, 0xe63946),
      B(6, 0, 24, 6, 1.2, .6, 0x6c757d), B(30, 0, 10, 5, 4, 5, 0x4361ee)])] },
};

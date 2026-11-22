/**
 * ENTENDA A DIFERENÇA (não confundir):
 * 1. SERVIDOR PHOTON  = um App ID (aplicativo isolado na nuvem Photon, com seu próprio limite de CCU).
 *    NÃO é uma máquina física. Jogadores de App IDs diferentes nunca se enxergam.
 * 2. REGIÃO/CONEXÃO   = por onde o cliente entra na rede Photon (ex.: "sa"). Escolhida no cliente; independe do App ID.
 * 3. SALA PHOTON      = grupo de jogadores DENTRO de um App ID. Todos da mesma sala precisam estar no mesmo App ID.
 * 4. PARTIDA          = estado de jogo (rodadas, placar) vivendo dentro de uma sala.
 * 5. LIMITE           = CCU do App ID (20) + máximo da sala (ex.: 2 no 1x1). A sala RESERVA seu máximo no slot ao ser criada
 *                       e libera ao fechar; assim nenhum slot passa de 20, mesmo com salas enchendo ao mesmo tempo.
 *
 * Como um App ID é isolado, a lista de salas global precisa vir de um diretório próprio (este backend), não do Photon.
 */
import { config } from './config';

export interface Slot { id: string; appId: string; cap: number; used: number; downUntil: number }
export class Pool {
  slots: Slot[];
  constructor(s: { id: string; appId: string }[], cap: number) { this.slots = s.map(x => ({ ...x, cap, used: 0, downUntil: 0 })); }
  reserve(n: number, skip?: string): Slot | null {
    const now = Date.now();
    for (const s of this.slots) if (s.id !== skip && s.downUntil < now && s.used + n <= s.cap) { s.used += n; return s; }
    return null;
  }
  release(s: Slot, n: number) { s.used = Math.max(0, s.used - n); }
  fail(id: string, ms = 60_000) { const s = this.slots.find(x => x.id === id); if (s) s.downUntil = Date.now() + ms; return !!s; }
  stats() { return this.slots.map(s => ({ id: s.id, used: s.used, cap: s.cap, down: s.downUntil > Date.now() })); }
}
/** Preenche slots em ordem: se um está cheio (ou instável), tenta o próximo. */
export class ServerAllocator extends Pool { constructor() { super(config.gameSlots, config.gameCap); } }
/** Chat: distribui por menor carga; nunca recusa (degrada em vez de impedir o jogo). */
export class ChatServerAllocator extends Pool {
  constructor() { super(config.chatShards, config.chatCap); }
  override reserve(n: number, skip?: string): Slot {
    const now = Date.now();
    const s = this.slots.filter(x => x.id !== skip && x.downUntil < now).sort((a, b) => a.used - b.used)[0] ?? this.slots[0];
    s.used += n; return s;
  }
  failover(old: Slot, n: number): Slot { this.fail(old.id); this.release(old, n); return this.reserve(n, old.id); }
}

// Filtro básico, anti-spam e limite de mensagens. Nenhuma mensagem é armazenada.
export interface Guard { tok: number; t: number; recent: { f: string; t: number }[] }
export const newGuard = (): Guard => ({ tok: 3, t: Date.now(), recent: [] });
const BAD = (process.env.CHAT_BLOCKLIST?.split(',') ?? []).map(s => s.trim().toLowerCase()).concat(
  ['merda', 'porra', 'caralho', 'fdp', 'puta', 'idiota', 'imbecil', 'fuck', 'shit', 'bitch']).filter(Boolean);
const LEET: Record<string, string> = { '@': 'a', '4': 'a', '3': 'e', '1': 'i', '!': 'i', '0': 'o', '$': 's', '5': 's' };
const fold = (c: string) => { const n = c.normalize('NFD'); const f = (n.length > 1 && /[\u0300-\u036f]/.test(n[1]) ? n[0] : c).toLowerCase(); return LEET[f] ?? f; };
export function clean(text: string): string {
  const chars = Array.from(text.replace(/[\u0000-\u001f]/g, '').replace(/https?:\/\/\S+/gi, '[link]').replace(/(.)\1{5,}/gu, '$1$1$1').trim()).slice(0, 140);
  const folded = chars.map(fold).join('');
  for (const w of BAD) { let i = folded.indexOf(w); while (i >= 0) { for (let k = 0; k < w.length; k++) chars[i + k] = '*'; i = folded.indexOf(w, i + w.length); } }
  return chars.join('');
}
/** Retorna o texto limpo ou null (bloqueado por limite/spam/vazio). Limite: rajada de 3, depois 1 msg/s. */
export function pass(g: Guard, text: string, now: number): string | null {
  g.tok = Math.min(3, g.tok + (now - g.t) / 1000); g.t = now;
  if (g.tok < 1) return null;
  const out = clean(text); if (!out.trim()) return null;
  const f = out.toLowerCase(); g.recent = g.recent.filter(r => now - r.t < 8000);
  if (g.recent.filter(r => r.f === f).length >= 2) return null;
  g.recent.push({ f, t: now }); g.tok -= 1; return out;
}

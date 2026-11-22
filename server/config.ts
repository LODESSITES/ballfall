import 'dotenv/config';
const env = (k: string, d = '') => process.env[k] ?? d;
const slots = (prefix: string, n: number, name: string) => Array.from({ length: n }, (_, i) => ({ id: `${name}-${i + 1}`, appId: env(`${prefix}${i + 1}`) })).filter(s => s.appId);
const game = slots('PHOTON_APP_ID_', 9, 'photon');
const chat = slots('CHAT_APP_ID_', 3, 'chat');
export const config = {
  port: +env('PORT', '3001'), adminKey: env('ADMIN_KEY'), maxConnPerIp: +env('MAX_CONN_PER_IP', '8'),
  lobbyAppId: env('PHOTON_MAIN_APP_ID'),
  gameCap: +env('PHOTON_SLOT_CAPACITY', '20'), chatCap: +env('CHAT_SLOT_CAPACITY', '20'),
  // Sem App IDs configurados, o jogo roda com um slot "local" (útil para testar sem conta Photon).
  gameSlots: game.length ? game : [{ id: 'local-1', appId: '' }],
  chatShards: chat.length ? chat : [{ id: 'chat-local', appId: '' }],
};

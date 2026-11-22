// Camada de transporte do cliente + máquina de estados de conexão/partida.
// PONTO DE EXTENSÃO Photon: esta classe é a única que conhece o WebSocket. Para usar o relay do Photon Realtime
// como transporte alternativo, implemente a mesma interface (connect/send/onMsg) em outra classe — ver README.
export type NS = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'LOBBY' | 'ROOM_SEARCHING' | 'ROOM_CREATED' | 'ROOM_JOINED' | 'MATCH_STARTING' | 'MATCH_RUNNING' | 'MATCH_FINISHED' | 'RECONNECTING' | 'ERROR';
export class Net {
  ws: WebSocket | null = null; st: NS = 'DISCONNECTED'; retry = 0; stopped = false; had = false;
  onMsg: (m: any) => void = () => {}; onState: (s: NS) => void = () => {}; hello: () => object = () => ({});
  token = localStorage.getItem('bf_token') ?? '';
  set(s: NS) { if (this.st !== s) { this.st = s; this.onState(s); } }
  connect() {
    this.stopped = false; this.set(this.had ? 'RECONNECTING' : 'CONNECTING');
    const url = (import.meta as any).env?.VITE_WS_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = new WebSocket(url); this.ws = ws;
    ws.onopen = () => this.send({ ...this.hello(), t: 'hello', token: this.token });
    ws.onmessage = e => {
      let m: any; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') { this.token = m.token; localStorage.setItem('bf_token', m.token); this.retry = 0; this.had = true; this.set('CONNECTED'); }
      this.onMsg(m);
    };
    ws.onerror = () => console.warn('[BallFall] falha ao abrir', url);
    ws.onclose = e => {
      console.warn('[BallFall] conexão fechada', e.code, e.reason);
      if (this.ws !== ws || this.stopped) return; this.ws = null;
      if (this.retry >= 8) return this.set('ERROR');
      this.set('RECONNECTING'); setTimeout(() => this.connect(), Math.min(500 * 2 ** this.retry++, 8000));
    };
  }
  send(m: object) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  stop() { this.stopped = true; this.ws?.close(); this.set('DISCONNECTED'); }
}

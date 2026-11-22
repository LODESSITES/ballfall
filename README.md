# Ball Fall

FPS 3D multiplayer para navegador: você é uma bola com rosto. Three.js + TypeScript no cliente, Node.js (`ws`) no servidor.

## Instalação e execução

```bash
npm install
cp .env.example .env      # preencha se quiser usar seus App IDs (opcional para testes)
npm run dev               # servidor (3001) + cliente Vite (5173)
```
Abra http://localhost:5173. Produção: `npm run build && npm start` (tudo em http://localhost:3001).
Checar tipos: `npm run typecheck`. Requer Node 20+.

## Testar com 2+ jogadores
1. Abra duas abas (ou dois navegadores) em http://localhost:5173.
2. Aba A: **Jogar** (1x1) cria a sala. Aba B: **Jogar** entra na mesma. A contagem começa quando a sala enche.
3. Sala privada: **Criar partida → Privada**, e na outra aba **Entrar com código**.
4. Sozinho: **Treinar** ou **Jogar contra bots**. Em outra máquina da rede, use `http://IP-DO-PC:5173`.

## Controles
WASD mover · Espaço pular · Shift correr · Ctrl/C agachar · Mouse esquerdo atirar · direito mirar · 1–8 armas · R recarregar · Tab placar · Enter chat · G emotes.

## Arquitetura (3 camadas)
- `shared/` — dados e física usados por cliente e servidor (modos, armas, mapas, colisão).
- `server/` — **servidor autoritativo**: valida movimento, dano, munição, eliminações e pontuação; roda os bots; chat por sala com filtro e limite; diretório de salas; alocadores.
- `client/` — Three.js, HUD, telas e máquina de estados de conexão (`net.ts`).

### Photon: o que é e o que não é
1. **Servidor Photon** = um App ID (app isolado com limite de CCU, 20 no plano gratuito). Não é uma máquina física.
2. **Região** = ponto de entrada de rede, escolhido no cliente.
3. **Sala Photon** = grupo de jogadores dentro de um App ID. App IDs diferentes não se enxergam.
4. **Partida** = estado de jogo (rodadas, placar) dentro de uma sala.
5. **Limite** = CCU do App ID + máximo da sala.

Photon Fusion não tem SDK para navegador. Photon Realtime é só relay (sem lógica de servidor), então não permite anti-trapaça sozinho. Por isso o jogo roda em um servidor Node autoritativo, e `ServerAllocator` / `ChatServerAllocator` (`server/allocator.ts`) tratam cada App ID como um **slot de capacidade de 20 jogadores**: a sala reserva seu máximo ao ser criada e libera ao fechar; slot cheio → próximo slot; slot marcado como instável (`/admin/fail?key=...&id=photon-3`) é pulado. O jogador nunca vê "servidor X".

**Atenção:** no MVP o tráfego em tempo real usa o WebSocket do servidor Node. Os App IDs são lidos do `.env` e usados para contabilidade de capacidade; **não há código do SDK Photon** (não pude validá-lo aqui). `client/net.ts` é o ponto de extensão para um transporte Photon Realtime.

### Chat
Passa pelo servidor, um canal por sala (isolamento garantido), canal de equipe, mensagens rápidas, limite de rajada de 3 + 1 msg/s, filtro de palavras/links/repetição, silenciar (local) e denunciar (🚩 no placar). Nenhuma mensagem é guardada. Os IDs de chat nunca vão ao navegador.

### Anti-trapaça
Servidor decide vida, escudo, munição, dano, kills, pontuação e recompensas (calculadas uma vez por partida); limita velocidade/posição e taxa de mensagens por conexão e por IP. Limite honesto: sem contas/banco, moedas e XP ficam só no `localStorage` (cosméticos) — recompensas reais precisam de backend com autenticação.

## Estado atual
**Implementado:** 3 mapas, 8 armas, modos 1x1–5x5/todos contra todos/treino/bots, salas públicas e privadas com código, navegar/criar, sala de espera, contagem, rodadas, placar, respawn, revanche, resultado, bots (fácil/médio/difícil), chat, emotes, reconexão automática, perfil e cor/rosto da bola.
**Ainda não (sem backend de contas):** amigos, convites, grupos, loja, inventário cosmético, desafios, títulos, recompensas diárias, controles de celular, esteiras móveis na Fábrica, SDK Photon real.

## Deploy
Qualquer host Node com WebSocket (Fly.io, Railway, Render, VPS): `npm ci && npm run build && npm start`, variáveis do `.env` no painel do host, HTTPS na frente (o cliente usa `wss://` automaticamente). Um processo = um estado em memória; para escalar, rode várias instâncias com um diretório de salas compartilhado (Redis).

## Melhorias futuras
Contas e amigos, Photon Realtime/Chat reais, modos de captura de pontos, matchmaking por nível, mobile, replays, mais mapas e cosméticos, previsão de lag-compensation.

## Hospedar o cliente em site estático (EdgeOne, Netlify, Vercel, GitHub Pages…)
Hospedagem estática **não roda o servidor do jogo**. Você precisa de dois lugares:
1. **Servidor** (Node com WebSocket): Render, Railway, Fly.io ou VPS. Build: `npm install`. Start: `npm start`. Anote a URL (ex.: `https://ball-fall.onrender.com`).
2. **Cliente**: crie `client/.env.production` com `VITE_WS_URL=wss://ball-fall.onrender.com/ws`, rode `npm run build` e envie a pasta `dist` para o EdgeOne.
Mais simples: hospede o projeto inteiro só no servidor Node (ele também serve o `dist`), sem EdgeOne.

## Loja, contas Google e itens
A loja é a página `/loja.html` do mesmo servidor (mesma conta e mesmo banco do jogo). Quem entra com Google na loja e depois no jogo (mesmo navegador) já tem os itens equipados, porque o servidor lê o cookie de sessão e consulta o banco.
- **Moedas**: 300 de boas-vindas, 100 por dia (🎁 Diária) e recompensas de partida (calculadas no servidor, 1 vez por partida, teto de 1000/dia). Não há pagamento com dinheiro real nesta versão (veja Limitações).
- **Itens**: acessórios da bola e armas. Qualquer pessoa logada pode **publicar** (custa 100 moedas, até 3 por dia): escolhe modelo, cor, preço e dano de **5 a 20**. O item só aparece na loja depois que um **admin** (e-mail em `ADMIN_EMAILS`) aprova na aba Moderação.
- **Equilíbrio (sem pay-to-win)**: a cadência do tiro é calculada pelo servidor a partir do dano, então o DPS nunca passa do Blaster padrão (dano 5 = tiro rápido; 20 = tiro lento). A arma customizada substitui o Blaster (tecla 1).
- **Segurança**: sessão em cookie HttpOnly (só o hash fica no banco), CSRF token + checagem de origem, limite de requisições por IP e por conta, validação de todos os campos no servidor, moedas em livro-razão (recompensa e compra não duplicam), moderação antes de publicar, CSP na loja, uma conta = uma conexão de jogo.

### Configurar o login Google
1. console.cloud.google.com → crie um projeto → *APIs e serviços → Tela de consentimento OAuth* (externo) → *Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web*.
2. *URIs de redirecionamento autorizados*: `https://SEU-DOMINIO/auth/google/callback` (e `http://localhost:5173/auth/google/callback` para testes).
3. Coloque `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_URL` e `ADMIN_EMAILS` nas variáveis do servidor (Railway → Variables). **Nunca** no código.
4. **Railway**: crie um **Volume** montado em `/data` e defina `DB_PATH=/data/ballfall.db`; sem volume o banco é apagado a cada deploy.
Teste local sem Google: `DEV_LOGIN=1` e abra `http://localhost:5173/auth/dev?email=voce@teste.com`.

### Limitações da loja
Não há pagamento com dinheiro real (exigiria Mercado Pago/Stripe com webhook assinado, outra etapa). Espada é só um modelo visual: dispara como as demais armas, não há combate corpo a corpo. Os acessórios/armas valem para quem entra com a conta no mesmo domínio. A loja precisa ser servida pelo mesmo domínio do jogo (cookie); se o jogo ficar no EdgeOne e o servidor no Railway, o cookie não é compartilhado — hospede tudo no Railway.

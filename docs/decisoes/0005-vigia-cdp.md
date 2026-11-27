# ADR 0005 · Vigia de rede via CDP

**Data:** 2026-11-26 · **Estado:** aceita

## Decisão
`webContents.debugger.attach('1.3')` + `Network.enable` com buffers zerados. Eventos usados: `webSocketCreated`, `webSocketClosed`, `webSocketFrameReceived`, `responseReceived`. O main só atualiza contadores e carimbos (nada de log por quadro). O vigia se solta quando as DevTools da conta abrem e volta quando fecham.

## Prova
20 mensagens/s por 30 s: CPU da conta 0,339% sem vigia e 0,343% com vigia; main 0,089% → 0,108%. Bem abaixo da meta de 2%.

## Detalhes descobertos nos testes
- A conexão pode abrir antes de o vigia ligar: ela passa a ser conhecida pelo primeiro quadro.
- Quando a principal cai, as conexões que já existiam (chat) não podem virar a nova principal.
- Com a principal conhecida, só os dados dela contam para "sem receber dados" (RN-064).
- O Chromium só acusa travamento quando há entrada do usuário. O HDeck faz um batimento a cada 5 s no mundo isolado para detectar página travada (RN-065), e a recarga derruba o processo travado antes de carregar de novo.

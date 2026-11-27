# ADR 0001 · Electron em vez de Tauri/WebView2

**Data:** 2026-11-26 · **Estado:** aceita para a interface e as lives; **as contas passaram para o WebView2 na ADR 0014** (2026-11-27, Cloudflare)

## Contexto
O HDeck precisa de várias sessões isoladas e persistentes, controle do estrangulamento de timers por página, captura de página, Chrome DevTools Protocol por página, páginas fora da tela e janelas em vários monitores.

## Decisão
Electron 45.5 (Chromium 156, Node 24). APIs usadas: `session.fromPartition`, `backgroundThrottling` / `setBackgroundThrottling`, `capturePage`, `webContents.debugger`, `WebContentsView` e renderização offscreen com `setFrameRate`.

## Consequências
- O WebView2 tem perfis, mas não controla o estrangulamento por página nem renderiza offscreen; o custo de memória do Chromium por página é o mesmo nos dois.
- Política de versão: subir de major a cada nova estável, rodando E2E e bancada antes (Seção 3).
- TypeScript fixado em 6.0 (o 7.0 ainda não funciona com o `svelte-check`).

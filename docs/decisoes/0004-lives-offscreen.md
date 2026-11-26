# ADR 0004 · Lives em página offscreen

**Data:** 2026-11-26 · **Estado:** aceita

## Decisão
Cada live é uma `BrowserWindow({ show: false, 480×270, offscreen: true, backgroundThrottling: false })` na partição da conta, muda, sem ouvir `paint`, com `setFrameRate(1)` no modo econômico. A aceleração por hardware do app continua ligada. A qualidade é gravada na preferência do player (`localStorage`, chave em `dados/lives-seletores.json`) e vale para as lives que abrirem ou recarregarem.

## Prova
`tests/provas/provas.spec.ts` com a live falsa (vídeo de `canvas.captureStream`): em 60 s o player não pausou, `visibilityState` = `visible`, 60 s de "tempo assistido" contados no servidor falso, cerca de 0,05% de CPU e 96 MB.

## Pendência
A contagem real de pontos do canal na Twitch/Kick depende do site e está no `docs/TESTE-MANUAL.md`. Se não contar, o plano B é uma `WebContentsView` comum numa janela auxiliar escondida 1×1.

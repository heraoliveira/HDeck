# ADR 0009 · Núcleo puro e portas

**Data:** 2026-11-26 · **Estado:** aceita

## Decisão
Toda regra de negócio fica em `src/main/nucleo/` (TypeScript puro; o Biome proíbe importar `electron`, `node:fs` e `node:net` ali). O núcleo fala com o mundo pelas portas de `portas.ts`: `Relogio`, `PaginaConta`, `FabricaPaginas`, `FabricaLives`, `Armazem`, `ClienteHttp`, `Rede`, `CanaisLocais`, `Sistema`, `CofreLogins`. Os adaptadores em `src/main/adaptadores/` só traduzem para o Electron e o Node. `src/main/index.ts` só compõe.

O cálculo das divisões de tela ficou em `src/shared/layout/` (e não em `nucleo/layout`) porque a interface usa a mesma conta para desenhar as molduras.

## Consequências
Os testes do núcleo usam o relógio falso: 45 s, 2 h e 30 dias passam na hora. No modo de teste do app, `HDECK_TESTE_ACELERAR=N` acelera o relógio do núcleo para os E2E de recargas programadas e lives.

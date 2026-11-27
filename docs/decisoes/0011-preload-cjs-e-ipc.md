# ADR 0011 · Preload em CommonJS e contrato IPC

**Data:** 2026-11-26 · **Estado:** aceita

## Contexto
Preload com `sandbox: true` não aceita ESM nem módulos de `node_modules` (o primeiro build falhou com "module not found: zod").

## Decisão
- O preload sai em CommonJS (`out/preload/shell.cjs`) e importa só `src/shared/ipc/nomes.ts` (nomes dos canais, sem dependência). Os esquemas Zod ficam em `contrato.ts`, usados pelo main; um teste confere que os nomes batem.
- A interface recebe o estado completo pelo evento `estado` (agrupado a cada 30 ms) em vez de eventos separados por conta, grupo e live; fotos (`conta.foto`) e métricas (`conta.metricas`) vão à parte.
- O main recusa IPC de quem não for uma das janelas de interface, de outro quadro ou de outra origem (teste em `tests/seguranca`).

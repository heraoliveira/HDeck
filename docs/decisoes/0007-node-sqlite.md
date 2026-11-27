# ADR 0007 · node:sqlite (sem módulo nativo)

**Data:** 2026-11-26 · **Estado:** aceita

## Decisão
Banco em `%APPDATA%/HDeck/hdeck.db` com o `node:sqlite` do Node 24 embutido no Electron. WAL ligado. Migrações por `PRAGMA user_version`, com ida e volta (`MIGRACOES` em `armazem-sqlite.ts`). Nenhum `.node` para recompilar a cada Electron.

## Consequências
- O módulo ainda emite um aviso de "experimental" no Node 24; a API usada (`DatabaseSync`, `prepare`, `exec`) é estável desde o 22.13.
- Retenção (RN-163): métricas por minuto até 48 h, depois média por hora; o que tem mais de 30 dias sai.

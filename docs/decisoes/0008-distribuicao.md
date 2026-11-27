# ADR 0008 · Distribuição e atualização

**Data:** 2026-11-26 · **Estado:** aceita (decisão 5 da Seção 2.1)

## Decisão
`electron-builder` gera `HDeck-Setup-<versão>.exe` (NSIS, por usuário, sem admin, em `%LOCALAPPDATA%\Programs\HDeck`), com atalho no menu Iniciar e desinstalador que pergunta se apaga `%APPDATA%\HDeck` (`build/installer.nsh`). As fuses são aplicadas no build (`build/electron-builder.yml`) e conferidas por teste no executável.

Atualização: `electron-updater` lendo o GitHub Releases de `heraoliveira/HDeck`, canais estável e teste; baixa sozinha e aplica ao fechar ou em "Reiniciar agora" (RN-173).

## Consequências
Sem certificado de assinatura, o SmartScreen avisa na primeira instalação; o `electron-updater` ainda confere o hash publicado. Assinatura (ex.: Azure Trusted Signing) fica como sugestão.

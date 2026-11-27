# ADR 0013 · Memória: processos compartilhados e "Otimizar"

**Data:** 2026-11-27 · **Estado:** aceita (pedido da dona: "1 aba de jogo com 2,8 GB e 15% de CPU")

## Diagnóstico
`tools/bancada/memoria-real.ts` abre o HDeck com uma conta num jogo real e lista RAM/CPU por processo.
Com pokeidle.io (sem login), em 60 s: total 652 MB, sendo ~470 MB fixos do Electron/Chromium (processo principal 139, GPU 160, rede 63, interface 107) e **183 MB da página do jogo**. O custo fixo é dividido por todas as contas; o que cresce por conta é a página.

O que faz uma conta chegar a GB com o tempo:
1. **Um processo por site:** cada iframe de outro domínio (anúncios, login, widgets) ganha um processo renderer próprio (~100–200 MB cada).
2. **Cache de páginas antigas (BFCache):** depois de um redirecionamento (ex.: login), a página anterior fica guardada na memória.
3. **Memória que o jogo acumula:** o próprio jogo vai pesando; só um processo novo devolve essa memória ao Windows.

O vigia de rede (CDP) foi medido com quadros grandes (20 KB, 20/s): +0,1% de CPU e ~60 MB no total; não é a causa.

## Decisão
- Flags (em `src/main/index.ts`): `disable-site-isolation-trials` e `disable-features=IsolateOrigins,site-per-process,BackForwardCache,SpareRendererForSitePerProcess,MediaRouter,OptimizationHints,Translate,AutofillServerCommunication`. Os iframes de terceiros dividem o processo da página do jogo. As contas continuam isoladas entre si (partições separadas, sandbox ligado).
- **Otimizar (RN-058):** reabre a conta num processo novo (derruba o processo dela e carrega a mesma URL, mantendo a sessão). Manual no painel do grupo, no painel da conta e nas ações em lote; sozinho a cada 1 h, uma por vez, nunca a conta em uso.

## Medição depois
pokeidle.io sem login, 60 s: total 648 MB, página 179 MB, CPU 2,0% (antes 7,8%). Uma conta logada não dá para medir aqui sem o login da dona; está no `docs/TESTE-MANUAL.md`.

## Consequência
Sem isolamento por site, um iframe malicioso dentro da página de um jogo fica no mesmo processo dessa página. O processo continua em sandbox e isolado das outras contas e do HDeck.

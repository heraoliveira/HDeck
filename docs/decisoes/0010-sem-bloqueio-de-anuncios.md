# ADR 0010 · Sem bloqueio de anúncios dos sites

**Data:** 2026-11-26 · **Estado:** aceita (revisável pela dona)

## Decisão
O HDeck não tem anúncios próprios e **não bloqueia** anúncios nem conteúdo dos jogos e das lives (RN-005): bloquear pode quebrar a contagem de tempo assistido e o funcionamento dos jogos. Teste: `tests/seguranca/seguranca.spec.ts` (a página carrega `/anuncio/ads.js`).

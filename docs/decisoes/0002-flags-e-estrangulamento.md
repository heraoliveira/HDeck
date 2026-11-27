# ADR 0002 · Flags do Chromium e estrangulamento

**Data:** 2026-11-26 · **Estado:** aceita

## Decisão
Em `src/main/index.ts`, antes do `ready`:
- `disable-renderer-backgrounding`, `disable-background-timer-throttling`, `disable-backgrounding-occluded-windows`
- `disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling`

Toda view de conta nasce com `backgroundThrottling: false`. Só a política **Economizar** com a conta **fora da tela** liga `setBackgroundThrottling(true)` (RN-050, RN-051). A janela da interface pode ser estrangulada, porque não roda jogo.

## Prova (Seção 16, passo 2)
`tests/provas/provas.spec.ts`: 60 s em cada cenário; contagem de `setInterval(250)` ≥ 95% e `visibilityState` sempre `visible` com a janela **minimizada**, **na bandeja** (escondida) e **coberta** por outra janela. Passou nos três. O E2E `tests/e2e/contas.spec.ts` repete os três em sequência por 2 min e a bancada por 15 min. O plano B (janela auxiliar 1×1) não foi necessário.

## Consequências
Views em foto e fora da tela ficam presas à janela (invisíveis e fora da área), nunca soltas (ver ADR 0003).

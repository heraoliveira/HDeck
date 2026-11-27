# ADR 0003 · Fotos das contas (modo econômico)

**Data:** 2026-11-26 · **Estado:** aceita

## Contexto
A Seção 5.4 pedia a view destacada da janela e `capturePage()` nela, com plano B se não funcionasse.

## Prova
`tests/provas/provas.spec.ts` testou três jeitos:

| Modo | Captura | Foto atualiza | Timers |
|---|---|---|---|
| View tirada da janela (`removeChildView`) | **não termina** (trava) | — | 100% |
| View presa e `setVisible(false)` | ok | sim | 100% |
| View presa, fora da área (x = −20000) | ok | sim | 100% |

No app real apareceu um caso a mais: uma view que **nunca** foi desenhada devolve foto vazia.

## Decisão
- Foto e fora da tela: a view continua presa à janela, **invisível** e posicionada fora da área.
- Toda view nasce visível fora da área e só se esconde depois do primeiro carregamento (para haver o que fotografar).
- A foto é JPEG qualidade 70 no tamanho do espaço; intervalo com jitter de ±100 ms por conta; nada de foto para espaço fora da tela (RN-054). Miniaturas do Painel: 10 s.

# Medições (Seção 13)

**2026-11-26** · Ryzen 5 5600X (12 threads), 24 GB, Windows 11 (10.0.26200) · Electron 45.5.0 · `pnpm bancada` (BANCADA_MIN=15) + `pnpm provas`. Resultado bruto: `tools/bancada/resultados/`.

| Medida | Meta | Medido | Situação |
|---|---|---|---|
| Interface parada, sem contas | ≤ 150 MB, ≤ 1% CPU | 380 MB, 0,1% | ❌ RAM acima (soma de todos os processos do Chromium: main, GPU, rede, interface) |
| Custo extra do HDeck por conta | ≤ 15 MB, ≤ 0,3% CPU | 14,2 MB, 0,47% | ✅ RAM / ❌ CPU levemente acima |
| 30 contas, 9 visíveis em econômico | interface ≥ 55 fps | 180 fps ao rolar a lateral; 3,8 GB, 14% CPU | ✅ |
| Econômico vs ao vivo (9 em grade) | CPU ≤ 40% do ao vivo | 11,4% vs 10,4% (110%) | ❌ sem ganho com o jogo falso |
| Timers escondidos 15 min (minimizada → bandeja → coberta) | ≥ 95% | 100% | ✅ |
| Live offscreen | ≤ 3% CPU, sem pausar 30 min | 0,05%, sem pausa em 60 s (prova) | ✅ (30 min reais: TESTE-MANUAL) |
| Abrir o app até a interface | ≤ 2 s | 0,74 s | ✅ |
| Recarga após queda | ≤ 1 s após a espera | 15,0–15,9 s com espera de 15 s (E2E) | ✅ |
| Vigia CDP por conta | ≤ 2% CPU | +0,02% | ✅ |

## Desvios e causa provável
- **Modo econômico sem ganho:** o jogo falso quase não desenha (canvas pequeno); o custo de desenhar é baixo e a foto a cada 1 s soma captura + JPEG. A view em foto fica invisível, mas a captura força a pintura. Próximo passo: medir com um jogo real pesado e, se o ganho seguir baixo, subir o padrão da foto para 2–5 s ou usar `beginFrameSubscription` (ADR 0003).
- **RAM ociosa 380 MB:** é a soma de todos os processos do Electron (o processo de GPU sozinho passa de 100 MB). A meta de 150 MB parece irreal para Chromium 156; ficou registrada como revisável pela dona.
- **CPU por conta 0,47%:** inclui o batimento de travamento (5 s) e o vigia; dá para espaçar o batimento para 10 s se preciso.

## 2026-11-27 · uma conta num jogo real (ADR 0013)
`node tools/bancada/memoria-real.ts https://pokeidle.io/ 60` (sem login):

| | Total | Página do jogo | CPU total |
|---|---|---|---|
| Antes | 652 MB | 183 MB | 7,8% |
| Depois (processos compartilhados + sem BFCache) | 648 MB | 179 MB | 2,0% |

Os ~470 MB fixos (principal, GPU, rede, interface) são divididos por todas as contas. Com login, o jogo cresce com o tempo; "Otimizar sozinho a cada 1 h" reabre a conta num processo novo e devolve essa memória. A medição com a conta logada fica para a dona (TESTE-MANUAL, item 20).

## 2026-11-27 · contas no WebView2 (ADR 0014)
Uma conta ao vivo na tela em https://ultimatepokeidle.com (sem login), medido com o "conjunto de trabalho privado" do Windows (o mesmo número do Gerenciador de Tarefas), somando Electron, motor e WebView2:

| | Memória privada | CPU (12 núcleos) |
|---|---|---|
| HDeck com o motor WebView2 | ~730 MB | ~4% |

Processos: interface Electron ~215 MB, motor .NET ~20 MB, navegador WebView2 ~45 MB, GPU do WebView2 ~300 MB (memória de vídeo contada como privada), rede e armazenamento ~25 MB, página do jogo ~170–230 MB. Desligar o isolamento por site juntou os renderers num só, mas não diminuiu o total; ele ficou ligado.

Provas (`pnpm provas`, 20 s por cenário): timers 99,9% minimizada, 99,9% na bandeja e 100% coberta, para a conta ao vivo e para a conta fora da tela; foto fora da tela atualizando (9 ticks em 2 s); vigia de rede com 20 msg/s: CPU 5,2% sem e 4,7% com (sem diferença mensurável).

## 2026-11-27 · CPU com 3 contas no pokeafk.io (ADR 0014)
`node tools/bancada/cpu-real.ts https://pokeafk.io/ 3 1 <política>` (modo econômico ligado, 1 conta ao vivo e 2 em foto, 20 s, 12 núcleos):

| Política fora da tela | CPU total do HDeck | Cada conta em foto | GPU do WebView2 |
|---|---|---|---|
| Manter farmando (antes, padrão) | ~22% | ~4,4% | ~7,5% |
| Economizar (agora, padrão) | ~11% | ~0,9% | ~4,1% |

A conta ao vivo gasta o que a página do jogo pede (~3,5–4%, como numa aba do Edge).

## 2026-11-28 · investigação de CPU e RAM, 3 contas no pokeafk.io (ADR 0014)
`FOTO=<s> node tools/bancada/cpu-real.ts https://pokeafk.io/ 3 1` (Economizar, modo econômico, 1 conta ao vivo e 2 em foto; RAM = memória privada, como no Gerenciador de Tarefas):

| Foto a cada | CPU total | Conta em foto | GPU das contas | RAM total |
|---|---|---|---|---|
| 1 s (antes) | ~9,4% | ~0,9% | ~3,5% | — |
| 5 s (novo padrão) | ~6–7,5% | ~0,15–0,25% | ~2,5–3% | ~550–610 MB |

Por processo (5 s): interface Electron ~110 MB e ~0,2% (principal, GPU, interface); motor .NET ~25 MB; navegador das contas ~40 MB; GPU das contas ~125 MB; cada página ~75–95 MB. O resto da CPU é a própria conta ao vivo (~3,5%) e o desenho dela na GPU.

O que já foi descartado: o vigia de rede (sem custo mensurável), desligar a aceleração da interface (GPU do Electron ~36 MB), desligar o isolamento por site (não diminuiu). Modo de memória baixa do Edge nas contas ocultas: ~3–4 MB a menos por conta numa página leve; fica ligado (em jogos pesados solta mais).

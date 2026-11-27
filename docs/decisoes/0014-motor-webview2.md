# ADR 0014 · Contas no WebView2 (Edge), num motor .NET

**Data:** 2026-11-27 · **Estado:** aceita (pedido da dona: a verificação "sou humano" do Cloudflare falhava; ela escolheu a opção 2 e testou o `Prova.exe` no pokeidle: "passou") · **Substitui** a parte das contas da ADR 0001

## Problema
O Cloudflare Turnstile recusava as contas do HDeck ("Falha na verificação"), e o mesmo acontecia num Electron puro, sem nada do HDeck. O Electron é um Chromium que o Cloudflare trata como navegador embutido. O WebView2 é o Edge do Windows; no teste da dona, o mesmo jogo passou.

## Decisão
- A interface, o núcleo e as lives continuam no Electron. **Só as páginas das contas** mudam de motor.
- `motor-paginas/` é um processo .NET 10 (`hdeck-motor.exe`) que hospeda as contas em WebView2. Ele conversa com o processo principal por JSON em linhas, no stdin/stdout (`src/main/adaptadores/webview2/cliente-motor.ts`).
- `FabricaPaginasWebView2` implementa as mesmas portas `PaginaConta`/`FabricaPaginas` (ADR 0009). O núcleo não mudou.
- Cada conta é um **perfil** do WebView2 (`conta-<id>`): cookies, armazenamento e cache separados. Um navegador só (um processo de GPU e um de rede) serve todas as contas.
- A página é uma janela filha nativa da janela do HDeck, posicionada no retângulo do espaço (pontos × DPI). Fora da tela ela continua visível em `x = -30000` (como na ADR 0003); a política Economizar a deixa oculta e com `MemoryUsageTargetLevel = Low`.
- Flags do navegador das contas (ADR 0002 e 0013): sem estrangular timers de página escondida/coberta, sem cache de páginas antigas, sem serviços do Edge que só gastam memória. O isolamento por site fica **ligado** (é o padrão do Edge; desligar não economizou memória na medição).
- Scripts do HDeck rodam num mundo isolado via CDP (`Page.createIsolatedWorld` + `Runtime.evaluate`). O aviso de clique/tecla (RN-043/053) também mora num mundo isolado (`Runtime.addBinding`). Nada é injetado no mundo da página.
- Vigia de rede (ADR 0005) pelo CDP do WebView2, observando desde antes da primeira navegação; o WebSocket só conta como aberto quando o servidor aceita (resposta do handshake). Os eventos do CDP chegam fora de ordem entre receptores: o motor junta "criado" e "aceito" e descarta quadros atrasados de conexões já fechadas.
- Página travada e "Otimizar" (RN-058): fecha o controlador e cria outro no mesmo perfil (processo novo, login mantido).
- Pop-ups (RN-151), downloads (RN-150) e permissões (RN-152): o motor pergunta ao HDeck, que decide com as mesmas políticas puras de `politicas.ts`. A regra de navegação (RN-153) e o login do Google como Firefox sem client hints (RN-154) estão copiados em C# (`Apoio.cs`).
- Janela solta ou de grupo: antes de fechar, as contas dela voltam para a principal (uma janela filha nativa morre com a janela mãe).
- Ao sair, o motor fecha as páginas e espera o navegador terminar, que grava cookies e armazenamento (RN-011).
- As sessões antigas (partições `conta-*` do Electron) não servem no WebView2 e são apagadas uma vez: **cada conta precisa entrar de novo uma vez**. As lives ganharam partição própria (`live-*`).
- O instalador leva o motor em `resources/motor` (autocontido, sem pedir .NET). O WebView2 Runtime já vem no Windows 11.

## Provas (com o HDeck de verdade)
- `tools/prova-webview2/embutido.mjs`: posição exata da janela filha, cookies isolados entre perfis, timers 100% com a janela normal, minimizada e escondida, foto fora da tela, vigia de rede, processo novo mantendo o cookie.
- `tests/provas/webview2.spec.ts`: timers 99,9–100% minimizada, na bandeja e coberta (ativa e fora da tela); foto fora da tela atualizando com a página rodando (9 ticks em 2 s); vigia com 20 msg/s sem custo de CPU mensurável.

## Consequências
- Dois Chromiums (o do Electron para a interface e o do Edge para as contas). Medição com uma conta no pokeidle: ~730 MB de memória privada no total e ~4% de CPU (12 núcleos) com a conta ao vivo na tela. Ver `docs/MEDICOES.md`.
- Instalador maior (~160 MB) por causa do .NET autocontido.
- O Playwright não enxerga as páginas das contas: os testes usam o modo de teste do motor (`avaliarPagina`, `estado`, `popups`).

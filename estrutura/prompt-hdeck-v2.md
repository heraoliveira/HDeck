# PROMPT-MESTRE v2 · HDeck · navegador de várias contas para jogos idle de navegador (Windows)

<!--
COMO USAR
1. Abra uma conversa nova com um assistente de código que tenha terminal e acesso ao repositório
   C:\Users\herao\Documents\HERA\PROJETOS\HDeck (já é um repositório git, branch main, com remote origin).
2. Aponte para os DOIS arquivos desta pasta (estrutura\prompt-hdeck-v2.md e estrutura\REGRAS.md)
   e escreva: "Execute o HDeck completo".
   - prompt-hdeck-v2.md diz COMO construir (arquitetura, tecnologia, testes, entrega).
   - REGRAS.md diz O QUE o programa faz (regras de negócio numeradas RN-xxx). Na fundação ele é copiado
     para docs\REGRAS.md, que passa a ser a fonte única das regras do programa.
   - Esta v2 substitui a v1 (prompt-hdeck-v1.md pode ser apagado).
3. O projeto é entregue DE UMA VEZ (Seção 16). Não existem fases para aprovar no meio.
   O assistente trabalha em commits pequenos, mas só para quando tudo da Seção 17 estiver cumprido.
4. Para mudar uma decisão depois, edite este documento e cole a seção alterada na conversa.
-->

## 0. Missão e regras inegociáveis

Você é, ao mesmo tempo, **engenheiro(a) de software sênior (desktop/Electron/Chromium), engenheiro(a) de desempenho e designer de produto sênior**. Sua missão é construir, **numa entrega única e completa**, o **HDeck**: um aplicativo para Windows que abre várias contas de jogos idle de navegador numa janela só, cada conta com login, cookies e cache isolados, rodando 24 h sem parar quando minimizado, com o menor consumo possível de memória e processador, **sem anúncios e sem telemetria**. A referência principal é o **IdleDeck** (idledeck.com.br); a Seção 2 diz o que foi verificado nele e o que adotamos.

Regras inegociáveis (em caso de conflito, prevalecem sobre o resto):
1. **Tudo local.** O HDeck não tem servidor, não tem conta online, não tem analytics, rastreador nem anúncio. Os únicos destinos de rede são: os sites dos jogos que o usuário abre, Twitch e Kick (só quando há live ligada), Discord/Telegram (só se o usuário configurar avisos) e o servidor de atualização (GitHub Releases). Cada destino novo exige ADR.
2. **Isolamento total por conta.** Cada conta tem a sua partição persistente (`persist:conta-<uuid>`): cookies, localStorage, IndexedDB, cache e service workers separados. Nada vaza entre contas. Contas nunca compartilham sessão.
3. **Não joga pelo usuário.** Sem bot, macro, clique automático, resolução de captcha ou verificação humana, proxy, VPN ou disfarce de navegador. Todas as contas usam o IP do usuário. O HDeck organiza, mantém vivo, vigia, avisa e recarrega. Isso protege as contas do usuário de banimento.
4. **Segurança de navegador primeiro.** Páginas de jogos e lives rodam com `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, **sem preload**. Só a interface do HDeck tem preload, com API mínima e tipada. Toda mensagem IPC é validada (Zod) e confere o remetente.
5. **Desempenho é requisito, não enfeite.** As metas da Seção 13 são critérios de aceite. Toda escolha que aumenta memória ou CPU por conta precisa de justificativa num ADR.
6. **Dados fora da lógica.** Catálogo de jogos conhecidos, padrões de configuração, textos e atalhos ficam em `src/shared/dados/` e `src/shared/i18n/`, nunca espalhados no código.
7. **Nada de cópia.** Use o IdleDeck para entender o produto; não copie código, textos, ícones, marca nem telas dele. Os nomes e textos das configurações deste documento são nossos.
8. **Escopo fechado.** Não adicione funções fora deste documento. Ideias vão para o fim da entrega, em "Sugestões".
9. **Questões jurídicas (termos de uso dos jogos, da Twitch e da Kick) são decisão da dona do projeto e estão fora do escopo.** Não bloqueie nem condicione nada por isso; o app só mostra os avisos de limite de contas que o catálogo de cada jogo declarar.
10. **Texto simples.** Toda frase da interface é pt-BR claro, curto e direto, no tom das telas de referência ("Recarregar sozinho quando a conexão cair", "Espera 45 s o jogo reconectar antes"). Sem jargão técnico na interface; o jargão fica no código e nos ADRs.
11. **Livro de regras.** `docs/REGRAS.md` (copiado de `estrutura/REGRAS.md` na fundação) guarda **toda a regra de negócio** do programa, numerada `RN-xxx`. Em conflito sobre comportamento, vale o REGRAS.md; em conflito sobre segurança, vale esta Seção 0. Regra nova ou alterada pela dona entra no REGRAS.md no mesmo commit do código. Nenhum comportamento visível ao usuário existe no código sem RN correspondente.
12. **Rastreabilidade.** Toda RN tem pelo menos um teste que cita o seu código (`// RN-012` ou no nome do teste). O script `pnpm regras` falha o CI se alguma RN ativa não tiver teste, ou se um teste citar RN inexistente.
13. **Núcleo puro, Electron nas bordas.** Regra de negócio (estados, recargas, agendas, layouts, avisos, limites) é TypeScript puro, sem importar `electron`, testável sem abrir janela. Só os adaptadores tocam a API do Electron (Seção 4.2).

---

## 1. Visão do produto

- **O que é:** um navegador especializado. A janela principal mostra **grupos** de **contas**; cada conta é uma página de jogo (uma URL) com a sua sessão isolada.
- **Para quem:** quem farma vários jogos idle de navegador com várias contas (ex.: pokeidle.io, lolidle.com, o próprio NarutoIdle da dona) e quer deixá-las rodando dia e noite no PC.
- **Promessa:** (1) as contas nunca param por estarem minimizadas, cobertas ou na bandeja; (2) se caírem, voltam sozinhas; (3) quando algo precisa do usuário, ele é avisado; (4) gasta o mínimo possível; (5) as lives da Twitch e da Kick que dão bônus nos jogos ficam ligadas por conta, sem precisar ficar visíveis.
- **Plataforma:** Windows 10 (22H2) e 11, x64. Nada de API nativa fora do Electron; o código fica portável sem esforço extra.
- **Idioma:** pt-BR. Todos os textos ficam num arquivo de textos (`shared/i18n/pt-BR.json`, acessado por chave), para não haver frase solta no código; outros idiomas ficam fora do escopo (só criar o arquivo quando a dona pedir).
- **Preço:** gratuito e de uso pessoal da dona; distribuição por instalador próprio (Seção 14).

### 1.1 Conceitos
| Conceito | Definição |
|---|---|
| **Jogo** | Entrada do catálogo (`dados/jogos.json`) ou criada pelo usuário: nome, domínios, URL inicial, ícone, se farma com a página escondida, se manda dados o tempo todo, limite de contas declarado, se dá bônus por live, plataforma de live suportada. |
| **Conta** | Uma página de um jogo com partição própria. Tem nome, cor, ícone, grupo, ordem, URL, zoom, som, política fora da tela, lives vinculadas, notas. |
| **Grupo** | Conjunto ordenado de contas (por jogo ou por time). Pode estar **ligado** (contas carregadas) ou **desligado** (contas descarregadas, zero memória). |
| **Live** | Página de um canal da Twitch ou da Kick ligada a uma conta, tocando sem som, na menor qualidade, sem aparecer na tela. |
| **Visão** | Como o grupo aparece: Grade, Principal + miniaturas, Foco (uma conta, abas no topo) ou Painel. |
| **Foto** | Captura da página usada no modo econômico e atrás de janelas sobrepostas (Seção 5.4). |

### 1.2 Estados de uma conta
`desligada` → `carregando` → `ativa` (ao vivo na tela) ⇄ `econômica` (rodando, mostrada como foto) · `escondida` (rodando fora da tela) · `caída` (esperando o jogo reconectar) · `recarregando` · `travada` (página sem responder) · `com aviso` (texto vigiado, sem dados, limite) · `erro` (site fora do ar, sem internet). A máquina de estados fica em `src/main/contas/estado.ts`, pura e testada, e o selo de cada estado aparece no cartão da conta.

---

## 2. Referência: o que foi verificado no IdleDeck e o que adotamos

Inspeção em 26/11/2026 das páginas públicas (idledeck.com.br, /guias, /guias/aba-em-segundo-plano e a página da Microsoft Store) e das duas capturas de tela das Configurações enviadas pela dona. O site não diz qual tecnologia o app usa.

| Aspecto | IdleDeck (observado) | **HDeck (adotamos)** |
|---|---|---|
| Plataforma | App gratuito para Windows 10/11, distribuído pela Microsoft Store | Windows 10/11; instalador NSIS próprio com atualização automática; MSIX/Store opcional depois (ADR) |
| Isolamento | Cookies, login e cache separados por conta, sem perfis do Chrome | Partição persistente por conta |
| Rodar escondido | Contas "não são tratadas como aba em segundo plano": timers e animações seguem com a janela minimizada, na bandeja ou coberta | Mesma promessa, com os mecanismos da Seção 5.2, e opção por jogo de economizar quando escondida |
| Visões | Grade; principal com miniaturas; uma conta em foco com abas (Ctrl+1, Ctrl+2...); Painel com consumo e histórico; conta em outro monitor | As quatro visões + conta solta em janela própria (outro monitor) + modos de divisão da Seção 7 |
| Modo econômico | Um clique no Painel mantém as contas farmando, mas mostra uma foto atualizada a cada poucos segundos; clicar na conta mostra ao vivo | Igual, com intervalo configurável (padrão 1 s) |
| Painel | Contas conectadas, quedas do dia, tempo online, miniaturas, memória e CPU por conta | Igual, mais histórico de 30 dias e gráficos simples |
| Grupos | Por jogo ou time; "Trocar para este grupo" desliga os outros e liga este | Igual, com abertura escalonada para não dar pico |
| Quedas | Detecta conexão caída, site fora do ar, página travada e falta de internet; recarrega sozinho | Igual (Seção 6) |
| Avisos | Notificação do Windows, som, selo na barra de tarefas, Discord (webhook) e Telegram (bot), enviados direto do PC | Igual (Seção 9) |
| Textos vigiados | O usuário cadastra palavras (ex.: "verificação") e é avisado se aparecerem na tela de alguma conta; só observa | Igual |
| Logins salvos | E-mail e senha por conta, guardados localmente com a criptografia do Windows, senha mestra opcional; "Preencher login" sem enviar | Igual (Seção 10) |
| Privacidade | Downloads, pop-ups e abas novas pedem clique; executáveis sempre bloqueados | Igual (Seção 11) |
| Lives | Twitch e Kick contatadas só quando há live ligada; nas capturas: lives nas contas, modo econômico das lives, qualidade (160p), lives por conta, voltar ao canal após raid, desligar live encerrada, religar quando voltar ao vivo (a cada 2 h) | Igual (Seção 8) |
| "Ping" | Conquistas/nível guardados no servidor deles (gamificação) | **Não copiamos.** No HDeck, "Ping" é a medição de latência e saúde dos sites dos jogos (Seção 9.4). Decisão revisável pela dona |
| Conta online | Precisa de conta no site para vincular o app | **Não existe.** Tudo local (regra 1) |
| Limites de jogo | Avisa ao chegar perto do limite de contas que o jogo publica | Igual, pelo catálogo |

### 2.1 Decisões que eu (autor deste prompt) tomei e a dona pode mudar
1. Electron em vez de Tauri/WebView2 (Seção 3.1).
2. "Ping" = latência dos jogos, não gamificação.
3. Sem conta online e sem servidor; backup por arquivo.
4. Lives usam a **mesma partição da conta** (login da Twitch/Kick uma vez por conta, e o vínculo OAuth feito dentro do jogo já serve).
5. Distribuição por instalador próprio + GitHub Releases, não pela Microsoft Store.
6. Interface em Svelte 5 (leve) em vez de React.
7. Sem módulo nativo (nenhum `.node` para recompilar): SQLite pelo `node:sqlite` do próprio Node do Electron. A função "aliviar memória" (forçar o Windows a tirar memória dos processos) foi **cortada**: só baixa o número no Gerenciador de Tarefas, a memória volta, e exigiria FFI nativo. O ganho real vem de foto, recarga por limite de memória e lives offscreen.
8. Só pt-BR (com textos por chave), sem en/es.

---

## 3. Stack técnica (versões estáveis em nov/2026)

### 3.1 Por que Electron
O app precisa de: várias sessões isoladas e persistentes; controle fino do estrangulamento de timers por página; captura de página; Chrome DevTools Protocol por página (para vigiar a rede sem tocar no jogo); páginas fora da tela; janelas em vários monitores. O Electron dá tudo isso em APIs estáveis (`session.fromPartition`, `webPreferences.backgroundThrottling`, `webContents.setBackgroundThrottling`, `capturePage`, `webContents.debugger`, `WebContentsView`, renderização offscreen com `setFrameRate`). O WebView2 (Tauri) tem perfis, mas não controla estrangulamento por página nem renderização offscreen; o custo de memória do Chromium por página é o mesmo nos dois. Registrar no ADR 0001.

| Camada | Escolha | Observação |
|---|---|---|
| Runtime do app | **Electron 45.x** (Chromium 156, Node 24) | Linha estável mais nova em nov/2026, com suporte até abr/2027. Política: subir de major a cada nova estável (Electron sai a cada ~8 semanas e mantém as 3 últimas), sempre rodando E2E e bancada antes |
| Ferramentas | **Node.js 24 LTS** + **pnpm** | Mesmo major do Node embutido no Electron, para os testes de unidade rodarem no mesmo motor. `.nvmrc`, `engines`, `packageManager` |
| Linguagem | **TypeScript** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ESM | Em tudo |
| Build | **electron-vite 5** (sobre **Vite 8**) | Três alvos: main, preload, renderer. Main e preload em ESM; preload em CommonJS se o sandbox exigir (preload sandboxed não aceita ESM: confirmar e registrar) |
| Interface | **Svelte 5** (runes) + CSS próprio com tokens | Sem biblioteca de componentes; ícones SVG embutidos (Lucide, só os usados, importados um a um). `svelte-check` no CI |
| Validação | **Zod** | IPC, configuração, catálogo, importação de backup |
| Banco local | **`node:sqlite`** (nativo do Node 24) | Sem módulo nativo para recompilar. Contas, grupos, histórico, avisos, cofre. WAL ligado |
| Configuração | JSON em `%APPDATA%/HDeck/config.json`, escrita atômica (tmp + rename), validada por Zod com migração por versão | |
| Cofre | **`safeStorage`** do Electron (DPAPI) + senha mestra opcional com `crypto.scrypt` + AES-256-GCM | Seção 10 |
| Testes | **Vitest** (unidade, integração, componentes com `@testing-library/svelte`), **fast-check** (propriedades), **Playwright** com `_electron` (E2E), jogo falso local (Seção 15) | |
| Qualidade | **Biome** (lint + formatação de TS/JSON/CSS), `svelte-check`, `tsc --noEmit`, `knip` | |
| Empacotamento | **electron-builder** (NSIS, por usuário, sem admin) + **electron-updater** (GitHub Releases) | Fuses do Electron aplicados no build e conferidos em teste (Seção 11) |
| CI | **GitHub Actions** em `windows-latest`: lint, typecheck, `pnpm regras`, unidade, integração, E2E, build do instalador | |
| Dependências | **Renovate** (ou Dependabot) semanal, agrupando Electron + electron-builder | Atualização de segurança do Electron entra em até 7 dias |
| Logs | **electron-log** com rotação (5 arquivos × 5 MB) em `%APPDATA%/HDeck/logs`, sem dados de login, tokens ou URLs com parâmetros | |

Dependências de produção são só estas: `electron-updater`, `electron-log`, `zod`, `svelte`. Qualquer outra exige ADR. Nenhuma dependência com módulo nativo.

---

## 4. Arquitetura

### 4.1 Repositório
```
src/
  main/                         processo principal
    index.ts                    só monta tudo (composição): flags, instância única, cria núcleo e adaptadores
    nucleo/                     REGRA DE NEGÓCIO, TS puro, proibido importar 'electron' (Biome noRestrictedImports)
      contas/estado.ts          máquina de estados da conta (Seção 1.2)
      contas/gerenciador.ts     ligar/desligar/recarregar, fila escalonada
      grupos/                   trocar grupo, ações em lote, limite de contas
      saude/                    decisões de queda, travamento, backoff, sem dados, internet
      economia/                 quem vira foto, política fora da tela, agenda da otimização, limite de memória
      lives/                    estado das lives, voltar ao canal, religar quando voltar
      avisos/                   regras do que avisa, agrupamento, silêncio, textos vigiados (comparação)
      layout/                   cálculo de grades e divisões
      ping/  painel/            agregação de métricas
      portas.ts                 interfaces que o núcleo usa: PaginaConta, Relogio, Armazem, Notificador, Rede...
    adaptadores/                implementações das portas com Electron/Node (finas, sem regra de negócio)
      electron/pagina-conta.ts  WebContentsView, partição, capturePage, setBackgroundThrottling
      electron/vigia-rede.ts    CDP (debugger) por conta
      electron/live-offscreen.ts
      electron/janelas.ts  bandeja.ts  atalhos.ts  energia.ts (powerMonitor, powerSaveBlocker)
      electron/endurecimento.ts web-contents-created, session-created, permissões, pop-ups, downloads, navegação
      electron/cofre.ts         safeStorage + crypto
      node/armazem-sqlite.ts    node:sqlite + migrações
      node/config-arquivo.ts    JSON atômico + migração
      node/discord.ts  telegram.ts  ping-http.ts
      updater.ts
    ipc/                        roteador: valida (Zod), confere remetente, chama o núcleo
  preload/
    shell.ts                    contextBridge: window.hdeck, gerado do contrato
  renderer/                     interface (Svelte 5)
    app/  componentes/  visoes/{grade,principal,foco,painel}/  configuracoes/  dialogos/  estado/ (stores)  estilos/tokens.css
  shared/                       usado por main, preload e renderer (sem 'electron', sem DOM)
    ipc/contrato.ts             canais + esquemas Zod
    tipos/  dados/{jogos.json,lives-seletores.json,padroes-config.ts,atalhos.ts}  i18n/pt-BR.json
tests/
  unidade/  integracao/  componentes/  e2e/  seguranca/
  fixtures/jogo-falso/  fixtures/live-falsa/   (servidor HTTP/WebSocket local controlável)
  falsos/                       implementações falsas das portas (relógio controlável, página falsa...)
tools/
  bancada/                      mede RAM/CPU com N contas do jogo falso
  regras/                       `pnpm regras`: confere RN ↔ testes
docs/
  decisoes/  (ADRs 0001...)   REGRAS.md   MEDICOES.md   TESTE-MANUAL.md
build/                          ícones, electron-builder.yml (com electronFuses)
```
Comandos na raiz: `pnpm dev`, `pnpm test` (unidade + integração + componentes), `pnpm e2e`, `pnpm regras`, `pnpm bancada`, `pnpm build`, `pnpm dist` (gera o instalador), `pnpm lint`, `pnpm typecheck` (tsc + svelte-check), `pnpm verificar` (tudo o que o CI roda, em ordem).

**Princípios de código:** composição em vez de herança; funções puras e dados imutáveis no núcleo; efeitos colaterais só nos adaptadores; injeção de dependência pela composição em `index.ts` (sem contêiner de DI); erros esperados como valores (`Resultado<T, Erro>`) e exceções só para o inesperado; tempo sempre pelo `Relogio` (nunca `Date.now()`/`setTimeout` direto no núcleo), o que torna testes de 45 s, 2 h ou 30 dias instantâneos; nomes de domínio em pt-BR, nomes de API do Electron como são.

### 4.2 Processos e responsabilidades
- **Main:** dono de toda a verdade (contas, grupos, estado, config, cofre). Cria e destrói as `WebContentsView`, decide visibilidade, foto, estrangulamento, recarga e avisos.
- **Renderer da interface (1 só):** desenha barra lateral, abas, molduras das contas, Painel, Configurações. **Não carrega nenhum jogo.** Mede os espaços onde cada conta deve aparecer (ResizeObserver) e manda os retângulos ao main; o main posiciona as views por cima (`setBounds`).
- **Uma `WebContentsView` por conta ligada**, na partição da conta. Desligar uma conta = `webContents.close()` e soltar tudo; a partição continua no disco.
- **Lives:** cada live é uma `BrowserWindow` offscreen e escondida (Seção 8.2). A renderização offscreen do Electron é documentada para `BrowserWindow`, não para `WebContentsView`.
- **Endurecimento central:** `app.on('web-contents-created')` e `app.on('session-created')` aplicam a TODA página e sessão criada (inclusive pop-ups e as que o próprio Chromium criar) as travas da Seção 11. Nenhum módulo cria página sem passar por isso, e um teste de segurança confere.

### 4.3 O problema das janelas por cima das contas
`WebContentsView` sempre fica acima do DOM da interface. Portanto:
- **Menus de contexto e "⋯"** usam `Menu.popup` nativo (fica acima de tudo).
- **Diálogos grandes** (Configurações, adicionar conta, cofre, confirmações): ao abrir, o main tira uma foto de cada view visível, a interface mostra as fotos no lugar e as views são escondidas; ao fechar, as views voltam. As contas **continuam rodando** (a política de estrangulamento não muda).
- **Arrastar e soltar** contas entre grupos/espaços usa o mesmo truque das fotos durante o arraste.

### 4.4 IPC
- Contrato único em `shared/ipc/contrato.ts`: cada canal tem nome, esquema de entrada e de saída. O preload expõe só funções geradas a partir dele (`hdeck.contas.adicionar(...)`, `hdeck.grupos.trocar(...)`...), mais um canal de eventos (`hdeck.ouvir(evento, cb)`).
- O main recusa mensagens que não venham do `webContents` da interface (confere `event.senderFrame.url` com a origem do app).
- Eventos do main para a interface: `conta.estado`, `conta.foto`, `conta.metricas`, `grupo.estado`, `aviso.novo`, `live.estado`, `ping.resultado`, `atualizacao.estado`.
- Fotos vão como `ImageBitmap`/JPEG pequeno (qualidade ~70, no tamanho do espaço na tela), nunca PNG em tamanho cheio.

### 4.5 Modelo de dados (SQLite)
`jogos` (id, nome, dominios, url_inicial, icone, farma_escondido, dados_continuos, limite_contas, bonus_live, origem: catalogo|usuario) · `grupos` (id, nome, cor, ordem, ligado, visao, layout_json) · `contas` (id uuid, grupo_id, jogo_id, nome, cor, icone, ordem, url, zoom, som, politica_fora_tela: padrao_do_jogo|manter|economizar, notas, criada_em) · `lives` (id, conta_id, plataforma: twitch|kick, canal, ligada, ordem) · `cofre` (conta_id, usuario_cifrado, senha_cifrada, campos_json) · `textos_vigiados` (id, texto, escopo: todas|grupo|conta, alvo_id, ativo) · `avisos` (id, conta_id, tipo, mensagem, criado_em, lido) · `metricas` (conta_id, minuto, ram_mb, cpu_pct, estado) com retenção de 30 dias e agregação por hora após 48 h · `eventos_conta` (conta_id, tipo: queda|recarga|travou|sem_dados|voltou, em) · `ping` (jogo_id, em, ms, status).

---

## 5. Motor de contas: isolamento, rodar escondido e economia

### 5.1 Criação da view de uma conta
```ts
new WebContentsView({ webPreferences: {
  partition: `persist:conta-${id}`, sandbox: true, contextIsolation: true, nodeIntegration: false,
  backgroundThrottling: false, spellcheck: false, webviewTag: false, enableWebSQL: false,
  autoplayPolicy: 'no-user-gesture-required', safeDialogs: true, navigateOnDragDrop: false,
}})
```
- **User agent:** o do Chrome da mesma versão do Chromium embutido, sem os tokens `Electron/` e `HDeck/` (vários sites recusam o UA do Electron). Não é disfarce: é o navegador real. Definido por sessão (`session.setUserAgent`) e em `app.userAgentFallback`.
- **Sem extensões** (fora do escopo: aumentam a superfície de ataque e o Electron só suporta parte da API do Chrome; fica em Sugestões); sem preload; permissões negadas por padrão (Seção 11).
- **Zoom** por conta (`setZoomFactor`), útil na grade.

### 5.2 Nunca parar quando escondida (o coração do produto)
Um navegador estrangula páginas ocultas: para de desenhar, limita timers a 1/s e, após minutos, a ~1/min (intensive wake-up throttling), e pode descartar a aba. Contramedidas, todas obrigatórias:
1. Flags na inicialização: `disable-renderer-backgrounding`, `disable-background-timer-throttling`, `disable-backgrounding-occluded-windows`, `disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling` (a lista final fica em `main/index.ts`, comentada, e no ADR 0002).
2. `backgroundThrottling: false` em toda view cujo jogo/conta esteja em **Manter farmando**; `webContents.setBackgroundThrottling(true)` dinâmico quando a política for **Economizar** e a conta sair da tela.
3. Janela minimizada, coberta ou na bandeja **não** desliga nenhuma view.
4. `powerSaveBlocker.start('prevent-app-suspension')` enquanto houver conta ligada (opção "Impedir o PC de dormir com contas ligadas", padrão ligado; a tela pode apagar).
5. **Verificação obrigatória** (teste E2E + `pnpm bancada`): a página do jogo falso conta ticks de `setInterval(…, 250)`, `requestAnimationFrame` e mensagens WebSocket. Com a janela minimizada por 15 min, na bandeja e coberta, a contagem de `setInterval` fica ≥ 95% da esperada e `document.visibilityState` reporta `visible` para contas em "Manter farmando". Se alguma combinação falhar, registrar em `docs/MEDICOES.md`, aplicar o plano B (manter a view anexada a uma janela auxiliar 1×1 fora da área visível, ou ajustar flags) e repetir até passar.

### 5.3 Contas fora da tela
Uma conta pode estar ligada mas fora da tela (outro grupo visível, visão Foco com outra aba, Principal com miniatura fora do recorte). Política **por jogo** no menu "⋯" de cada grupo (como na captura: *Manter farmando* (padrão) ou *Economizar*), com exceção por conta:
- **Manter farmando:** view destacada da janela, `backgroundThrottling` desligado; segue a 100%.
- **Economizar:** view destacada e estrangulada normalmente pelo Chromium (só para jogos que calculam no servidor e não dependem da aba). O catálogo traz `farma_escondido` para sugerir o padrão certo.

### 5.4 Modo econômico (as contas viram foto)
- Ligado na configuração "Modo econômico" (padrão ligado) e por um botão no Painel e na barra do grupo.
- Toda conta visível que **não é a ativa** (a última em que o usuário clicou) é mostrada como **foto atualizada** a cada *N* (configuração "Atualizar a foto a cada": 1 s padrão; 2, 5, 10, 30 s). A view real é destacada da janela (o compositor da GPU deixa de desenhá-la), mas continua com timers e rede a 100%.
- A foto vem de `webContents.capturePage()` redimensionada ao tamanho do espaço. **Verificar** que a captura funciona com a view destacada; se não funcionar, usar `beginFrameSubscription` ou manter a view anexada fora da área visível (plano em ADR 0003). O intervalo é dessincronizado entre contas (jitter) para não capturar tudo no mesmo milissegundo, e suspenso para contas cujo espaço está fora da tela.
- Passar o mouse mostra "Clique para jogar"; clicar põe a conta **ao vivo** naquele espaço e ela vira a ativa. Configurável: "Voltar a ser foto depois de X s sem mexer" (desligado padrão; 30 s, 1, 5 min).
- Meta: CPU total com 9 contas em grade econômica ≤ 40% da mesma grade ao vivo (Seção 13).

### 5.5 Otimização programada (intervalos de tempo)
Seção "Otimização" em Contas e jogos, com regras por grupo ou globais:
- **Recarregar contas a cada** (desligado, 2, 4, 6, 12, 24 h), escalonado (uma conta por vez, com intervalo de 20 s) e nunca uma conta ativa em uso nos últimos 60 s.
- **Recarregar a conta se a memória passar de** (desligado, 1, 1,5, 2, 3 GB): resolve vazamento de memória dos jogos, que é a maior causa de RAM alta.
- **Limpar o cache de arquivos das contas a cada** (desligado, 1, 7 dias): `session.clearCache()` (nunca cookies, storage ou logins).
- Todas as ações ficam registradas em `eventos_conta` e aparecem no Painel.

### 5.6 Abertura e troca de grupos
- **Abrir contas aos poucos:** ao ligar um grupo ou iniciar o app, carrega uma conta a cada *N* s (padrão 3 s), para não dar pico de CPU, rede e para não parecer abertura em massa para o jogo.
- **Trocar para este grupo:** desliga os outros grupos (fecha as views; partição fica) e liga este. Avisa antes se isso passar do limite de contas declarado do jogo.
- **Ao abrir o app:** restaurar "os grupos que estavam ligados" (padrão), "todas" ou "nenhuma".

---

## 6. Saúde das contas: quedas, travamentos e recargas

Seção "Se a conta cair" das Configurações (capturas):

| Configuração | Padrão | Como funciona |
|---|---|---|
| **Recarregar sozinho quando a conexão cair** — "Espera 45 s o jogo reconectar antes" | ligado, 45 s (ajustável 15–300 s) | Vigia de rede por conta via **CDP** (`webContents.debugger.attach('1.3')`, domínio `Network`: `webSocketCreated`, `webSocketClosed`, `webSocketFrameReceived`, `loadingFailed`). Se o WebSocket principal fechar e nenhum novo abrir em 45 s, recarrega. Backoff: 45 s, 2 min, 5 min, 15 min; após 4 falhas seguidas, para e avisa |
| **Recarregar ao voltar da suspensão** — "Depois de o PC dormir, a conexão do jogo morre" | ligado | `powerMonitor` `resume`: espera a internet voltar e recarrega as contas ligadas, escalonado |
| **Avisar se ficar sem receber dados** — "Só para jogos que mandam dados o tempo todo" | Nunca (1, 2, 5, 10, 30 min) | Último quadro WebSocket ou resposta de rede por conta; se passar do tempo, estado `com aviso` + aviso. Padrão por jogo vem do catálogo (`dados_continuos`) |
| **Recarregar se a página travar** | ligado, 30 s | eventos `unresponsive`/`responsive`; se continuar travada, recarrega |
| **Recarregar se a página fechar sozinha** | ligado | `render-process-gone` (crash, falta de memória): recarrega com backoff e registra o motivo |
| **Quando a internet cair** | esperar e recarregar | `net.isOnline()` + verificação leve a cada 10 s enquanto offline; ao voltar, recarrega só as contas que caíram |
| **Site fora do ar** | tentar de novo | `did-fail-load` / status ≥ 500 no quadro principal: backoff igual ao da queda e aviso |

- O vigia CDP **não altera nada** na página; só observa. Para gastar pouco: `Network.enable({ maxTotalBufferSize: 0, maxResourceBufferSize: 0, maxPostDataSize: 0 })` (não guarda corpo de nenhuma resposta), o main só atualiza um carimbo de "último dado" por conta (nada de log por quadro), e o vigia só é ligado nas contas com "Recarregar quando a conexão cair" ou "Avisar se ficar sem receber dados" ativos. Se ainda custar mais de 2% de CPU por conta na bancada, cair para `did-fail-load`/`render-process-gone` + `session.webRequest` e registrar no ADR.
- **Qual WebSocket conta:** o catálogo pode declarar `ws_principal` (padrão de URL). Sem isso, vale o WebSocket com mais quadros recebidos no primeiro minuto depois de carregar; WebSockets de chat, anúncios ou métricas não disparam recarga.
- **DevTools da conta:** ao abrir as DevTools de uma conta, o vigia se solta (`detach`) e volta ao fechar, para não brigar com o depurador; enquanto isso a conta mostra "vigia pausado".
- **O próprio HDeck:** se a interface cair (`render-process-gone` da janela principal), ela é recarregada sem fechar as contas. Se o processo principal morrer por erro não tratado, o erro vai para o log e o app se reabre (`app.relaunch()` + `app.exit()`), no máximo 3 vezes em 10 min, restaurando os grupos ligados.
- Recarga preserva a URL atual quando ela é do domínio do jogo; senão volta à URL cadastrada.

---

## 7. Visões, divisão de tela e ações em lote

### 7.1 Visões (por grupo, lembradas)
1. **Grade:** todas as contas do grupo lado a lado. Automática (1, 2, 3×2, 2×2, 3×3, 4×3, 4×4) ou escolhida.
2. **Principal + miniaturas:** uma conta grande, as outras em fotos numa faixa (direita ou embaixo). Clicar numa miniatura troca a principal.
3. **Foco:** uma conta ocupa tudo, as outras viram abas no topo (Ctrl+1…Ctrl+9, Ctrl+Tab).
4. **Painel:** cartões de todas as contas de todos os grupos: miniatura, estado, tempo online, quedas do dia, recargas, último dado recebido, RAM e CPU, lives ligadas; ordenar e filtrar; botões em lote; gráfico de RAM/CPU total das últimas 24 h e histórico de 30 dias. As miniaturas do Painel usam a última foto já existente e só capturam de novo, a cada 10 s, as dos cartões visíveis na rolagem (nada de capturar 30 contas fora da tela). Métricas vêm de `app.getAppMetrics()` a cada 5 s, ligadas à conta pelo `getOSProcessId()`; com o Painel fechado, a coleta cai para 1 vez por minuto (só para o histórico).

### 7.2 Modos de divisão de tela
Seletor na barra do grupo com prévia em miniatura: **1**, **2 lado a lado**, **2 empilhadas**, **1 grande + 2**, **1 grande + 3**, **2×2**, **3×2**, **3×3**, **4×4** e **Personalizada** (o usuário arrasta divisórias; o layout salvo vira `layout_json` do grupo). Cada espaço mostra uma conta escolhida (clicar no espaço e depois na conta, como no NarutoIdle) ou "Automático" (ordem do grupo). Proporção travada opcional (16:9) para jogos que quebram em tamanhos estranhos.

### 7.3 Conta solta e vários monitores
"Abrir em janela própria" no "⋯" da conta: move a view para uma `BrowserWindow` nova (sem recarregar), que lembra monitor, posição e tamanho. Fechar a janela devolve a conta ao grupo. Um grupo inteiro também pode abrir numa janela própria.

### 7.4 Ações em lote
Disponíveis no "⋯" do grupo, na seleção múltipla do Painel (Ctrl/Shift + clique) e na paleta de comandos (Ctrl+K): **Recarregar**, **Recarregar sem cache**, **Ligar / Desligar**, **Trocar para este grupo**, **Silenciar / Ativar som**, **Modo econômico liga/desliga**, **Política fora da tela**, **Zoom** (igualar), **Preencher login** em todas que pedirem, **Ligar / Desligar lives**, **Limpar cache**, **Tirar foto de todas** (salva PNGs numa pasta escolhida), **Mover para grupo**, **Duplicar configuração** (nova conta vazia com o mesmo jogo e ajustes, partição nova). Toda ação em lote é escalonada quando recarrega ou liga e mostra progresso.

### 7.5 Gerenciar contas e grupos
- Adicionar conta: escolher jogo do catálogo ou colar URL (o domínio sugere o jogo), nome, grupo, cor/ícone.
- Arrastar contas entre grupos e reordenar; renomear; cor do grupo; apagar conta (confirma e oferece "apagar também os dados de login" = apagar a pasta da partição com `session.clearStorageData` e remoção da pasta).
- Barra lateral com grupos (contagem, selo de avisos, botão ligar), recolhível.

---

## 8. Lives da Twitch e da Kick

Objetivo: ganhar os bônus que alguns jogos dão por assistir live com a conta vinculada. **Ninguém precisa ver as lives.**

### 8.1 Vínculo
- Cada conta pode ter várias lives (Twitch ou Kick + canal). O botão **Lives** aparece nas contas dos jogos que o catálogo marca com `bonus_live` (e em qualquer conta, se o usuário ligar "Mostrar Lives em todas as contas").
- A live abre **na partição da própria conta**: o login da Twitch/Kick feito ali é o da conta, e o vínculo OAuth que o jogo pede já usa esse login. O botão "Entrar na Twitch/Kick desta conta" abre a página de login visível uma vez.

### 8.2 Como a live roda sem aparecer
- Cada live é uma `BrowserWindow({ show: false, width: 480, height: 270, webPreferences: { offscreen: true, partition: <da conta>, sandbox: true, contextIsolation: true, backgroundThrottling: false } })`, com `setFrameRate(1)` no modo econômico das lives, muda (`setAudioMuted(true)`) e sem ouvir o evento `paint` (ninguém consome os quadros). Assim a página se considera visível, o vídeo toca e o custo de desenho é mínimo. **Não** desligar a aceleração por hardware do app para isso (os jogos precisam da GPU); o modo offscreen padrão (bitmap em memória) funciona com ela ligada.
- **Verificação obrigatória:** com uma live de teste, confirmar em 30 min que o player continua tocando (sem pausar) e que o tempo assistido conta (ex.: pontos do canal subindo na Twitch). Se offscreen não contar, plano B: `WebContentsView` comum numa janela auxiliar escondida 1×1 com `backgroundThrottling: false`. Resultado em `docs/MEDICOES.md`.
- **Anúncios das lives:** o HDeck não tem anúncios próprios, mas **não bloqueia** anúncios dos sites (Twitch/Kick ou jogos): bloquear pode quebrar a contagem do tempo assistido e o funcionamento dos jogos. Fica registrado como decisão revisável.
- **Ver uma live:** no menu Lives da conta, "Mostrar" abre a live numa janela pequena visível (nova página na mesma partição, com som opcional); fechar volta ao modo escondido.

### 8.3 Configurações (capturas)
| Configuração | Padrão | Comportamento |
|---|---|---|
| **Lives nas contas** | ligado | Liga o sistema; desligado fecha todas as lives |
| **Modo econômico das lives** | ligado | Lives que você não está vendo ficam na página offscreen pequena a 1 quadro/s |
| **Qualidade das lives** | 160p (menor consumo) | 160p, 360p, 480p, 720p, Automática. Vale para as que abrirem ou recarregarem a partir de agora; aplicada pelo adaptador da plataforma (preferência de qualidade do player) e conferida após carregar |
| **Lives por conta** | Sem limite | 1, 2, 3, 5, Sem limite. "Cada live usa de 400 MB a 1 GB de memória. Diminuir não fecha as que já estão abertas" |
| **Voltar sozinha ao canal cadastrado** | ligado | Se houver raid/host ou a página for para outro canal (`did-navigate`, `did-navigate-in-page`), volta ao canal cadastrado |
| **Desligar a live que encerrar** | ligado | Live encerrada sai da memória e fica na lista como "encerrada" |
| **Ligar de novo quando voltar ao vivo** | desligado | O app reabre a live de tempos em tempos para ver se o canal voltou; voltou, fica ligada; senão desliga de novo |
| **Conferir se a live voltou a cada** | 2 horas | 30 min, 1, 2, 4, 6 h (habilitado só com a opção acima) |

### 8.4 Adaptadores
`lives/adaptadores/twitch.ts` e `kick.ts` implementam a mesma interface: `urlDoCanal`, `aplicarQualidade`, `estaAoVivo`, `canalAtual(url)`, `precisaLogin`. A leitura da página é feita num **mundo isolado** (`executeJavaScriptInIsolatedWorld`), só leitura (elementos do player, `video.paused`, indicador "ao vivo"), sem clicar em nada. Os seletores ficam em `dados/lives-seletores.json` para correção rápida quando os sites mudarem, com teste de fumaça manual documentado.
Regra 3 vale aqui: o HDeck não clica em baús de pontos nem em nada da página.

---

## 9. Avisos, textos vigiados e Ping

### 9.1 Canais
- **Notificação do Windows** (`Notification`, com o nome e a cor da conta; clicar leva à conta).
- **Som** (3 sons sintetizados próprios + "escolher arquivo"; volume).
- **Selo na barra de tarefas** (`setOverlayIcon` com contador) e piscar a janela (opcional).
- **Discord:** URL de webhook + botão "Testar". Mensagem curta com conta, jogo, motivo e hora.
- **Telegram:** token do bot + chat id + "Testar".
- Envios saem direto do PC. A URL do webhook e o token do bot são cifrados só com `safeStorage` (não com a senha mestra), para os avisos funcionarem com o cofre trancado e o usuário longe. Falha de envio tenta de novo 3 vezes (5 s, 30 s, 2 min) e respeita o `429`/`retry_after` do Discord e do Telegram; limite próprio de 1 mensagem a cada 3 s por canal (o resto entra no agrupamento).

### 9.2 O que avisa (cada item liga/desliga por canal)
Conta caiu e não voltou depois das tentativas · ficou sem receber dados · texto vigiado apareceu · página travou ou fechou sozinha · site fora do ar · sem internet há mais de X min · memória passou do limite · live encerrou / voltou ao vivo · login pedido (a página do jogo mostra o formulário de login cadastrado no catálogo) · perto do limite de contas do jogo.
- **Agrupamento:** avisos iguais em sequência viram um só ("3 contas de Pokéidle caíram"). **Horário de silêncio** opcional (só registra, não toca nem notifica). Histórico na aba Avisos.

### 9.3 Textos vigiados
Lista de textos (ex.: "verificação", "captcha", "você foi desconectado"), sem diferenciar maiúsculas e acentos, com escopo todas/grupo/conta. Verificação no mundo isolado, só leitura: o main varre cada conta a cada 5 s (padrão; 2–60 s) com `executeJavaScriptInIsolatedWorld`, que percorre os nós de texto com `TreeWalker` (pulando `script`, `style`, `noscript` e elementos com `hidden`), normaliza (minúsculas, sem acento) e devolve só os textos cadastrados encontrados. Não usa `innerText` (força recálculo de layout em toda varredura). Para jogos 100% em canvas, o texto não existe no DOM: a tela de configuração avisa isso. Nada é injetado no mundo da página do jogo. Contas em foto também são varridas. Um mesmo texto na mesma conta avisa uma vez até sumir da tela.

### 9.4 Ping (latência dos jogos)
Para cada jogo com conta ligada, mede a cada 5 min (1–30) o tempo de uma requisição `HEAD` à URL inicial a partir do main (`net.fetch`), guarda em `ping`, mostra no Painel (ms atual, média 1 h, gráfico 24 h) e avisa se passar de um limite (padrão 1.000 ms ou erro 3 vezes seguidas). É leve e não usa as sessões das contas.

---

## 10. Logins salvos (cofre)

- Por conta: usuário/e-mail, senha e, se preciso, seletores dos campos (o catálogo traz os seletores de cada jogo conhecido; para outros, "Ensinar os campos": o usuário clica no campo de usuário e no de senha numa sobreposição).
- **Cifra:** cada segredo é cifrado com AES-256-GCM usando uma chave de dados; a chave de dados é protegida por `safeStorage` (DPAPI, ligada ao usuário do Windows). Com **senha mestra** ligada, a chave de dados também é envolvida por uma chave derivada com `scrypt` (N=2^17, r=8, p=1, sal aleatório); o cofre pede a senha ao abrir e **tranca sozinho** depois de X min (padrão 15). Sem a senha mestra não há recuperação (avisar claramente).
- **Preencher login:** botão na conta, no aviso "login pedido" e em lote. Preenche os campos no mundo isolado disparando os eventos `input`/`change` e **não envia** o formulário: o usuário confirma clicando em Entrar (regra 3).
- Senhas nunca aparecem em log, IPC de eventos, Painel ou backup sem cifra. Mostrar senha exige o cofre destrancado e um clique em "mostrar" por 10 s.

---

## 11. Segurança e privacidade

- **Fuses do Electron** no build: `RunAsNode` off, `EnableNodeOptionsEnvironmentVariable` off, `EnableNodeCliInspectArguments` off, `EnableCookieEncryption` on, `EnableEmbeddedAsarIntegrityValidation` on, `OnlyLoadAppFromAsar` on, `GrantFileProtocolExtraPrivileges` off.
- **Interface do app:** carregada de `app://` (protocolo próprio) ou arquivo local com **CSP estrita** (`default-src 'self'`; sem `unsafe-eval`; sem remoto). Navegação da janela principal bloqueada.
- **Permissões das páginas** (`setPermissionRequestHandler` e `setPermissionCheckHandler` por sessão): nega tudo por padrão; libera só `fullscreen`, `clipboard-sanitized-write` e `notifications` (essa só se o usuário ligar por conta). Câmera, microfone, geolocalização, MIDI, HID, serial, USB: sempre negados.
- **Pop-ups e abas novas** (`setWindowOpenHandler`): pop-ups de login (OAuth do Google, Discord, Twitch, Kick, carteiras) abrem numa janela filha **na mesma partição** e fecham sozinhos ao terminar; qualquer outro pop-up pede confirmação com o endereço visível; links externos podem ir para o navegador padrão (`shell.openExternal`) só com clique do usuário e só `https:`.
- **Downloads** (`will-download`): sempre pedem confirmação com nome, origem e tamanho; executáveis e instaladores (`.exe .msi .bat .cmd .ps1 .scr .vbs .js .jar .dll .lnk .appx .msix`) são **sempre bloqueados**.
- **Navegação:** `will-navigate` só permite `https:` (e `http:` em `localhost` para o jogo falso nos testes); esquemas `file:`, `javascript:` e de protocolos externos bloqueados.
- **Sem telemetria e sem relatório de erro remoto.** Erros ficam no log local; o usuário pode abrir a pasta de logs.
- **Atualizações:** só de releases assinadas (assinatura de código opcional; se não houver certificado, o `electron-updater` ainda confere o hash publicado, e o README explica o aviso do SmartScreen).
- **Backup:** "Exportar backup" gera um arquivo `.hdeck` (zip) com config, grupos, contas, textos vigiados e, se marcado, o cofre (sempre cifrado com uma senha de backup). "Incluir dados de login dos jogos (cookies)" copia as pastas das partições com o app parado, avisando que quem tiver o arquivo entra nas contas.
- **Instância única** (`requestSingleInstanceLock`).
- **Travas aplicadas no endurecimento central (4.2), sem exceção:** `will-attach-webview` sempre negado; `setWindowOpenHandler`, `will-navigate`, `will-redirect` e `will-frame-navigate` com a política acima; `setPermissionRequestHandler`/`setPermissionCheckHandler`/`setDevicePermissionHandler` em toda sessão nova; `session.setSpellCheckerEnabled(false)`; nenhuma página recebe preload além da interface.
- **Retorno das páginas é dado não confiável:** tudo que volta de `executeJavaScriptInIsolatedWorld` (textos, estado da live, campos de login) passa por Zod antes de chegar ao núcleo; tamanho limitado (ex.: no máximo 50 textos de 200 caracteres).
- **Login com Google em app embutido:** o Google costuma recusar login em navegadores embutidos ("este navegador pode não ser seguro"). O HDeck não tenta contornar isso (seria disfarce, regra 3). O UA sem o token `Electron` resolve parte dos casos; quando não resolver, a conta mostra a mensagem "O Google não deixa entrar por aqui. Use login por e-mail/senha do jogo ou entre por outro método que o jogo ofereça" e o caso fica no `docs/TESTE-MANUAL.md`.

---

## 12. Interface e design

### 12.1 Direção visual (a partir das capturas)
Tema **escuro** sóbrio, cartões em camadas, roxo como cor de destaque, tipografia de sistema, bordas suaves. Nada de brilho, gradiente chamativo ou animação gratuita. Tema claro e "seguir o sistema" disponíveis.

Tokens (`renderer/estilos/tokens.css`, valores iniciais tirados das capturas; ajustar contraste AA):
```css
--fundo-app:#0f1117;  --fundo-painel:#161a24;  --fundo-cartao:#1c2130;  --fundo-cartao-hover:#222838;
--borda:#2a3042;      --texto:#e8eaf0;         --texto-2:#9aa1b2;       --texto-3:#6b7285;
--destaque:#7c6cf0;   --destaque-forte:#6a58e8; --perigo:#e5534b;       --aviso:#d9a23b;  --ok:#3fb27f;
--raio-s:6px; --raio-m:10px; --raio-l:14px; --esp:4px (múltiplos de 4);
--fonte:"Segoe UI Variable","Segoe UI",system-ui,sans-serif; tamanhos 12/13/14/16/20.
```

### 12.2 Janela principal
- **Barra de título própria** (frameless com `titleBarOverlay` para os botões do Windows): logo HDeck, grupo atual, seletor de visão/divisão, botões Modo econômico, Recarregar grupo, Som, Painel, Configurações, contador de RAM/CPU total.
- **Barra lateral:** grupos com cor, contagem de contas ligadas/total, selo de avisos, botão ligar/desligar e "⋯".
- **Área central:** a visão do grupo. Cada espaço de conta tem uma **moldura fina** com faixa de 24 px: cor da conta, nome, selo de estado, ícones de live/som e "⋯". A conta ativa tem a borda em `--destaque`.
- **Paleta de comandos** (Ctrl+K): ir para conta, ações em lote, abrir configuração.
- **Bandeja:** ícone com menu (Mostrar, Modo econômico, Silenciar tudo, Pausar avisos 1 h, Sair) e selo de avisos.

### 12.3 Configurações (modal com busca, como nas capturas)
Coluna esquerda com campo **Buscar configuração** (busca em título, descrição e palavras-chave, destacando o resultado) e as seções:
1. **Geral:** iniciar com o Windows, abrir minimizado na bandeja, fechar o X vai para a bandeja, restaurar ao abrir, abrir contas aos poucos, impedir o PC de dormir, idioma, tema, confirmar ao sair, atalhos (lista editável).
2. **Contas e jogos:** *Se a conta cair*, *Economia* (modo econômico, contas fora da tela [aponta para o "⋯" de cada grupo, como na captura], atualizar a foto a cada), *Otimização* (Seção 5.5), *Lives da Twitch e da Kick* (Seção 8.3), *Som* (Som dos jogos: Todas / Só a conta ativa / Nenhuma — "Conta ativa = a última em que você clicou"), *Jogos* (catálogo editável).
3. **Avisos:** canais, o que avisa, textos vigiados, horário de silêncio, histórico.
4. **Logins salvos:** cofre, senha mestra, trancar após.
5. **Ping:** intervalo, limite de aviso.
6. **Conta e versão:** versão, verificar atualização, canal (estável/teste), novidades, exportar/importar backup, pasta de dados. (Sem conta online.)
7. **Avançado:** aceleração por hardware (vale ao reiniciar), abrir DevTools de uma conta, limpar cache de todas, abrir pasta de logs, redefinir tudo. Não existe troca de user agent por conta (seria disfarce, regra 3).

Padrão de linha: título em `--texto` 14 px semibold, descrição em `--texto-2` 12–13 px abaixo, controle à direita (interruptor roxo, select escuro). Seções com rótulo em caixa alta pequeno (`SE A CONTA CAIR`). Linhas dependentes ficam esmaecidas quando a principal está desligada (como "Conferir se a live voltou a cada"). Toda mudança salva na hora e vale sem reiniciar, salvo as marcadas "vale ao reiniciar".

### 12.4 Acessibilidade e atalhos
Contraste AA, foco visível, tudo navegável por teclado. Atalhos padrão (editáveis, em `dados/atalhos.ts`, interceptados também dentro das páginas via `before-input-event`): Ctrl+1…9 (conta), Ctrl+Tab / Ctrl+Shift+Tab, F5 (recarregar conta), Ctrl+Shift+R (recarregar grupo), Ctrl+M (som da conta), Ctrl+E (modo econômico), Ctrl+K (paleta), Ctrl+, (configurações), F11 (tela cheia da conta), Ctrl+L (preencher login), Ctrl+Alt+1…9 (grupo).

---

## 13. Metas de desempenho (critérios de aceite, medidos por `pnpm bancada` em notebook médio: 4 núcleos, 16 GB)

| Medida | Meta |
|---|---|
| Interface do HDeck parada (sem contas) | ≤ 150 MB de RAM total, ≤ 1% de CPU |
| Custo extra do HDeck por conta (além da própria página) | ≤ 15 MB e ≤ 0,3% de CPU |
| 30 contas do jogo falso ligadas, 9 visíveis em modo econômico | sem travar a interface (quadros da interface ≥ 55 fps ao rolar a barra lateral) |
| Modo econômico vs ao vivo (9 contas em grade) | CPU ≤ 40% do ao vivo |
| Timers com janela minimizada/na bandeja/coberta por 15 min | ≥ 95% dos ticks esperados (Seção 5.2) |
| Live offscreen a 160p | ≤ 3% de CPU por live; sem pausar em 30 min |
| Abrir o app até a interface utilizável | ≤ 2 s (contas carregam depois, aos poucos) |
| Recarga após queda detectada | começa em ≤ 1 s após o tempo de espera configurado |
| Vigia de rede (CDP) por conta | ≤ 2% de CPU extra |

Resultados reais vão para `docs/MEDICOES.md` com data, máquina e versão. Se uma meta não fechar, documentar a causa e o melhor valor obtido, sem esconder.

---

## 14. Empacotamento, atualização e operação

- `pnpm dist` gera `HDeck-Setup-<versão>.exe` (NSIS, instala por usuário em `%LOCALAPPDATA%\Programs\HDeck`, atalho no menu Iniciar, desinstalador que pergunta se apaga os dados em `%APPDATA%\HDeck`).
- **Atualização automática** via electron-updater a partir de GitHub Releases do repositório (canal estável e teste); baixa em segundo plano, aplica ao fechar ou com "Reiniciar agora". Nunca reinicia sozinho com contas ligadas.
- **Iniciar com o Windows:** `app.setLoginItemSettings` com argumento `--bandeja`.
- **Versão** no padrão `AAAA.M.D` + número de build; CHANGELOG.md mantido.
- **Pasta de dados:** `%APPDATA%\HDeck\` com `config.json`, `hdeck.db`, `Partitions/` (do Chromium), `logs/`. Botão "Mover pasta de dados" fica fora do escopo.

---

## 15. Qualidade e estrutura de testes

### 15.1 Pirâmide (o que testa o quê)
| Camada | Pasta | Ferramenta | Roda onde | O que cobre | Tempo-alvo |
|---|---|---|---|---|---|
| **Unidade** | `tests/unidade/` | Vitest (Node 24) | todo commit | todo o `src/main/nucleo/` e `src/shared/`: máquina de estados, backoff, agendas, layouts e divisões, regras de aviso e agrupamento, silêncio, limites de contas, comparação de textos vigiados, política fora da tela, migrações de config, contrato IPC | < 10 s |
| **Propriedades** | junto da unidade | fast-check | todo commit | layouts (nenhum espaço se sobrepõe, todos cabem na área, qualquer tamanho de janela); máquina de estados (nenhuma sequência de eventos leva a estado inválido ou a duas recargas simultâneas); agendador (nunca recarrega duas contas do mesmo grupo no mesmo intervalo escalonado); agrupamento de avisos (nenhum aviso some) | < 20 s |
| **Integração** | `tests/integracao/` | Vitest | todo commit | adaptadores Node reais: `armazem-sqlite` (migrações sobem e descem, WAL, retenção de 30 dias), `config-arquivo` (escrita atômica sobrevive a interrupção simulada, arquivo corrompido → volta ao backup), `cofre` com `safeStorage` falso (ida e volta, senha errada, adulteração detectada pelo GCM, tranca por tempo), `discord`/`telegram` contra servidor HTTP local (repetição, 429) | < 30 s |
| **Componentes** | `tests/componentes/` | Vitest + @testing-library/svelte + happy-dom | todo commit | linhas de configuração (interruptor, select, dependentes esmaecidas), busca das configurações, cartão da conta com cada estado, seletor de divisão, foco por teclado | < 20 s |
| **Segurança** | `tests/seguranca/` | Playwright `_electron` + `@electron/fuses` | todo commit | toda página criada tem `sandbox`, `contextIsolation`, sem `nodeIntegration` e sem preload (exceto a interface); `will-attach-webview` negado; permissões negadas; navegação para `file:`/`javascript:` bloqueada; `.exe` bloqueado; IPC de remetente estranho recusado; fuses lidos do executável empacotado com os valores da Seção 11 | < 2 min |
| **E2E** | `tests/e2e/` | Playwright `_electron` + jogo falso e live falsa | todo commit (CI) | fluxos da Seção 15.2 | < 10 min |
| **Bancada** | `tools/bancada/` | script próprio | antes da entrega e de cada major do Electron | metas da Seção 13 | 15–30 min |
| **Teste manual** | `docs/TESTE-MANUAL.md` | roteiro | antes da entrega | o que depende de sites reais e não dá para automatizar: login de verdade em 2 jogos (ex.: pokeidle.io e o NarutoIdle local), Twitch e Kick reais (qualidade 160p, raid, live encerrada, tempo assistido contando), login Google, suspensão real do PC, dois monitores com escalas diferentes | ~1 h |

Regras dos testes:
- O núcleo usa o `Relogio` falso (`tests/falsos/`), então 45 s, 2 h e 30 dias passam na hora; **nenhum teste de unidade dorme**.
- Cobertura mínima (v8): **90% de linhas e ramos em `src/main/nucleo/` e `src/shared/`**; adaptadores e interface não têm meta de número (são cobertos por E2E). O CI falha abaixo disso.
- `pnpm regras` (`tools/regras/`): lê os `RN-xxx` ativos do `docs/REGRAS.md` e procura cada um nos testes; falha se faltar ou sobrar. Gera `docs/rastreio.md` (RN → testes).
- Teste instável não é tolerado: falhou uma vez sem motivo, conserta a causa (normalmente espera por tempo em vez de espera por evento).
- E2E espera por **evento/estado**, nunca por `sleep` fixo (exceto o próprio teste de 2 min minimizado).

### 15.2 Fluxos E2E
1. adicionar 2 contas do mesmo jogo falso, fazer login em cada uma e confirmar que os cookies não se misturam, inclusive depois de reiniciar o app;
2. minimizar 2 min, mandar para a bandeja e cobrir com outra janela: os ticks seguem (a versão de 15 min roda na bancada);
3. derrubar o WS → recarrega após o tempo configurado; derrubar sempre → para após as tentativas e avisa; WS secundário caindo não recarrega;
4. parar de mandar dados → aviso "sem dados";
5. travar a página → recarga por travamento; matar o processo da conta → recarga com motivo registrado;
6. texto vigiado aparece → aviso uma vez; some e volta → avisa de novo;
7. modo econômico: conta não ativa vira foto e os ticks continuam; clicar volta ao vivo; abrir Configurações troca as views por fotos e fechar devolve;
8. trocar para grupo B desliga o A (processos fechados, memória liberada) e abre B aos poucos;
9. divisões 2×2, 1+3 e personalizada posicionam as views nos retângulos certos; redimensionar a janela reposiciona;
10. conta solta em janela própria e de volta, sem recarregar a página (o contador de ticks não zera);
11. download `.exe` bloqueado; pop-up de OAuth falso abre na mesma partição e fecha ao terminar; pop-up comum pede confirmação;
12. cofre: salvar, trancar, destrancar, preencher sem enviar (o formulário falso confere que não houve submit); avisos do Discord falso chegam com o cofre trancado;
13. live falsa: abre muda e offscreen, volta ao canal após "raid", desliga quando encerra, religa quando volta (com relógio acelerado por variável de teste);
14. Configurações: buscar "live" encontra as opções; mudar uma opção vale na hora e persiste após reiniciar;
15. otimização programada: com intervalo de teste curto, recarrega escalonado e nunca a conta em uso;
16. queda da interface (matar o renderer da janela principal) → interface volta e as contas não recarregam;
17. exportar backup e importar numa pasta de dados vazia: grupos, contas, textos e cofre voltam.

### 15.3 Outros
- **CI:** `pnpm verificar` = lint → typecheck → `pnpm regras` → unidade + propriedades + integração + componentes (com cobertura) → segurança → E2E; build do instalador nos pushes da `main`; artefatos de falha do Playwright (vídeo, trace) anexados.
- **ADRs** em `docs/decisoes/` para toda decisão relevante (no mínimo: 0001 Electron, 0002 flags e estrangulamento, 0003 fotos, 0004 lives offscreen, 0005 vigia CDP, 0006 cofre, 0007 node:sqlite, 0008 distribuição, 0009 núcleo puro e portas, 0010 sem bloqueio de anúncios dos sites).
- **`docs/REGRAS.md`:** livro de regras de negócio (regra 11). Ler antes de cada mudança; seguir a lista "Antes de entregar" que está no fim dele.

---

## 16. Protocolo de trabalho do assistente (entrega única)

1. **Início:** leia este documento e o `estrutura/REGRAS.md` inteiros, faça um plano curto (ordem de construção, riscos) e faça **no máximo 3 perguntas bloqueantes**. Sem resposta, assuma o padrão mais sensato, registre num ADR e siga. Não pare para pedir aprovação de etapas.
2. **Ordem de construção interna** (é só ordem de trabalho, não fases de aprovação; cada passo deixa o CI verde e se apoia no anterior):
   1. **Fundação:** copiar `estrutura/REGRAS.md` para `docs/REGRAS.md`; pnpm, TypeScript, electron-vite, Svelte, Biome (com a proibição de `electron` no núcleo), Vitest, fast-check, Playwright, `pnpm regras`, CI; contrato IPC; portas e falsos; config; SQLite; jogo falso e live falsa; endurecimento central (4.2) **desde o primeiro dia**.
   2. **Provas técnicas** (os riscos do produto), cada uma com teste automatizado que fica no repositório: rodar escondido (5.2), foto com view destacada (5.4), live offscreen (8.2), custo do CDP (6). Registre resultado e plano escolhido em ADR antes de construir em cima.
   3. **Núcleo** completo com testes (estados, gerenciador, grupos, saúde, economia, avisos, layout, lives, ping, painel).
   4. **Adaptadores** ligando o núcleo ao Electron: contas, partições, vigia, fotos, janelas, energia, cofre, armazém.
   5. **Interface:** visões, divisões, conta solta, fotos atrás de diálogos, Configurações com busca, Painel, paleta, bandeja.
   6. **Lives, avisos (todos os canais), textos vigiados, Ping, cofre e preencher login.**
   7. **Entrega:** backup, atualização, instalador com fuses, testes de segurança no executável empacotado, bancada, `docs/MEDICOES.md`, `docs/TESTE-MANUAL.md` executado, README.
3. **Durante:** código completo e executável (sem `TODO` sem dono, sem trechos omitidos, sem código morto: `knip` limpo), testes junto com o código, commits pequenos com mensagens claras em pt-BR (`tipo: descrição`, ex.: `feat(saude): recarga por queda do WebSocket`), na `main`.
4. **Entrega final, nesta ordem:**
   (a) resumo do que foi feito; (b) como rodar, testar e gerar o instalador (comandos exatos); (c) resultado dos testes, da cobertura, do `pnpm regras` e de `docs/MEDICOES.md`; (d) o que ficou de fora e por quê; (e) riscos e dívidas técnicas (principalmente o que depende dos sites da Twitch, da Kick e dos jogos mudarem); (f) "Sugestões" (opcional).
5. **Nada que a dona trouxe** (textos, marca, ícone, desenhos) sai ou é trocado sem pedido expresso dela.

---

## 17. Critérios de aceite da entrega única

- `pnpm verificar` verde no CI (lint, typecheck, regras, cobertura ≥ 90% no núcleo, unidade, integração, componentes, segurança, E2E) e instalador gerado que instala, abre, atualiza e desinstala no Windows 11 e no Windows 10 22H2.
- Toda RN ativa do `docs/REGRAS.md` implementada e com teste (`docs/rastreio.md` completo).
- Todas as configurações das capturas existem, com os mesmos padrões, funcionam e persistem (Seções 6, 5.4, 8.3, 12.3).
- Isolamento comprovado (E2E 1) e contas que não param escondidas (E2E 2 + bancada).
- Metas da Seção 13 cumpridas ou com desvio documentado e justificado em `docs/MEDICOES.md`.
- Nenhuma conexão de rede fora das listadas na regra 1 (conferido numa sessão de 10 min sem contas, com o log de rede do próprio app).
- `docs/TESTE-MANUAL.md` executado, com o resultado de cada item.
- README com instalação, uso, atalhos, onde ficam os dados, como fazer backup e como atualizar o Electron.

---

## 18. Riscos conhecidos e resposta já decidida

| Risco | Chance | Resposta |
|---|---|---|
| Uma combinação (minimizado/bandeja/coberto) ainda estrangular timers | média | Prova técnica no passo 2; plano B da 5.2; documentar em MEDICOES |
| `capturePage` não funcionar com a view destacada | média | Plano B da 5.4 (`beginFrameSubscription` ou view anexada fora da área visível) |
| Twitch/Kick não contarem o tempo em página offscreen | média | Plano B da 8.2 |
| Sites da Twitch, da Kick ou dos jogos mudarem o HTML | alta, com o tempo | Seletores em `dados/lives-seletores.json` e catálogo em `dados/jogos.json`, corrigíveis sem mexer em código; roteiro manual |
| Google recusar login no app | alta | Mensagem clara (Seção 11); sem contorno |
| Jogo detectar várias contas no mesmo IP | depende do jogo | Fora do escopo (regra 9); o app só mostra o limite declarado no catálogo |
| Memória total alta com muitas contas | certa (cada página de jogo é um Chromium) | Grupos desligados = zero memória; recarga por limite de memória; foto; lives 160p offscreen; `Lives por conta` |
| SmartScreen avisar no instalador sem assinatura | alta | README explica; assinatura de código (ex.: Azure Trusted Signing) fica como sugestão |
| Electron sair de suporte | certa a cada ~6 meses | Política de atualização da Seção 3 + Renovate |

---

## 19. Conferência dos requisitos da dona

| Requisito | Onde está resolvido |
|---|---|
| Navegador especializado em jogos de navegador | 1, 4, 5 |
| Cada aba com seu link e cookies/dados isolados | regra 2, 5.1, E2E 1 |
| Eficiência entre abas, pouca RAM | 5.2–5.6, 7.1 (Painel), 13, bancada |
| Otimização por intervalos de tempo (RAM e CPU) | 5.5 |
| Configurações das capturas | 6, 5.4, 8.3, 12.3 (mesmos textos de função e padrões) |
| Grupos configuráveis, gerenciar quais contas em cada grupo | 5.6, 7.5 |
| Modos de divisão de tela | 7.2, 7.3 |
| Ações em lote | 7.4 |
| Conta ligada a Twitch e Kick para bônus de live | 8.1 |
| Lives sem precisar aparecer | 8.2 |
| Segurança | regras 1–4, 10, 11 |
| Sem anúncios | regra 1 (o app não tem anúncio nem telemetria; ver 8.2 sobre anúncios dos sites) |
| Regras de negócio num arquivo próprio | regra 11, `docs/REGRAS.md` |
| Testes | 15 |
| Manutenção | 3 (política de versões, Renovate), 4.1 (núcleo/adaptadores), dados fora da lógica, ADRs |

---

## Anexo · Fontes
- idledeck.com.br (página inicial, perguntas frequentes, segurança), idledeck.com.br/guias e /guias/aba-em-segundo-plano, página do IdleDeck na Microsoft Store: consultadas em 26/11/2026, sem conta e sem área logada. A tecnologia interna do IdleDeck não é divulgada; tudo o que está aqui sobre implementação é decisão do HDeck.
- Capturas de tela das Configurações do IdleDeck (Contas e jogos: Se a conta cair, Economia, Lives da Twitch e da Kick, Som) enviadas pela dona.
- releases.electronjs.org e endoflife.date/electron: Electron 45 estável (Chromium 156, Node 24) em nov/2026.

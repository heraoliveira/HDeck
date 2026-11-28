# HDeck · Livro de regras de negócio

> Fonte única do que o HDeck **faz**. O prompt-mestre (`estrutura/prompt-hdeck-v2.md`) diz **como** construir.
> Na fundação, este arquivo é copiado para `docs/REGRAS.md`, e a partir daí só aquele vale.

## Como usar este arquivo

- Cada regra tem um código **RN-xxx** que nunca muda nem é reaproveitado. Regra que deixa de valer fica marcada **[revogada em AAAA-MM-DD, motivo]**, sem ser apagada.
- Toda regra ativa tem pelo menos um teste que cita o código (`// RN-012` ou no nome do teste). `pnpm regras` confere isso no CI.
- Regra nova ou alterada pela dona entra aqui **no mesmo commit** do código, com a origem.
- Em conflito sobre comportamento, vale este arquivo; em conflito sobre segurança, vale a Seção 0 do prompt-mestre.
- Valores entre parênteses são os **padrões**; os ajustáveis aparecem nas Configurações.
- Origem: **D** = pedido da dona · **R** = observado na referência (IdleDeck) e adotado · **P** = decisão de projeto (revisável pela dona).

## Glossário

**Conta:** uma página de um jogo com sessão própria. **Grupo:** conjunto ordenado de contas. **Ligada:** carregada na memória. **Ativa:** a última conta em que o usuário clicou. **Visível:** aparece em algum espaço da tela. **Foto:** captura da conta mostrada no lugar dela. **Live:** página de um canal da Twitch ou da Kick ligada a uma conta. **Jogo do catálogo:** jogo com ajustes conhecidos em `dados/jogos.json`.

---

## 1. Princípios

- **RN-001** O HDeck não joga pelo usuário: não clica, não digita, não usa macro, não resolve captcha ou verificação humana, não envia formulários. (D/R)
- **RN-002** O HDeck não usa proxy, VPN, nem disfarça o navegador; todas as contas saem pelo IP do usuário. O navegador das contas se apresenta como o Edge comum, sem a marca "WebView2" (RN-154). (R; alterada D 2026-11-27)
- **RN-003** O HDeck não tem anúncios, telemetria, analytics nem conta online. (D)
- **RN-004** O HDeck só se conecta a: sites dos jogos abertos, Twitch/Kick com live ligada, Discord/Telegram se configurados, e o servidor de atualização. (P)
- **RN-005** O HDeck não bloqueia nem altera anúncios ou conteúdo dos sites dos jogos e das lives. (P)
- **RN-006** Toda frase da interface é pt-BR simples e direta. (D)
- **RN-007** Todos os painéis, menus, diálogos e o HUD seguem a estilização do app (tema do HFinance, tokens de `estilos/tokens.css`); nada de menu nativo do sistema dentro do app (a bandeja do Windows é a exceção). Clicar ou passar o mouse num controle da interface devolve o teclado que ficou na página de uma conta: nenhum campo deixa de aceitar texto e nenhum botão pede dois cliques. (D, 2026-11-27)
- **RN-008** À direita fica o painel da conta selecionada, que recolhe e expande como o dos grupos: estado, Início, Recarregar, Som, Destacar, lives, consumo de RAM e CPU da última hora, Otimizar (com o horário do automático) e o histórico da conta; Foco, Desligar e Mais no rodapé. Recolhido, mostra o avatar e tudo o que está no painel, na mesma ordem: cada botão e um ícone para cada bloco (clicar abre o painel nele); a barra dos grupos recolhida mostra as contas de cada grupo, na cor dele, com clique e botão direito. Totalmente personalizável: cada bloco (botões, lives, consumo, Otimizar, histórico, endereço, zoom, fora da tela, notas) e cada botão sai, volta e muda de lugar. (D, 2026-11-27; personalização 2026-11-28)

## 2. Contas

- **RN-010** Cada conta tem sessão isolada e persistente: cookies, armazenamento, cache e login não são compartilhados com nenhuma outra conta. (D)
- **RN-011** A sessão de uma conta sobrevive a fechar o app, reiniciar o PC e atualizar o HDeck. (D)
- **RN-012** Uma conta pertence a exatamente um grupo e a um jogo (do catálogo ou criado pelo usuário). (P)
- **RN-013** Ao adicionar uma conta por URL, o domínio sugere o jogo do catálogo; o usuário pode trocar. (P)
- **RN-014** Uma conta tem: nome, cor, ícone, grupo, ordem, URL, zoom, som ligado/desligado, política fora da tela, lives, notas. (P)
- **RN-015** Apagar uma conta pede confirmação; "apagar também os dados de login" apaga a sessão dela do disco. Sem essa opção, só a conta some da lista e a sessão é apagada também (não existe sessão órfã). (P)
- **RN-016** "Duplicar configuração" cria conta nova com o mesmo jogo e ajustes e **sessão nova e vazia**. (P)
- **RN-017** Uma conta está sempre em um destes estados: desligada, carregando, ativa, econômica, escondida, caída, recarregando, travada, com aviso, erro. O estado aparece no cartão da conta. (P)
- **RN-018** A conta fica no link em que está: recarregar, otimizar, reabrir o app ou religar a conta voltam ao último link do jogo (o endereço cadastrado só vale na primeira vez, no "Início" e depois de limpar os dados). Um link de outro domínio (login de terceiros) não conta. (P; alterada D 2026-11-27)
- **RN-019** Conta solta em janela própria continua a mesma página, sem recarregar; fechar a janela devolve a conta ao grupo. A janela lembra monitor, posição e tamanho. (R)

## 3. Grupos

- **RN-030** Grupo ligado = contas carregadas; grupo desligado = nenhuma conta dele na memória. Grupo novo já vem ligado. (R; alterada D 2026-11-27)
- **RN-031** "Trocar para este grupo" desliga todos os outros grupos e liga este. (R)
- **RN-032** Ligar contas (abrir o app, ligar grupo, trocar grupo, voltar da suspensão) é escalonado: uma conta a cada N s (3 s). (P)
- **RN-033** Ao abrir o app, restaura os grupos que estavam ligados (opções: todos, nenhum). (P)
- **RN-034** Antes de ligar contas, se o total de contas ligadas de um jogo passar do limite que o catálogo declara para ele, o app avisa e pede confirmação; não impede. (R)
- **RN-035** Cada grupo lembra a sua visão e o seu modo de divisão. (P)
- **RN-036** Contas podem ser arrastadas entre grupos e reordenadas; a barra lateral mostra cada grupo expansível com as contas dele. Mudar a ordem dentro do grupo não pede confirmação. (D, alterada 2026-11-27)
- **RN-037** Cada grupo tem um endereço padrão: a conta nova do grupo começa nele, e o usuário pode trocar. Adicionar conta não pede para escolher jogo; o jogo sai do endereço. (D, 2026-11-27)
- **RN-038** Arrastar (ou mover) uma conta para outro grupo pede confirmação. (D, 2026-11-27)

## 4. Visões e divisão de tela

- **RN-040** Visões: Grade, Principal + miniaturas, Foco (abas) e Painel. (R)
- **RN-041** Divisões: 1, 2 lado a lado, 2 empilhadas, 1+2, 1+3, 2×2, 3×2, 3×3, 4×4 e Personalizada. Cada espaço mostra uma conta escolhida ou "Automático" (ordem do grupo). (D) Diferenças de 1–2 px (arredondamento da escala do Windows) não mudam o tamanho da conta, para o jogo não tremer (D, 2026-11-28).
- **RN-042** Espaços nunca se sobrepõem e sempre cabem na área disponível, em qualquer tamanho de janela. (P)
- **RN-043** A conta ativa tem a borda destacada. Clicar numa conta a torna ativa. (R)
- **RN-044** Ao abrir um diálogo por cima das contas, elas aparecem como foto e continuam rodando; ao fechar, voltam ao vivo. (P)
- **RN-045** Painel: estado, tempo online, quedas do dia, recargas, último dado recebido, RAM, CPU e lives de cada conta, de todos os grupos; histórico de 30 dias. RAM e CPU são medidas como no Gerenciador de Tarefas (memória privada; CPU em % do PC inteiro), somando os processos da conta, e atualizam a cada 2 s. Clicar no consumo da barra de título mostra quanto cada parte usa: cada grupo, a interface, o desenho das contas (GPU) e a base do navegador. (R; alterada D 2026-11-27 e 2026-11-28)

## 5. Rodar escondido e economia

- **RN-050** Conta com política "Manter farmando" roda a 100% (timers, animações e rede) com a janela minimizada, na bandeja, coberta, ou com a conta fora da tela. (D/R)
- **RN-051** A política fora da tela é por jogo, no menu "⋯" do grupo: "Economizar" (padrão) ou "Manter farmando"; a conta pode ter exceção própria. A conta começa em "Seguir o grupo". "Economizar": a conta que não está ao vivo (foto ou fora da tela) para de desenhar e acorda só para cada foto; timers e rede seguem a 100%. "Manter farmando": continua desenhando, para jogos que param quando a página fica oculta. (R; alterada D 2026-11-27, CPU)
- **RN-052** Com o **Modo econômico** ligado (ligado), toda conta visível que não é a ativa aparece como foto atualizada a cada N s (5 s; opções 1, 2, 5, 10, 30 s) e continua farmando normalmente. Com "Economizar", ela só desenha na hora da foto (RN-051). A foto mostra a tela inteira da conta, reduzida e na proporção certa (a página é desenhada no tamanho do espaço grande da janela), em todas as divisões. (R; alterada D 2026-11-28)
- **RN-053** Clicar numa conta em foto a põe ao vivo e a torna ativa. Opcional: voltar a ser foto após X sem mexer (desligado; 30 s, 1 min, 5 min). (R/P)
- **RN-054** Fotos não são capturadas para contas cujo espaço não está na tela. (P)
- **RN-055** Com contas ligadas, o PC é impedido de dormir (ligado); a tela pode apagar. (P)
- **RN-056** Otimização programada (cada item desligado por padrão, global ou por grupo):
  - recarregar contas a cada 2, 4, 6, 12 ou 24 h;
  - recarregar a conta cuja memória passar de 1; 1,5; 2 ou 3 GB;
  - limpar o cache de arquivos das contas a cada 1 ou 7 dias (nunca cookies, armazenamento ou login). (D)
- **RN-058** **Otimizar** reabre a conta num processo novo (o login continua) e solta a memória que o jogo acumulou. Manual (painel do grupo, da conta e ações em lote) e sozinho só se a dona ligar, **por conta** (contas do mesmo grupo podem ter regras diferentes): desligado (padrão), por tempo (30 min, 1, 2, 4 h) ou quando a página passa de X MB de RAM (300 MB a 2 GB). Uma conta por vez e nunca a conta em uso. Otimizar à mão ou pelo grupo zera o relógio da conta. (D, alterada 2026-11-28)
- **RN-057** Recargas programadas são uma conta por vez, com 20 s entre elas, e nunca recarregam a conta ativa usada nos últimos 60 s (ela fica para o fim da fila). (P)

## 6. Saúde: quedas e recargas

- **RN-060** **Recarregar sozinho quando a conexão cair** (ligado): se a conexão principal do jogo cair e não voltar em 45 s (15–300 s), a conta recarrega. (R)
- **RN-061** Recargas por queda seguem a espera 45 s → 2 min → 5 min → 15 min; após 4 falhas seguidas, param e o usuário é avisado. Um carregamento bem-sucedido zera a contagem. (P)
- **RN-062** A conexão principal é a declarada no catálogo; sem declaração, é a que mais recebeu dados no primeiro minuto. Quedas de outras conexões (chat, anúncios) não recarregam. (P)
- **RN-063** **Recarregar ao voltar da suspensão** (ligado): ao acordar o PC, espera a internet e recarrega as contas ligadas, escalonado. (R)
- **RN-064** **Avisar se ficar sem receber dados** (Nunca; 1, 2, 5, 10, 30 min): só para jogos que mandam dados o tempo todo; o padrão de cada jogo vem do catálogo. (R)
- **RN-065** Página travada por mais de 30 s recarrega (ligado). (R)
- **RN-066** Página que fechar sozinha (erro, falta de memória) recarrega com a mesma espera da RN-061, e o motivo fica no histórico. (R)
- **RN-067** Sem internet: o app espera, confere a cada 10 s e, quando volta, recarrega só as contas que caíram. (R)
- **RN-068** Site fora do ar (falha ao carregar ou erro do servidor): mesma espera da RN-061 e aviso. (R)
- **RN-069** Toda queda, recarga, travamento e volta fica registrada no histórico da conta. (R)
- **RN-070** Se a interface do HDeck cair, ela volta sozinha sem recarregar as contas. Se o app fechar por erro, reabre sozinho (até 3 vezes em 10 min) e restaura os grupos ligados. (P)

## 7. Lives da Twitch e da Kick

- **RN-080** Uma conta pode ter várias lives (Twitch ou Kick + canal). O botão "Lives" aparece nas contas dos jogos marcados no catálogo como "dá bônus por live", ou em todas se o usuário ligar a opção. A janela de lives mostra as lives com filtro por conta (Twitch e Kick, ligar/desligar tudo, abrir por link ou nome). Depois que a conta entra na Twitch ou na Kick, o "Conectar" daquela plataforma some (vira um selo de conectada). Selecionar uma live mostra a live com o chat dentro dessa janela, sem som até a dona ligar. Live clicada no jogo abre a janela já nela (nova ou existente); a janela abre do tamanho em que foi fechada; o botão de ligar/desligar da lista desliga de verdade (player escondido e o da janela). RAM e CPU das lives entram na conta e aparecem por live no painel da conta. Um link de live da Twitch ou da Kick clicado no jogo vira live daquela conta e abre nessa janela. O painel direito mostra as lives ligadas da conta. (R; alterada D 2026-11-28)
- **RN-081** A live usa a sessão da própria conta: o login na Twitch/Kick é por conta e serve também ao vínculo feito dentro do jogo. (P)
- **RN-082** **Lives nas contas** (ligado): liga o sistema; desligado fecha todas as lives. (R)
- **RN-083** As lives tocam sem som e não aparecem na tela. "Mostrar" abre a live numa janela pequena; fechar volta ao modo escondido. (D/R)
- **RN-084** **Modo econômico das lives** (ligado): a live escondida desenha no mínimo possível (1 quadro/s). (R)
- **RN-085** **Qualidade das lives** (160p; opções 160p, 360p, 480p, 720p, Automática): vale para as lives que abrirem ou recarregarem depois da mudança. (R)
- **RN-086** **Lives por conta** (Sem limite; 1, 2, 3, 5): diminuir não fecha as já abertas, só impede abrir novas além do limite. (R)
- **RN-087** **Voltar sozinha ao canal cadastrado** (ligado): se a página for para outro canal (raid, host, clique), volta ao canal cadastrado. (R)
- **RN-088** **Desligar a live que encerrar** (ligado): a live encerrada sai da memória e fica na lista como "encerrada". (R)
- **RN-089** **Ligar de novo quando voltar ao vivo** (desligado), conferindo a cada (2 h; 30 min, 1, 2, 4, 6 h): o app reabre a live para ver se voltou; voltou, fica ligada; senão, desliga de novo. A opção "conferir a cada" só fica ativa com esta ligada. (R)
- **RN-090** O HDeck não clica em nada da live (baús, botões, anúncios). (D)
- **RN-091** Se a live pedir login, a conta mostra "Entre na Twitch/Kick desta conta" e avisa. (P)
- **RN-092** Nenhuma janela fica aberta escondida: a live desligada (ou de conta desligada) fecha o player; live escondida não abre pop-up; pop-ups e logins de uma conta fecham com ela; ao sair do HDeck não sobra motor nem navegador. Um zelador confere a cada 30 s e fecha qualquer janela escondida que não seja da interface nem de uma live ligada. (D, 2026-11-28)

## 8. Som

- **RN-100** **Som dos jogos** (Todas; Só a conta ativa; Nenhuma). "Conta ativa" = a última em que o usuário clicou. O som próprio da conta (ligado/desligado) vale por cima. (R)
- **RN-101** Lives são sempre mudas, exceto quando "Mostrar" é usado e o usuário liga o som. (P)

## 9. Avisos

- **RN-110** Canais: notificação do Windows, som, selo na barra de tarefas (contador), Discord (webhook) e Telegram (bot). Cada um liga/desliga; Discord e Telegram têm botão "Testar". (R)
- **RN-111** O que avisa (cada item liga/desliga por canal): conta caiu e não voltou; sem dados; texto vigiado; página travou ou fechou; site fora do ar; sem internet há mais de X min (5); memória acima do limite; live encerrou/voltou; login pedido; perto do limite de contas. Ping lento ou com erro é um item próprio. Por padrão só avisa o que acontece no jogo ou é importante; ping, memória, lives e limite de contas ficam só no histórico até a dona ligar. (R/P; alterada D 2026-11-27)
- **RN-112** Avisos iguais seguidos viram um só ("3 contas de X caíram"). Nenhum aviso é perdido: todos ficam no histórico. Abrir o painel de avisos marca todos como lidos. (P; alterada D 2026-11-28)
- **RN-113** Horário de silêncio (desligado): avisos só vão para o histórico, sem som e sem notificação. (P)
- **RN-114** Avisos para Discord e Telegram funcionam mesmo com o cofre trancado. (P)
- **RN-115** Discord/Telegram: até 3 novas tentativas (5 s, 30 s, 2 min), respeitando o "espere" dos serviços, e no máximo 1 mensagem a cada 3 s por canal. (P)
- **RN-116** Clicar na notificação leva à conta. (R)

## 10. Textos vigiados

- **RN-120** O usuário cadastra textos; se algum aparecer na tela de uma conta, o app avisa. O app só lê, não interage. (R)
- **RN-121** A comparação ignora maiúsculas e acentos. Escopo de cada texto: todas as contas, um grupo ou uma conta. (P)
- **RN-122** A varredura é a cada 5 s (2–60 s) e inclui contas em foto ou fora da tela. (P)
- **RN-123** O mesmo texto na mesma conta avisa uma vez; avisa de novo só depois de sumir e voltar. (P)
- **RN-124** Em jogos desenhados só em canvas o texto não pode ser lido; a configuração avisa isso. (P)

## 11. Ping

- **RN-130** Para cada jogo com conta ligada, o app mede a cada 5 min (1–30) o tempo de resposta do site, mostra no Painel (atual, média 1 h, gráfico 24 h) e avisa acima de 1.000 ms ou com 3 erros seguidos. (P)

## 12. Logins salvos (cofre)

- **RN-140** Por conta: usuário/e-mail e senha, guardados só no PC, cifrados e ligados ao usuário do Windows. (R)
- **RN-141** Senha mestra opcional; com ela, o cofre pede a senha ao abrir e tranca sozinho após 15 min sem uso. Sem a senha mestra não há recuperação, e o app avisa isso ao criar. (R/P)
- **RN-142** "Preencher login" só preenche os campos; nunca envia o formulário. (R)
- **RN-143** Senhas nunca aparecem em log, Painel, histórico ou backup sem cifra. Mostrar uma senha exige cofre destrancado e dura 10 s. (P)

## 13. Segurança e privacidade

- **RN-150** Downloads sempre pedem confirmação com nome, origem e tamanho; executáveis e instaladores são sempre bloqueados. (R)
- **RN-151** Pop-ups de login (Google, Discord, Twitch, Kick, carteiras) abrem na sessão da conta e fecham ao terminar; outros pop-ups e abas novas pedem confirmação mostrando o endereço. (R)
- **RN-152** Câmera, microfone, localização e acesso a dispositivos são sempre negados às páginas; notificações das páginas só se o usuário ligar na conta. (P)
- **RN-153** Páginas só navegam em `https:` (e `http:` em localhost). (P)
- **RN-154** Login com Google funciona dentro do app: **regra: todo login (contas, pop-ups, Twitch e Kick das lives) abre no motor do Edge**, nunca numa janela do Electron; as contas se apresentam como o Microsoft Edge comum da mesma versão desde a primeira navegação (sem a marca "WebView2" nas client hints; nas páginas de login do Google também sem o objeto `chrome.webview`). O login da Twitch/Kick feito lá é copiado para a sessão das lives da conta, porque o Google bloqueia navegadores embutidos. Se mesmo assim o Google recusar, a conta mostra a orientação de usar outro método de login do jogo. (D, alterada 2026-11-27)

## 14. Backup e dados

- **RN-160** Exportar backup gera um arquivo com configurações, grupos, contas e textos vigiados; o cofre entra só cifrado com uma senha de backup. (P)
- **RN-161** "Incluir dados de login dos jogos" copia as sessões; o app avisa que quem tiver o arquivo entra nas contas e desliga as contas durante a cópia. (P)
- **RN-162** Importar backup numa instalação nova restaura tudo o que foi exportado. (P)
- **RN-163** Histórico de métricas e eventos: 30 dias; depois de 48 h as métricas ficam agrupadas por hora. (P)

## 15. Geral e atualização

- **RN-170** Iniciar com o Windows (desligado), abrindo na bandeja. (R/P)
- **RN-171** Fechar no X manda para a bandeja (ligado); sair de verdade pelo menu da bandeja, com confirmação se houver contas ligadas. (P)
- **RN-172** Só uma cópia do app abre; abrir de novo traz a janela existente. (P)
- **RN-173** Atualizações baixam sozinhas e são aplicadas ao fechar ou em "Reiniciar agora"; o app nunca reinicia sozinho com contas ligadas. (P)
- **RN-174** Toda configuração vale na hora, salvo as marcadas "vale ao reiniciar". (P)
- **RN-175** A busca das Configurações encontra pelo título, pela descrição e por palavras-chave. (R)
- **RN-176** Atalhos padrão: Ctrl+1…9 (conta), Ctrl+Tab (próxima), F5 (recarregar conta), Ctrl+Shift+R (recarregar grupo), Ctrl+M (som da conta), Ctrl+E (modo econômico), Ctrl+K (paleta), Ctrl+, (configurações), F11 (tela cheia da conta), Ctrl+L (preencher login), Ctrl+Alt+1…9 (grupo). Todos editáveis; valem também com o foco dentro de uma conta. Trocar de conta pelo teclado já deixa a conta pronta para jogar (o teclado vai para ela, sem clique). (R/P; alterada D 2026-11-28)

## 16. Ações em lote

- **RN-180** Disponíveis por grupo, por seleção no Painel e na paleta: recarregar, recarregar sem cache, ligar/desligar, trocar para este grupo, silenciar/ativar som, modo econômico, política fora da tela, igualar zoom, preencher login, ligar/desligar lives, limpar cache, tirar foto de todas, mover para grupo. (D)
- **RN-181** Ações em lote que carregam páginas seguem o escalonamento da RN-032 e mostram o progresso. (P)

---

## Antes de entregar (lista do assistente)

- [ ] Toda mudança de comportamento tem RN nova ou alterada aqui, no mesmo commit.
- [ ] `pnpm verificar` verde (inclui `pnpm regras`).
- [ ] Nenhuma frase de interface fora de `i18n/pt-BR.json`; textos simples (RN-006).
- [ ] Nenhuma conexão de rede nova fora da RN-004 (ou ADR aprovando).
- [ ] Nenhuma página criada sem passar pelo endurecimento central.
- [ ] Nada que a dona trouxe foi trocado ou removido sem pedido.
- [ ] MEDICOES.md atualizado se a mudança mexe em desempenho.

## Histórico
- 2026-11-28 · v6 · pedidos da dona: RN-092 nova (nada aberto escondido); RN-154 (todo login no motor do Edge) e RN-008 (painéis recolhidos) alteradas.
- 2026-11-28 · v5 · pedidos da dona: RN-008 (personalizável), RN-045 (detalhamento), RN-051 (conta segue o grupo), RN-052 (5 s, foto proporcional), RN-058 (Otimizar sozinho por conta, por tempo ou RAM), RN-080 (janela de lives e links), RN-112 (avisos lidos ao abrir) e RN-176 (trocar de conta já foca) alteradas.
- 2026-11-27 · v4 · pedidos da dona: RN-030 (grupo novo ligado), RN-051/052 (Economizar padrão, foto não desenha entre fotos), RN-111 (avisos discretos), RN-154 e RN-002 (identidade Edge desde o início) e RN-007 (teclado volta à interface) alteradas.
- 2026-11-27 · v3 · pedidos da dona: RN-008 nova (painel direito); RN-018 (fica no link atual), RN-058 (nada recarrega sozinho sem ela ligar) e RN-154 (Google vê o Edge comum) alteradas; RN-045 (RAM e CPU como no Gerenciador de Tarefas) alterada.
- 2026-11-27 · v2 · pedidos da dona: RN-007, RN-037, RN-038, RN-058 novas; RN-002, RN-036 e RN-154 alteradas.

- 2026-11-26 · v1 · criação a partir do prompt-mestre v2 (RN-001 a RN-181).

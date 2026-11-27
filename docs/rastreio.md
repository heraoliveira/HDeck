# Rastreio RN → testes

> Gerado por `pnpm regras`. Não editar à mão.

Regras ativas: 101 · com teste: 101

| RN | Regra | Testes |
|---|---|---|
| RN-001 | O HDeck não joga pelo usuário: não clica, não digita, não usa macro, não resolve captcha o… | tests/unidade/geral.test.ts |
| RN-002 | O HDeck não usa proxy, VPN, nem disfarça o navegador; todas as contas saem pelo IP do usuá… | tests/unidade/geral.test.ts<br>tests/unidade/rodada2.test.ts<br>tests/unidade/seguranca-politicas.test.ts |
| RN-003 | O HDeck não tem anúncios, telemetria, analytics nem conta online. (D)… | tests/seguranca/seguranca.spec.ts<br>tests/unidade/geral.test.ts |
| RN-004 | O HDeck só se conecta a: sites dos jogos abertos, Twitch/Kick com live ligada, Discord/Tel… | tests/seguranca/seguranca.spec.ts<br>tests/unidade/shared.test.ts |
| RN-005 | O HDeck não bloqueia nem altera anúncios ou conteúdo dos sites dos jogos e das lives. (P)… | tests/seguranca/seguranca.spec.ts |
| RN-006 | Toda frase da interface é pt-BR simples e direta. (D)… | tests/unidade/shared.test.ts |
| RN-007 | Todos os painéis, menus, diálogos e o HUD seguem a estilização do app (tema do HFinance, t… | tests/componentes/interface.test.ts<br>tests/e2e/paineis.spec.ts<br>tests/unidade/rodada2.test.ts |
| RN-010 | Cada conta tem sessão isolada e persistente: cookies, armazenamento, cache e login não são… | tests/e2e/contas.spec.ts |
| RN-011 | A sessão de uma conta sobrevive a fechar o app, reiniciar o PC e atualizar o HDeck. (D)… | tests/e2e/contas.spec.ts<br>tests/integracao/adaptadores-node.test.ts |
| RN-012 | Uma conta pertence a exatamente um grupo e a um jogo (do catálogo ou criado pelo usuário).… | tests/unidade/contas.test.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/shared.test.ts |
| RN-013 | Ao adicionar uma conta por URL, o domínio sugere o jogo do catálogo; o usuário pode trocar… | tests/unidade/contas.test.ts<br>tests/unidade/motor-casos.test.ts |
| RN-014 | Uma conta tem: nome, cor, ícone, grupo, ordem, URL, zoom, som ligado/desligado, política f… | tests/unidade/contas.test.ts<br>tests/unidade/motor-casos.test.ts |
| RN-015 | Apagar uma conta pede confirmação; "apagar também os dados de login" apaga a sessão dela d… | tests/integracao/adaptadores-node.test.ts<br>tests/unidade/motor.test.ts |
| RN-016 | "Duplicar configuração" cria conta nova com o mesmo jogo e ajustes e **sessão nova e vazia… | tests/unidade/contas.test.ts<br>tests/unidade/motor-casos.test.ts<br>tests/unidade/motor.test.ts |
| RN-017 | Uma conta está sempre em um destes estados: desligada, carregando, ativa, econômica, escon… | tests/componentes/interface.test.ts<br>tests/unidade/estado.test.ts<br>tests/unidade/motor.test.ts |
| RN-018 | Recarregar mantém a URL atual se ela for do domínio do jogo; senão volta à URL cadastrada.… | tests/unidade/contas.test.ts<br>tests/unidade/motor.test.ts |
| RN-019 | Conta solta em janela própria continua a mesma página, sem recarregar; fechar a janela dev… | tests/e2e/contas.spec.ts<br>tests/unidade/motor-casos.test.ts<br>tests/unidade/motor.test.ts |
| RN-030 | Grupo ligado = contas carregadas; grupo desligado = nenhuma conta dele na memória. (R)… | tests/unidade/motor.test.ts |
| RN-031 | "Trocar para este grupo" desliga todos os outros grupos e liga este. (R)… | tests/e2e/contas.spec.ts<br>tests/unidade/fila-grupos.test.ts<br>tests/unidade/motor-casos.test.ts<br>tests/unidade/motor.test.ts |
| RN-032 | Ligar contas (abrir o app, ligar grupo, trocar grupo, voltar da suspensão) é escalonado: u… | tests/e2e/contas.spec.ts<br>tests/unidade/fila-grupos.test.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/shared.test.ts |
| RN-033 | Ao abrir o app, restaura os grupos que estavam ligados (opções: todos, nenhum). (P)… | tests/unidade/fila-grupos.test.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/shared.test.ts |
| RN-034 | Antes de ligar contas, se o total de contas ligadas de um jogo passar do limite que o catá… | tests/unidade/fila-grupos.test.ts<br>tests/unidade/motor.test.ts |
| RN-035 | Cada grupo lembra a sua visão e o seu modo de divisão. (P)… | tests/unidade/motor.test.ts |
| RN-036 | Contas podem ser arrastadas entre grupos e reordenadas; a barra lateral mostra cada grupo … | tests/componentes/interface.test.ts<br>tests/unidade/contas.test.ts<br>tests/unidade/fila-grupos.test.ts<br>tests/unidade/motor-casos.test.ts<br>tests/unidade/motor.test.ts |
| RN-037 | Cada grupo tem um endereço padrão: a conta nova do grupo começa nele, e o usuário pode tro… | tests/componentes/interface.test.ts<br>tests/e2e/paineis.spec.ts<br>tests/unidade/rodada2.test.ts |
| RN-038 | Arrastar (ou mover) uma conta para outro grupo pede confirmação. (D, 2026-11-27)… | tests/componentes/interface.test.ts<br>tests/e2e/paineis.spec.ts |
| RN-040 | Visões: Grade, Principal + miniaturas, Foco (abas) e Painel. (R)… | tests/e2e/fumaca.spec.ts<br>tests/unidade/layout.test.ts |
| RN-041 | Divisões: 1, 2 lado a lado, 2 empilhadas, 1+2, 1+3, 2×2, 3×2, 3×3, 4×4 e Personalizada. Ca… | tests/componentes/interface.test.ts<br>tests/e2e/contas.spec.ts<br>tests/unidade/layout.test.ts |
| RN-042 | Espaços nunca se sobrepõem e sempre cabem na área disponível, em qualquer tamanho de janel… | tests/e2e/contas.spec.ts<br>tests/unidade/layout.test.ts |
| RN-043 | A conta ativa tem a borda destacada. Clicar numa conta a torna ativa. (R)… | tests/componentes/interface.test.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/rodada2.test.ts |
| RN-044 | Ao abrir um diálogo por cima das contas, elas aparecem como foto e continuam rodando; ao f… | tests/e2e/contas.spec.ts<br>tests/unidade/motor.test.ts |
| RN-045 | Painel: estado, tempo online, quedas do dia, recargas, último dado recebido, RAM, CPU e li… | tests/unidade/motor-casos.test.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/ping-painel-cofre.test.ts |
| RN-050 | Conta com política "Manter farmando" roda a 100% (timers, animações e rede) com a janela m… | tests/e2e/contas.spec.ts<br>tests/provas/provas.spec.ts<br>tests/unidade/economia.test.ts<br>tests/unidade/motor.test.ts |
| RN-051 | A política fora da tela é por jogo, no menu "⋯" do grupo: "Manter farmando" (padrão) ou "E… | tests/unidade/economia.test.ts<br>tests/unidade/motor.test.ts |
| RN-052 | Com o **Modo econômico** ligado (ligado), toda conta visível que não é a ativa aparece com… | tests/e2e/contas.spec.ts<br>tests/provas/provas.spec.ts<br>tests/unidade/economia.test.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/shared.test.ts |
| RN-053 | Clicar numa conta em foto a põe ao vivo e a torna ativa. Opcional: voltar a ser foto após … | tests/componentes/interface.test.ts<br>tests/e2e/contas.spec.ts<br>tests/unidade/economia.test.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/shared.test.ts |
| RN-054 | Fotos não são capturadas para contas cujo espaço não está na tela. (P)… | tests/unidade/economia.test.ts<br>tests/unidade/motor.test.ts |
| RN-055 | Com contas ligadas, o PC é impedido de dormir (ligado); a tela pode apagar. (P)… | tests/unidade/motor.test.ts<br>tests/unidade/shared.test.ts |
| RN-056 | Otimização programada (cada item desligado por padrão, global ou por grupo):… | tests/e2e/saude.spec.ts<br>tests/unidade/economia.test.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/shared.test.ts |
| RN-058 | **Otimizar** reabre a conta num processo novo (o login continua) e solta a memória que o j… | tests/componentes/interface.test.ts<br>tests/e2e/paineis.spec.ts<br>tests/unidade/rodada2.test.ts<br>tests/unidade/shared.test.ts |
| RN-057 | Recargas programadas são uma conta por vez, com 20 s entre elas, e nunca recarregam a cont… | tests/e2e/saude.spec.ts<br>tests/unidade/economia.test.ts<br>tests/unidade/fila-grupos.test.ts |
| RN-060 | **Recarregar sozinho quando a conexão cair** (ligado): se a conexão principal do jogo cair… | tests/e2e/saude.spec.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/saude.test.ts<br>tests/unidade/shared.test.ts |
| RN-061 | Recargas por queda seguem a espera 45 s → 2 min → 5 min → 15 min; após 4 falhas seguidas, … | tests/e2e/saude.spec.ts<br>tests/unidade/motor-casos.test.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/saude.test.ts |
| RN-062 | A conexão principal é a declarada no catálogo; sem declaração, é a que mais recebeu dados … | tests/e2e/saude.spec.ts<br>tests/unidade/saude.test.ts |
| RN-063 | **Recarregar ao voltar da suspensão** (ligado): ao acordar o PC, espera a internet e recar… | tests/unidade/motor-casos.test.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/shared.test.ts |
| RN-064 | **Avisar se ficar sem receber dados** (Nunca; 1, 2, 5, 10, 30 min): só para jogos que mand… | tests/e2e/saude.spec.ts<br>tests/unidade/motor-casos.test.ts<br>tests/unidade/saude.test.ts<br>tests/unidade/shared.test.ts |
| RN-065 | Página travada por mais de 30 s recarrega (ligado). (R)… | tests/e2e/saude.spec.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/saude.test.ts<br>tests/unidade/shared.test.ts |
| RN-066 | Página que fechar sozinha (erro, falta de memória) recarrega com a mesma espera da RN-061,… | tests/e2e/saude.spec.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/saude.test.ts<br>tests/unidade/shared.test.ts |
| RN-067 | Sem internet: o app espera, confere a cada 10 s e, quando volta, recarrega só as contas qu… | tests/unidade/motor.test.ts<br>tests/unidade/saude.test.ts |
| RN-068 | Site fora do ar (falha ao carregar ou erro do servidor): mesma espera da RN-061 e aviso. (… | tests/unidade/motor.test.ts<br>tests/unidade/saude.test.ts |
| RN-069 | Toda queda, recarga, travamento e volta fica registrada no histórico da conta. (R)… | tests/unidade/motor.test.ts<br>tests/unidade/saude.test.ts |
| RN-070 | Se a interface do HDeck cair, ela volta sozinha sem recarregar as contas. Se o app fechar … | tests/e2e/contas.spec.ts<br>tests/unidade/ping-painel-cofre.test.ts |
| RN-080 | Uma conta pode ter várias lives (Twitch ou Kick + canal). O botão "Lives" aparece nas cont… | tests/unidade/lives.test.ts<br>tests/unidade/motor.test.ts |
| RN-081 | A live usa a sessão da própria conta: o login na Twitch/Kick é por conta e serve também ao… | tests/e2e/recursos.spec.ts<br>tests/unidade/lives.test.ts |
| RN-082 | **Lives nas contas** (ligado): liga o sistema; desligado fecha todas as lives. (R)… | tests/unidade/lives.test.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/shared.test.ts |
| RN-083 | As lives tocam sem som e não aparecem na tela. "Mostrar" abre a live numa janela pequena; … | tests/e2e/recursos.spec.ts<br>tests/provas/provas.spec.ts<br>tests/unidade/lives.test.ts<br>tests/unidade/motor.test.ts |
| RN-084 | **Modo econômico das lives** (ligado): a live escondida desenha no mínimo possível (1 quad… | tests/provas/provas.spec.ts<br>tests/unidade/lives.test.ts<br>tests/unidade/shared.test.ts |
| RN-085 | **Qualidade das lives** (160p; opções 160p, 360p, 480p, 720p, Automática): vale para as li… | tests/unidade/lives.test.ts<br>tests/unidade/shared.test.ts |
| RN-086 | **Lives por conta** (Sem limite; 1, 2, 3, 5): diminuir não fecha as já abertas, só impede … | tests/unidade/lives.test.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/shared.test.ts |
| RN-087 | **Voltar sozinha ao canal cadastrado** (ligado): se a página for para outro canal (raid, h… | tests/e2e/recursos.spec.ts<br>tests/unidade/lives.test.ts<br>tests/unidade/shared.test.ts |
| RN-088 | **Desligar a live que encerrar** (ligado): a live encerrada sai da memória e fica na lista… | tests/e2e/recursos.spec.ts<br>tests/unidade/lives.test.ts<br>tests/unidade/motor-casos.test.ts<br>tests/unidade/shared.test.ts |
| RN-089 | **Ligar de novo quando voltar ao vivo** (desligado), conferindo a cada (2 h; 30 min, 1, 2,… | tests/componentes/interface.test.ts<br>tests/e2e/recursos.spec.ts<br>tests/unidade/lives.test.ts<br>tests/unidade/motor-casos.test.ts<br>tests/unidade/shared.test.ts |
| RN-090 | O HDeck não clica em nada da live (baús, botões, anúncios). (D)… | tests/unidade/lives.test.ts |
| RN-091 | Se a live pedir login, a conta mostra "Entre na Twitch/Kick desta conta" e avisa. (P)… | tests/unidade/lives.test.ts<br>tests/unidade/motor-casos.test.ts<br>tests/unidade/motor.test.ts |
| RN-100 | **Som dos jogos** (Todas; Só a conta ativa; Nenhuma). "Conta ativa" = a última em que o us… | tests/unidade/economia.test.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/shared.test.ts |
| RN-101 | Lives são sempre mudas, exceto quando "Mostrar" é usado e o usuário liga o som. (P)… | tests/unidade/lives.test.ts |
| RN-110 | Canais: notificação do Windows, som, selo na barra de tarefas (contador), Discord (webhook… | tests/unidade/avisos.test.ts |
| RN-111 | O que avisa (cada item liga/desliga por canal): conta caiu e não voltou; sem dados; texto … | tests/unidade/avisos.test.ts<br>tests/unidade/motor.test.ts |
| RN-112 | Avisos iguais seguidos viram um só ("3 contas de X caíram"). Nenhum aviso é perdido: todos… | tests/unidade/avisos.test.ts<br>tests/unidade/motor.test.ts |
| RN-113 | Horário de silêncio (desligado): avisos só vão para o histórico, sem som e sem notificação… | tests/unidade/avisos.test.ts<br>tests/unidade/shared.test.ts |
| RN-114 | Avisos para Discord e Telegram funcionam mesmo com o cofre trancado. (P)… | tests/e2e/recursos.spec.ts<br>tests/integracao/adaptadores-node.test.ts<br>tests/unidade/motor-casos.test.ts<br>tests/unidade/motor.test.ts |
| RN-115 | Discord/Telegram: até 3 novas tentativas (5 s, 30 s, 2 min), respeitando o "espere" dos se… | tests/integracao/adaptadores-node.test.ts<br>tests/unidade/avisos.test.ts |
| RN-116 | Clicar na notificação leva à conta. (R)… | tests/unidade/avisos.test.ts |
| RN-120 | O usuário cadastra textos; se algum aparecer na tela de uma conta, o app avisa. O app só l… | tests/e2e/saude.spec.ts<br>tests/unidade/avisos.test.ts<br>tests/unidade/motor.test.ts |
| RN-121 | A comparação ignora maiúsculas e acentos. Escopo de cada texto: todas as contas, um grupo … | tests/unidade/avisos.test.ts |
| RN-122 | A varredura é a cada 5 s (2–60 s) e inclui contas em foto ou fora da tela. (P)… | tests/unidade/avisos.test.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/shared.test.ts |
| RN-123 | O mesmo texto na mesma conta avisa uma vez; avisa de novo só depois de sumir e voltar. (P)… | tests/e2e/saude.spec.ts<br>tests/unidade/avisos.test.ts<br>tests/unidade/motor.test.ts |
| RN-124 | Em jogos desenhados só em canvas o texto não pode ser lido; a configuração avisa isso. (P)… | tests/componentes/interface.test.ts |
| RN-130 | Para cada jogo com conta ligada, o app mede a cada 5 min (1–30) o tempo de resposta do sit… | tests/unidade/motor-casos.test.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/ping-painel-cofre.test.ts<br>tests/unidade/shared.test.ts |
| RN-140 | Por conta: usuário/e-mail e senha, guardados só no PC, cifrados e ligados ao usuário do Wi… | tests/e2e/recursos.spec.ts<br>tests/integracao/adaptadores-node.test.ts |
| RN-141 | Senha mestra opcional; com ela, o cofre pede a senha ao abrir e tranca sozinho após 15 min… | tests/e2e/recursos.spec.ts<br>tests/integracao/adaptadores-node.test.ts<br>tests/unidade/ping-painel-cofre.test.ts<br>tests/unidade/shared.test.ts |
| RN-142 | "Preencher login" só preenche os campos; nunca envia o formulário. (R)… | tests/e2e/recursos.spec.ts<br>tests/unidade/motor-casos.test.ts<br>tests/unidade/motor.test.ts |
| RN-143 | Senhas nunca aparecem em log, Painel, histórico ou backup sem cifra. Mostrar uma senha exi… | tests/unidade/motor.test.ts<br>tests/unidade/ping-painel-cofre.test.ts |
| RN-150 | Downloads sempre pedem confirmação com nome, origem e tamanho; executáveis e instaladores … | tests/e2e/recursos.spec.ts<br>tests/unidade/seguranca-politicas.test.ts |
| RN-151 | Pop-ups de login (Google, Discord, Twitch, Kick, carteiras) abrem na sessão da conta e fec… | tests/e2e/recursos.spec.ts<br>tests/unidade/seguranca-politicas.test.ts |
| RN-152 | Câmera, microfone, localização e acesso a dispositivos são sempre negados às páginas; noti… | tests/seguranca/seguranca.spec.ts<br>tests/unidade/seguranca-politicas.test.ts |
| RN-153 | Páginas só navegam em `https:` (e `http:` em localhost). (P)… | tests/seguranca/seguranca.spec.ts<br>tests/unidade/seguranca-politicas.test.ts<br>tests/unidade/shared.test.ts |
| RN-154 | Login com Google funciona dentro do app: só nas páginas de login do Google o HDeck se apre… | tests/unidade/geral.test.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/rodada2.test.ts<br>tests/unidade/seguranca-politicas.test.ts |
| RN-160 | Exportar backup gera um arquivo com configurações, grupos, contas e textos vigiados; o cof… | tests/e2e/recursos.spec.ts<br>tests/integracao/adaptadores-node.test.ts |
| RN-161 | "Incluir dados de login dos jogos" copia as sessões; o app avisa que quem tiver o arquivo … | tests/integracao/adaptadores-node.test.ts |
| RN-162 | Importar backup numa instalação nova restaura tudo o que foi exportado. (P)… | tests/e2e/recursos.spec.ts<br>tests/integracao/adaptadores-node.test.ts |
| RN-163 | Histórico de métricas e eventos: 30 dias; depois de 48 h as métricas ficam agrupadas por h… | tests/integracao/adaptadores-node.test.ts<br>tests/unidade/motor-casos.test.ts<br>tests/unidade/ping-painel-cofre.test.ts |
| RN-170 | Iniciar com o Windows (desligado), abrindo na bandeja. (R/P)… | tests/unidade/geral.test.ts<br>tests/unidade/shared.test.ts |
| RN-171 | Fechar no X manda para a bandeja (ligado); sair de verdade pelo menu da bandeja, com confi… | tests/unidade/geral.test.ts<br>tests/unidade/shared.test.ts |
| RN-172 | Só uma cópia do app abre; abrir de novo traz a janela existente. (P)… | tests/seguranca/seguranca.spec.ts |
| RN-173 | Atualizações baixam sozinhas e são aplicadas ao fechar ou em "Reiniciar agora"; o app nunc… | tests/integracao/atualizador.test.ts |
| RN-174 | Toda configuração vale na hora, salvo as marcadas "vale ao reiniciar". (P)… | tests/componentes/interface.test.ts<br>tests/e2e/recursos.spec.ts<br>tests/integracao/adaptadores-node.test.ts<br>tests/unidade/motor-casos.test.ts<br>tests/unidade/motor.test.ts<br>tests/unidade/shared.test.ts |
| RN-175 | A busca das Configurações encontra pelo título, pela descrição e por palavras-chave. (R)… | tests/componentes/interface.test.ts<br>tests/e2e/recursos.spec.ts<br>tests/unidade/shared.test.ts |
| RN-176 | Atalhos padrão: Ctrl+1…9 (conta), Ctrl+Tab (próxima), F5 (recarregar conta), Ctrl+Shift+R … | tests/componentes/interface.test.ts<br>tests/unidade/shared.test.ts |
| RN-180 | Disponíveis por grupo, por seleção no Painel e na paleta: recarregar, recarregar sem cache… | tests/unidade/motor-casos.test.ts<br>tests/unidade/motor.test.ts |
| RN-181 | Ações em lote que carregam páginas seguem o escalonamento da RN-032 e mostram o progresso.… | tests/unidade/fila-grupos.test.ts<br>tests/unidade/motor.test.ts |

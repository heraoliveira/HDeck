# Teste manual

Roteiro do que depende de sites reais, contas reais ou do hardware e não dá para automatizar (Seção 15.1). Tempo: ~1 h.
Preencha **Resultado** com ✅, ❌ (e o que aconteceu) ou ⏳ (não feito).

Execução de 2026-11-26 (assistente, no PC da dona, sem contas reais): os itens que não precisam de login foram conferidos; os que precisam das contas da dona ficaram ⏳ para ela.

| # | Item | Como | Resultado |
|---|---|---|---|
| 1 | Instalador no Windows 11 | `dist\HDeck-Setup-<versão>.exe`; instala sem admin, atalho no menu Iniciar, abre | ⏳ dona (o executável empacotado abriu a interface em teste automático: `tests/seguranca`) |
| 2 | Instalador no Windows 10 22H2 | Mesmo do item 1 numa máquina Windows 10 | ⏳ dona |
| 3 | Desinstalar | Pergunta se apaga os dados; "Não" mantém `%APPDATA%\HDeck` | ⏳ dona |
| 4 | Atualização | Publicar uma versão maior no GitHub Releases; o app baixa e mostra "Reiniciar agora"; com contas ligadas não reinicia sozinho | ⏳ dona (comportamento coberto por `tests/integracao/atualizador.test.ts`) |
| 5 | Login real em pokeidle.io | Adicionar 2 contas, entrar com logins diferentes, fechar e abrir o app: cada uma continua com o seu | ⏳ dona |
| 6 | Login real no NarutoIdle (local) | Mesmo do item 5 | ⏳ dona |
| 7 | Twitch: qualidade 160p | Ligar uma live; "Mostrar" e conferir no player que está em 160p | ⏳ dona |
| 8 | Twitch: tempo assistido conta | Deixar 30 min escondida; os pontos do canal sobem | ⏳ dona (com a live falsa: 60/60 s contados, ADR 0004) |
| 9 | Twitch: raid | Num canal que faz raid, a live volta ao canal cadastrado | ⏳ dona |
| 10 | Twitch: live encerrada e volta | Live encerra → sai da memória como "encerrada"; com "Ligar de novo", volta quando o canal entra ao vivo | ⏳ dona |
| 11 | Kick: itens 7 a 10 | Mesmo roteiro na Kick (os seletores da Kick em `dados/lives-seletores.json` ainda não foram conferidos num canal real) | ⏳ dona |
| 12 | Login com Google | Num jogo com "Entrar com Google": se o Google recusar, a conta mostra a orientação de usar outro método | ⏳ dona |
| 13 | Suspensão real do PC | Ligar contas, suspender, acordar: recarregam aos poucos depois que a internet volta | ⏳ dona |
| 14 | Dois monitores com escalas diferentes | Conta solta no segundo monitor (125%/150%); fechar e abrir o app: a janela volta no mesmo lugar | ⏳ dona |
| 15 | Notificação do Windows | Configurações → Avisos → testar; clicar leva à conta | ⏳ dona |
| 16 | Discord e Telegram reais | Colar o webhook / token + chat id, "Testar" chega | ⏳ dona (servidor falso: ok nos testes) |
| 17 | Sem internet | Desligar o Wi-Fi 6 min: aviso "Sem internet"; ao voltar, só as contas que caíram recarregam | ⏳ dona |
| 18 | Bandeja | Fechar no X → bandeja; menu: Mostrar, Modo econômico, Silenciar, Pausar avisos 1 h, Sair (confirma com contas ligadas) | ⏳ dona |
| 19 | Iniciar com o Windows | Ligar a opção e "Abrir na bandeja"; reiniciar o PC: abre só na bandeja | ⏳ dona |
| 20 | Memória com a conta logada | Uma conta do pokeidle logada por 2 h: anotar a RAM no Painel antes e depois de "Otimizar" | ⏳ dona |
| 21 | Login com Google (correção) | "Entrar com Google" no jogo: a tela de "navegador não seguro" não aparece mais | ⏳ dona |
| 22 | Cloudflare "sou humano" (motor WebView2) | Abrir o pokeidle numa conta e fazer o login: a verificação do Cloudflare passa. Cada conta precisa entrar de novo uma vez depois desta versão | ⏳ dona |
| 23 | Conta solta e grupo em janela própria (WebView2) | Soltar uma conta, mover a janela, fechar: a conta volta para a principal sem recarregar. Listas suspensas do jogo abrem no lugar certo depois de mover a janela | ⏳ dona |

## Observações
- A contagem real do tempo assistido (item 8) é o maior risco: se não contar com a página offscreen, trocar para o plano B do ADR 0004.
- Os seletores da Twitch e da Kick mudam com o tempo; se um item falhar, corrigir `src/shared/dados/lives-seletores.json` (sem mexer em código).

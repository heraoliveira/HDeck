# HDeck

Navegador de várias contas para jogos idle de navegador, para Windows 10 (22H2) e 11.
Cada conta tem login, cookies e cache próprios; as contas continuam rodando com a janela minimizada, na bandeja ou coberta; se caírem, voltam sozinhas; quando algo precisa de você, o HDeck avisa. Sem anúncios, sem telemetria e sem conta online: tudo fica no seu PC.

## Instalar

1. Baixe `HDeck-Setup-<versão>.exe` em [Releases](https://github.com/heraoliveira/HDeck/releases) (ou gere com `pnpm dist`, abaixo).
2. Abra o instalador. Ele instala só para o seu usuário (sem pedir administrador) em `%LOCALAPPDATA%\Programs\HDeck` e cria os atalhos no menu Iniciar e na área de trabalho.
3. **Aviso do SmartScreen:** o instalador ainda não tem assinatura de código, então o Windows pode mostrar "O Windows protegeu o computador". Clique em **Mais informações → Executar assim mesmo**. As atualizações automáticas conferem o hash publicado no GitHub.

Para desinstalar: Configurações do Windows → Aplicativos → HDeck. O desinstalador pergunta se apaga também os seus dados.

## Usar

- **Grupos** ficam na barra da esquerda. O interruptor liga ou desliga o grupo (desligado = nenhuma conta na memória). O `⋯` do grupo tem *Trocar para este grupo*, *Abrir em janela própria* e *Contas fora da tela* (Manter farmando ou Economizar, por jogo).
- **Adicionar conta:** escolha o jogo ou cole o link; o endereço sugere o jogo. Cada conta tem a própria sessão.
- **Visões:** Grade, Principal + miniaturas, Foco (abas) e Painel, no botão ao lado do nome do grupo. Divisões: 1, 2 lado a lado, 2 empilhadas, 1+2, 1+3, 2×2, 3×2, 3×3, 4×4 e Personalizada (arraste as divisórias). Clique num espaço vazio para escolher a conta dele.
- **Modo econômico** (folha na barra de título): só a conta em que você clicou fica ao vivo; as outras aparecem como foto e continuam farmando. Clique na foto para jogar.
- **Conta em janela própria:** `⋯` da conta → *Abrir em janela própria* (ótimo para outro monitor). Fechar a janela devolve a conta.
- **Painel:** estado, tempo online, quedas, recargas, RAM e CPU de cada conta, gráficos de 24 h e 30 dias, ping dos jogos e ações em lote (Ctrl/Shift + clique para escolher contas).
- **Lives:** `⋯` da conta → *Lives*. A live abre na sessão da conta, sem som e sem aparecer. "Entrar na Twitch/Kick desta conta" abre o login uma vez.
- **Logins salvos:** `⋯` da conta → *Logins salvos*. "Preencher login" só preenche; você clica em Entrar.
- **Avisos:** notificação do Windows, som, selo, Discord e Telegram, em Configurações → Avisos. Textos vigiados avisam quando uma palavra aparece na tela de uma conta.

### Atalhos (editáveis em Configurações → Geral)

| Atalho | Faz |
|---|---|
| Ctrl+1…9 | Vai para a conta 1…9 do grupo |
| Ctrl+Tab / Ctrl+Shift+Tab | Próxima / anterior |
| F5 | Recarregar a conta |
| Ctrl+Shift+R | Recarregar o grupo |
| Ctrl+M | Som da conta |
| Ctrl+E | Modo econômico |
| Ctrl+K | Paleta de comandos |
| Ctrl+, | Configurações |
| F11 | Tela cheia |
| Ctrl+L | Preencher login |
| Ctrl+Alt+1…9 | Vai para o grupo 1…9 |

Os atalhos valem também com o foco dentro de uma conta.

## Onde ficam os dados

`%APPDATA%\HDeck\`:
- `config.json` — configurações (com cópia `config.json.bak`)
- `hdeck.db` — grupos, contas, avisos, histórico e cofre (cifrado)
- `WebView2\EBWebView\WV2Profile_conta-<id>\` — cookies e logins de cada conta (perfil do Edge WebView2)
- `logs\` — registros, sem senhas nem endereços com parâmetros

### Backup

Configurações → Conta e versão → Backup. Gera um arquivo `.hdeck` com grupos, contas, lives, textos vigiados e configurações. Os logins salvos só entram cifrados com a senha do backup. "Incluir dados de login dos jogos (cookies)" copia as sessões: quem tiver o arquivo entra nas suas contas. Para restaurar, use *Importar backup* (o HDeck reinicia).

## Desenvolver

Requisitos: Windows 10/11, Node.js 24, pnpm 12 (`corepack enable`) e o SDK do .NET 10 (o motor das páginas, `motor-paginas/`, é compilado em `pnpm build`). As contas rodam no Edge WebView2 (ADR 0014), que já vem no Windows 11.

```powershell
pnpm install
```

```powershell
pnpm dev
```

| Comando | Faz |
|---|---|
| `pnpm dev` | Abre o app em modo de desenvolvimento |
| `pnpm motor` | Compila o motor das páginas (.NET + WebView2) em `motor-paginas/publicado` |
| `pnpm test` | Unidade, propriedades, integração e componentes |
| `pnpm cobertura` | O mesmo com cobertura (mínimo 90% no núcleo e no shared) |
| `pnpm e2e` | Fluxos E2E com o jogo falso e a live falsa (abre janelas) |
| `pnpm seguranca` | Testes de segurança (fuses só depois de `pnpm dist`) |
| `pnpm provas` | Provas técnicas (timers escondidos, foto, live, CDP) |
| `pnpm regras` | Confere RN ↔ testes e gera `docs/rastreio.md` |
| `pnpm bancada` | Mede as metas de desempenho (`BANCADA_MIN=15`) |
| `pnpm lint` / `pnpm typecheck` / `pnpm knip` | Qualidade |
| `pnpm verificar` | Tudo o que o CI roda, em ordem |
| `pnpm dist` | Gera `dist/HDeck-Setup-<versão>.exe` |
| `pnpm jogo-falso` | Sobe o jogo falso em http://localhost:7357/jogo |

Documentos: `docs/REGRAS.md` (regras de negócio), `docs/decisoes/` (ADRs), `docs/MEDICOES.md`, `docs/TESTE-MANUAL.md`, `docs/rastreio.md`.

### Como atualizar o Electron

1. `pnpm up electron@<nova> electron-builder@latest @electron/fuses@latest` (o Renovate abre isso sozinho toda semana).
2. `pnpm verificar` e `pnpm bancada`; compare com `docs/MEDICOES.md`.
3. `pnpm provas` se mudou o major (confere timers escondidos, foto e live offscreen).
4. Atualize a versão do Chromium/Node no ADR 0001 e publique.

### Publicar uma versão

1. Ajuste `version` no `package.json` (formato `AAAA.M.D`) e o `CHANGELOG.md`.
2. `pnpm dist`.
3. Crie a release no GitHub com `HDeck-Setup-<versão>.exe`, o `.blockmap` e o `latest.yml` de `dist/` (o app instalado procura atualização ali).

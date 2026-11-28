/**
 * Composição do HDeck (Seção 4.1): flags, instância única, núcleo e adaptadores.
 * Nenhuma regra de negócio aqui: só monta as peças e liga o IPC.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type Config, configPadrao } from '@shared/config/esquema.ts'
import { type Comando, comandoDaTecla, mapaDeAtalhos } from '@shared/dados/atalhos.ts'
import { catalogoDeJogos } from '@shared/dados/catalogo.ts'
import { t } from '@shared/i18n/index.ts'
import { type Evento, eventoIpc } from '@shared/ipc/contrato.ts'
import type { Conta, Grupo, PlataformaLive } from '@shared/tipos/dominio.ts'
import { urlSemParametros } from '@shared/util/texto.ts'
import {
  app,
  BrowserWindow,
  dialog,
  type Input,
  Menu,
  nativeTheme,
  net,
  protocol,
  safeStorage,
  session,
  shell,
} from 'electron'
import { Bandeja } from './adaptadores/electron/bandeja.ts'
import { instalarEndurecimento } from './adaptadores/electron/endurecimento.ts'
import { GerenciadorJanelas } from './adaptadores/electron/janelas.ts'
import { FabricaLivesElectron, janelasDasLives } from './adaptadores/electron/live-offscreen.ts'
import {
  type Perguntador,
  PerguntadorDeTeste,
  PerguntadorNativo,
} from './adaptadores/electron/perguntador.ts'
import { scriptEnsinar } from './adaptadores/electron/scripts-pagina.ts'
import {
  CanaisLocaisElectron,
  ouvirEnergia,
  redeElectron,
  SistemaElectron,
} from './adaptadores/electron/sistema.ts'
import { ArmazemSqlite } from './adaptadores/node/armazem-sqlite.ts'
import { exportarBackup, importarBackup } from './adaptadores/node/backup.ts'
import { Cofre } from './adaptadores/node/cofre.ts'
import { ConfigArquivo } from './adaptadores/node/config-arquivo.ts'
import { ClienteHttpFetch } from './adaptadores/node/http.ts'
import { criarLog } from './adaptadores/node/log.ts'
import { Atualizador } from './adaptadores/updater.ts'
import { ClienteMotor } from './adaptadores/webview2/cliente-motor.ts'
import { apagarParticoesAntigas, FabricaPaginasWebView2 } from './adaptadores/webview2/pagina-webview2.ts'
import { type Manipuladores, registrarIpc } from './ipc/roteador.ts'
import { sugerirJogo } from './nucleo/contas/contas.ts'
import {
  aoFecharJanela,
  iniciarEscondido,
  opcoesDeInicio,
  precisaConfirmarSaida,
} from './nucleo/geral/geral.ts'
import { Motor } from './nucleo/motor.ts'
import { podeReabrir } from './nucleo/painel/painel.ts'
import type { Relogio } from './nucleo/portas.ts'
import { userAgentLimpo } from './nucleo/seguranca/politicas.ts'

const modoTeste = process.env.HDECK_TESTE === '1'
if (process.env.HDECK_DADOS) app.setPath('userData', process.env.HDECK_DADOS)
app.setName('HDeck')
// Barra de tarefas: o app instalado usa o id dele; fora dele (desenvolvimento, testes) usa outro, para o
// Windows não misturar com o electron.exe e mostrar o ícone do Electron no lugar do HDeck.
const ID_APP = app.isPackaged && process.env.HDECK_TESTE !== '1' ? 'br.hera.hdeck' : 'br.hera.hdeck.dev'
app.setAppUserModelId(ID_APP)
process.env.HDECK_AUMID = ID_APP // o motor das páginas usa o mesmo id (pop-ups agrupam com o HDeck)
// Toda janela leva o ícone do HDeck também para a barra de tarefas (fixar, reabrir), não só no título.
app.on('browser-window-created', (_e, w) => {
  const icone = app.isPackaged ? process.execPath : join(import.meta.dirname, '..', '..', 'build', 'icon.ico')
  w.setAppDetails({
    appId: ID_APP,
    appIconPath: icone,
    appIconIndex: 0,
    relaunchCommand: `"${process.execPath}"`,
    relaunchDisplayName: 'HDeck',
  })
})
const pastaDados = app.getPath('userData')
mkdirSync(pastaDados, { recursive: true })

/** Onde está o motor das páginas (ADR 0014): junto do app instalado, ou o publicado na pasta do projeto. */
function caminhoDoMotor(): string {
  if (process.env.HDECK_MOTOR) return process.env.HDECK_MOTOR
  return app.isPackaged
    ? join(process.resourcesPath, 'motor', 'hdeck-motor.exe')
    : join(import.meta.dirname, '..', '..', 'motor-paginas', 'publicado', 'hdeck-motor.exe')
}

// Mesmas flags de antes, agora no navegador das contas: sem estrangular timers de página escondida
// ou coberta (ADR 0002) e sem os processos e serviços que só gastam memória (ADR 0013).
const ARGUMENTOS_WEBVIEW2 = [
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  // Barras de rolagem por cima do conteúdo: aparecer ou sumir não muda a largura da página (o jogo não fica
  // "tremendo" num tamanho em que a barra liga e desliga sem parar).
  '--enable-features=msOverlayScrollbarWinStyle,OverlayScrollbar',
  '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling,BackForwardCache,SpareRendererForSitePerProcess,MediaRouter,OptimizationHints,Translate,AutofillServerCommunication,msSmartScreenProtection,msEdgeShoppingUI',
].join(' ')

// ---------- Flags do Chromium (Seção 5.2, ADR 0002) ----------
// Sem isto, páginas escondidas são estranguladas: timers a 1/s e depois 1/min, e janelas cobertas param.
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
// Memória (ADR 0013): iframes de anúncio e de terceiros dividem o processo da página do jogo
// (sem um processo por site), sem cache de páginas antigas e sem processo reserva.
app.commandLine.appendSwitch('disable-site-isolation-trials')
app.commandLine.appendSwitch(
  'disable-features',
  'CalculateNativeWinOcclusion,IntensiveWakeUpThrottling,IsolateOrigins,site-per-process,BackForwardCache,SpareRendererForSitePerProcess,MediaRouter,OptimizationHints,Translate,AutofillServerCommunication',
)

const arquivoConfig = new ConfigArquivo(join(pastaDados, 'config.json'))
if (!arquivoConfig.ler().avancado.aceleracaoHardware) app.disableHardwareAcceleration() // vale ao reiniciar

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
])

// RN-172: só uma cópia.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  iniciar().catch((e: unknown) => {
    // Uma falha ao abrir não pode deixar o HDeck rodando escondido, sem janela: avisa e fecha.
    console.error(e)
    dialog.showErrorBox('HDeck', `O HDeck não conseguiu abrir.\n\n${String((e as Error)?.message ?? e)}`)
    app.exit(1)
  })
}

/** Relógio real. No modo de teste, HDECK_TESTE_ACELERAR=N faz o tempo do núcleo andar N vezes mais rápido. */
const acelerar = modoTeste ? Math.max(1, Number(process.env.HDECK_TESTE_ACELERAR ?? 1)) : 1
const inicioRelogio = Date.now()
const relogioReal: Relogio = {
  agora: () => (acelerar === 1 ? Date.now() : inicioRelogio + (Date.now() - inicioRelogio) * acelerar),
  depois: (ms, fn) => {
    const h = setTimeout(fn, ms / acelerar)
    return () => clearTimeout(h)
  },
  aCada: (ms, fn) => {
    const h = setInterval(fn, Math.max(5, ms / acelerar))
    return () => clearInterval(h)
  },
}

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'"

async function iniciar(): Promise<void> {
  const log = criarLog(join(pastaDados, 'logs'))
  const reaberto = process.argv.includes('--reaberto')
  instalarReabertura(log)

  await app.whenReady()
  Menu.setApplicationMenu(null)
  app.userAgentFallback = userAgentLimpo(app.userAgentFallback)

  // Interface carregada de app:// com CSP estrita (Seção 11).
  const pastaInterface = normalize(join(import.meta.dirname, '../renderer'))
  protocol.handle('app', async (req) => {
    const u = new URL(req.url)
    const arq = normalize(
      join(pastaInterface, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname)),
    )
    if (!arq.startsWith(pastaInterface + sep) && arq !== pastaInterface)
      return new Response('proibido', { status: 403 })
    const r = await net.fetch(pathToFileURL(arq).toString())
    const tipos: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
    }
    return new Response(r.body, {
      status: r.status,
      headers: {
        'content-type': tipos[extname(arq)] ?? 'application/octet-stream',
        'content-security-policy': CSP,
      },
    })
  })
  const urlDev = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
  const origemInterface = urlDev ? new URL(urlDev).origin : 'app://hdeck'
  const urlInterface = (consulta: string) =>
    urlDev ? `${urlDev}?${consulta}` : `app://hdeck/index.html?${consulta}`

  const perguntador: Perguntador = modoTeste ? new PerguntadorDeTeste() : new PerguntadorNativo()
  const armazem = new ArmazemSqlite(join(pastaDados, 'hdeck.db'))
  for (const j of catalogoDeJogos())
    if (!armazem.listarJogos().some((x) => x.id === j.id)) armazem.salvarJogo(j)
  const protecao = {
    disponivel: () => safeStorage.isEncryptionAvailable(),
    proteger: (d: Uint8Array) => safeStorage.encryptString(Buffer.from(d).toString('base64')),
    desproteger: (d: Uint8Array) => Buffer.from(safeStorage.decryptString(Buffer.from(d)), 'base64'),
  }
  const cofre = new Cofre(armazem, protecao)
  if (cofre.iniciar() === 'sem_chave')
    log.aviso('o Windows não abriu a chave do cofre: os logins salvos ficam fechados nesta sessão')

  let motor: Motor | null = null
  let saindo = false
  const contasPorJanelaGrupo = new Map<string, string>()
  let mapa = mapaDeAtalhos({})

  const emitir = (evento: Evento, dados: unknown) => {
    for (const wc of janelas.interfaces()) if (!wc.isDestroyed()) wc.send(eventoIpc(evento), dados)
  }

  const janelas = new GerenciadorJanelas({
    pastaDados,
    preload: join(import.meta.dirname, '../preload/shell.cjs'),
    urlInterface,
    aoMedirSolta: (contaId, largura, altura) =>
      motor?.definirEspacos(`solta:${contaId}`, [
        { contaId, retangulo: { x: 0, y: 0, largura, altura }, tipo: 'conta' },
      ]),
    antesDeFechar: (janelaId) => fabrica.liberarJanela(janelaId),
    aoFecharSolta: (contaId) => {
      motor?.definirEspacos(`solta:${contaId}`, [])
      motor?.devolvida(contaId)
    },
    aoFecharPrincipal: (e) => {
      if (saindo) return
      e.preventDefault()
      // RN-171: fechar no X manda para a bandeja.
      if (motor && aoFecharJanela(motor.obterConfig(), saindo) === 'bandeja') janelas.principal?.hide()
      else void sair()
    },
    aoFecharJanelaGrupo: (grupoId) => {
      contasPorJanelaGrupo.delete(grupoId)
      motor?.definirEspacos(`grupo:${grupoId}`, [])
    },
    iniciarEscondida: iniciarEscondido(arquivoConfig.ler(), process.argv),
  })

  instalarEndurecimento({
    ehInterface: (wc) => janelas.idDaInterface(wc) !== null,
    // As contas não usam mais sessões do Electron (ADR 0014): aqui só ficam a interface e as lives.
    notificacoesDaSessao: () => false,
    modoTeste,
    perguntador,
    log,
    aoBloquearDownload: (nome) =>
      emitir('mensagem', { tipo: 'aviso', texto: t('dialogo.downloadBloqueado', { nome }) }),
  })

  // ---------- Motor das páginas (ADR 0014): as contas rodam em WebView2 (Edge), num processo .NET ----------
  const cliente: ClienteMotor = new ClienteMotor({
    exe: caminhoDoMotor(),
    pasta: join(pastaDados, 'WebView2'),
    argumentos: ARGUMENTOS_WEBVIEW2,
    teste: modoTeste,
    log,
    aoPerguntar: (e) => fabrica.decidir(e),
    aoCair: () => {
      // As páginas morreram com o motor: o núcleo registra a queda e o motor reabre com todas.
      if (saindo) return
      fabrica.motorCaiu()
      setTimeout(
        () =>
          void cliente
            .iniciar()
            .then(() => {
              fabrica.definirAtalhos([...mapa.keys()])
              fabrica.remontarTodas()
            })
            .catch((e: unknown) => log.erro('o motor das páginas não reabriu', { erro: String(e) })),
        1000,
      )
    },
  })
  const fabrica: FabricaPaginasWebView2 = new FabricaPaginasWebView2({
    log,
    motor: cliente,
    janela: (id) => janelas.obter(id),
    principal: () => janelas.principal,
    notificacoes: (id) => motor?.conta(id)?.notificacoesDaPagina ?? false,
    perguntador,
    modoTeste,
    aoBloquearDownload: (nome) =>
      emitir('mensagem', { tipo: 'aviso', texto: t('dialogo.downloadBloqueado', { nome }) }),
    aoTecla: (texto) => {
      const cmd = mapa.get(texto)
      if (cmd) executarComando(cmd)
    },
    aoLinkDeLive: (contaId, url) => {
      const r = motor?.abrirLinkDeLive(contaId, url)
      if (!r?.ok) return false
      janelas.abrirLives(contaId)
      return true
    },
  })
  apagarParticoesAntigas(pastaDados, log)

  // ---------- Regra: todo login abre no motor do Edge (RN-154) ----------
  // O Google recusa o Electron ("navegador não seguro"). O login da Twitch/Kick das lives abre no motor
  // (mesma identidade de Edge das contas) e os cookies dele vão para a sessão das lives da conta.
  const DOMINIOS_LOGIN: Record<PlataformaLive, string[]> = {
    twitch: ['www.twitch.tv', 'twitch.tv', 'passport.twitch.tv', 'id.twitch.tv', 'gql.twitch.tv'],
    kick: ['kick.com', 'www.kick.com'],
  }
  function abrirLoginNoMotor(contaId: string, plataforma: PlataformaLive, url: string): boolean {
    if (!cliente.pid) return false
    cliente.enviar('abrirLogin', {
      chave: contaId,
      perfil: `live-${contaId}`.replace(/[^A-Za-z0-9-]/g, '').slice(0, 64),
      url,
      dominios: modoTeste && process.env.HDECK_TESTE_LOGIN_MOTOR ? ['localhost'] : DOMINIOS_LOGIN[plataforma],
    })
    return true
  }
  type CookieMotor = {
    nome: string
    valor: string
    dominio: string
    caminho: string
    expira: number | null
    httpOnly: boolean
    seguro: boolean
    sameSite: string
  }
  const ultimosCookies = new Map<string, string>()
  cliente.ouvirGeral('cookiesLogin', (e) => {
    const contaId = String(e.chave ?? '')
    const lista = (e.cookies ?? []) as CookieMotor[]
    const chave = JSON.stringify(lista.map((c) => [c.dominio, c.nome, c.valor]))
    if (!motor?.conta(contaId) || lista.length === 0 || ultimosCookies.get(contaId) === chave) return
    ultimosCookies.set(contaId, chave)
    const s = session.fromPartition(`persist:live-${contaId}`)
    const sameSite = (v: string) =>
      v === 'Strict' ? 'strict' : v === 'Lax' ? 'lax' : v === 'None' ? 'no_restriction' : 'unspecified'
    void Promise.all(
      lista.map((c) =>
        s.cookies
          .set({
            url: `https://${c.dominio.replace(/^\./, '')}${c.caminho || '/'}`,
            name: c.nome,
            value: c.valor,
            domain: c.dominio,
            path: c.caminho || '/',
            secure: c.seguro,
            httpOnly: c.httpOnly,
            sameSite: sameSite(c.sameSite) as 'lax',
            ...(c.expira ? { expirationDate: c.expira } : {}),
          })
          .catch(() => {}),
      ),
    ).then(() => {
      log.info('login das lives copiado', { conta: motor?.conta(contaId)?.nome, cookies: lista.length })
      motor?.recarregarLivesDaConta(contaId)
    })
  })
  const sistema = new SistemaElectron()
  const http = new ClienteHttpFetch((url, init) => net.fetch(url, init))
  const locais = new CanaisLocaisElectron({
    janela: () => janelas.principal,
    aoClicar: (aviso) => {
      janelas.mostrarPrincipal()
      if (aviso.contaId && motor?.conta(aviso.contaId)) {
        motor.selecionarGrupo(motor.conta(aviso.contaId)!.grupoId)
        motor.ativar(aviso.contaId)
        emitir('comando', { cmd: 'focar', contaId: aviso.contaId })
      }
    },
    tocarSom: () => emitir('comando', { cmd: 'tocarSom', ...somDeArquivo() }),
    aoSelo: (n) => bandeja.atualizar(n),
  })
  const somDeArquivo = () => {
    const c = motor?.obterConfig().avisos
    if (c?.somEscolhido !== 'arquivo' || !c.somArquivo || !existsSync(c.somArquivo)) return {}
    try {
      const b = readFileSync(c.somArquivo)
      if (b.length > 2 * 1024 * 1024) return {}
      const tipo =
        extname(c.somArquivo).toLowerCase() === '.wav'
          ? 'audio/wav'
          : extname(c.somArquivo) === '.ogg'
            ? 'audio/ogg'
            : 'audio/mpeg'
      return { arquivo: `data:${tipo};base64,${b.toString('base64')}` }
    } catch {
      return {}
    }
  }

  motor = new Motor({
    relogio: relogioReal,
    armazem,
    configArquivo: arquivoConfig,
    paginas: fabrica,
    lives: new FabricaLivesElectron(
      log,
      modoTeste ? (process.env.HDECK_TESTE_LIVE_URL ?? null) : null,
      (contaId, plataforma, url) => abrirLoginNoMotor(contaId, plataforma, url),
    ),
    http,
    rede: redeElectron,
    locais,
    sistema,
    log,
    cofre: Object.assign(cofre, {}),
    segredos: {
      discord: () => cofre.segredo('discord'),
      telegram: () => cofre.segredo('telegram'),
      existe: (c) => cofre.segredo(c) !== null,
    },
    gerarId: () => randomUUID(),
    versao: { app: app.getVersion(), electron: process.versions.electron, dados: pastaDados },
    emitir: (e, d) => {
      emitir(e as Evento, d)
      if (e === 'estado') aoMudarEstado(d as ReturnType<Motor['snapshot']>)
    },
    janelas: {
      soltar: (id, nome) => janelas.soltar(id, nome),
      devolver: (id) => janelas.devolver(id),
    },
    ...(modoTeste && process.env.HDECK_TESTE_TELEGRAM_URL
      ? {
          endpoints: {
            telegram: (tk: string) => `${process.env.HDECK_TESTE_TELEGRAM_URL}/bot${tk}/sendMessage`,
          },
        }
      : {}),
  })
  const m = motor

  const atualizador = new Atualizador(log, (e) => emitir('atualizacao.estado', e))
  let configAnterior: Config = configPadrao()
  const aoMudarEstado = (s: ReturnType<Motor['snapshot']>) => {
    const c = s.config
    if (c !== configAnterior) {
      if (c.geral.atalhos !== configAnterior.geral.atalhos) {
        mapa = mapaDeAtalhos(c.geral.atalhos)
        fabrica.definirAtalhos([...mapa.keys()])
      }
      if (c.geral.tema !== configAnterior.geral.tema)
        nativeTheme.themeSource =
          c.geral.tema === 'sistema' ? 'system' : c.geral.tema === 'claro' ? 'light' : 'dark'
      if (
        c.geral.iniciarComWindows !== configAnterior.geral.iniciarComWindows &&
        app.isPackaged &&
        !modoTeste
      )
        app.setLoginItemSettings(opcoesDeInicio(c)) // RN-170
      if (c.atualizacao.canal !== configAnterior.atualizacao.canal)
        atualizador.definirCanal(c.atualizacao.canal)
      configAnterior = c
    }
    bandeja.atualizar(s.naoLidos)
  }

  const bandeja = new Bandeja({
    mostrar: () => janelas.mostrarPrincipal(),
    economia: () => m.obterConfig().economia.modoEconomico,
    alternarEconomia: () => m.alternarEconomia(),
    silenciado: () => m.snapshot().silenciarTudo,
    alternarSilencio: () => m.silenciar(!m.snapshot().silenciarTudo),
    pausarAvisos: () => m.pausarAvisos(3_600_000),
    sair: () => void sair(),
    contasLigadas: () => m.contasLigadas(),
  })

  // RN-171: sair de verdade, com confirmação se houver contas ligadas.
  async function sair(): Promise<void> {
    if (saindo) return
    if (precisaConfirmarSaida(m.obterConfig(), m.contasLigadas())) {
      const r = await perguntador.perguntar({
        mensagem: t('dialogo.sairTitulo'),
        detalhe: t('dialogo.sairTexto', { n: m.contasLigadas() }),
        botoes: [t('dialogo.sair'), t('comum.cancelar')],
        janela: janelas.principal,
      })
      if (r !== 0) return
    }
    saindo = true
    m.encerrar()
    await cliente.encerrar()
    bandeja.destruir()
    armazem.fechar()
    app.quit()
  }
  app.on('before-quit', () => {
    saindo = true
    janelas.encerrando = true
  })
  app.on('window-all-closed', () => {
    // Fica na bandeja.
  })
  app.on('second-instance', () => janelas.mostrarPrincipal()) // RN-172

  // ---------- Atalhos (RN-176) ----------
  const contasDoGrupoAtual = (): Conta[] => {
    const s = m.snapshot()
    return s.contas.filter((c) => c.grupoId === s.grupoAtualId).sort((a, b) => a.ordem - b.ordem)
  }
  // Trocar de conta pelo teclado já deixa a conta pronta: o teclado vai para a página (sem precisar clicar).
  const focarConta = (id: string) =>
    setTimeout(
      () =>
        void fabrica
          .pagina(id)
          ?.focarTeclado()
          .catch(() => {}),
      150,
    )
  const executarComando = (cmd: Comando): void => {
    const s = m.snapshot()
    const ativa = s.ativaId
    const lista = contasDoGrupoAtual()
    if (cmd.startsWith('conta.') && /\d$/.test(cmd)) {
      const c = lista[Number(cmd.slice(-1)) - 1]
      if (c) {
        m.ativar(c.id)
        emitir('comando', { cmd: 'focar', contaId: c.id })
        focarConta(c.id)
      }
      return
    }
    if (cmd.startsWith('grupo.') && /\d$/.test(cmd)) {
      const g = [...s.grupos].sort((a, b) => a.ordem - b.ordem)[Number(cmd.slice(-1)) - 1]
      if (g) m.selecionarGrupo(g.id)
      return
    }
    switch (cmd) {
      case 'conta.proxima':
      case 'conta.anterior': {
        if (lista.length === 0) return
        const i = lista.findIndex((c) => c.id === ativa)
        const prox = lista[(i + (cmd === 'conta.proxima' ? 1 : -1) + lista.length) % lista.length]!
        m.ativar(prox.id)
        emitir('comando', { cmd: 'focar', contaId: prox.id })
        focarConta(prox.id)
        return
      }
      case 'conta.recarregar':
        if (ativa) m.recarregar(ativa, false)
        return
      case 'grupo.recarregar':
        void m.lote(
          lista.map((c) => c.id).filter((id) => m.idsLigadas().includes(id)),
          'recarregar',
        )
        return
      case 'conta.som':
        if (ativa) m.editarConta(ativa, { som: !m.conta(ativa)?.som })
        return
      case 'economia.alternar':
        m.alternarEconomia()
        return
      case 'conta.telaCheia':
        m.telaCheia()
        return
      case 'conta.preencherLogin':
        if (ativa) void m.preencherLogin([ativa])
        return
      default:
        emitir('comando', { cmd })
    }
  }
  const tratarTecla = (input: Input): boolean => {
    const cmd = comandoDaTecla(mapa, input)
    if (!cmd) return false
    executarComando(cmd)
    return true
  }

  // ---------- IPC ----------
  const validarWebhook = (url: string) =>
    url === '' ||
    /^https:\/\/((canary|ptb)\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url) ||
    (modoTeste && /^http:\/\/localhost:\d+\//.test(url))
  const validarToken = (tk: string) =>
    tk === '' || /^\d{5,}:[\w-]{20,}$/.test(tk) || (modoTeste && /^teste:/.test(tk))

  const caminhoDeTeste = () =>
    (globalThis as { hdeckTeste?: { proximoArquivo?: string } }).hdeckTeste?.proximoArquivo
  async function escolherArquivo(
    salvar: boolean,
    nome: string,
    filtros: Electron.FileFilter[],
  ): Promise<string | null> {
    const teste = caminhoDeTeste()
    if (modoTeste && teste) return teste
    const w = janelas.principal
    if (!w) return null
    if (salvar) {
      const r = await dialog.showSaveDialog(w, { defaultPath: nome, filters: filtros })
      return r.canceled ? null : (r.filePath ?? null)
    }
    const r = await dialog.showOpenDialog(w, { properties: ['openFile'], filters: filtros })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  }

  const comDialogo = async <T>(fn: () => Promise<T>): Promise<T> => {
    m.definirDialogo(true)
    try {
      return await fn()
    } finally {
      m.definirDialogo(false)
    }
  }

  const desligarTudoDurante = async <T>(fn: () => Promise<T> | T): Promise<T> => {
    const ligados = m
      .listarGrupos()
      .filter((g) => g.ligado)
      .map((g) => g.id)
    for (const g of ligados) m.ligarGrupo(g, false)
    await new Promise((r) => setTimeout(r, 1500)) // o Chromium solta os arquivos das sessões
    try {
      return await fn()
    } finally {
      for (const g of ligados) m.ligarGrupo(g, true, true)
    }
  }

  const manipuladores: Manipuladores = {
    'estado.obter': (_e, ctx) => ({ ...m.snapshot(), janela: ctx.janela }),
    'config.alterar': (e) => {
      const r = m.alterarConfig(e.caminho, e.valor)
      return r.ok ? { ok: true } : { ok: false }
    },
    'config.redefinir': () => m.redefinirConfig(),
    'grupos.criar': (e) => m.criarGrupo(e.nome, e.cor),
    'grupos.editar': (e) => m.editarGrupo(e.id, { nome: e.nome, cor: e.cor }),
    'grupos.apagar': (e) => m.apagarGrupo(e.id),
    'grupos.ligar': (e) => {
      const r = m.ligarGrupo(e.id, e.ligado, e.confirmado)
      return r.ok ? { ok: true } : { ok: false, excessos: r.erro.excessos }
    },
    'grupos.trocar': (e) => {
      const r = m.trocarGrupo(e.id, e.confirmado)
      return r.ok ? { ok: true } : { ok: false, excessos: r.erro.excessos }
    },
    'grupos.selecionar': (e) => m.selecionarGrupo(e.id),
    'grupos.layout': (e) => m.definirLayout(e.id, e.visao, e.layout as Partial<Grupo['layout']> | undefined),
    'grupos.reordenar': (e) => m.reordenarGrupos(e.ids),
    'grupos.politica': (e) => m.definirPolitica(e.grupoId, e.jogoId, e.politica),
    'grupos.janela': (e) => {
      const g = m.listarGrupos().find((x) => x.id === e.id)
      if (g) janelas.abrirGrupo(g.id, g.nome)
    },
    'contas.adicionar': (e) => {
      const r = m.adicionarConta(e)
      return r.ok ? { ok: true, conta: r.valor } : { ok: false, erro: r.erro }
    },
    'contas.editar': (e) => {
      const { id, ...patch } = e
      return m.editarConta(id, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)))
    },
    'contas.apagar': (e) => m.apagarConta(e.id, e.apagarLogin),
    'contas.mover': (e) => m.moverConta(e.id, e.grupoId, e.posicao),
    'contas.ativar': (e) => m.ativar(e.id),
    'contas.duplicar': (e) => m.duplicar(e.id),
    'contas.soltar': (e) => m.soltar(e.id),
    'contas.inicio': (e) => m.irParaInicio(e.id),
    'contas.detalhe': (e) => m.detalheConta(e.id),
    'contas.lote': async (e) => {
      if (e.acao === 'fotos') {
        const fotos = await m.fotosDe(e.ids)
        const pasta = modoTeste && caminhoDeTeste() ? caminhoDeTeste()! : await escolherPasta()
        if (!pasta) return { ok: false }
        mkdirSync(pasta, { recursive: true })
        const data = new Date().toISOString().replace(/[:.]/g, '-')
        for (const f of fotos)
          writeFileSync(join(pasta, `${f.nome.replace(/[^\w\s-]/g, '_')}-${data}.png`), f.dados)
        emitir('mensagem', { tipo: 'ok', texto: t('lote.fotosSalvas', { n: fotos.length, pasta }) })
        return { ok: true, feitas: fotos.length }
      }
      const r = await m.lote(e.ids, e.acao, { zoom: e.zoom, grupoId: e.grupoId, confirmado: e.confirmado })
      if (r.ok) return { ok: true, ...r.valor }
      return typeof r.erro === 'string'
        ? { ok: false, erro: r.erro }
        : { ok: false, excessos: r.erro.excessos }
    },
    'contas.espacos': (e, ctx) => m.definirEspacos(ctx.janela, e.espacos),
    'contas.sugerirJogo': (e) => sugerirJogo(e.url, m.listarJogos())?.id ?? null,
    'contas.devtools': (e) => m.abrirDevtools(e.id),
    'contas.limparDados': (e) => m.limparDados(e.id),
    'dialogo.estado': (e) => m.definirDialogo(e.aberto),
    'jogos.salvar': (e) => m.salvarJogo({ ...e, origem: e.origem === 'catalogo' ? 'catalogo' : 'usuario' }),
    'jogos.apagar': (e) => m.apagarJogo(e.id),
    'lives.adicionar': (e) => {
      const r = m.adicionarLive(e.contaId, e.plataforma, e.canal)
      return r.ok ? { ok: true } : { ok: false, erro: r.erro }
    },
    'lives.remover': (e) => m.removerLive(e.id),
    'lives.ligar': (e) => {
      const r = m.ligarLive(e.id, e.ligada)
      return r.ok ? { ok: true } : { ok: false, erro: r.erro }
    },
    'lives.mostrar': (e) => m.mostrarLive(e.id, e.som),
    'lives.entrar': (e) => m.entrarNaLive(e.id),
    'lives.entrarPlataforma': (e) => m.entrarNaPlataforma(e.contaId, e.plataforma),
    'lives.abrirLink': (e) => {
      const r = m.abrirLinkDeLive(e.contaId, e.texto, e.plataforma)
      return r.ok ? { ok: true, id: r.valor.id } : { ok: false, erro: r.erro }
    },
    'lives.ligarTodas': (e) => m.ligarLivesDaConta(e.contaId, e.plataforma, e.ligada),
    'lives.janela': (e) => janelas.abrirLives(e.contaId ?? m.snapshot().ativaId ?? undefined),
    'textos.salvar': (e) => m.salvarTexto(e),
    'textos.apagar': (e) => m.apagarTexto(e.id),
    'avisos.listar': (e) => m.listarAvisos(e.limite),
    'avisos.marcarLidos': () => m.marcarAvisosLidos(),
    'avisos.testar': async (e) => {
      if (e.canal === 'windows') {
        locais.notificar(
          {
            id: 'teste',
            contaId: null,
            tipo: 'caiu',
            mensagem: t('avisos.teste'),
            criadoEm: Date.now(),
            lido: true,
          },
          t('app.nome'),
        )
        return { ok: true }
      }
      if (e.canal === 'som') {
        locais.tocarSom()
        return { ok: true }
      }
      return m.testarCanal(e.canal)
    },
    'avisos.segredo': (e) => {
      const valido = e.canal === 'discord' ? validarWebhook(e.valor.trim()) : validarToken(e.valor.trim())
      if (!valido) return { ok: false }
      cofre.definirSegredo(e.canal, e.valor.trim())
      m.alterarConfig(`avisos.${e.canal}`, e.valor.trim() !== '')
      return { ok: true }
    },
    'avisos.somArquivo': async () => {
      const arq = await escolherArquivo(false, '', [{ name: 'Som', extensions: ['wav', 'mp3', 'ogg'] }])
      if (!arq) return { ok: false }
      m.alterarConfig('avisos.somArquivo', arq)
      m.alterarConfig('avisos.somEscolhido', 'arquivo')
      return { ok: true }
    },
    'cofre.criarSenha': (e) => {
      const erro = cofre.criarSenhaMestra(e.senha)
      if (!erro) {
        m.alterarConfig('cofre.senhaMestra', true)
        m.cofreDestrancado()
      }
      return { ok: !erro, erro }
    },
    'cofre.removerSenha': (e) => {
      const erro = cofre.removerSenhaMestra(e.senha)
      if (!erro) m.alterarConfig('cofre.senhaMestra', false)
      return { ok: !erro, erro }
    },
    'cofre.destrancar': (e) => {
      const erro = cofre.destrancar(e.senha)
      if (!erro) m.cofreDestrancado()
      return { ok: !erro, erro }
    },
    'cofre.trancar': () => m.trancarCofre(),
    'cofre.salvar': (e) => {
      m.usarCofre()
      const erro = cofre.salvar(
        e.contaId,
        e.usuario,
        e.senha,
        e.seletores ?? cofre.dados(e.contaId)?.seletores ?? null,
      )
      return { ok: !erro, erro }
    },
    'cofre.obter': (e) => {
      m.usarCofre()
      const d = cofre.dados(e.contaId)
      return {
        aberto: cofre.aberto(),
        usuario: d?.usuario ?? null,
        temLogin: cofre.contasComLogin().includes(e.contaId),
        seletores: d?.seletores ?? null,
      }
    },
    'cofre.mostrarSenha': (e) => ({
      senha: m.mostrarSenha(e.contaId, () =>
        emitir('mensagem', { tipo: 'esconderSenha', contaId: e.contaId }),
      ),
    }),
    'cofre.apagar': (e) => cofre.apagar(e.contaId),
    'cofre.preencher': (e) => m.preencherLogin(e.ids),
    'cofre.ensinar': async (e) => {
      const pagina = fabrica.pagina(e.contaId)
      if (!pagina) return { ok: false }
      m.ativar(e.contaId)
      const r = (await pagina.rodarIsolado(scriptEnsinar(), 125_000).catch(() => null)) as {
        usuario: string
        senha: string
      } | null
      if (!r || typeof r.usuario !== 'string' || typeof r.senha !== 'string') return { ok: false }
      const seletores = { usuario: r.usuario.slice(0, 200), senha: r.senha.slice(0, 200) }
      const d = cofre.dados(e.contaId)
      if (d) cofre.salvar(e.contaId, d.usuario, d.senha, seletores)
      return { ok: true, seletores }
    },
    'painel.dados': () => m.dadosDoPainel(),
    'painel.aberto': (e) => m.definirPainelAberto(e.aberto),
    'backup.exportar': async (e) =>
      comDialogo(async () => {
        const arq = await escolherArquivo(true, `hdeck-${new Date().toISOString().slice(0, 10)}.hdeck`, [
          { name: 'Backup do HDeck', extensions: ['hdeck'] },
        ])
        if (!arq) return { ok: false }
        const gerar = () =>
          exportarBackup(
            { armazem, config: arquivoConfig, cofre, agora: Date.now() },
            {
              incluirCofre: e.incluirCofre,
              senhaBackup: e.senhaBackup,
              pastaSessoes: e.incluirSessoes ? join(pastaDados, 'WebView2', 'EBWebView') : undefined,
            },
          )
        const r = e.incluirSessoes ? await desligarTudoDurante(gerar) : gerar() // RN-161
        if (typeof r === 'string') return { ok: false, erro: r }
        writeFileSync(arq, r)
        return { ok: true, arquivo: arq }
      }),
    'backup.importar': async (e) =>
      comDialogo(async () => {
        const arq = await escolherArquivo(false, '', [{ name: 'Backup do HDeck', extensions: ['hdeck'] }])
        if (!arq) return { ok: false }
        const r = await desligarTudoDurante(() =>
          importarBackup(
            readFileSync(arq),
            {
              armazem,
              config: arquivoConfig,
              cofre,
              pastaSessoes: join(pastaDados, 'WebView2', 'EBWebView'),
            },
            e.senhaBackup,
          ),
        )
        if (typeof r === 'string') return { ok: false, erro: r }
        if (!modoTeste) {
          setTimeout(() => {
            saindo = true
            m.encerrar()
            app.relaunch()
            app.exit(0)
          }, 1500)
        }
        return { ok: true, resumo: r }
      }),
    'app.verificarAtualizacao': () => atualizador.procurar(),
    'app.reiniciarAtualizar': () => {
      saindo = true
      m.encerrar()
      return atualizador.reiniciarAgora()
    },
    'app.abrirPasta': (e) => shell.openPath(e.qual === 'logs' ? join(pastaDados, 'logs') : pastaDados),
    'app.limparCacheTodas': () => m.limparCacheTodas(),
    'app.sair': () => sair(),
    // O teclado pode ter ficado na página de uma conta (outra janela nativa): volta para a interface.
    'app.focarInterface': (_e, ctx) => {
      const w = janelas.obter(ctx.janela) as BrowserWindow | null
      if (!w || w.isDestroyed()) return
      fabrica.devolverTeclado(w)
      w.webContents.focus()
    },
    'app.silenciarTudo': (e) => m.silenciar(e.ligado),
    'app.telaCheia': (_e, ctx) => {
      const w = BrowserWindow.fromWebContents(ctx.wc)
      w?.setFullScreen(!w.isFullScreen())
    },
  }
  async function escolherPasta(): Promise<string | null> {
    const w = janelas.principal
    if (!w) return null
    const r = await dialog.showOpenDialog(w, { properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  }

  registrarIpc(manipuladores, {
    log,
    janelaDe: (wc) => janelas.idDaInterface(wc),
    origemValida: (url) => url.startsWith(`${origemInterface}/`),
  })

  // ---------- Janela, bandeja, energia ----------
  const principal = janelas.criarPrincipal()
  principal.webContents.on('did-finish-load', () => log.info('interface carregada'))
  principal.webContents.on('before-input-event', (ev, input: Input) => {
    if (input.type === 'keyDown' && tratarTecla(input)) ev.preventDefault()
  })
  // RN-070: a interface caiu → volta sozinha, sem recarregar as contas.
  principal.webContents.on('render-process-gone', (_e, d) => {
    log.erro('a interface caiu', { motivo: d.reason })
    if (!saindo) setTimeout(() => !principal.isDestroyed() && principal.webContents.reload(), 500)
  })
  bandeja.criar()
  ouvirEnergia(() => m.aoAcordar())
  principal.on('move', () => fabrica.janelaMoveu())
  try {
    await cliente.iniciar()
  } catch (e) {
    log.erro('o motor das páginas não abriu', { erro: String(e) })
    void perguntador.informar(t('dialogo.motorFaltando'))
  }
  fabrica.definirAtalhos([...mapa.keys()])
  // RAM e CPU (Painel, barra de título e grupos): o motor mede tudo a cada 2 s, como o Gerenciador de Tarefas.
  // Regra (RN-092): nenhuma janela fica aberta escondida. A cada 30 s o zelador fecha toda janela do
  // Electron que não está à vista e não é da interface nem de uma live ligada (ex.: pop-up de uma página
  // oculta, player de uma live que já desligou). Devolve quantas fechou.
  function zelarJanelas(): number {
    const snap = m.snapshot()
    const interfaces = new Set([
      janelas.principal,
      janelas.lives,
      ...janelas.grupos.values(),
      ...janelas.soltas.values(),
    ])
    let fechadas = 0
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.isDestroyed() || interfaces.has(w)) continue
      const liveId = janelasDasLives.get(w)
      const live = liveId ? snap.lives.find((l) => l.id === liveId) : undefined
      const daLiveLigada = !!live && live.ligada && snap.estados[live.contaId]?.estado !== 'desligada'
      if (daLiveLigada || (w.isVisible() && !liveId)) continue
      log.aviso('janela escondida fechada', { url: urlSemParametros(w.webContents.getURL()) })
      w.destroy()
      fechadas++
    }
    return fechadas
  }
  setInterval(() => !saindo && zelarJanelas(), 30_000)

  let medindo = false
  setInterval(() => {
    if (medindo || saindo) return
    medindo = true
    void fabrica
      .medir(app.getAppMetrics().map((x) => x.pid))
      .then((ms) => sistema.definirMedicao(ms))
      .catch(() => sistema.definirMedicao(null))
      .finally(() => {
        medindo = false
      })
  }, 2000)
  m.iniciar({ reaberto })
  if (app.isPackaged && !modoTeste) setTimeout(() => void atualizador.procurar(), 30_000)

  if (modoTeste) {
    Object.assign(globalThis, {
      hdeckTeste: {
        motor: m,
        fabrica,
        janelas,
        perguntador,
        cofre,
        armazem,
        sistema,
        executarComando,
        zelarJanelas,
        proximoArquivo: undefined,
        async encerrar() {
          saindo = true
          m.encerrar()
          await cliente.encerrar()
        },
      },
    })
  }
  log.info('HDeck aberto', { versao: app.getVersion(), reaberto })

  // Diagnóstico sem automação (modo de teste): abre uma URL numa conta, espera e grava foto + sinais
  // que sites antirrobô olham. Serve para conferir o Cloudflare sem o Playwright ligado.
  if (modoTeste && process.env.HDECK_TESTE_DIAG_URL) {
    const url = process.env.HDECK_TESTE_DIAG_URL
    const saida = process.env.HDECK_TESTE_DIAG_SAIDA ?? join(pastaDados, 'diag')
    if (process.env.HDECK_TESTE_DIAG_SEM_VIGIA) m.alterarConfig('queda.recarregarQuandoCair', false)
    const g = m.listarGrupos()[0]!
    const r = m.adicionarConta({ grupoId: g.id, url, nome: 'Diag' })
    m.ligarGrupo(g.id, true, true)
    if (r.ok && process.env.HDECK_TESTE_DIAG_ATIVA) setTimeout(() => m.ativar(r.valor.id), 500)
    setTimeout(
      async () => {
        const pg = r.ok ? fabrica.pagina(r.valor.id) : undefined
        if (pg) {
          const img = await pg.capturar(0, 0)
          if (img) writeFileSync(`${saida}.png`, img)
          const sinais = await pg
            .lerPagina(
              'JSON.stringify({ ua: navigator.userAgent, webdriver: navigator.webdriver, brands: navigator.userAgentData?.brands, plugins: navigator.plugins.length, langs: navigator.languages })',
            )
            .catch((e: unknown) => String(e))
          writeFileSync(`${saida}.json`, JSON.stringify({ url: pg.urlAtual(), sinais }, null, 2))
        }
        app.exit(0)
      },
      Number(process.env.HDECK_TESTE_DIAG_SEG ?? 25) * 1000,
    )
  }
}

/** RN-070: erro não tratado → registra e reabre (no máximo 3 vezes em 10 min). */
function instalarReabertura(log: ReturnType<typeof criarLog>): void {
  const arquivo = join(pastaDados, 'reaberturas.json')
  // Promessa rejeitada sem tratamento não derruba o app: só vai para o log.
  process.on('unhandledRejection', (e) =>
    log.aviso('promessa rejeitada sem tratamento', { erro: String((e as Error)?.stack ?? e) }),
  )
  process.on('uncaughtException', (e) => {
    log.erro('erro não tratado', { erro: String(e?.stack ?? e) })
    let lista: number[] = []
    try {
      lista = JSON.parse(readFileSync(arquivo, 'utf8')) as number[]
    } catch {
      lista = []
    }
    const agora = Date.now()
    if (!podeReabrir(lista, agora) || modoTeste) {
      app.exit(1)
      return
    }
    writeFileSync(arquivo, JSON.stringify([...lista.filter((x) => agora - x < 10 * 60_000), agora]))
    app.relaunch({ args: [...process.argv.slice(1).filter((a) => a !== '--reaberto'), '--reaberto'] })
    app.exit(1)
  })
}

/**
 * Composição do HDeck (Seção 4.1): flags, instância única, núcleo e adaptadores.
 * Nenhuma regra de negócio aqui: só monta as peças e liga o IPC.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  type Input,
  Menu,
  type MenuItemConstructorOptions,
  nativeTheme,
  net,
  protocol,
  safeStorage,
  session,
  shell,
  type WebContents,
} from 'electron'
import { type Config, configPadrao } from '@shared/config/esquema.ts'
import { type Comando, comandoDaTecla, mapaDeAtalhos } from '@shared/dados/atalhos.ts'
import { catalogoDeJogos } from '@shared/dados/catalogo.ts'
import { t } from '@shared/i18n/index.ts'
import { eventoIpc, type Evento } from '@shared/ipc/contrato.ts'
import type { Conta, Grupo } from '@shared/tipos/dominio.ts'
import { Atualizador } from './adaptadores/updater.ts'
import { Bandeja } from './adaptadores/electron/bandeja.ts'
import { instalarEndurecimento } from './adaptadores/electron/endurecimento.ts'
import { GerenciadorJanelas } from './adaptadores/electron/janelas.ts'
import { FabricaLivesElectron } from './adaptadores/electron/live-offscreen.ts'
import { FabricaPaginasElectron, particaoDa } from './adaptadores/electron/pagina-conta.ts'
import { type Perguntador, PerguntadorDeTeste, PerguntadorNativo } from './adaptadores/electron/perguntador.ts'
import { MUNDO_ISOLADO, scriptEnsinar } from './adaptadores/electron/scripts-pagina.ts'
import { CanaisLocaisElectron, ouvirEnergia, redeElectron, SistemaElectron } from './adaptadores/electron/sistema.ts'
import { ArmazemSqlite } from './adaptadores/node/armazem-sqlite.ts'
import { exportarBackup, importarBackup } from './adaptadores/node/backup.ts'
import { Cofre } from './adaptadores/node/cofre.ts'
import { ConfigArquivo } from './adaptadores/node/config-arquivo.ts'
import { ClienteHttpFetch } from './adaptadores/node/http.ts'
import { criarLog } from './adaptadores/node/log.ts'
import { type Contexto, type Manipuladores, registrarIpc } from './ipc/roteador.ts'
import { sugerirJogo } from './nucleo/contas/contas.ts'
import { Motor } from './nucleo/motor.ts'
import { podeReabrir } from './nucleo/painel/painel.ts'
import type { Relogio } from './nucleo/portas.ts'
import { userAgentLimpo } from './nucleo/seguranca/politicas.ts'

const modoTeste = process.env.HDECK_TESTE === '1'
if (process.env.HDECK_DADOS) app.setPath('userData', process.env.HDECK_DADOS)
app.setName('HDeck')
app.setAppUserModelId('br.hera.hdeck')
const pastaDados = app.getPath('userData')
mkdirSync(pastaDados, { recursive: true })

// ---------- Flags do Chromium (Seção 5.2, ADR 0002) ----------
// Sem isto, páginas escondidas são estranguladas: timers a 1/s e depois 1/min, e janelas cobertas param.
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,IntensiveWakeUpThrottling')

const arquivoConfig = new ConfigArquivo(join(pastaDados, 'config.json'))
if (!arquivoConfig.ler().avancado.aceleracaoHardware) app.disableHardwareAcceleration() // vale ao reiniciar

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
])

// RN-172: só uma cópia.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void iniciar()
}

const relogioReal: Relogio = {
  agora: () => Date.now(),
  depois: (ms, fn) => {
    const h = setTimeout(fn, ms)
    return () => clearTimeout(h)
  },
  aCada: (ms, fn) => {
    const h = setInterval(fn, ms)
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
    const arq = normalize(join(pastaInterface, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname)))
    if (!arq.startsWith(pastaInterface + sep) && arq !== pastaInterface) return new Response('proibido', { status: 403 })
    const r = await net.fetch(pathToFileURL(arq).toString())
    const tipos: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }
    return new Response(r.body, {
      status: r.status,
      headers: { 'content-type': tipos[extname(arq)] ?? 'application/octet-stream', 'content-security-policy': CSP },
    })
  })
  const urlDev = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
  const origemInterface = urlDev ? new URL(urlDev).origin : 'app://hdeck'
  const urlInterface = (consulta: string) => (urlDev ? `${urlDev}?${consulta}` : `app://hdeck/index.html?${consulta}`)

  const perguntador: Perguntador = modoTeste ? new PerguntadorDeTeste() : new PerguntadorNativo()
  const armazem = new ArmazemSqlite(join(pastaDados, 'hdeck.db'))
  for (const j of catalogoDeJogos()) if (!armazem.listarJogos().some((x) => x.id === j.id)) armazem.salvarJogo(j)
  const protecao = {
    disponivel: () => safeStorage.isEncryptionAvailable(),
    proteger: (d: Uint8Array) => safeStorage.encryptString(Buffer.from(d).toString('base64')),
    desproteger: (d: Uint8Array) => Buffer.from(safeStorage.decryptString(Buffer.from(d)), 'base64'),
  }
  const cofre = new Cofre(armazem, protecao)
  cofre.iniciar()

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
      motor?.definirEspacos(`solta:${contaId}`, [{ contaId, retangulo: { x: 0, y: 0, largura, altura }, tipo: 'conta' }]),
    aoFecharSolta: (contaId) => {
      fabrica.voltarParaPrincipal(contaId)
      motor?.definirEspacos(`solta:${contaId}`, [])
      motor?.devolvida(contaId)
    },
    aoFecharPrincipal: (e) => {
      if (saindo) return
      e.preventDefault()
      // RN-171: fechar no X manda para a bandeja.
      if (motor?.obterConfig().geral.fecharVaiParaBandeja) janelas.principal?.hide()
      else void sair()
    },
    aoFecharJanelaGrupo: (grupoId) => {
      contasPorJanelaGrupo.delete(grupoId)
      motor?.definirEspacos(`grupo:${grupoId}`, [])
    },
    iniciarEscondida: process.argv.includes('--bandeja') && arquivoConfig.ler().geral.abrirNaBandeja,
  })

  instalarEndurecimento({
    ehInterface: (wc) => janelas.idDaInterface(wc) !== null,
    notificacoesDaSessao: (s) =>
      motor?.listarContas().some((c) => c.notificacoesDaPagina && session.fromPartition(particaoDa(c.id)) === s) ?? false,
    modoTeste,
    perguntador,
    log,
    aoBloquearDownload: (nome) => emitir('mensagem', { tipo: 'aviso', texto: t('dialogo.downloadBloqueado', { nome }) }),
  })

  const fabrica = new FabricaPaginasElectron({
    log,
    janela: (id) => janelas.obter(id),
    principal: () => janelas.principal,
    aoTeclar: (_contaId, input) => tratarTecla(input),
    pastaDados,
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
      const tipo = extname(c.somArquivo).toLowerCase() === '.wav' ? 'audio/wav' : extname(c.somArquivo) === '.ogg' ? 'audio/ogg' : 'audio/mpeg'
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
    lives: new FabricaLivesElectron(log, modoTeste ? (process.env.HDECK_TESTE_LIVE_URL ?? null) : null),
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
      ? { endpoints: { telegram: (tk: string) => `${process.env.HDECK_TESTE_TELEGRAM_URL}/bot${tk}/sendMessage` } }
      : {}),
  })
  const m = motor

  const atualizador = new Atualizador(log, (e) => emitir('atualizacao.estado', e))
  let configAnterior: Config = configPadrao()
  const aoMudarEstado = (s: ReturnType<Motor['snapshot']>) => {
    const c = s.config
    if (c !== configAnterior) {
      if (c.geral.atalhos !== configAnterior.geral.atalhos) mapa = mapaDeAtalhos(c.geral.atalhos)
      if (c.geral.tema !== configAnterior.geral.tema) nativeTheme.themeSource = c.geral.tema === 'sistema' ? 'system' : c.geral.tema === 'claro' ? 'light' : 'dark'
      if (c.geral.iniciarComWindows !== configAnterior.geral.iniciarComWindows && app.isPackaged && !modoTeste)
        app.setLoginItemSettings({ openAtLogin: c.geral.iniciarComWindows, args: ['--bandeja'] }) // RN-170
      if (c.atualizacao.canal !== configAnterior.atualizacao.canal) atualizador.definirCanal(c.atualizacao.canal)
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
    if (m.obterConfig().geral.confirmarAoSair && m.contasLigadas() > 0) {
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
    bandeja.destruir()
    armazem.fechar()
    app.quit()
  }
  app.on('before-quit', () => {
    saindo = true
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
  const executarComando = (cmd: Comando): void => {
    const s = m.snapshot()
    const ativa = s.ativaId
    const lista = contasDoGrupoAtual()
    if (cmd.startsWith('conta.') && /\d$/.test(cmd)) {
      const c = lista[Number(cmd.slice(-1)) - 1]
      if (c) {
        m.ativar(c.id)
        emitir('comando', { cmd: 'focar', contaId: c.id })
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

  // ---------- Menus "⋯" nativos (Seção 4.3) ----------
  const dialogoNaInterface = (qual: string, id: string) => emitir('comando', { cmd: 'dialogo', qual, id })
  const confirmarExcessos = async (excessos: { jogoNome: string; limite: number; total: number }[]) => {
    const e = excessos[0]!
    const r = await perguntador.perguntar({
      mensagem: t('limite.titulo'),
      detalhe: t('limite.texto', { jogo: e.jogoNome, limite: e.limite, total: e.total }),
      botoes: [t('limite.continuar'), t('comum.cancelar')],
      janela: janelas.principal,
    })
    return r === 0
  }
  const ligarGrupoComConfirmacao = async (id: string, trocar: boolean) => {
    let r = trocar ? m.trocarGrupo(id) : m.ligarGrupo(id, true)
    if (!r.ok && (await confirmarExcessos(r.erro.excessos))) r = trocar ? m.trocarGrupo(id, true) : m.ligarGrupo(id, true, true)
    return r
  }

  const menuDaConta = (id: string): MenuItemConstructorOptions[] => {
    const c = m.conta(id)
    if (!c) return []
    const ligada = m.idsLigadas().includes(id)
    const s = m.snapshot()
    const jogo = s.jogos.find((j) => j.id === c.jogoId)
    const mostrarLives = s.config.lives.mostrarEmTodas || (jogo?.bonusLive ?? false)
    const zoom = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5]
    return [
      { label: t('conta.recarregar'), enabled: ligada, click: () => m.recarregar(id, false) },
      { label: t('conta.recarregarSemCache'), enabled: ligada, click: () => m.recarregar(id, true) },
      ligada
        ? { label: t('conta.desligar'), click: () => m.desligarConta(id) }
        : { label: t('conta.ligar'), click: () => void m.lote([id], 'ligar') },
      { label: c.som ? t('conta.silenciar') : t('conta.ativarSom'), click: () => m.editarConta(id, { som: !c.som }) },
      { type: 'separator' },
      { label: t('conta.soltar'), enabled: ligada, click: () => m.soltar(id) },
      ...(mostrarLives ? [{ label: `${t('conta.lives')}…`, click: () => dialogoNaInterface('lives', id) }] : []),
      { label: `${t('cfg.cofre.t')}…`, click: () => dialogoNaInterface('cofre', id) },
      { label: t('conta.preencherLogin'), enabled: ligada, click: () => void m.preencherLogin([id]) },
      {
        label: t('conta.foraDaTela'),
        submenu: (['padrao_do_jogo', 'manter', 'economizar'] as const).map((p) => ({
          label: p === 'padrao_do_jogo' ? t('conta.politicaPadrao') : p === 'manter' ? t('grupo.manterFarmando') : t('grupo.economizar'),
          type: 'radio' as const,
          checked: c.politicaForaTela === p,
          click: () => m.editarConta(id, { politicaForaTela: p }),
        })),
      },
      {
        label: t('conta.zoom'),
        submenu: zoom.map((z) => ({
          label: `${Math.round(z * 100)}%`,
          type: 'radio' as const,
          checked: Math.abs(c.zoom - z) < 0.01,
          click: () => m.editarConta(id, { zoom: z }),
        })),
      },
      {
        label: t('conta.mover'),
        submenu: s.grupos
          .filter((g) => g.id !== c.grupoId)
          .map((g) => ({ label: g.nome, click: () => m.moverConta(id, g.id, 9999) })),
      },
      { type: 'separator' },
      { label: t('conta.duplicar'), click: () => m.duplicar(id) },
      { label: t('conta.limparCache'), enabled: ligada, click: () => void m.limparCache(id) },
      { label: t('conta.devtools'), enabled: ligada, click: () => m.abrirDevtools(id) },
      { label: `${t('conta.editar')}…`, click: () => dialogoNaInterface('editarConta', id) },
      { label: `${t('conta.apagar')}…`, click: () => dialogoNaInterface('apagarConta', id) },
    ]
  }

  const menuDoGrupo = (id: string): MenuItemConstructorOptions[] => {
    const s = m.snapshot()
    const g = s.grupos.find((x) => x.id === id)
    if (!g) return []
    const jogos = [...new Set(s.contas.filter((c) => c.grupoId === id).map((c) => c.jogoId))]
      .map((jid) => s.jogos.find((j) => j.id === jid))
      .filter((j) => j !== undefined)
    return [
      g.ligado
        ? { label: t('lateral.desligar'), click: () => m.ligarGrupo(id, false) }
        : { label: t('lateral.ligar'), click: () => void ligarGrupoComConfirmacao(id, false) },
      { label: t('grupo.trocar'), click: () => void ligarGrupoComConfirmacao(id, true) },
      {
        label: t('titulo.recarregarGrupo'),
        enabled: g.ligado,
        click: () =>
          void m.lote(
            s.contas.filter((c) => c.grupoId === id).map((c) => c.id),
            'recarregar',
          ),
      },
      { label: t('grupo.abrirJanela'), click: () => janelas.abrirGrupo(id, g.nome) },
      {
        label: t('grupo.foraDaTela'),
        enabled: jogos.length > 0,
        submenu: jogos.map((j) => ({
          label: j.nome,
          submenu: (['manter', 'economizar'] as const).map((p) => ({
            label: p === 'manter' ? t('grupo.manterFarmando') : t('grupo.economizar'),
            type: 'radio' as const,
            checked: (g.layout.politicas[j.id] ?? 'manter') === p,
            click: () => m.definirPolitica(id, j.id, p),
          })),
        })),
      },
      { type: 'separator' },
      { label: `${t('grupo.renomear')}…`, click: () => dialogoNaInterface('editarGrupo', id) },
      { label: `${t('grupo.apagar')}…`, click: () => dialogoNaInterface('apagarGrupo', id) },
    ]
  }
  const abrirMenu = (itens: MenuItemConstructorOptions[], wc: WebContents, x: number, y: number) => {
    const w = BrowserWindow.fromWebContents(wc)
    if (w) Menu.buildFromTemplate(itens).popup({ window: w, x, y })
  }

  // ---------- IPC ----------
  const validarWebhook = (url: string) =>
    url === '' ||
    /^https:\/\/((canary|ptb)\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url) ||
    (modoTeste && /^http:\/\/localhost:\d+\//.test(url))
  const validarToken = (tk: string) => tk === '' || /^\d{5,}:[\w-]{20,}$/.test(tk) || (modoTeste && /^teste:/.test(tk))

  const caminhoDeTeste = () => (globalThis as { hdeckTeste?: { proximoArquivo?: string } }).hdeckTeste?.proximoArquivo
  async function escolherArquivo(salvar: boolean, nome: string, filtros: Electron.FileFilter[]): Promise<string | null> {
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
    const ligados = m.listarGrupos().filter((g) => g.ligado).map((g) => g.id)
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
    'grupos.menu': (e, ctx) => abrirMenu(menuDoGrupo(e.id), ctx.wc, e.x, e.y),
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
    'contas.menu': (e, ctx) => abrirMenu(menuDaConta(e.id), ctx.wc, e.x, e.y),
    'contas.lote': async (e) => {
      if (e.acao === 'fotos') {
        const fotos = await m.fotosDe(e.ids)
        const pasta = modoTeste && caminhoDeTeste() ? caminhoDeTeste()! : await escolherPasta()
        if (!pasta) return { ok: false }
        mkdirSync(pasta, { recursive: true })
        const data = new Date().toISOString().replace(/[:.]/g, '-')
        for (const f of fotos) writeFileSync(join(pasta, `${f.nome.replace(/[^\w\s-]/g, '_')}-${data}.png`), f.dados)
        emitir('mensagem', { tipo: 'ok', texto: t('lote.fotosSalvas', { n: fotos.length, pasta }) })
        return { ok: true, feitas: fotos.length }
      }
      const r = await m.lote(e.ids, e.acao, { zoom: e.zoom, grupoId: e.grupoId, confirmado: e.confirmado })
      if (r.ok) return { ok: true, ...r.valor }
      return typeof r.erro === 'string' ? { ok: false, erro: r.erro } : { ok: false, excessos: r.erro.excessos }
    },
    'contas.espacos': (e, ctx) => m.definirEspacos(ctx.janela, e.espacos),
    'contas.sugerirJogo': (e) => sugerirJogo(e.url, m.listarJogos())?.id ?? null,
    'contas.devtools': (e) => m.abrirDevtools(e.id),
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
    'textos.salvar': (e) => m.salvarTexto(e),
    'textos.apagar': (e) => m.apagarTexto(e.id),
    'avisos.listar': (e) => m.listarAvisos(e.limite),
    'avisos.marcarLidos': () => m.marcarAvisosLidos(),
    'avisos.testar': async (e) => {
      if (e.canal === 'windows') {
        locais.notificar({ id: 'teste', contaId: null, tipo: 'caiu', mensagem: t('avisos.teste'), criadoEm: Date.now(), lido: true }, t('app.nome'))
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
      const erro = cofre.salvar(e.contaId, e.usuario, e.senha, e.seletores ?? cofre.dados(e.contaId)?.seletores ?? null)
      return { ok: !erro, erro }
    },
    'cofre.obter': (e) => {
      m.usarCofre()
      const d = cofre.dados(e.contaId)
      return { aberto: cofre.aberto(), usuario: d?.usuario ?? null, temLogin: cofre.contasComLogin().includes(e.contaId), seletores: d?.seletores ?? null }
    },
    'cofre.mostrarSenha': (e) => ({ senha: m.mostrarSenha(e.contaId, () => emitir('mensagem', { tipo: 'esconderSenha', contaId: e.contaId })) }),
    'cofre.apagar': (e) => cofre.apagar(e.contaId),
    'cofre.preencher': (e) => m.preencherLogin(e.ids),
    'cofre.ensinar': async (e) => {
      const view = fabrica.view(e.contaId)
      if (!view) return { ok: false }
      m.ativar(e.contaId)
      const r = (await view.webContents
        .executeJavaScriptInIsolatedWorld(MUNDO_ISOLADO, [{ code: scriptEnsinar() }])
        .catch(() => null)) as { usuario: string; senha: string } | null
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
            { incluirCofre: e.incluirCofre, senhaBackup: e.senhaBackup, pastaSessoes: e.incluirSessoes ? join(pastaDados, 'Partitions') : undefined },
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
          importarBackup(readFileSync(arq), { armazem, config: arquivoConfig, cofre, pastaSessoes: join(pastaDados, 'Partitions') }, e.senhaBackup),
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
  m.iniciar({ reaberto })
  if (app.isPackaged && !modoTeste) setTimeout(() => void atualizador.procurar(), 30_000)

  if (modoTeste) {
    Object.assign(globalThis, {
      hdeckTeste: { motor: m, fabrica, janelas, perguntador, cofre, armazem, sistema, executarComando, proximoArquivo: undefined },
    })
  }
  log.info('HDeck aberto', { versao: app.getVersion(), reaberto })
}

/** RN-070: erro não tratado → registra e reabre (no máximo 3 vezes em 10 min). */
function instalarReabertura(log: ReturnType<typeof criarLog>): void {
  const arquivo = join(pastaDados, 'reaberturas.json')
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

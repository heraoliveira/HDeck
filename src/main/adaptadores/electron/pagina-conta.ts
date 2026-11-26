import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type BaseWindow, type Input, session, WebContentsView } from 'electron'
import { PADROES } from '@shared/dados/padroes-config.ts'
import type { Conta } from '@shared/tipos/dominio.ts'
import { validarEncontrados } from '../../nucleo/avisos/textos.ts'
import type {
  DadosLogin,
  EventosPagina,
  Exibicao,
  FabricaPaginas,
  Log,
  PaginaConta,
  Seletores,
} from '../../nucleo/portas.ts'
import { MUNDO_ISOLADO, scriptExisteSeletor, scriptPreencher, scriptProcurarTextos } from './scripts-pagina.ts'
import { VigiaRede } from './vigia-rede.ts'

export type DependenciasPaginas = {
  log: Log
  /** Janela pelo id usado no núcleo ("principal", "solta:<id>", "grupo:<id>"). */
  janela: (id: string) => BaseWindow | null
  principal: () => BaseWindow | null
  /** Atalhos (RN-176): devolve true se a tecla foi tratada (e não chega ao jogo). */
  aoTeclar: (contaId: string, input: Input) => boolean
  pastaDados: string
}

export const particaoDa = (contaId: string) => `persist:conta-${contaId}`

/**
 * Página de uma conta: uma WebContentsView na partição da conta (Seção 5.1).
 * Fotos e contas fora da tela ficam presas à janela, só que invisíveis (prova técnica: a captura
 * de uma view tirada da janela não termina; ADR 0003).
 */
class PaginaContaElectron implements PaginaConta {
  readonly view: WebContentsView
  private janelaAtual: BaseWindow | null = null
  private vigia: VigiaRede
  private ultimoUso = 0

  constructor(
    private readonly conta: Conta,
    private readonly ev: EventosPagina,
    private readonly d: DependenciasPaginas,
  ) {
    this.view = new WebContentsView({
      webPreferences: {
        partition: particaoDa(conta.id),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        backgroundThrottling: false,
        spellcheck: false,
        webviewTag: false,
        enableWebSQL: false,
        autoplayPolicy: 'no-user-gesture-required',
        safeDialogs: true,
        navigateOnDragDrop: false,
      },
    })
    this.view.setBackgroundColor('#0f1117')
    this.view.setVisible(false)
    const wc = this.view.webContents
    this.vigia = new VigiaRede(wc, ev, d.log)
    wc.on('did-finish-load', () => ev.carregou(wc.getURL()))
    wc.on('did-fail-load', (_e, codigo, descricao, _url, principal) => {
      if (principal) ev.falhouCarregar(codigo, descricao)
    })
    wc.on('did-navigate', (_e, url, status) => {
      if (status > 0) ev.statusPrincipal(status)
      ev.navegou(url)
    })
    wc.on('did-navigate-in-page', (_e, url, principal) => {
      if (principal) ev.navegou(url)
    })
    wc.on('unresponsive', () => ev.travou())
    wc.on('responsive', () => ev.respondeu())
    wc.on('render-process-gone', (_e, det) => {
      if (det.reason !== 'clean-exit') ev.processoMorreu(det.reason)
    })
    wc.on('page-title-updated', (_e, titulo) => ev.tituloMudou(titulo))
    wc.on('input-event', (_e, input) => {
      if (input.type !== 'mouseDown' && input.type !== 'keyDown') return
      const agora = Date.now()
      if (agora - this.ultimoUso < 1000) return
      this.ultimoUso = agora
      ev.interagiu()
    })
    wc.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown' && d.aoTeclar(conta.id, input)) e.preventDefault()
    })
    this.anexar(d.principal())
  }

  private anexar(j: BaseWindow | null): void {
    if (!j || j.isDestroyed() || j === this.janelaAtual) return
    if (this.janelaAtual && !this.janelaAtual.isDestroyed()) this.janelaAtual.contentView.removeChildView(this.view)
    j.contentView.addChildView(this.view)
    this.janelaAtual = j
  }

  /** A janela solta vai fechar: devolve a view para a principal antes (sem recarregar, RN-019). */
  voltarParaPrincipal(): void {
    this.view.setVisible(false)
    this.anexar(this.d.principal())
  }

  carregar(url: string): void {
    void this.view.webContents.loadURL(url).catch(() => {})
  }

  recarregar(semCache: boolean): void {
    if (semCache) this.view.webContents.reloadIgnoringCache()
    else this.view.webContents.reload()
  }

  fechar(): void {
    this.vigia.definir(false)
    if (this.janelaAtual && !this.janelaAtual.isDestroyed()) this.janelaAtual.contentView.removeChildView(this.view)
    this.janelaAtual = null
    if (!this.view.webContents.isDestroyed()) this.view.webContents.close()
  }

  urlAtual(): string {
    return this.view.webContents.isDestroyed() ? this.conta.url : this.view.webContents.getURL() || this.conta.url
  }

  exibir(e: Exibicao): void {
    if (e.modo === 'viva') {
      this.anexar(this.d.janela(e.janela) ?? this.d.principal())
      this.view.setBounds({ x: e.retangulo.x, y: e.retangulo.y, width: e.retangulo.largura, height: e.retangulo.altura })
      this.view.setVisible(true)
      return
    }
    // Foto ou fora da tela: continua presa e rodando, só invisível.
    this.view.setVisible(false)
  }

  definirMudo(mudo: boolean): void {
    this.view.webContents.setAudioMuted(mudo)
  }

  definirZoom(fator: number): void {
    this.view.webContents.setZoomFactor(fator)
  }

  definirEstrangulamento(estrangular: boolean): void {
    this.view.webContents.setBackgroundThrottling(estrangular)
  }

  vigiar(ligado: boolean): void {
    this.vigia.definir(ligado)
  }

  async capturar(largura: number, altura: number): Promise<Uint8Array | null> {
    const wc = this.view.webContents
    if (wc.isDestroyed() || wc.isLoading()) return null
    // A foto é do tamanho do espaço na tela (Seção 4.4): a view assume esse tamanho mesmo escondida.
    if (largura > 0 && altura > 0 && !this.view.getVisible()) {
      const b = this.view.getBounds()
      if (b.width !== largura || b.height !== altura) this.view.setBounds({ ...b, width: largura, height: altura })
    }
    const img = await Promise.race([wc.capturePage(), new Promise<null>((r) => setTimeout(() => r(null), 3000))])
    if (!img || img.isEmpty()) return null
    if (largura === 0 || altura === 0) return img.toPNG()
    const { width } = img.getSize()
    const final = width > largura ? img.resize({ width: largura, quality: 'good' }) : img
    return final.toJPEG(PADROES.fotoQualidadeJpeg)
  }

  pid(): number | null {
    const wc = this.view.webContents
    if (wc.isDestroyed()) return null
    const p = wc.getOSProcessId()
    return p > 0 ? p : null
  }

  async procurarTextos(textos: string[]): Promise<string[]> {
    const wc = this.view.webContents
    if (wc.isDestroyed() || textos.length === 0) return []
    const r = await wc.executeJavaScriptInIsolatedWorld(MUNDO_ISOLADO, [{ code: scriptProcurarTextos(textos) }])
    return validarEncontrados(r)
  }

  async preencherLogin(dados: DadosLogin, seletores: Seletores | null): Promise<boolean> {
    const wc = this.view.webContents
    if (wc.isDestroyed()) return false
    const r = await wc.executeJavaScriptInIsolatedWorld(MUNDO_ISOLADO, [
      { code: scriptPreencher(dados.usuario, dados.senha, seletores) },
    ])
    return r === true
  }

  async existeSeletor(seletor: string): Promise<boolean> {
    const wc = this.view.webContents
    if (wc.isDestroyed()) return false
    return (await wc.executeJavaScriptInIsolatedWorld(MUNDO_ISOLADO, [{ code: scriptExisteSeletor(seletor) }])) === true
  }

  async limparCache(): Promise<void> {
    // Só os arquivos guardados: nunca cookies, armazenamento ou login (RN-056).
    await this.view.webContents.session.clearCache()
  }

  abrirDevtools(): void {
    this.view.webContents.openDevTools({ mode: 'detach' })
  }

  telaCheia(): void {
    const j = this.janelaAtual as (BaseWindow & { setFullScreen?: (v: boolean) => void; isFullScreen?: () => boolean }) | null
    if (j?.setFullScreen && j.isFullScreen) j.setFullScreen(!j.isFullScreen())
  }
}

/** Fábrica das páginas e limpeza das sessões apagadas (RN-015). */
export class FabricaPaginasElectron implements FabricaPaginas {
  readonly paginas = new Map<string, PaginaContaElectron>()
  private readonly arquivoPendentes: string

  constructor(private readonly d: DependenciasPaginas) {
    this.arquivoPendentes = join(d.pastaDados, 'sessoes-para-apagar.json')
    this.apagarPendentes()
  }

  criar(conta: Conta, eventos: EventosPagina): PaginaConta {
    const p = new PaginaContaElectron(conta, eventos, this.d)
    this.paginas.set(conta.id, p)
    p.view.webContents.once('destroyed', () => {
      if (this.paginas.get(conta.id) === p) this.paginas.delete(conta.id)
    })
    return p
  }

  view(contaId: string): WebContentsView | undefined {
    return this.paginas.get(contaId)?.view
  }

  voltarParaPrincipal(contaId: string): void {
    this.paginas.get(contaId)?.voltarParaPrincipal()
  }

  async apagarSessao(contaId: string): Promise<void> {
    const s = session.fromPartition(particaoDa(contaId))
    await s.clearStorageData()
    await s.clearCache()
    await s.clearAuthCache()
    const pasta = join(this.d.pastaDados, 'Partitions', `conta-${contaId}`)
    try {
      rmSync(pasta, { recursive: true, force: true, maxRetries: 3 })
    } catch {
      // O Chromium ainda segura arquivos: apaga na próxima abertura.
      this.adicionarPendente(pasta)
    }
  }

  private pendentes(): string[] {
    try {
      return existsSync(this.arquivoPendentes) ? (JSON.parse(readFileSync(this.arquivoPendentes, 'utf8')) as string[]) : []
    } catch {
      return []
    }
  }

  private adicionarPendente(pasta: string): void {
    writeFileSync(this.arquivoPendentes, JSON.stringify([...new Set([...this.pendentes(), pasta])]))
  }

  private apagarPendentes(): void {
    const restam = this.pendentes().filter((p) => {
      try {
        rmSync(p, { recursive: true, force: true })
        return false
      } catch {
        return true
      }
    })
    if (existsSync(this.arquivoPendentes)) writeFileSync(this.arquivoPendentes, JSON.stringify(restam))
  }
}

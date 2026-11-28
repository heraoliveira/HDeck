import { type SeletoresPlataforma, seletoresDasLives } from '@shared/dados/catalogo.ts'
import { PADROES } from '@shared/dados/padroes-config.ts'
import type { Live, PlataformaLive } from '@shared/tipos/dominio.ts'
import { dominioDe, dominioPertence } from '@shared/util/texto.ts'
import { BrowserWindow, nativeImage } from 'electron'
import { z } from 'zod'
import type { EstadoLidoLive, EventosLive, FabricaLives, Log, PaginaLive } from '../../nucleo/portas.ts'

/** Sessão das lives de uma conta (no Electron; as contas em si moram no WebView2, ADR 0014). */
const particaoDa = (contaId: string) => `persist:live-${contaId}`

import { bitmapLogo } from './icones.ts'
import { MUNDO_ISOLADO, scriptEstadoLive, scriptQualidade } from './scripts-pagina.ts'

const estadoSchema = z.object({
  aoVivo: z.boolean(),
  offline: z.boolean(),
  pedeLogin: z.boolean(),
  tocando: z.boolean(),
})

const prefsPagina = (contaId: string) => ({
  partition: particaoDa(contaId),
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  spellcheck: false,
  webviewTag: false,
})

/**
 * Live escondida (Seção 8.2, ADR 0004): BrowserWindow offscreen, sem mostrar, muda, a 1 quadro/s
 * no modo econômico, na partição da conta (RN-081). Ninguém ouve o evento `paint`.
 */
class PaginaLiveElectron implements PaginaLive {
  private readonly janela: BrowserWindow
  private visivel: BrowserWindow | null = null
  private qualidadeAplicada = false

  constructor(
    private readonly live: Live,
    private readonly sel: SeletoresPlataforma,
    ev: EventosLive,
  ) {
    this.janela = new BrowserWindow({
      show: false,
      width: PADROES.liveLargura,
      height: PADROES.liveAltura,
      paintWhenInitiallyHidden: true,
      webPreferences: { ...prefsPagina(live.contaId), offscreen: true, backgroundThrottling: false },
    })
    const wc = this.janela.webContents
    wc.setAudioMuted(true) // RN-083 / RN-101
    wc.on('did-finish-load', () => ev.carregou(wc.getURL()))
    wc.on('did-navigate', (_e, url) => ev.navegou(url))
    wc.on('did-navigate-in-page', (_e, url, principal) => {
      if (principal) ev.navegou(url)
    })
    wc.on('render-process-gone', () => ev.morreu())
  }

  carregar(url: string, qualidade: string): void {
    const wc = this.janela.webContents
    this.qualidadeAplicada = false
    wc.once('dom-ready', () => {
      // RN-085: grava a preferência do player e recarrega uma vez se mudou.
      const valor = this.sel.qualidade.valores[qualidade]
      if (!valor || this.qualidadeAplicada) return
      this.qualidadeAplicada = true
      void wc
        .executeJavaScriptInIsolatedWorld(MUNDO_ISOLADO, [
          { code: scriptQualidade(this.sel.qualidade.chave, valor) },
        ])
        .then((mudou) => {
          if (mudou === true && !wc.isDestroyed()) wc.reload()
        })
        .catch(() => {})
    })
    void this.janela.loadURL(url).catch(() => {})
  }

  fechar(): void {
    this.esconder()
    if (!this.janela.isDestroyed()) this.janela.destroy()
  }

  async lerEstado(): Promise<EstadoLidoLive> {
    const wc = this.janela.webContents
    if (!wc || wc.isDestroyed()) return { aoVivo: false, offline: false, pedeLogin: false, tocando: false }
    const r = await wc.executeJavaScriptInIsolatedWorld(MUNDO_ISOLADO, [{ code: scriptEstadoLive(this.sel) }])
    return estadoSchema.parse(r)
  }

  /** RN-083: "Mostrar" abre a live numa janela pequena visível, na mesma sessão. */
  mostrar(somLigado: boolean): void {
    if (this.visivel && !this.visivel.isDestroyed()) {
      this.visivel.webContents.setAudioMuted(!somLigado)
      this.visivel.focus()
      return
    }
    this.visivel = new BrowserWindow({
      width: 640,
      height: 400,
      icon: nativeImage.createFromBitmap(bitmapLogo(64), { width: 64, height: 64 }),
      autoHideMenuBar: true,
      title: this.live.canal,
      webPreferences: prefsPagina(this.live.contaId),
    })
    this.visivel.webContents.setAudioMuted(!somLigado)
    this.visivel.on('closed', () => {
      this.visivel = null
    })
    void this.visivel.loadURL(this.janela.webContents.getURL()).catch(() => {})
  }

  esconder(): void {
    if (this.visivel && !this.visivel.isDestroyed()) this.visivel.destroy()
    this.visivel = null
  }

  definirEconomico(ligado: boolean): void {
    if (!this.janela.isDestroyed()) this.janela.webContents.setFrameRate(ligado ? 1 : 30)
  }

  pid(): number | null {
    const wc = this.janela.webContents
    if (!wc || wc.isDestroyed()) return null
    const p = wc.getOSProcessId()
    return p > 0 ? p : null
  }
}

export class FabricaLivesElectron implements FabricaLives {
  private readonly seletores = seletoresDasLives()

  constructor(
    private readonly log: Log,
    /** Modo de teste: a live falsa (ex.: http://localhost:1234/live/{canal}). */
    private readonly urlDeTeste: string | null = null,
  ) {}

  criar(live: Live, eventos: EventosLive): PaginaLive {
    this.log.info('abrindo live', { plataforma: live.plataforma })
    return new PaginaLiveElectron(live, this.seletores[live.plataforma], eventos)
  }

  urlDoCanal(plataforma: PlataformaLive, canal: string): string {
    const modelo = this.urlDeTeste ?? this.seletores[plataforma].urlCanal
    return modelo.replace('{canal}', encodeURIComponent(canal))
  }

  canalDaUrl(plataforma: PlataformaLive, url: string): string | null {
    const host = dominioDe(url)
    if (!host) return null
    const modelo = new URL(this.urlDoCanal(plataforma, 'X'))
    const dominios = this.urlDeTeste ? [modelo.hostname] : this.seletores[plataforma].dominios
    if (!dominios.some((d) => dominioPertence(host, d))) return null
    const prefixo = modelo.pathname.replace(/X\/?$/, '')
    const caminho = new URL(url).pathname
    if (!caminho.startsWith(prefixo)) return null
    return decodeURIComponent(caminho.slice(prefixo.length).split('/')[0] ?? '') || null
  }

  abrirLogin(contaId: string, plataforma: PlataformaLive): void {
    const url = plataforma === 'twitch' ? 'https://www.twitch.tv/login' : 'https://kick.com/login'
    const w = new BrowserWindow({
      width: 520,
      height: 760,
      autoHideMenuBar: true,
      icon: nativeImage.createFromBitmap(bitmapLogo(64), { width: 64, height: 64 }),
      webPreferences: prefsPagina(contaId),
    })
    void w.loadURL(this.urlDeTeste ? this.urlDoCanal(plataforma, 'login') : url).catch(() => {})
  }
}

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type BaseWindow, BrowserWindow, nativeImage, screen, type WebContents } from 'electron'
import { z } from 'zod'
import { bitmapLogo } from './icones.ts'

const posicaoSchema = z.record(
  z.string(),
  z.object({
    x: z.number(),
    y: z.number(),
    largura: z.number(),
    altura: z.number(),
    maximizada: z.boolean(),
  }),
)
type Posicoes = z.infer<typeof posicaoSchema>

export type OpcoesJanelas = {
  pastaDados: string
  preload: string
  urlInterface: (consulta: string) => string
  /** Uma janela solta mudou de tamanho: o espaço da conta é a área toda (RN-019). */
  aoMedirSolta: (contaId: string, largura: number, altura: number) => void
  /** A janela solta vai fechar: devolver a view antes (sem recarregar). */
  aoFecharSolta: (contaId: string) => void
  aoFecharPrincipal: (e: { preventDefault: () => void }) => void
  aoFecharJanelaGrupo: (grupoId: string) => void
  iniciarEscondida: boolean
}

const prefsInterface = (preload: string) => ({
  preload,
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  webviewTag: false,
  spellcheck: false,
  // A interface pode ser estrangulada quando escondida: não roda jogo nenhum.
  backgroundThrottling: true,
})

/**
 * Janelas do app (Seções 7.3 e 12.2): a principal (frameless com os botões do Windows),
 * as contas soltas e os grupos em janela própria. Lembra monitor, posição e tamanho.
 */
export class GerenciadorJanelas {
  principal: BrowserWindow | null = null
  readonly soltas = new Map<string, BrowserWindow>()
  readonly grupos = new Map<string, BrowserWindow>()
  private posicoes: Posicoes = {}
  private readonly arquivo: string
  readonly icone = nativeImage.createFromBitmap(bitmapLogo(64), { width: 64, height: 64 })

  constructor(private readonly o: OpcoesJanelas) {
    this.arquivo = join(o.pastaDados, 'janelas.json')
    try {
      if (existsSync(this.arquivo))
        this.posicoes = posicaoSchema.parse(JSON.parse(readFileSync(this.arquivo, 'utf8')))
    } catch {
      this.posicoes = {}
    }
  }

  criarPrincipal(): BrowserWindow {
    const p = this.lugar('principal', 1280, 800)
    const w = new BrowserWindow({
      ...p,
      minWidth: 720,
      minHeight: 480,
      show: false,
      frame: false,
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#161a24', symbolColor: '#e8eaf0', height: 40 },
      backgroundColor: '#0f1117',
      icon: this.icone,
      title: 'HDeck',
      webPreferences: prefsInterface(this.o.preload),
    })
    this.lembrar(w, 'principal')
    w.on('close', (e) => this.o.aoFecharPrincipal(e))
    w.once('ready-to-show', () => {
      if (!this.o.iniciarEscondida) w.show()
      if (this.posicoes.principal?.maximizada) w.maximize()
    })
    void w.loadURL(this.o.urlInterface('janela=principal'))
    this.principal = w
    return w
  }

  /** RN-019: a conta vai para uma janela própria, sem recarregar. */
  soltar(contaId: string, titulo: string): BrowserWindow {
    const existente = this.soltas.get(contaId)
    if (existente && !existente.isDestroyed()) {
      existente.focus()
      return existente
    }
    const chave = `solta:${contaId}`
    const w = new BrowserWindow({
      ...this.lugar(chave, 960, 640),
      title: titulo,
      icon: this.icone,
      autoHideMenuBar: true,
      backgroundColor: '#0f1117',
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
    })
    this.lembrar(w, chave)
    const medir = () => {
      if (w.isDestroyed()) return
      const [largura, altura] = w.getContentSize() as [number, number]
      this.o.aoMedirSolta(contaId, largura, altura)
    }
    w.on('resize', medir)
    w.once('ready-to-show', medir)
    w.on('close', () => {
      this.o.aoFecharSolta(contaId)
      this.soltas.delete(contaId)
    })
    void w.loadURL('about:blank')
    this.soltas.set(contaId, w)
    setTimeout(medir, 50)
    return w
  }

  devolver(contaId: string): void {
    const w = this.soltas.get(contaId)
    if (w && !w.isDestroyed()) w.close()
  }

  /** Um grupo inteiro numa janela própria (Seção 7.3): outra cópia da interface, só daquele grupo. */
  abrirGrupo(grupoId: string, titulo: string): BrowserWindow {
    const existente = this.grupos.get(grupoId)
    if (existente && !existente.isDestroyed()) {
      existente.focus()
      return existente
    }
    const chave = `grupo:${grupoId}`
    const w = new BrowserWindow({
      ...this.lugar(chave, 1100, 720),
      title: titulo,
      icon: this.icone,
      frame: false,
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#161a24', symbolColor: '#e8eaf0', height: 40 },
      backgroundColor: '#0f1117',
      webPreferences: prefsInterface(this.o.preload),
    })
    this.lembrar(w, chave)
    w.on('closed', () => {
      this.grupos.delete(grupoId)
      this.o.aoFecharJanelaGrupo(grupoId)
    })
    void w.loadURL(
      this.o.urlInterface(`janela=${encodeURIComponent(chave)}&grupo=${encodeURIComponent(grupoId)}`),
    )
    this.grupos.set(grupoId, w)
    return w
  }

  /** Id da janela no núcleo. */
  obter(id: string): BaseWindow | null {
    if (id === 'principal') return this.principal
    if (id.startsWith('solta:')) return this.soltas.get(id.slice(6)) ?? null
    if (id.startsWith('grupo:')) return this.grupos.get(id.slice(6)) ?? null
    return null
  }

  /** Qual janela de interface mandou a mensagem (ou null se não for nossa). */
  idDaInterface(wc: WebContents): string | null {
    if (this.principal && !this.principal.isDestroyed() && this.principal.webContents === wc)
      return 'principal'
    for (const [g, w] of this.grupos) if (!w.isDestroyed() && w.webContents === wc) return `grupo:${g}`
    return null
  }

  interfaces(): WebContents[] {
    const out: WebContents[] = []
    if (this.principal && !this.principal.isDestroyed()) out.push(this.principal.webContents)
    for (const w of this.grupos.values()) if (!w.isDestroyed()) out.push(w.webContents)
    return out
  }

  mostrarPrincipal(): void {
    const w = this.principal
    if (!w || w.isDestroyed()) return
    if (w.isMinimized()) w.restore()
    w.show()
    w.focus()
  }

  private lugar(chave: string, largura: number, altura: number) {
    const p = this.posicoes[chave]
    if (!p) return { width: largura, height: altura }
    // Só restaura se o lugar ainda cabe num monitor ligado (dois monitores com escalas diferentes).
    const area = screen.getDisplayMatching({ x: p.x, y: p.y, width: p.largura, height: p.altura }).workArea
    const cabe =
      p.x + 40 >= area.x &&
      p.y + 20 >= area.y &&
      p.x < area.x + area.width - 40 &&
      p.y < area.y + area.height - 40
    return cabe
      ? { x: p.x, y: p.y, width: p.largura, height: p.altura }
      : { width: p.largura, height: p.altura }
  }

  private lembrar(w: BrowserWindow, chave: string): void {
    const salvar = () => {
      if (w.isDestroyed()) return
      const b = w.getNormalBounds()
      this.posicoes[chave] = {
        x: b.x,
        y: b.y,
        largura: b.width,
        altura: b.height,
        maximizada: w.isMaximized(),
      }
      try {
        writeFileSync(this.arquivo, JSON.stringify(this.posicoes))
      } catch {
        // disco cheio ou travado: só não lembra
      }
    }
    let t: ReturnType<typeof setTimeout> | null = null
    const adiar = () => {
      if (t) clearTimeout(t)
      t = setTimeout(salvar, 500)
    }
    w.on('move', adiar)
    w.on('resize', adiar)
    w.on('close', salvar)
  }
}

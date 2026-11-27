import type { Config } from '@shared/config/esquema.ts'
import type { EstadoLive, Live } from '@shared/tipos/dominio.ts'
import type { Cancelar, FabricaLives, PaginaLive, Relogio } from '../portas.ts'

export type AvisosLive = {
  encerrou(live: Live): void
  voltou(live: Live): void
  pedeLogin(live: Live): void
  mudou(liveId: string, estado: EstadoLive): void
}

type Viva = {
  live: Live
  pagina: PaginaLive | null
  estado: EstadoLive
  mostrando: boolean
  conferirEm: Cancelar | null
  carregouAoConferir?: boolean
}

const LER_A_CADA_MS = 30_000
/** Tempo que a live tem para começar a tocar ao conferir se voltou (RN-089). */
const ESPERA_CONFERIR_MS = 20_000

/**
 * Lives da Twitch e da Kick (Seção 8). Decide quais páginas de live existem e reage
 * ao que elas mostram. Nunca clica em nada (RN-090): só abre, lê e fecha.
 */
export class ControleLives {
  private vivas = new Map<string, Viva>()
  private leitura: Cancelar | null = null

  constructor(
    private readonly relogio: Relogio,
    private readonly config: () => Config,
    private readonly fabrica: FabricaLives,
    private readonly avisos: AvisosLive,
  ) {}

  iniciar(): void {
    this.leitura ??= this.relogio.aCada(LER_A_CADA_MS, () => void this.lerTodas())
  }

  parar(): void {
    this.leitura?.()
    this.leitura = null
    for (const id of [...this.vivas.keys()]) this.fechar(id, 'desligada')
  }

  estado(liveId: string): EstadoLive {
    return this.vivas.get(liveId)?.estado ?? 'desligada'
  }

  estados(): Record<string, EstadoLive> {
    return Object.fromEntries([...this.vivas].map(([id, v]) => [id, v.estado]))
  }

  abertasDaConta(contaId: string): number {
    return [...this.vivas.values()].filter((v) => v.live.contaId === contaId && v.pagina !== null).length
  }

  pids(): Map<number, string> {
    const out = new Map<number, string>()
    for (const v of this.vivas.values()) {
      const pid = v.pagina?.pid()
      if (pid) out.set(pid, v.live.contaId)
    }
    return out
  }

  /**
   * Põe as páginas de acordo com o que deve estar aberto: lives ligadas de contas ligadas,
   * com o sistema de lives ligado (RN-082) e respeitando o limite por conta (RN-086).
   */
  sincronizar(lives: readonly Live[], contasLigadas: ReadonlySet<string>): void {
    const cfg = this.config().lives
    const devem = new Set(
      cfg.ligadas ? lives.filter((l) => l.ligada && contasLigadas.has(l.contaId)).map((l) => l.id) : [],
    )
    for (const [id, v] of this.vivas) {
      if (!devem.has(id)) this.fechar(id, 'desligada')
      else v.live = lives.find((l) => l.id === id) ?? v.live
    }
    for (const l of [...lives].sort((a, b) => a.ordem - b.ordem)) {
      if (!devem.has(l.id) || this.vivas.has(l.id)) continue
      if (!this.cabeMaisUma(l.contaId)) continue
      this.abrir(l)
    }
  }

  /** RN-086: diminuir o limite não fecha as abertas, só impede abrir novas. */
  cabeMaisUma(contaId: string): boolean {
    const lim = this.config().lives.porConta
    return lim === 0 || this.abertasDaConta(contaId) < lim
  }

  /** RN-084: aplica o modo econômico a quem não está sendo mostrado. */
  aplicarEconomia(): void {
    const eco = this.config().lives.economico
    for (const v of this.vivas.values()) if (!v.mostrando) v.pagina?.definirEconomico(eco)
  }

  /** RN-083: "Mostrar" abre a live numa janela pequena; RN-101: com som só se o usuário ligar. */
  mostrar(liveId: string, som: boolean): boolean {
    const v = this.vivas.get(liveId)
    if (!v?.pagina) return false
    v.mostrando = true
    v.pagina.definirEconomico(false)
    v.pagina.mostrar(som)
    return true
  }

  esconder(liveId: string): void {
    const v = this.vivas.get(liveId)
    if (!v?.pagina) return
    v.mostrando = false
    v.pagina.esconder()
    v.pagina.definirEconomico(this.config().lives.economico)
  }

  /** Recarrega as lives da conta (ex.: depois de mudar a qualidade, RN-085). */
  recarregarDaConta(contaId: string): void {
    for (const v of this.vivas.values()) {
      if (v.live.contaId !== contaId || !v.pagina) continue
      v.pagina.carregar(
        this.fabrica.urlDoCanal(v.live.plataforma, v.live.canal),
        this.config().lives.qualidade,
      )
    }
  }

  async lerTodas(): Promise<void> {
    await Promise.all([...this.vivas.keys()].map((id) => this.ler(id)))
  }

  async ler(liveId: string): Promise<void> {
    const v = this.vivas.get(liveId)
    if (!v?.pagina || v.estado === 'conferindo') return
    let lido: Awaited<ReturnType<PaginaLive['lerEstado']>>
    try {
      lido = await v.pagina.lerEstado()
    } catch {
      return
    }
    if (!this.vivas.has(liveId)) return
    if (lido.pedeLogin) {
      if (v.estado !== 'pede_login') {
        this.mudar(v, 'pede_login')
        this.avisos.pedeLogin(v.live) // RN-091
      }
      return
    }
    if (lido.offline && !lido.aoVivo) {
      this.encerrou(v)
      return
    }
    if (lido.aoVivo || lido.tocando) this.mudar(v, 'tocando')
  }

  private abrir(live: Live, conferindo = false): void {
    const cfg = this.config().lives
    const viva: Viva = {
      live,
      pagina: null,
      estado: conferindo ? 'conferindo' : 'abrindo',
      mostrando: false,
      conferirEm: null,
    }
    this.vivas.set(live.id, viva)
    const pagina = this.fabrica.criar(live, {
      carregou: () => {
        if (viva.estado === 'abrindo') this.mudar(viva, 'tocando')
        // RN-089: ao conferir, dá um tempo para a página mostrar se está ao vivo depois de carregar.
        if (viva.estado === 'conferindo' && !viva.carregouAoConferir) {
          viva.carregouAoConferir = true
          viva.conferirEm?.()
          viva.conferirEm = this.relogio.depois(ESPERA_CONFERIR_MS, () => void this.concluirConferencia(viva))
        }
      },
      navegou: (url) => this.navegou(viva, url),
      morreu: () => {
        if (viva.pagina)
          viva.pagina.carregar(this.fabrica.urlDoCanal(live.plataforma, live.canal), cfg.qualidade)
      },
    })
    viva.pagina = pagina
    pagina.definirEconomico(cfg.economico)
    pagina.carregar(this.fabrica.urlDoCanal(live.plataforma, live.canal), cfg.qualidade)
    this.avisos.mudou(live.id, viva.estado)
    if (conferindo) {
      // Se a página nem carregar, conclui depois de um tempo maior (conta como encerrada).
      viva.conferirEm = this.relogio.depois(ESPERA_CONFERIR_MS * 3, () => void this.concluirConferencia(viva))
    }
  }

  /** RN-087: raid/host/clique levou a outro canal → volta ao cadastrado. */
  private navegou(v: Viva, url: string): void {
    if (!this.config().lives.voltarAoCanal || !v.pagina) return
    const canal = this.fabrica.canalDaUrl(v.live.plataforma, url)
    if (canal !== null && canal.toLowerCase() === v.live.canal.toLowerCase()) return
    v.pagina.carregar(this.fabrica.urlDoCanal(v.live.plataforma, v.live.canal), this.config().lives.qualidade)
  }

  /** RN-088 e RN-089 */
  private encerrou(v: Viva): void {
    const cfg = this.config().lives
    if (v.estado !== 'encerrada') this.avisos.encerrou(v.live)
    if (cfg.desligarEncerrada) {
      v.pagina?.fechar()
      v.pagina = null
    }
    this.mudar(v, 'encerrada')
    this.agendarReligar(v)
  }

  private agendarReligar(v: Viva): void {
    const cfg = this.config().lives
    v.conferirEm?.()
    v.conferirEm = null
    if (!cfg.religar || v.pagina) return
    v.conferirEm = this.relogio.depois(cfg.religarACadaMin * 60_000, () => {
      v.conferirEm = null
      if (this.vivas.get(v.live.id) !== v) return
      this.vivas.delete(v.live.id)
      this.abrir(v.live, true)
    })
  }

  private async concluirConferencia(v: Viva): Promise<void> {
    v.conferirEm = null
    if (this.vivas.get(v.live.id) !== v || !v.pagina) return
    let aoVivo = false
    try {
      const lido = await v.pagina.lerEstado()
      aoVivo = lido.aoVivo && !lido.offline
    } catch {
      aoVivo = false
    }
    if (aoVivo) {
      this.mudar(v, 'tocando')
      this.avisos.voltou(v.live)
      return
    }
    v.pagina.fechar()
    v.pagina = null
    this.mudar(v, 'encerrada')
    this.agendarReligar(v)
  }

  private fechar(id: string, estadoFinal: EstadoLive): void {
    const v = this.vivas.get(id)
    if (!v) return
    v.conferirEm?.()
    v.pagina?.fechar()
    this.vivas.delete(id)
    this.avisos.mudou(id, estadoFinal)
  }

  private mudar(v: Viva, e: EstadoLive): void {
    if (v.estado === e) return
    v.estado = e
    this.avisos.mudou(v.live.id, e)
  }
}

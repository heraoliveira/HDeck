import type {
  CanaisLocais,
  ClienteHttp,
  CofreLogins,
  DadosLogin,
  EstadoLidoLive,
  EventosLive,
  EventosPagina,
  Exibicao,
  FabricaLives,
  FabricaPaginas,
  Log,
  Metrica,
  PaginaConta,
  PaginaLive,
  PedidoHttp,
  Rede,
  RespostaHttp,
  Seletores,
  Sistema,
} from '../../src/main/nucleo/portas.ts'
import type { Aviso, Conta, Live, PlataformaLive } from '../../src/shared/tipos/dominio.ts'

let pidSeq = 1000

export class PaginaFalsa implements PaginaConta {
  url: string
  carregamentos: string[] = []
  recargas: { semCache: boolean }[] = []
  fechada = false
  exibicao: Exibicao = { modo: 'fora' }
  mudo = false
  zoom = 1
  estrangulada = false
  vigiando = false
  capturas = 0
  textosNaTela: string[] = []
  campos: DadosLogin | null = null
  enviou = false
  temCampos = true
  seletoresExistentes = new Set<string>()
  cacheLimpo = 0
  devtoolsAbertas = 0
  emTelaCheia = 0
  readonly meuPid = pidSeq++

  constructor(
    readonly conta: Conta,
    readonly ev: EventosPagina,
  ) {
    this.url = conta.url
  }

  carregar(url: string): void {
    this.url = url
    this.carregamentos.push(url)
  }
  recarregar(semCache: boolean): void {
    this.recargas.push({ semCache })
  }
  renovacoes = 0
  renovarProcesso(): void {
    this.renovacoes++
  }
  fechar(): void {
    this.fechada = true
  }
  urlAtual(): string {
    return this.url
  }
  exibir(e: Exibicao): void {
    this.exibicao = e
  }
  definirMudo(m: boolean): void {
    this.mudo = m
  }
  definirZoom(f: number): void {
    this.zoom = f
  }
  definirEstrangulamento(e: boolean): void {
    this.estrangulada = e
  }
  vigiar(l: boolean): void {
    this.vigiando = l
  }
  ultimaCaptura: { largura: number; altura: number; natural?: { largura: number; altura: number } } | null =
    null
  async capturar(
    largura = 0,
    altura = 0,
    natural?: { largura: number; altura: number },
  ): Promise<Uint8Array | null> {
    this.capturas++
    this.ultimaCaptura = { largura, altura, ...(natural ? { natural } : {}) }
    return new Uint8Array([1, 2, 3])
  }
  pid(): number | null {
    return this.fechada ? null : this.meuPid
  }
  async procurarTextos(textos: string[]): Promise<string[]> {
    return textos.filter((t) => this.textosNaTela.some((x) => x.toLowerCase().includes(t)))
  }
  async preencherLogin(dados: DadosLogin, _s: Seletores | null): Promise<boolean> {
    if (!this.temCampos) return false
    this.campos = dados
    return true
  }
  async existeSeletor(s: string): Promise<boolean> {
    return this.seletoresExistentes.has(s)
  }
  async limparCache(): Promise<void> {
    this.cacheLimpo++
  }
  abrirDevtools(): void {
    this.devtoolsAbertas++
  }
  telaCheia(): void {
    this.emTelaCheia++
  }
}

export class FabricaPaginasFalsa implements FabricaPaginas {
  paginas = new Map<string, PaginaFalsa>()
  todas: PaginaFalsa[] = []
  sessoesApagadas: string[] = []
  criar(conta: Conta, ev: EventosPagina): PaginaConta {
    const p = new PaginaFalsa(conta, ev)
    this.paginas.set(conta.id, p)
    this.todas.push(p)
    return p
  }
  async apagarSessao(id: string): Promise<void> {
    this.sessoesApagadas.push(id)
  }
  de(id: string): PaginaFalsa {
    const p = this.paginas.get(id)
    if (!p) throw new Error(`sem página ${id}`)
    return p
  }
}

export class PaginaLiveFalsa implements PaginaLive {
  carregamentos: { url: string; qualidade: string }[] = []
  fechada = false
  visivel = false
  som = false
  economico = false
  estadoLido: EstadoLidoLive = { aoVivo: true, offline: false, pedeLogin: false, tocando: true }
  readonly meuPid = pidSeq++
  constructor(
    readonly live: Live,
    readonly ev: EventosLive,
  ) {}
  carregar(url: string, qualidade: string): void {
    this.carregamentos.push({ url, qualidade })
  }
  fechar(): void {
    this.fechada = true
  }
  async lerEstado(): Promise<EstadoLidoLive> {
    return this.estadoLido
  }
  mostrar(som: boolean): void {
    this.visivel = true
    this.som = som
  }
  esconder(): void {
    this.visivel = false
    this.som = false
  }
  definirEconomico(l: boolean): void {
    this.economico = l
  }
  pid(): number | null {
    return this.fechada ? null : this.meuPid
  }
}

export class FabricaLivesFalsa implements FabricaLives {
  criadas: PaginaLiveFalsa[] = []
  logins: string[] = []
  criar(live: Live, ev: EventosLive): PaginaLive {
    const p = new PaginaLiveFalsa(live, ev)
    this.criadas.push(p)
    return p
  }
  urlDoCanal(p: PlataformaLive, canal: string): string {
    return p === 'twitch' ? `https://www.twitch.tv/${canal}` : `https://kick.com/${canal}`
  }
  canalDaUrl(_p: PlataformaLive, url: string): string | null {
    try {
      return new URL(url).pathname.split('/').filter(Boolean)[0] ?? null
    } catch {
      return null
    }
  }
  abrirLogin(contaId: string, plataforma: PlataformaLive): void {
    this.logins.push(`${contaId}:${plataforma}`)
  }
  abertas(): PaginaLiveFalsa[] {
    return this.criadas.filter((p) => !p.fechada)
  }
  ultimaDe(liveId: string): PaginaLiveFalsa | undefined {
    return [...this.criadas].reverse().find((p) => p.live.id === liveId)
  }
}

export class HttpFalso implements ClienteHttp {
  pedidos: PedidoHttp[] = []
  respostas: RespostaHttp[] = []
  padrao: RespostaHttp = { status: 204, esperarSeg: null }
  medicoes: { ms: number | null; status: number }[] = []
  async postar(p: PedidoHttp): Promise<RespostaHttp> {
    this.pedidos.push(p)
    return this.respostas.shift() ?? this.padrao
  }
  async medir(_url: string): Promise<{ ms: number | null; status: number }> {
    return this.medicoes.shift() ?? { ms: 100, status: 200 }
  }
}

export class RedeFalsa implements Rede {
  ligada = true
  online(): boolean {
    return this.ligada
  }
}

export class LocaisFalsos implements CanaisLocais {
  notificacoes: { aviso: Aviso; titulo: string }[] = []
  sons = 0
  selos: number[] = []
  piscadas = 0
  notificar(aviso: Aviso, titulo: string): void {
    this.notificacoes.push({ aviso, titulo })
  }
  tocarSom(): void {
    this.sons++
  }
  selo(n: number): void {
    this.selos.push(n)
  }
  piscar(): void {
    this.piscadas++
  }
}

export class SistemaFalso implements Sistema {
  acordado = false
  ms: Metrica[] = []
  impedirDormir(l: boolean): void {
    this.acordado = l
  }
  metricas(): Metrica[] {
    return this.ms
  }
}

export class CofreFalso implements CofreLogins {
  logins = new Map<string, DadosLogin & { seletores: Seletores | null }>()
  senhaMestra = false
  trancado = false
  aberto(): boolean {
    return !this.trancado
  }
  dados(id: string) {
    return this.trancado ? null : (this.logins.get(id) ?? null)
  }
  contasComLogin(): string[] {
    return [...this.logins.keys()]
  }
  apagar(id: string): void {
    this.logins.delete(id)
  }
  senhaMestraLigada(): boolean {
    return this.senhaMestra
  }
  trancar(): void {
    this.trancado = true
  }
}

export const logMudo: Log = { info: () => {}, aviso: () => {}, erro: () => {} }

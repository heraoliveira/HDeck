/**
 * Portas: tudo o que o núcleo precisa do mundo de fora (Seção 4.1, ADR 0009).
 * O núcleo nunca importa `electron`; os adaptadores implementam estas interfaces.
 */
import type { Config } from '@shared/config/esquema.ts'
import type {
  Aviso,
  Conta,
  EventoConta,
  Grupo,
  Jogo,
  Live,
  PlataformaLive,
  TextoVigiado,
} from '@shared/tipos/dominio.ts'

export type Cancelar = () => void

export interface Relogio {
  agora(): number
  /** Chama `fn` uma vez depois de `ms`. */
  depois(ms: number, fn: () => void): Cancelar
  /** Chama `fn` a cada `ms`. */
  aCada(ms: number, fn: () => void): Cancelar
}

export type Retangulo = { x: number; y: number; largura: number; altura: number }

/** Como a página de uma conta aparece agora. */
export type Exibicao =
  | { modo: 'viva'; retangulo: Retangulo; janela: string }
  | { modo: 'foto' }
  | { modo: 'fora' }

export type EventosPagina = {
  carregou(urlAtual: string): void
  falhouCarregar(codigo: number, descricao: string): void
  statusPrincipal(status: number): void
  travou(): void
  respondeu(): void
  processoMorreu(motivo: string): void
  wsAbriu(id: string, url: string): void
  wsFechou(id: string): void
  dadoRecebido(wsId: string | null): void
  navegou(url: string): void
  devtools(aberto: boolean): void
  tituloMudou(titulo: string): void
}

export interface PaginaConta {
  carregar(url: string): void
  recarregar(semCache: boolean): void
  fechar(): void
  urlAtual(): string
  exibir(exibicao: Exibicao): void
  definirMudo(mudo: boolean): void
  definirZoom(fator: number): void
  /** true = deixar o Chromium desacelerar (política Economizar fora da tela). */
  definirEstrangulamento(estrangular: boolean): void
  /** Liga/desliga o vigia de rede (CDP). */
  vigiar(ligado: boolean): void
  capturar(largura: number, altura: number): Promise<Uint8Array | null>
  pid(): number | null
  /** Procura os textos (já normalizados) no DOM, num mundo isolado; devolve os encontrados. */
  procurarTextos(textos: string[]): Promise<string[]>
  /** Preenche sem enviar (RN-142). */
  preencherLogin(dados: DadosLogin, seletores: { usuario: string; senha: string } | null): Promise<boolean>
  existeSeletor(seletor: string): Promise<boolean>
  limparCache(): Promise<void>
  abrirDevtools(): void
  telaCheia(): void
}

export type DadosLogin = { usuario: string; senha: string }

export interface FabricaPaginas {
  criar(conta: Conta, eventos: EventosPagina): PaginaConta
  /** Apaga a sessão da conta do disco (RN-015). */
  apagarSessao(contaId: string): Promise<void>
}

export type EventosLive = {
  carregou(url: string): void
  navegou(url: string): void
  morreu(): void
}

export interface PaginaLive {
  carregar(url: string, qualidade: string): void
  fechar(): void
  lerEstado(): Promise<EstadoLidoLive>
  mostrar(somLigado: boolean): void
  esconder(): void
  definirEconomico(ligado: boolean): void
  pid(): number | null
}

export type EstadoLidoLive = { aoVivo: boolean; offline: boolean; pedeLogin: boolean; tocando: boolean }

export interface FabricaLives {
  criar(live: Live, eventos: EventosLive): PaginaLive
  urlDoCanal(plataforma: PlataformaLive, canal: string): string
  canalDaUrl(plataforma: PlataformaLive, url: string): string | null
  abrirLogin(live: Live): void
}

export type LinhaMetrica = { contaId: string; minuto: number; ramMb: number; cpuPct: number; estado: string }
export type LinhaPing = { jogoId: string; em: number; ms: number | null; status: number }

export interface Armazem {
  listarJogos(): Jogo[]
  salvarJogo(j: Jogo): void
  apagarJogo(id: string): void
  listarGrupos(): Grupo[]
  salvarGrupo(g: Grupo): void
  apagarGrupo(id: string): void
  listarContas(): Conta[]
  salvarConta(c: Conta): void
  apagarConta(id: string): void
  listarLives(): Live[]
  salvarLive(l: Live): void
  apagarLive(id: string): void
  listarTextos(): TextoVigiado[]
  salvarTexto(t: TextoVigiado): void
  apagarTexto(id: string): void
  registrarAviso(a: Aviso): void
  listarAvisos(limite: number): Aviso[]
  marcarAvisosLidos(): void
  registrarEvento(e: EventoConta): void
  listarEventos(desde: number, contaId?: string): EventoConta[]
  registrarMetricas(linhas: LinhaMetrica[]): void
  listarMetricas(desde: number): LinhaMetrica[]
  registrarPing(p: LinhaPing): void
  listarPing(desde: number): LinhaPing[]
  /** RN-163 */
  aplicarRetencao(agora: number): void
  transacao<T>(fn: () => T): T
}

export interface ArmazemConfig {
  ler(): Config
  gravar(c: Config): void
}

export type PedidoHttp = { url: string; corpo: unknown }
export type RespostaHttp = { status: number; esperarSeg: number | null }

export interface ClienteHttp {
  postar(p: PedidoHttp): Promise<RespostaHttp>
  medir(url: string): Promise<{ ms: number | null; status: number }>
}

export interface Rede {
  online(): boolean
}

export interface CanaisLocais {
  notificar(aviso: Aviso, titulo: string): void
  tocarSom(): void
  selo(naoLidos: number): void
  piscar(): void
}

export type Metrica = { pid: number; ramMb: number; cpuPct: number }

export interface Sistema {
  impedirDormir(ligado: boolean): void
  metricas(): Metrica[]
}

export type Seletores = { usuario: string; senha: string }

/** Cofre já decifrado (Seção 10). Devolve null com o cofre trancado. */
export interface CofreLogins {
  aberto(): boolean
  dados(contaId: string): (DadosLogin & { seletores: Seletores | null }) | null
  contasComLogin(): string[]
  apagar(contaId: string): void
}

export interface Log {
  info(msg: string, dados?: Record<string, unknown>): void
  aviso(msg: string, dados?: Record<string, unknown>): void
  erro(msg: string, dados?: Record<string, unknown>): void
}

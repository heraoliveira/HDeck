import { alterarCaminho, type Config, configPadrao } from '@shared/config/esquema.ts'
import { PADROES } from '@shared/dados/padroes-config.ts'
import { t } from '@shared/i18n/index.ts'
import type {
  AcaoLote,
  EspacoTela,
  EstadoDaConta,
  MetricasEvento,
  PainelDados,
  Snapshot,
} from '@shared/ipc/contrato.ts'
import type {
  Aviso,
  Conta,
  EstadoLive,
  Grupo,
  Jogo,
  LayoutGrupo,
  Live,
  PlataformaLive,
  PoliticaForaTela,
  TextoVigiado,
  TipoAviso,
  Visao,
} from '@shared/tipos/dominio.ts'
import { layoutGrupoSchema } from '@shared/tipos/dominio.ts'
import { falha, ok, type Resultado } from '@shared/tipos/resultado.ts'
import { normalizar } from '@shared/util/texto.ts'
import { CentralAvisos } from './avisos/avisos.ts'
import { FilaEnvio } from './avisos/envio.ts'
import { DetectorTextos, textosDaConta } from './avisos/textos.ts'
import { TravaCofre } from './cofre/cofre.ts'
import {
  contasDoGrupo,
  criarConta,
  duplicarConta,
  moverConta,
  type NovaConta,
  urlDeRecarga,
} from './contas/contas.ts'
import {
  type EstadoInterno,
  type EventoEstado,
  estadoInicial,
  estadoVisivel,
  estaLigada,
  type ModoExibicao,
  podeRecarregar,
  transicionar,
} from './contas/estado.ts'
import { FilaEscalonada } from './contas/fila.ts'
import {
  contaMuda,
  decidirExibicao,
  deveEstrangular,
  deveVoltarAFoto,
  intervaloDaFotoMs,
  politicaEfetiva,
} from './economia/economia.ts'
import { AgendaOtimizacao } from './economia/otimizacao.ts'
import {
  type Excesso,
  excessosDeLimite,
  gruposAoAbrir,
  pertoDoLimite,
  planoDeTroca,
  reordenarGrupos,
} from './grupos/grupos.ts'
import { ControleLives } from './lives/lives.ts'
import { metricasPorConta, resumirConta, serieTotal, totais } from './painel/painel.ts'
import { AgendaPing, resumoPing } from './ping/ping.ts'
import type {
  Armazem,
  ArmazemConfig,
  CanaisLocais,
  Cancelar,
  ClienteHttp,
  CofreLogins,
  FabricaLives,
  FabricaPaginas,
  LinhaMetrica,
  Log,
  PaginaConta,
  PedidoHttp,
  Rede,
  Relogio,
  Retangulo,
  Sistema,
} from './portas.ts'
import { type MotivoRecarga, VigiaSaude } from './saude/vigia.ts'
import { googleRecusou } from './seguranca/politicas.ts'

export type DependenciasMotor = {
  relogio: Relogio
  armazem: Armazem
  configArquivo: ArmazemConfig
  paginas: FabricaPaginas
  lives: FabricaLives
  http: ClienteHttp
  rede: Rede
  locais: CanaisLocais
  sistema: Sistema
  log: Log
  cofre: CofreLogins & { senhaMestraLigada(): boolean; trancar(): void }
  segredos: {
    discord(): string | null
    telegram(): string | null
    existe(canal: 'discord' | 'telegram'): boolean
  }
  gerarId: () => string
  versao: Snapshot['versao']
  /** Envia um evento para as interfaces abertas. */
  emitir: (evento: string, dados: unknown) => void
  /** Pergunta ao usuário (diálogo nativo). */
  janelas: {
    soltar(contaId: string, nome: string): void
    devolver(contaId: string): void
  }
  endpoints?: { discord?: (url: string) => string; telegram?: (token: string) => string }
}

type Rt = {
  pagina: PaginaConta
  estado: EstadoInterno
  saude: VigiaSaude
  onlineDesde: number
  ultimoUso: number
  devtools: boolean
  google: boolean
  fotoTimer: Cancelar | null
  espaco: { janela: string; retangulo: Retangulo | null; tipo: 'conta' | 'miniatura' } | null
  exibicao: ModoExibicao
  solta: boolean
  loginPedido: boolean
  ultimaMemoria: number
}

export type ResultadoLigar = Resultado<{ ligadas: number }, { excessos: Excesso[] }>

const SEM_INTERNET = 'sem_internet'

/**
 * Motor do HDeck: dono de toda a verdade (Seção 4.2). Liga e desliga contas, decide
 * exibição, foto, estrangulamento, recarga, avisos e lives. Não conhece o Electron.
 */
export class Motor {
  private config: Config = configPadrao()
  private jogos: Jogo[] = []
  private grupos: Grupo[] = []
  private contas: Conta[] = []
  private lives: Live[] = []
  private textos: TextoVigiado[] = []
  private rt = new Map<string, Rt>()
  private ativaId: string | null = null
  private grupoAtualId: string | null = null
  private silenciarTudo = false
  private dialogoAberto = false
  private painelAberto = false
  private aoVivoManual = new Set<string>()
  private filaLigar: FilaEscalonada
  private otimizacao: AgendaOtimizacao
  private ping: AgendaPing
  private controleLives: ControleLives
  private avisos: CentralAvisos
  private filaDiscord: FilaEnvio
  private filaTelegram: FilaEnvio
  private detector = new DetectorTextos()
  private trava: TravaCofre
  private timers: Cancelar[] = []
  private timerMetricas: Cancelar | null = null
  private timerVarredura: Cancelar | null = null
  private varreduraSeg = 0
  private offlineDesde: number | null = null
  private avisouSemInternet = false
  private ultimasMetricas: MetricasEvento = { porConta: {}, total: { ramMb: 0, cpuPct: 0 } }
  private ultimoMinutoGravado = 0
  private emitirAgendado = false
  private limitesAvisados = new Set<string>()

  constructor(private readonly d: DependenciasMotor) {
    const r = d.relogio
    this.filaLigar = new FilaEscalonada(r, 3000, (p) => d.emitir('lote.progresso', p))
    this.otimizacao = new AgendaOtimizacao(r, () => this.config, {
      ligadas: () => this.idsLigadas(),
      emUso: (id) =>
        id === this.ativaId &&
        r.agora() - (this.rt.get(id)?.ultimoUso ?? 0) < PADROES.ativaProtegidaSeg * 1000,
      recarregar: (id, motivo) => this.recarregar(id, false, motivo),
      limparCache: (id) => void this.limparCache(id),
      avisarMemoria: (id, lim) =>
        this.avisar(
          'memoria',
          id,
          t('avisos.memoria', { conta: this.nomeConta(id), limite: this.formatarMb(lim) }),
        ),
    })
    this.ping = new AgendaPing(
      r,
      () => this.config,
      d.http,
      () => this.jogosLigados(),
      (l) => {
        d.armazem.registrarPing(l)
        d.emitir('ping.resultado', l)
      },
      (a) =>
        this.avisar(
          'site_fora',
          null,
          a.tipo === 'lento'
            ? t('avisos.ping', { jogo: a.jogo.nome, ms: a.ms })
            : t('avisos.pingErro', { jogo: a.jogo.nome, n: a.n }),
          `ping:${a.jogo.id}`,
        ),
    )
    this.controleLives = new ControleLives(r, () => this.config, d.lives, {
      encerrou: (l) =>
        this.avisar(
          'live',
          l.contaId,
          t('avisos.liveEncerrou', { canal: l.canal, conta: this.nomeConta(l.contaId) }),
        ),
      voltou: (l) =>
        this.avisar(
          'live',
          l.contaId,
          t('avisos.liveVoltou', { canal: l.canal, conta: this.nomeConta(l.contaId) }),
        ),
      pedeLogin: (l) =>
        this.avisar(
          'login_pedido',
          l.contaId,
          t('avisos.livePedeLogin', {
            plataforma: this.nomePlataforma(l.plataforma),
            conta: this.nomeConta(l.contaId),
          }),
        ),
      mudou: () => this.emitirEstado(),
    })
    const discordUrl = d.endpoints?.discord ?? ((u: string) => u)
    const telegramUrl =
      d.endpoints?.telegram ?? ((tk: string) => `https://api.telegram.org/bot${tk}/sendMessage`)
    this.filaDiscord = new FilaEnvio(r, d.http, (texto): PedidoHttp | null => {
      const url = d.segredos.discord()
      return url ? { url: discordUrl(url), corpo: { content: texto, username: 'HDeck' } } : null
    })
    this.filaTelegram = new FilaEnvio(
      r,
      d.http,
      (texto): PedidoHttp | null => {
        const tk = d.segredos.telegram()
        const chat = this.config.avisos.telegramChatId
        return tk && chat ? { url: telegramUrl(tk), corpo: { chat_id: chat, text: texto } } : null
      },
      3900,
    )
    this.avisos = new CentralAvisos(
      r,
      () => this.config,
      d.armazem,
      d.locais,
      { discord: this.filaDiscord, telegram: this.filaTelegram },
      () => this.naoLidos(),
      () => d.gerarId(),
    )
    this.avisos.aoAvisar((a) => {
      d.emitir('aviso.novo', a)
      this.emitirEstado()
    })
    this.trava = new TravaCofre(
      r,
      () => this.config.cofre.trancarAposMin,
      () => d.cofre.senhaMestraLigada(),
      () => {
        d.cofre.trancar()
        this.emitirEstado()
      },
    )
  }

  // ======================= início e fim =======================

  iniciar(): void {
    const d = this.d
    this.config = d.configArquivo.ler()
    this.jogos = d.armazem.listarJogos()
    this.grupos = d.armazem.listarGrupos().sort((a, b) => a.ordem - b.ordem)
    this.contas = d.armazem.listarContas()
    this.lives = d.armazem.listarLives()
    this.textos = d.armazem.listarTextos()
    if (this.grupos.length === 0) this.criarGrupo(t('grupo.novoNome', { n: 1 }))
    this.grupoAtualId = this.grupos[0]?.id ?? null
    this.filaLigar.definirIntervalo(this.config.geral.abrirAosPoucosSeg * 1000)
    // RN-033: restaura os grupos.
    const ligar = new Set(gruposAoAbrir(this.config, this.grupos))
    for (const g of this.grupos) this.salvarGrupo({ ...g, ligado: ligar.has(g.id) })
    const primeiroLigado = this.grupos.find((g) => g.ligado)
    if (primeiroLigado) this.grupoAtualId = primeiroLigado.id
    for (const g of this.grupos) if (g.ligado) this.enfileirarGrupo(g.id)
    this.otimizacao.iniciar()
    this.ping.iniciar()
    this.controleLives.iniciar()
    this.reagendarVarredura()
    this.reagendarMetricas()
    this.timers.push(d.relogio.aCada(PADROES.conferirInternetSeg * 1000, () => this.conferirInternet()))
    this.timers.push(d.relogio.aCada(60 * 60_000, () => d.armazem.aplicarRetencao(d.relogio.agora())))
    this.timers.push(d.relogio.aCada(5_000, () => this.conferirVoltarAFoto()))
    d.armazem.aplicarRetencao(d.relogio.agora())
    this.atualizarEnergia()
    this.emitirEstado()
  }

  encerrar(): void {
    for (const c of this.timers) c()
    this.timers = []
    this.timerMetricas?.()
    this.timerVarredura?.()
    this.filaLigar.limpar()
    this.otimizacao.parar()
    this.ping.parar()
    this.controleLives.parar()
    this.avisos.esvaziar()
    this.filaDiscord.parar()
    this.filaTelegram.parar()
    for (const id of [...this.rt.keys()]) this.fecharPagina(id)
    this.d.sistema.impedirDormir(false)
  }

  // ======================= leitura =======================

  snapshot(): Snapshot {
    const estados: Record<string, EstadoDaConta> = {}
    for (const c of this.contas) {
      const rt = this.rt.get(c.id)
      const e = rt?.estado ?? estadoInicial
      const enfileirada = !rt && this.filaLigar.pendentes().includes(c.id)
      estados[c.id] = {
        estado: enfileirada ? 'carregando' : estadoVisivel(e),
        motivo: e.motivoErro,
        falhas: rt?.saude.falhasSeguidas() ?? 0,
        vigiaPausado: rt?.devtools ?? false,
        googleRecusou: rt?.google ?? false,
        ultimoDado: rt?.saude.ultimoDadoEm() ?? null,
        onlineDesde: rt?.onlineDesde ?? null,
        solta: rt?.solta ?? false,
      }
    }
    const livesEstado: Record<string, EstadoLive> = {}
    for (const l of this.lives) livesEstado[l.id] = this.controleLives.estado(l.id)
    return {
      config: this.config,
      jogos: this.jogos,
      grupos: this.grupos,
      contas: [...this.contas].sort((a, b) => a.ordem - b.ordem),
      lives: this.lives,
      textos: this.textos,
      estados,
      livesEstado,
      ativaId: this.ativaId,
      grupoAtualId: this.grupoAtualId,
      silenciarTudo: this.silenciarTudo,
      avisosPausados: this.avisos.pausado(),
      naoLidos: this.naoLidos(),
      cofre: {
        senhaMestra: this.d.cofre.senhaMestraLigada(),
        aberto: this.trava.aberto(),
        comLogin: this.d.cofre.contasComLogin(),
      },
      segredos: { discord: this.d.segredos.existe('discord'), telegram: this.d.segredos.existe('telegram') },
      versao: this.d.versao,
      dialogoAberto: this.dialogoAberto,
    }
  }

  obterConfig(): Config {
    return this.config
  }

  contasLigadas(): number {
    return this.rt.size
  }

  idsLigadas(): string[] {
    return [...this.rt.keys()]
  }

  estadoInterno(id: string): EstadoInterno | undefined {
    return this.rt.get(id)?.estado
  }

  pagina(id: string): PaginaConta | undefined {
    return this.rt.get(id)?.pagina
  }

  conta(id: string): Conta | undefined {
    return this.contas.find((c) => c.id === id)
  }

  listarContas(): Conta[] {
    return [...this.contas]
  }

  listarGrupos(): Grupo[] {
    return [...this.grupos]
  }

  pendentesDeLigar(): string[] {
    return this.filaLigar.pendentes()
  }

  // ======================= configuração =======================

  /** RN-174: vale na hora. */
  alterarConfig(caminho: string, valor: unknown): Resultado<Config> {
    const nova = alterarCaminho(this.config, caminho, valor)
    if (!nova) return falha('valor inválido')
    this.definirConfig(nova)
    return ok(nova)
  }

  definirConfig(nova: Config): void {
    const antes = this.config
    this.config = nova
    this.d.configArquivo.gravar(nova)
    this.filaLigar.definirIntervalo(nova.geral.abrirAosPoucosSeg * 1000)
    if (antes.economia !== nova.economia) this.reaplicarExibicao()
    if (antes.som !== nova.som) this.aplicarSom()
    if (antes.ping.intervaloMin !== nova.ping.intervaloMin) this.ping.iniciar()
    if (antes.avisos.varreduraSeg !== nova.avisos.varreduraSeg) this.reagendarVarredura()
    if (antes.lives !== nova.lives) {
      this.sincronizarLives()
      this.controleLives.aplicarEconomia()
    }
    if (antes.cofre.trancarAposMin !== nova.cofre.trancarAposMin) this.trava.usar()
    if (antes.queda !== nova.queda) for (const [id, rt] of this.rt) rt.pagina.vigiar(this.precisaVigia(id))
    this.atualizarEnergia()
    this.emitirEstado()
  }

  redefinirConfig(): void {
    this.definirConfig(configPadrao())
  }

  // ======================= grupos =======================

  criarGrupo(nome: string, cor?: string): Grupo {
    const g: Grupo = {
      id: this.d.gerarId(),
      nome: nome.slice(0, 60),
      cor: cor ?? '#7c6cf0',
      ordem: this.grupos.length,
      ligado: false,
      visao: 'grade',
      layout: layoutGrupoSchema.parse({}),
    }
    this.salvarGrupo(g)
    this.emitirEstado()
    return g
  }

  editarGrupo(id: string, patch: { nome?: string | undefined; cor?: string | undefined }): boolean {
    const g = this.grupos.find((x) => x.id === id)
    if (!g) return false
    this.salvarGrupo({
      ...g,
      ...(patch.nome ? { nome: patch.nome } : {}),
      ...(patch.cor ? { cor: patch.cor } : {}),
    })
    this.emitirEstado()
    return true
  }

  async apagarGrupo(id: string): Promise<boolean> {
    const g = this.grupos.find((x) => x.id === id)
    if (!g) return false
    for (const c of contasDoGrupo(this.contas, id)) await this.apagarConta(c.id, true)
    this.grupos = this.grupos.filter((x) => x.id !== id)
    this.d.armazem.apagarGrupo(id)
    if (this.grupos.length === 0) this.criarGrupo(t('grupo.novoNome', { n: 1 }))
    if (this.grupoAtualId === id) this.grupoAtualId = this.grupos[0]?.id ?? null
    this.emitirEstado()
    return true
  }

  reordenarGrupos(ids: string[]): void {
    this.grupos = reordenarGrupos(this.grupos, ids)
    this.d.armazem.transacao(() => {
      for (const g of this.grupos) this.d.armazem.salvarGrupo(g)
    })
    this.emitirEstado()
  }

  selecionarGrupo(id: string): void {
    if (!this.grupos.some((g) => g.id === id)) return
    this.grupoAtualId = id
    this.emitirEstado()
  }

  /** RN-035: cada grupo lembra a visão e a divisão. */
  definirLayout(id: string, visao?: Visao, layout?: Partial<LayoutGrupo>): boolean {
    const g = this.grupos.find((x) => x.id === id)
    if (!g) return false
    const novoLayout = layoutGrupoSchema.safeParse({ ...g.layout, ...(layout ?? {}) })
    if (!novoLayout.success) return false
    this.salvarGrupo({ ...g, visao: visao ?? g.visao, layout: novoLayout.data })
    this.emitirEstado()
    return true
  }

  /** RN-051: política por jogo no "⋯" do grupo. */
  definirPolitica(grupoId: string, jogoId: string, politica: PoliticaForaTela): void {
    const g = this.grupos.find((x) => x.id === grupoId)
    if (!g) return
    this.salvarGrupo({
      ...g,
      layout: { ...g.layout, politicas: { ...g.layout.politicas, [jogoId]: politica } },
    })
    this.reaplicarExibicao()
    this.emitirEstado()
  }

  /** RN-030 / RN-034: ligar um grupo; sem confirmação, recusa se passar do limite do jogo. */
  ligarGrupo(id: string, ligado: boolean, confirmado = false): ResultadoLigar {
    const g = this.grupos.find((x) => x.id === id)
    if (!g) return ok({ ligadas: 0 })
    if (!ligado) {
      for (const c of contasDoGrupo(this.contas, id)) this.desligarConta(c.id)
      this.salvarGrupo({ ...g, ligado: false })
      this.atualizarEnergia()
      this.emitirEstado()
      return ok({ ligadas: 0 })
    }
    const novas = contasDoGrupo(this.contas, id).map((c) => c.id)
    if (!confirmado) {
      const excessos = excessosDeLimite(this.jogos, this.contas, new Set(this.rt.keys()), novas)
      if (excessos.length > 0) return falha({ excessos })
    }
    this.salvarGrupo({ ...g, ligado: true })
    this.enfileirarGrupo(id)
    this.emitirEstado()
    return ok({ ligadas: novas.length })
  }

  /** RN-031: desliga os outros e liga este, aos poucos (RN-032). */
  trocarGrupo(id: string, confirmado = false): ResultadoLigar {
    const plano = planoDeTroca(this.grupos, id)
    if (!confirmado) {
      const fica = new Set(
        [...this.rt.keys()].filter((cid) => !plano.desligar.includes(this.conta(cid)?.grupoId ?? '')),
      )
      const excessos = excessosDeLimite(
        this.jogos,
        this.contas,
        fica,
        contasDoGrupo(this.contas, id).map((c) => c.id),
      )
      if (excessos.length > 0) return falha({ excessos })
    }
    for (const gid of plano.desligar) this.ligarGrupo(gid, false)
    this.grupoAtualId = id
    return this.ligarGrupo(id, true, true)
  }

  private enfileirarGrupo(grupoId: string): void {
    const contas = contasDoGrupo(this.contas, grupoId)
    const lote = `grupo:${grupoId}:${this.d.relogio.agora()}`
    for (const c of contas) this.enfileirarLigar(c.id, lote)
  }

  private enfileirarLigar(contaId: string, lote?: string): void {
    if (this.rt.has(contaId)) return
    this.filaLigar.adicionar({
      chave: contaId,
      executar: () => this.ligarConta(contaId),
      ...(lote ? { lote } : {}),
    })
  }

  // ======================= contas =======================

  adicionarConta(dados: NovaConta): Resultado<Conta, string> {
    const r = criarConta(dados, {
      id: this.d.gerarId(),
      agora: this.d.relogio.agora(),
      grupos: this.grupos,
      jogos: this.jogos,
      contas: this.contas,
    })
    if (!r.ok) return r
    this.contas.push(r.valor)
    this.d.armazem.salvarConta(r.valor)
    const g = this.grupos.find((x) => x.id === r.valor.grupoId)
    if (g?.ligado) this.enfileirarLigar(r.valor.id)
    this.emitirEstado()
    return r
  }

  editarConta(id: string, patch: Partial<Omit<Conta, 'id' | 'grupoId' | 'ordem' | 'criadaEm'>>): boolean {
    const c = this.conta(id)
    if (!c) return false
    if (patch.jogoId && !this.jogos.some((j) => j.id === patch.jogoId)) return false
    const nova = { ...c, ...patch }
    this.substituirConta(nova)
    const rt = this.rt.get(id)
    if (rt) {
      if (patch.zoom !== undefined) rt.pagina.definirZoom(nova.zoom)
      if (patch.url && patch.url !== c.url) rt.pagina.carregar(nova.url)
    }
    if (patch.som !== undefined) this.aplicarSom()
    if (patch.politicaForaTela) this.reaplicarExibicao()
    this.emitirEstado()
    return true
  }

  /** RN-015: apagar a conta sempre apaga a sessão dela (não existe sessão órfã). */
  async apagarConta(id: string, _apagarLogin: boolean): Promise<boolean> {
    if (!this.conta(id)) return false
    this.desligarConta(id)
    this.filaLigar.remover((k) => k === id)
    for (const l of this.lives.filter((x) => x.contaId === id)) this.removerLive(l.id)
    this.contas = this.contas.filter((c) => c.id !== id)
    this.d.armazem.apagarConta(id)
    this.d.cofre.apagar(id)
    await this.d.paginas.apagarSessao(id)
    if (this.ativaId === id) this.ativaId = null
    this.emitirEstado()
    return true
  }

  /** RN-016 */
  duplicar(id: string): Conta | null {
    const c = this.conta(id)
    if (!c) return null
    const nova = duplicarConta(
      c,
      this.d.gerarId(),
      this.d.relogio.agora(),
      t('conta.copiaNome', { nome: c.nome }),
      contasDoGrupo(this.contas, c.grupoId).length,
    )
    this.contas.push(nova)
    this.d.armazem.salvarConta(nova)
    if (this.grupos.find((g) => g.id === nova.grupoId)?.ligado) this.enfileirarLigar(nova.id)
    this.emitirEstado()
    return nova
  }

  /** RN-036 */
  moverConta(id: string, grupoId: string, posicao: number): boolean {
    if (!this.conta(id) || !this.grupos.some((g) => g.id === grupoId)) return false
    const antes = this.conta(id)!.grupoId
    const novas = moverConta(this.contas, id, grupoId, posicao)
    this.d.armazem.transacao(() => {
      for (const c of novas) {
        const velha = this.contas.find((x) => x.id === c.id)
        if (velha && (velha.ordem !== c.ordem || velha.grupoId !== c.grupoId)) this.d.armazem.salvarConta(c)
      }
    })
    this.contas = novas
    const destinoLigado = this.grupos.find((g) => g.id === grupoId)?.ligado ?? false
    if (antes !== grupoId) {
      if (destinoLigado) this.enfileirarLigar(id)
      else this.desligarConta(id)
    }
    this.emitirEstado()
    return true
  }

  /** RN-043: clicar numa conta a torna ativa; RN-053: foto clicada vai ao vivo. */
  ativar(id: string): void {
    const rt = this.rt.get(id)
    if (rt) rt.ultimoUso = this.d.relogio.agora()
    if (this.ativaId === id && !this.aoVivoManual.has(`foto:${id}`)) return
    this.aoVivoManual.delete(`foto:${id}`)
    this.ativaId = id
    this.reaplicarExibicao()
    this.aplicarSom()
    this.emitirEstado()
  }

  /** A página avisou que o usuário mexeu nela (clique ou tecla). */
  usou(id: string): void {
    const rt = this.rt.get(id)
    if (!rt) return
    rt.ultimoUso = this.d.relogio.agora()
    if (this.ativaId !== id) this.ativar(id)
  }

  ligarConta(id: string): void {
    const c = this.conta(id)
    if (!c || this.rt.has(id)) return
    const jogo = this.jogos.find((j) => j.id === c.jogoId)
    let rtRef: Rt | null = null
    const contaId = id
    const saude = new VigiaSaude(
      this.d.relogio,
      () => this.config,
      () => this.jogoDe(contaId),
      this.d.rede,
      {
        recarregar: (motivo) => this.recarregar(contaId, false, motivo),
        avisar: (tipo, dados) => this.avisoDaSaude(contaId, tipo, dados),
        resolverAviso: (tipo) => this.evento(contaId, { tipo: 'avisoResolvido', chave: tipo }),
        registrar: (tipo, motivo) =>
          this.d.armazem.registrarEvento({ contaId, tipo, motivo, em: this.d.relogio.agora() }),
        estado: (ev) => this.evento(contaId, ev),
      },
    )
    const pagina = this.d.paginas.criar(c, {
      carregou: () => {
        if (rtRef) rtRef.google = false
        saude.carregou()
      },
      falhouCarregar: (codigo, desc) => saude.falhouCarregar(codigo, desc),
      statusPrincipal: (s) => saude.statusPrincipal(s),
      travou: () => saude.travou(),
      respondeu: () => saude.respondeu(),
      processoMorreu: (motivo) => saude.processoMorreu(motivo),
      wsAbriu: (wid, url) => saude.wsAbriu(wid, url),
      wsFechou: (wid) => saude.wsFechou(wid),
      dadoRecebido: (wid) => saude.dado(wid),
      navegou: () => {},
      devtools: (aberto) => {
        if (rtRef) rtRef.devtools = aberto
        this.emitirEstado()
      },
      tituloMudou: (titulo) => {
        if (rtRef && googleRecusou(pagina.urlAtual(), titulo)) {
          rtRef.google = true
          this.emitirEstado()
        }
      },
    })
    const agora = this.d.relogio.agora()
    rtRef = {
      pagina,
      estado: transicionar(estadoInicial, { tipo: 'ligar' }),
      saude,
      onlineDesde: agora,
      ultimoUso: 0,
      devtools: false,
      google: false,
      fotoTimer: null,
      espaco: null,
      exibicao: 'fora',
      solta: false,
      loginPedido: false,
      ultimaMemoria: 0,
    }
    this.rt.set(id, rtRef)
    pagina.definirZoom(c.zoom)
    pagina.vigiar(this.precisaVigia(id))
    pagina.carregar(c.url)
    this.otimizacao.marcarRecarga(id)
    this.aplicarExibicao(id)
    this.aplicarSom()
    this.sincronizarLives()
    this.verificarPertoDoLimite(jogo)
    this.atualizarEnergia()
    this.emitirEstado()
  }

  desligarConta(id: string): void {
    this.filaLigar.remover((k) => k === id)
    if (!this.rt.has(id)) return
    this.fecharPagina(id)
    this.sincronizarLives()
    this.atualizarEnergia()
    this.emitirEstado()
  }

  private fecharPagina(id: string): void {
    const rt = this.rt.get(id)
    if (!rt) return
    rt.fotoTimer?.()
    rt.saude.desligar()
    if (rt.solta) this.d.janelas.devolver(id)
    rt.pagina.fechar()
    this.rt.delete(id)
    this.detector.esquecer(id)
    this.otimizacao.esquecer(id)
  }

  /** RN-018: recarrega mantendo a URL do jogo. Nunca duas recargas ao mesmo tempo. */
  recarregar(id: string, semCache: boolean, motivo: MotivoRecarga = 'manual'): boolean {
    const rt = this.rt.get(id)
    const c = this.conta(id)
    if (!rt || !c || !podeRecarregar(rt.estado)) return false
    if (motivo === 'manual' || motivo === 'programada' || motivo === 'memoria' || motivo === 'suspensao') {
      rt.saude.recarregouPorFora()
      this.d.armazem.registrarEvento({ contaId: id, tipo: 'recarga', motivo, em: this.d.relogio.agora() })
    }
    this.evento(id, { tipo: 'recarregar' })
    this.detector.esquecer(id)
    rt.loginPedido = false
    const url = urlDeRecarga(rt.pagina.urlAtual(), c, this.jogoDe(id))
    if (semCache || url !== rt.pagina.urlAtual()) {
      if (semCache) rt.pagina.recarregar(true)
      else rt.pagina.carregar(url)
    } else {
      rt.pagina.recarregar(false)
    }
    this.otimizacao.marcarRecarga(id)
    this.emitirEstado()
    return true
  }

  /** RN-019: abre a conta numa janela própria, sem recarregar. */
  soltar(id: string): boolean {
    const rt = this.rt.get(id)
    const c = this.conta(id)
    if (!rt || !c || rt.solta) return false
    rt.solta = true
    this.d.janelas.soltar(id, c.nome)
    this.emitirEstado()
    return true
  }

  /** A janela própria fechou: a conta volta ao grupo (RN-019). */
  devolvida(id: string): void {
    const rt = this.rt.get(id)
    if (!rt) return
    rt.solta = false
    rt.espaco = null
    this.aplicarExibicao(id)
    this.emitirEstado()
  }

  abrirDevtools(id: string): void {
    this.rt.get(id)?.pagina.abrirDevtools()
  }

  telaCheia(id?: string): void {
    const alvo = id ?? this.ativaId
    if (alvo) this.rt.get(alvo)?.pagina.telaCheia()
  }

  async limparCache(id: string): Promise<void> {
    const rt = this.rt.get(id)
    if (!rt) return
    await rt.pagina.limparCache()
    this.d.armazem.registrarEvento({
      contaId: id,
      tipo: 'limpou_cache',
      motivo: 'cache',
      em: this.d.relogio.agora(),
    })
  }

  async limparCacheTodas(): Promise<void> {
    for (const id of this.idsLigadas()) await this.limparCache(id)
  }

  // ======================= exibição, foto e diálogos =======================

  /**
   * A interface (ou uma janela solta) informa onde cada conta aparece.
   * `janela` identifica a janela que mediu; espaços de outras janelas não são tocados.
   */
  definirEspacos(janela: string, espacos: readonly EspacoTela[]): void {
    const vistos = new Set<string>()
    for (const e of espacos) {
      const rt = this.rt.get(e.contaId)
      if (!rt || vistos.has(e.contaId)) continue
      if (rt.solta && !janela.startsWith('solta:')) continue
      vistos.add(e.contaId)
      rt.espaco = { janela, retangulo: e.retangulo, tipo: e.tipo }
    }
    for (const [id, rt] of this.rt) {
      if (rt.espaco?.janela === janela && !vistos.has(id)) rt.espaco = null
    }
    this.reaplicarExibicao()
  }

  /** RN-044: com um diálogo aberto, as contas viram foto e continuam rodando. */
  definirDialogo(aberto: boolean): void {
    this.dialogoAberto = aberto
    this.reaplicarExibicao()
    this.emitirEstado()
  }

  definirPainelAberto(aberto: boolean): void {
    this.painelAberto = aberto
    this.reagendarMetricas()
  }

  alternarEconomia(): void {
    this.alterarConfig('economia.modoEconomico', !this.config.economia.modoEconomico)
  }

  private reaplicarExibicao(): void {
    for (const id of this.rt.keys()) this.aplicarExibicao(id)
  }

  private modoDe(id: string): ModoExibicao {
    const rt = this.rt.get(id)
    if (!rt?.espaco || rt.espaco.retangulo === null) return 'fora'
    if (rt.espaco.tipo === 'miniatura') return 'foto'
    if (rt.solta) return this.dialogoAberto && rt.espaco.janela === 'principal' ? 'foto' : 'viva'
    if (this.dialogoAberto) return 'foto'
    if (this.aoVivoManual.has(`foto:${id}`)) return 'foto'
    const visiveis = [...this.rt]
      .filter(([, r]) => r.espaco?.retangulo && r.espaco.tipo === 'conta' && !r.solta)
      .map(([cid]) => cid)
    return decidirExibicao(visiveis, this.ativaId, this.config.economia.modoEconomico).get(id) ?? 'fora'
  }

  private aplicarExibicao(id: string): void {
    const rt = this.rt.get(id)
    const c = this.conta(id)
    if (!rt || !c) return
    const modo = this.modoDe(id)
    const mudou = modo !== rt.exibicao
    rt.exibicao = modo
    if (modo === 'viva' && rt.espaco?.retangulo) {
      rt.pagina.exibir({ modo: 'viva', retangulo: rt.espaco.retangulo, janela: rt.espaco.janela })
    } else {
      rt.pagina.exibir({ modo: modo === 'viva' ? 'fora' : modo })
    }
    const politica = politicaEfetiva(
      c,
      this.grupos.find((g) => g.id === c.grupoId),
      this.jogoDe(id),
    )
    rt.pagina.definirEstrangulamento(deveEstrangular(politica, modo))
    this.evento(id, { tipo: 'exibir', modo })
    // Foto: captura logo e depois a cada N s (RN-052), só com espaço na tela (RN-054).
    if (mudou || (modo === 'foto' && !rt.fotoTimer)) {
      rt.fotoTimer?.()
      rt.fotoTimer = null
      if (modo === 'foto') {
        void this.capturarFoto(id)
        const ms =
          rt.espaco?.tipo === 'miniatura' && this.painelAberto
            ? PADROES.fotoPainelSeg * 1000
            : intervaloDaFotoMs(this.config, id)
        rt.fotoTimer = this.d.relogio.aCada(ms, () => void this.capturarFoto(id))
      }
    }
  }

  async capturarFoto(id: string): Promise<boolean> {
    const rt = this.rt.get(id)
    if (!rt || rt.exibicao !== 'foto' || !rt.espaco?.retangulo) return false
    const { largura, altura } = rt.espaco.retangulo
    if (largura <= 0 || altura <= 0) return false
    const dados = await rt.pagina.capturar(largura, altura)
    if (!dados) return false
    this.d.emitir('conta.foto', { contaId: id, dados })
    return true
  }

  /** Foto de todas, para salvar em PNG (ação em lote). */
  async fotosDe(ids: readonly string[]): Promise<{ contaId: string; nome: string; dados: Uint8Array }[]> {
    const out: { contaId: string; nome: string; dados: Uint8Array }[] = []
    for (const id of ids) {
      const rt = this.rt.get(id)
      if (!rt) continue
      const dados = await rt.pagina.capturar(0, 0)
      if (dados) out.push({ contaId: id, nome: this.nomeConta(id), dados })
    }
    return out
  }

  private conferirVoltarAFoto(): void {
    const id = this.ativaId
    if (!id) return
    const rt = this.rt.get(id)
    if (!rt || rt.exibicao !== 'viva') return
    if (deveVoltarAFoto(this.config, rt.ultimoUso, this.d.relogio.agora())) {
      this.aoVivoManual.add(`foto:${id}`)
      this.aplicarExibicao(id)
      this.emitirEstado()
    }
  }

  // ======================= som =======================

  silenciar(ligado: boolean): void {
    this.silenciarTudo = ligado
    this.aplicarSom()
    this.emitirEstado()
  }

  private aplicarSom(): void {
    for (const [id, rt] of this.rt) {
      const c = this.conta(id)
      if (c) rt.pagina.definirMudo(contaMuda(this.config, c, this.ativaId, this.silenciarTudo))
    }
  }

  // ======================= ações em lote (RN-180, RN-181) =======================

  async lote(
    ids: readonly string[],
    acao: AcaoLote,
    extra: { zoom?: number | undefined; grupoId?: string | undefined; confirmado?: boolean | undefined } = {},
  ): Promise<Resultado<{ feitas: number }, { excessos: Excesso[] } | string>> {
    const validos = ids.filter((id) => this.conta(id))
    const loteId = `lote:${acao}:${this.d.relogio.agora()}`
    const escalonar = (fn: (id: string) => void) => {
      for (const id of validos)
        this.filaLigar.adicionar({ chave: `${acao}:${id}`, executar: () => fn(id), lote: loteId })
    }
    switch (acao) {
      case 'recarregar':
        escalonar((id) => this.recarregar(id, false))
        break
      case 'recarregarSemCache':
        escalonar((id) => this.recarregar(id, true))
        break
      case 'ligar': {
        if (!extra.confirmado) {
          const excessos = excessosDeLimite(this.jogos, this.contas, new Set(this.rt.keys()), validos)
          if (excessos.length > 0) return falha({ excessos })
        }
        for (const id of validos) {
          const g = this.grupos.find((x) => x.id === this.conta(id)?.grupoId)
          if (g && !g.ligado) this.salvarGrupo({ ...g, ligado: true })
        }
        escalonar((id) => this.ligarConta(id))
        break
      }
      case 'desligar':
        for (const id of validos) this.desligarConta(id)
        break
      case 'silenciar':
      case 'ativarSom':
        for (const id of validos) this.editarConta(id, { som: acao === 'ativarSom' })
        break
      case 'economiaLigar':
      case 'economiaDesligar':
        this.alterarConfig('economia.modoEconomico', acao === 'economiaLigar')
        break
      case 'manter':
      case 'economizar':
        for (const id of validos) this.editarConta(id, { politicaForaTela: acao })
        break
      case 'zoom': {
        const z = extra.zoom ?? this.conta(validos[0] ?? '')?.zoom ?? 1
        for (const id of validos) this.editarConta(id, { zoom: z })
        break
      }
      case 'preencher':
        await this.preencherLogin(validos)
        break
      case 'livesLigar':
      case 'livesDesligar':
        for (const l of this.lives.filter((x) => validos.includes(x.contaId)))
          this.ligarLive(l.id, acao === 'livesLigar')
        break
      case 'limparCache':
        for (const id of validos) await this.limparCache(id)
        break
      case 'fotos':
        // Quem salva os arquivos é o adaptador (pede a pasta); aqui só confere.
        break
      case 'mover': {
        if (!extra.grupoId) return falha('grupo')
        let pos = contasDoGrupo(this.contas, extra.grupoId).length
        for (const id of validos) this.moverConta(id, extra.grupoId, pos++)
        break
      }
    }
    this.emitirEstado()
    return ok({ feitas: validos.length })
  }

  // ======================= saúde: internet e suspensão =======================

  /** RN-063: o PC acordou. */
  aoAcordar(): void {
    if (!this.config.queda.recarregarAoAcordar) return
    const esperar = () => {
      if (!this.d.rede.online()) {
        this.d.relogio.depois(PADROES.conferirInternetSeg * 1000, esperar)
        return
      }
      const lote = `suspensao:${this.d.relogio.agora()}`
      for (const id of this.idsLigadas())
        this.filaLigar.adicionar({
          chave: `acordar:${id}`,
          executar: () => this.recarregar(id, false, 'suspensao'),
          lote,
        })
    }
    esperar()
  }

  /** RN-067: confere a cada 10 s; quando a internet volta, recarrega só as que caíram. */
  conferirInternet(): void {
    const online = this.d.rede.online()
    const agora = this.d.relogio.agora()
    if (!online) {
      this.offlineDesde ??= agora
      if (
        !this.avisouSemInternet &&
        agora - this.offlineDesde >= this.config.avisos.semInternetMin * 60_000
      ) {
        this.avisouSemInternet = true
        const min = Math.round((agora - this.offlineDesde) / 60_000)
        this.avisar('sem_internet', null, t('avisos.semInternet', { min }), SEM_INTERNET)
      }
      return
    }
    this.offlineDesde = null
    this.avisouSemInternet = false
    for (const rt of this.rt.values()) if (rt.saude.esperandoInternet()) rt.saude.internetVoltou()
  }

  // ======================= métricas e Painel =======================

  private reagendarMetricas(): void {
    this.timerMetricas?.()
    const seg = this.painelAberto ? PADROES.metricasPainelSeg : PADROES.metricasFundoSeg
    this.timerMetricas = this.d.relogio.aCada(seg * 1000, () => this.coletarMetricas())
  }

  coletarMetricas(): MetricasEvento {
    const ms = this.d.sistema.metricas()
    const pids = new Map<number, string>()
    for (const [id, rt] of this.rt) {
      const pid = rt.pagina.pid()
      if (pid) pids.set(pid, id)
    }
    for (const [pid, conta] of this.controleLives.pids()) pids.set(pid, conta)
    const porConta = metricasPorConta(ms, pids)
    const evento: MetricasEvento = { porConta: Object.fromEntries(porConta), total: totais(ms) }
    this.ultimasMetricas = evento
    this.d.emitir('conta.metricas', evento)
    const agora = this.d.relogio.agora()
    const minuto = Math.floor(agora / 60_000) * 60_000
    if (minuto !== this.ultimoMinutoGravado) {
      this.ultimoMinutoGravado = minuto
      const linhas: LinhaMetrica[] = [...porConta].map(([contaId, m]) => ({
        contaId,
        minuto,
        ramMb: Math.round(m.ramMb),
        cpuPct: Math.round(m.cpuPct * 10) / 10,
        estado: estadoVisivel(this.rt.get(contaId)?.estado ?? estadoInicial),
      }))
      if (linhas.length > 0) this.d.armazem.registrarMetricas(linhas)
    }
    this.otimizacao.verificarMemoria(new Map([...porConta].map(([id, m]) => [id, m.ramMb])))
    return evento
  }

  metricasAtuais(): MetricasEvento {
    return this.ultimasMetricas
  }

  dadosDoPainel(): PainelDados {
    const agora = this.d.relogio.agora()
    const eventos = this.d.armazem.listarEventos(agora - 30 * 86_400_000)
    const metricas = this.d.armazem.listarMetricas(agora - 30 * 86_400_000)
    const pings = this.d.armazem.listarPing(agora - 86_400_000)
    const contas: PainelDados['contas'] = {}
    for (const c of this.contas) {
      const rt = this.rt.get(c.id)
      const r = resumirConta(eventos, c.id, agora, {
        onlineDesde: rt?.onlineDesde ?? null,
        ultimoDado: rt?.saude.ultimoDadoEm() ?? null,
        ramMb: 0,
        cpuPct: 0,
      })
      contas[c.id] = {
        quedasHoje: r.quedasHoje,
        recargasHoje: r.recargasHoje,
        onlineDesde: r.onlineDesde,
        ultimoDado: r.ultimoDado,
      }
    }
    const ping: PainelDados['ping'] = {}
    for (const j of this.jogos) ping[j.id] = resumoPing(pings, j.id, agora)
    const horas30 = new Map<number, { em: number; ramMb: number; cpuPct: number; n: number }>()
    for (const p of serieTotal(metricas, agora - 30 * 86_400_000)) {
      const h = Math.floor(p.em / 3_600_000) * 3_600_000
      const a = horas30.get(h) ?? { em: h, ramMb: 0, cpuPct: 0, n: 0 }
      horas30.set(h, { em: h, ramMb: a.ramMb + p.ramMb, cpuPct: a.cpuPct + p.cpuPct, n: a.n + 1 })
    }
    return {
      serie24h: serieTotal(metricas, agora - 86_400_000),
      serie30d: [...horas30.values()].map((x) => ({
        em: x.em,
        ramMb: x.ramMb / x.n,
        cpuPct: x.cpuPct / x.n,
      })),
      contas,
      ping,
      eventos: eventos.slice(-500),
    }
  }

  // ======================= textos vigiados e login pedido =======================

  private reagendarVarredura(): void {
    this.timerVarredura?.()
    this.varreduraSeg = this.config.avisos.varreduraSeg
    this.timerVarredura = this.d.relogio.aCada(this.varreduraSeg * 1000, () => void this.varrer())
  }

  /** RN-120 a RN-123: inclui contas em foto ou fora da tela. */
  async varrer(): Promise<void> {
    for (const [id, rt] of this.rt) {
      const c = this.conta(id)
      if (!c || rt.estado.fase !== 'rodando') continue
      const textos = textosDaConta(this.textos, c)
      if (textos.length > 0) {
        const procurados = [...new Set(textos.map((x) => normalizar(x.texto)))]
        let achados: string[] = []
        try {
          achados = await rt.pagina.procurarTextos(procurados)
        } catch {
          achados = []
        }
        if (!this.rt.has(id)) continue
        const antes = this.detector.ativos(id)
        const novos = this.detector.atualizar(id, achados)
        for (const n of novos) {
          const original = textos.find((x) => normalizar(x.texto) === n)?.texto ?? n
          this.evento(id, { tipo: 'aviso', chave: `texto:${n}` })
          this.avisar(
            'texto_vigiado',
            id,
            t('avisos.texto', { texto: original, conta: c.nome }),
            `texto:${n}:${id}`,
          )
        }
        for (const sumiu of antes.filter((x) => !achados.map(normalizar).includes(x)))
          this.evento(id, { tipo: 'avisoResolvido', chave: `texto:${sumiu}` })
      }
      const jogo = this.jogoDe(id)
      if (jogo?.seletorPedeLogin) {
        const pede = await rt.pagina.existeSeletor(jogo.seletorPedeLogin).catch(() => false)
        if (pede && !rt.loginPedido) {
          rt.loginPedido = true
          this.evento(id, { tipo: 'aviso', chave: 'login' })
          this.avisar('login_pedido', id, t('avisos.loginPedido', { conta: c.nome }))
        } else if (!pede && rt.loginPedido) {
          rt.loginPedido = false
          this.evento(id, { tipo: 'avisoResolvido', chave: 'login' })
        }
      }
    }
    this.emitirEstado()
  }

  salvarTexto(dados: Omit<TextoVigiado, 'id'> & { id?: string | undefined }): TextoVigiado {
    const tx: TextoVigiado = { ...dados, id: dados.id ?? this.d.gerarId() }
    this.textos = [...this.textos.filter((x) => x.id !== tx.id), tx]
    this.d.armazem.salvarTexto(tx)
    this.emitirEstado()
    return tx
  }

  apagarTexto(id: string): void {
    this.textos = this.textos.filter((x) => x.id !== id)
    this.d.armazem.apagarTexto(id)
    this.emitirEstado()
  }

  // ======================= jogos =======================

  salvarJogo(j: Jogo): void {
    this.jogos = [...this.jogos.filter((x) => x.id !== j.id), j]
    this.d.armazem.salvarJogo(j)
    this.emitirEstado()
  }

  apagarJogo(id: string): boolean {
    if (this.contas.some((c) => c.jogoId === id)) return false
    this.jogos = this.jogos.filter((j) => j.id !== id)
    this.d.armazem.apagarJogo(id)
    this.emitirEstado()
    return true
  }

  listarJogos(): Jogo[] {
    return [...this.jogos]
  }

  // ======================= lives =======================

  adicionarLive(contaId: string, plataforma: PlataformaLive, canal: string): Resultado<Live> {
    if (!this.conta(contaId)) return falha('conta')
    const limpo = canal.trim().replace(/^@/, '')
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(limpo)) return falha('canal')
    const l: Live = {
      id: this.d.gerarId(),
      contaId,
      plataforma,
      canal: limpo,
      ligada: true,
      ordem: this.lives.filter((x) => x.contaId === contaId).length,
    }
    this.lives.push(l)
    this.d.armazem.salvarLive(l)
    this.sincronizarLives()
    this.emitirEstado()
    return ok(l)
  }

  removerLive(id: string): void {
    this.lives = this.lives.filter((l) => l.id !== id)
    this.d.armazem.apagarLive(id)
    this.sincronizarLives()
    this.emitirEstado()
  }

  ligarLive(id: string, ligada: boolean): Resultado<true> {
    const l = this.lives.find((x) => x.id === id)
    if (!l) return falha('live')
    if (ligada && !l.ligada && !this.controleLives.cabeMaisUma(l.contaId)) return falha('limite')
    const nova = { ...l, ligada }
    this.lives = this.lives.map((x) => (x.id === id ? nova : x))
    this.d.armazem.salvarLive(nova)
    this.sincronizarLives()
    this.emitirEstado()
    return ok(true)
  }

  mostrarLive(id: string, som: boolean): boolean {
    return this.controleLives.mostrar(id, som)
  }

  esconderLive(id: string): void {
    this.controleLives.esconder(id)
  }

  entrarNaLive(id: string): void {
    const l = this.lives.find((x) => x.id === id)
    if (l) this.d.lives.abrirLogin(l)
  }

  async lerLives(): Promise<void> {
    await this.controleLives.lerTodas()
  }

  private sincronizarLives(): void {
    this.controleLives.sincronizar(this.lives, new Set(this.rt.keys()))
  }

  // ======================= cofre =======================

  cofreAberto(): boolean {
    return this.trava.aberto()
  }

  cofreDestrancado(): void {
    this.trava.destrancar()
    this.emitirEstado()
  }

  trancarCofre(): void {
    this.trava.trancar()
  }

  usarCofre(): void {
    this.trava.usar()
  }

  mostrarSenha(contaId: string, aoEsconder: () => void): string | null {
    const dados = this.d.cofre.dados(contaId)
    if (!dados) return null
    return this.trava.mostrar(contaId, aoEsconder) ? dados.senha : null
  }

  /** RN-142: só preenche; nunca envia. */
  async preencherLogin(
    ids: readonly string[],
  ): Promise<{ preenchidas: string[]; semLogin: string[]; semCampos: string[] }> {
    const out = { preenchidas: [] as string[], semLogin: [] as string[], semCampos: [] as string[] }
    if (!this.trava.aberto()) return { ...out, semLogin: [...ids] }
    this.trava.usar()
    for (const id of ids) {
      const rt = this.rt.get(id)
      const dados = this.d.cofre.dados(id)
      if (!rt || !dados) {
        out.semLogin.push(id)
        continue
      }
      const seletores = dados.seletores ?? this.jogoDe(id)?.seletoresLogin ?? null
      const okP = await rt.pagina
        .preencherLogin({ usuario: dados.usuario, senha: dados.senha }, seletores)
        .catch(() => false)
      ;(okP ? out.preenchidas : out.semCampos).push(id)
    }
    return out
  }

  // ======================= avisos =======================

  pausarAvisos(ms: number): void {
    this.avisos.pausar(ms)
    this.emitirEstado()
  }

  async testarCanal(canal: 'discord' | 'telegram'): Promise<{ ok: boolean; status: number }> {
    return (canal === 'discord' ? this.filaDiscord : this.filaTelegram).testar(t('avisos.teste'))
  }

  avisoDeTeste(): void {
    this.avisos.emitir({
      tipo: 'caiu',
      contaId: null,
      mensagem: t('avisos.teste'),
      chave: `teste:${this.d.relogio.agora()}`,
    })
  }

  marcarAvisosLidos(): void {
    this.d.armazem.marcarAvisosLidos()
    this.d.locais.selo(0)
    this.emitirEstado()
  }

  listarAvisos(limite: number): Aviso[] {
    return this.d.armazem.listarAvisos(limite)
  }

  private naoLidos(): number {
    return this.d.armazem.listarAvisos(1000).filter((a) => !a.lido).length
  }

  private avisoDaSaude(
    id: string,
    tipo: 'caiu' | 'sem_dados' | 'travou' | 'fechou' | 'site_fora',
    dados: Record<string, string | number>,
  ): void {
    const conta = this.nomeConta(id)
    const jogo = this.jogoDe(id)?.nome ?? ''
    switch (tipo) {
      case 'caiu':
        this.evento(id, { tipo: 'erro', motivo: 'desistiu' })
        this.avisar(
          'caiu',
          id,
          t('avisos.caiu', { conta, n: dados.n ?? 4 }),
          `caiu:${this.jogoDe(id)?.id}`,
          (n) => t('avisos.caiuVarias', { n, jogo }),
        )
        break
      case 'sem_dados':
        this.evento(id, { tipo: 'aviso', chave: 'sem_dados' })
        this.avisar('sem_dados', id, t('avisos.semDados', { conta, min: dados.min ?? 0 }))
        break
      case 'travou':
        this.avisar('travou', id, t('avisos.travou', { conta }))
        break
      case 'fechou':
        this.avisar('travou', id, t('avisos.fechou', { conta, motivo: String(dados.motivo ?? '') }))
        break
      case 'site_fora':
        this.avisar('site_fora', id, t('avisos.siteFora', { jogo, conta }), `site:${this.jogoDe(id)?.id}`)
        break
    }
  }

  private avisar(
    tipo: TipoAviso,
    contaId: string | null,
    mensagem: string,
    chave?: string,
    agrupado?: (n: number) => string,
  ): void {
    this.avisos.emitir({
      tipo,
      contaId,
      mensagem,
      chave: chave ?? `${tipo}:${contaId ?? ''}`,
      titulo: contaId ? this.nomeConta(contaId) : t('app.nome'),
      ...(agrupado ? { agrupado } : {}),
    })
  }

  /** RN-111: "perto do limite de contas". */
  private verificarPertoDoLimite(jogo: Jogo | undefined): void {
    if (!jogo || jogo.limiteContas === null) return
    const ligadas = [...this.rt.keys()].filter((id) => this.conta(id)?.jogoId === jogo.id).length
    if (pertoDoLimite(jogo, ligadas)) {
      if (this.limitesAvisados.has(jogo.id)) return
      this.limitesAvisados.add(jogo.id)
      this.avisar(
        'limite_contas',
        null,
        t('avisos.limite', { jogo: jogo.nome, limite: jogo.limiteContas }),
        `limite:${jogo.id}`,
      )
    } else {
      this.limitesAvisados.delete(jogo.id)
    }
  }

  // ======================= utilidades =======================

  /** RN-055: impede o PC de dormir enquanto houver conta ligada. */
  private atualizarEnergia(): void {
    this.d.sistema.impedirDormir(this.config.geral.impedirDormir && this.rt.size > 0)
  }

  private precisaVigia(_id: string): boolean {
    const q = this.config.queda
    const jogo = this.jogoDe(_id)
    return q.recarregarQuandoCair || q.avisarSemDadosMin > 0 || (jogo?.dadosContinuos ?? false)
  }

  private evento(id: string, ev: EventoEstado): void {
    const rt = this.rt.get(id)
    if (!rt) return
    const novo = transicionar(rt.estado, ev)
    if (novo === rt.estado) return
    rt.estado = novo
    if (ev.tipo === 'carregou' && estaLigada(novo)) this.aplicarExibicao(id)
    this.emitirEstado()
  }

  private jogoDe(id: string): Jogo | undefined {
    const c = this.conta(id)
    return c ? this.jogos.find((j) => j.id === c.jogoId) : undefined
  }

  private jogosLigados(): Jogo[] {
    const ids = new Set([...this.rt.keys()].map((id) => this.conta(id)?.jogoId))
    return this.jogos.filter((j) => ids.has(j.id))
  }

  private nomeConta(id: string): string {
    return this.conta(id)?.nome ?? id
  }

  private nomePlataforma(p: PlataformaLive): string {
    return t(p === 'twitch' ? 'lives.twitch' : 'lives.kick')
  }

  private formatarMb(mb: number): string {
    return t('comum.gb', { n: String(Math.round((mb / 1024) * 10) / 10).replace('.', ',') })
  }

  private salvarGrupo(g: Grupo): void {
    this.grupos = this.grupos.some((x) => x.id === g.id)
      ? this.grupos.map((x) => (x.id === g.id ? g : x))
      : [...this.grupos, g]
    this.d.armazem.salvarGrupo(g)
  }

  private substituirConta(c: Conta): void {
    this.contas = this.contas.map((x) => (x.id === c.id ? c : x))
    this.d.armazem.salvarConta(c)
  }

  /** Junta vários pedidos de "estado mudou" num só envio. */
  private emitirEstado(): void {
    if (this.emitirAgendado) return
    this.emitirAgendado = true
    this.d.relogio.depois(30, () => {
      this.emitirAgendado = false
      this.d.emitir('estado', this.snapshot())
    })
  }
}

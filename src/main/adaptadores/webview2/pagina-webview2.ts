import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { PADROES } from '@shared/dados/padroes-config.ts'
import { t } from '@shared/i18n/index.ts'
import type { Conta } from '@shared/tipos/dominio.ts'
import { dominioDe, urlSemParametros } from '@shared/util/texto.ts'
import { type BaseWindow, type BrowserWindow, shell } from 'electron'
import { validarEncontrados } from '../../nucleo/avisos/textos.ts'
import type {
  DadosLogin,
  EventosPagina,
  Exibicao,
  FabricaPaginas,
  Log,
  Metrica,
  PaginaConta,
  Seletores,
} from '../../nucleo/portas.ts'
import { decidirPopup, downloadBloqueado, podeAbrirFora } from '../../nucleo/seguranca/politicas.ts'
import type { Perguntador } from '../electron/perguntador.ts'
import { scriptExisteSeletor, scriptPreencher, scriptProcurarTextos } from '../electron/scripts-pagina.ts'
import type { ClienteMotor, EventoMotor } from './cliente-motor.ts'

export type DependenciasWebView2 = {
  log: Log
  motor: ClienteMotor
  /** Janela pelo id usado no núcleo ("principal", "solta:<id>", "grupo:<id>"). */
  janela: (id: string) => BaseWindow | null
  principal: () => BaseWindow | null
  /** RN-152: a conta permite notificações da página? */
  notificacoes: (contaId: string) => boolean
  perguntador: Perguntador
  modoTeste: boolean
  aoBloquearDownload: (nome: string) => void
  /** Um atalho do HDeck (RN-176) apertado dentro da página. */
  aoTecla: (texto: string) => void
}

/** Identificador nativo (HWND) da janela, em texto, para o motor pendurar a página nela. */
export function hwndDe(j: BaseWindow | null): string | null {
  if (!j || j.isDestroyed()) return null
  return j.getNativeWindowHandle().readBigUInt64LE(0).toString()
}

const comTempo = <T>(p: Promise<T>, ms: number): Promise<T | 'tempo'> =>
  Promise.race([p, new Promise<'tempo'>((r) => setTimeout(() => r('tempo'), ms))])

/**
 * Página de uma conta no motor WebView2 (ADR 0014). Este lado só traduz: o núcleo fala com a
 * porta PaginaConta, e cada chamada vira um pedido ao motor; os eventos do motor voltam ao núcleo.
 */
class PaginaWebView2 implements PaginaConta {
  private url: string
  private pidAtual: number | null = null
  private semResposta = false
  private semRespostaSeguidas = 0
  private conferindo = false
  private morta = false
  private carregando = true
  private fechada = false
  private exibicao: Exibicao = { modo: 'fora' }
  private janelaId = 'principal'
  private mudo = false
  private zoom = 1
  private estrangular = false
  private vigiando = false
  private readonly batimento: ReturnType<typeof setInterval>

  constructor(
    private readonly conta: Conta,
    private readonly ev: EventosPagina,
    private readonly d: DependenciasWebView2,
  ) {
    this.url = conta.url
    d.motor.ouvir(conta.id, (e) => this.aoEvento(e))
    this.montar()
    this.batimento = setInterval(() => void this.conferirResposta().catch(() => {}), 5000)
  }

  /** Cria a página no motor com o estado atual (também depois que o motor reabre). */
  montar(): void {
    const janela = hwndDe(this.d.principal())
    if (!janela) return
    this.carregando = true
    this.d.motor.enviar('criar', {
      conta: this.conta.id,
      url: this.url,
      janela,
      mudo: this.mudo,
      zoom: this.zoom,
      notificacoes: this.d.notificacoes(this.conta.id),
    })
    if (this.estrangular) this.d.motor.enviar('estrangular', { conta: this.conta.id, valor: true })
    if (this.vigiando) this.d.motor.enviar('vigiar', { conta: this.conta.id, valor: true })
    this.exibir(this.exibicao)
  }

  private aoEvento(e: EventoMotor): void {
    const ev = this.ev
    switch (e.ev) {
      case 'comecou':
        this.semResposta = false
        this.morta = false
        this.semRespostaSeguidas = 0
        this.carregando = true
        ev.comecouCarregar()
        break
      case 'carregou': {
        this.carregando = false
        const url = String(e.url ?? '')
        if (url) this.url = url
        const status = Number(e.status ?? 0)
        if (status > 0) ev.statusPrincipal(status)
        ev.carregou(url)
        break
      }
      case 'falhou':
        this.carregando = false
        ev.falhouCarregar(Number(e.codigo ?? -2), String(e.descricao ?? ''))
        break
      case 'navegou': {
        const url = String(e.url ?? '')
        if (url && url !== 'about:blank') this.url = url
        ev.navegou(url)
        break
      }
      case 'titulo':
        ev.tituloMudou(String(e.titulo ?? ''))
        break
      case 'travou':
        if (!this.semResposta) {
          this.semResposta = true
          ev.travou()
        }
        break
      case 'morreu':
        this.pidAtual = null
        // Processo morto não é página travada: o batimento espera a próxima navegação.
        this.morta = true
        ev.processoMorreu(String(e.motivo ?? 'crashed'))
        break
      case 'pid':
        this.pidAtual = typeof e.pid === 'number' ? e.pid : null
        break
      case 'wsAbriu':
        ev.wsAbriu(String(e.ws), String(e.url ?? ''))
        break
      case 'wsFechou':
        ev.wsFechou(String(e.ws))
        break
      case 'dado':
        ev.dadoRecebido(e.ws == null ? null : String(e.ws))
        break
      case 'uso':
        ev.interagiu()
        break
      case 'tecla':
        this.d.aoTecla(String(e.texto ?? ''))
        break
    }
  }

  /**
   * RN-065: sem ninguém mexendo, o navegador não acusa travamento; o HDeck pergunta à página
   * (no mundo isolado) a cada 5 s se ela ainda responde.
   */
  private async conferirResposta(): Promise<void> {
    if (this.fechada || this.carregando || this.morta || this.conferindo) return
    this.conferindo = true
    const r = await comTempo(
      this.d.motor.pedir('avaliar', { conta: this.conta.id, codigo: '1' }, 9000).then(
        () => true,
        () => true,
      ),
      8000,
    ).finally(() => {
      this.conferindo = false
    })
    const respondeu = r === true
    // Uma resposta lenta não é travamento (o jogo pode estar ocupado ou a máquina carregada): só depois de
    // 3 perguntas seguidas sem resposta (~25 s) a página conta como travada.
    this.semRespostaSeguidas = respondeu ? 0 : this.semRespostaSeguidas + 1
    if (this.semRespostaSeguidas >= 3 && !this.semResposta) {
      this.semResposta = true
      this.ev.travou()
    } else if (respondeu && this.semResposta) {
      this.semResposta = false
      this.ev.respondeu()
    }
  }

  private avaliar<T>(codigo: string, timeoutMs = 15_000): Promise<T> {
    return this.d.motor.pedir<T>('avaliar', { conta: this.conta.id, codigo }, timeoutMs)
  }

  carregar(url: string): void {
    this.url = url
    this.d.motor.enviar('carregar', { conta: this.conta.id, url })
  }

  recarregar(semCache: boolean): void {
    // Página travada não atende o reload: abre num processo novo.
    if (this.semResposta) {
      this.renovarProcesso()
      return
    }
    this.d.motor.enviar('recarregar', { conta: this.conta.id, semCache })
  }

  renovarProcesso(): void {
    this.semResposta = false
    this.pidAtual = null
    this.carregando = true
    this.d.motor.enviar('renovar', { conta: this.conta.id })
  }

  fechar(): void {
    this.fechada = true
    clearInterval(this.batimento)
    this.d.motor.soltar(this.conta.id)
    this.d.motor.enviar('fechar', { conta: this.conta.id })
  }

  urlAtual(): string {
    return this.url || this.conta.url
  }

  exibir(e: Exibicao): void {
    this.exibicao = e
    if (e.modo === 'viva') {
      const j = this.d.janela(e.janela) ?? this.d.principal()
      this.janelaId = this.d.janela(e.janela) ? e.janela : 'principal'
      this.d.motor.enviar('exibir', {
        conta: this.conta.id,
        modo: 'viva',
        janela: hwndDe(j),
        x: e.retangulo.x,
        y: e.retangulo.y,
        largura: e.retangulo.largura,
        altura: e.retangulo.altura,
      })
      return
    }
    // Foto ou fora da tela: continua rodando, só fora da área da janela.
    this.d.motor.enviar('exibir', { conta: this.conta.id, modo: e.modo })
  }

  /** A janela solta ou do grupo vai fechar: a página volta para a principal antes (RN-019). */
  async voltarParaPrincipal(): Promise<void> {
    this.janelaId = 'principal'
    this.exibicao = { modo: 'fora' }
    await this.d.motor
      .pedir('exibir', { conta: this.conta.id, modo: 'fora', janela: hwndDe(this.d.principal()) }, 3000)
      .catch(() => {})
  }

  estaNaJanela(id: string): boolean {
    return this.janelaId === id
  }

  definirMudo(mudo: boolean): void {
    this.mudo = mudo
    this.d.motor.enviar('mudo', { conta: this.conta.id, valor: mudo })
  }

  definirZoom(fator: number): void {
    this.zoom = fator
    this.d.motor.enviar('zoom', { conta: this.conta.id, valor: fator })
  }

  definirEstrangulamento(estrangular: boolean): void {
    this.estrangular = estrangular
    this.d.motor.enviar('estrangular', { conta: this.conta.id, valor: estrangular })
  }

  vigiar(ligado: boolean): void {
    this.vigiando = ligado
    this.d.motor.enviar('vigiar', { conta: this.conta.id, valor: ligado })
  }

  async capturar(largura: number, altura: number): Promise<Uint8Array | null> {
    if (this.fechada || this.carregando) return null
    const b64 = await this.d.motor
      .pedir<string | null>(
        'capturar',
        { conta: this.conta.id, largura, altura, qualidade: PADROES.fotoQualidadeJpeg },
        5000,
      )
      .catch(() => null)
    return b64 ? new Uint8Array(Buffer.from(b64, 'base64')) : null
  }

  pid(): number | null {
    return this.pidAtual
  }

  conhecerPid(pid: number): void {
    this.pidAtual ??= pid
  }

  async procurarTextos(textos: string[]): Promise<string[]> {
    if (this.fechada || textos.length === 0) return []
    return validarEncontrados(await this.avaliar(scriptProcurarTextos(textos)))
  }

  async preencherLogin(dados: DadosLogin, seletores: Seletores | null): Promise<boolean> {
    if (this.fechada) return false
    return (await this.avaliar(scriptPreencher(dados.usuario, dados.senha, seletores))) === true
  }

  async existeSeletor(seletor: string): Promise<boolean> {
    if (this.fechada) return false
    return (await this.avaliar(scriptExisteSeletor(seletor))) === true
  }

  /** Roda um script do HDeck no mundo isolado (ex.: "Ensinar os campos", que espera 2 min). */
  rodarIsolado<T>(codigo: string, timeoutMs: number): Promise<T> {
    return this.avaliar<T>(codigo, timeoutMs)
  }

  /** Onde a página está de fato (posição em pontos, janela, processo): diagnóstico e testes. */
  nativo(): Promise<{
    viva: boolean
    naTela: boolean
    visivel: boolean
    x: number
    y: number
    largura: number
    altura: number
    janela: string
    pid: number | null
    devtools: boolean
  }> {
    return this.d.motor.pedir('estado', { conta: this.conta.id })
  }

  /** Só no modo de teste: lê o mundo da página (contadores do jogo falso). */
  lerPagina<T>(codigo: string): Promise<T> {
    return this.d.motor.pedir<T>('avaliarPagina', { conta: this.conta.id, codigo })
  }

  async limparCache(): Promise<void> {
    // Só os arquivos guardados: nunca cookies, armazenamento ou login (RN-056).
    await this.d.motor.pedir('limparCache', { conta: this.conta.id })
  }

  abrirDevtools(): void {
    this.d.motor.enviar('devtools', { conta: this.conta.id })
  }

  telaCheia(): void {
    const j = (this.d.janela(this.janelaId) ?? this.d.principal()) as
      | (BaseWindow & { setFullScreen?: (v: boolean) => void; isFullScreen?: () => boolean })
      | null
    if (j?.setFullScreen && j.isFullScreen) j.setFullScreen(!j.isFullScreen())
  }

  caiu(): void {
    this.pidAtual = null
    this.carregando = true
    this.ev.processoMorreu('motor')
  }

  get estado() {
    return { exibicao: this.exibicao, mudo: this.mudo, zoom: this.zoom, estrangular: this.estrangular }
  }
}

/** Fábrica das páginas no motor WebView2, e as decisões que o motor pergunta (pop-up, download). */
export class FabricaPaginasWebView2 implements FabricaPaginas {
  readonly paginas = new Map<string, PaginaWebView2>()
  private readonly urls = new Map<string, string>()

  constructor(private readonly d: DependenciasWebView2) {}

  criar(conta: Conta, eventos: EventosPagina): PaginaConta {
    this.paginas.get(conta.id)?.fechar()
    const p = new PaginaWebView2(conta, eventos, this.d)
    this.paginas.set(conta.id, p)
    this.urls.set(conta.id, conta.url)
    const fechar = p.fechar.bind(p)
    p.fechar = () => {
      fechar()
      if (this.paginas.get(conta.id) === p) this.paginas.delete(conta.id)
    }
    return p
  }

  pagina(contaId: string): PaginaWebView2 | undefined {
    return this.paginas.get(contaId)
  }

  /** O motor caiu: para o núcleo, cada página morreu (ele registra e decide). */
  motorCaiu(): void {
    for (const p of this.paginas.values()) p.caiu()
  }

  /** O motor caiu e reabriu: as páginas voltam do jeito que estavam (o login está no perfil). */
  remontarTodas(): void {
    for (const p of this.paginas.values()) p.montar()
  }

  /** Antes de uma janela solta ou de grupo fechar, as páginas dela voltam para a principal. */
  async liberarJanela(janelaId: string): Promise<void> {
    await Promise.all(
      [...this.paginas.values()].filter((p) => p.estaNaJanela(janelaId)).map((p) => p.voltarParaPrincipal()),
    )
  }

  async voltarParaPrincipal(contaId: string): Promise<void> {
    await this.paginas.get(contaId)?.voltarParaPrincipal()
  }

  /** A janela mexeu: listas suspensas e o teclado de idiomas da página acompanham. */
  janelaMoveu(): void {
    for (const id of this.paginas.keys()) this.d.motor.enviar('moveu', { conta: id })
  }

  /** O WebView2 grava cookies sozinho; ao sair, o motor fecha o navegador direito (RN-011). */
  async gravarSessoes(): Promise<void> {}

  async apagarSessao(contaId: string): Promise<void> {
    await this.d.motor.pedir('apagarSessao', { conta: contaId }, 30_000)
  }

  /**
   * Mede RAM e CPU de todos os processos (os do Electron, o motor e os do WebView2). Os processos de uma
   * conta (página e iframes) saem com o pid da página, para o núcleo somar tudo na conta certa.
   */
  async medir(pidsElectron: number[]): Promise<Metrica[]> {
    type P = { pid: number; ramMb: number; cpuPct: number; conta?: string; principal?: boolean }
    const r = await this.d.motor.pedir<{ processos: P[] }>('metricas', { pids: pidsElectron }, 8000)
    // O processo da página principal de cada conta (o motor também avisa pelo evento "pid").
    for (const p of r.processos) if (p.conta && p.principal) this.paginas.get(p.conta)?.conhecerPid(p.pid)
    return r.processos.map((p) => {
      const dona = p.conta ? this.paginas.get(p.conta)?.pid() : null
      return { pid: dona ?? p.pid, ramMb: p.ramMb, cpuPct: p.cpuPct }
    })
  }

  /** Pop-ups das contas abertos agora (diagnóstico e testes). */
  popups(): Promise<number> {
    return this.d.motor.pedir<number>('popups')
  }

  /** Atalhos do HDeck (RN-176) que o motor segura antes de chegarem ao jogo. */
  definirAtalhos(lista: string[]): void {
    this.d.motor.enviar('atalhos', { lista })
  }

  /** Pergunta do motor (pop-up ou download), decidida pelas mesmas políticas puras de antes. */
  async decidir(e: EventoMotor): Promise<unknown> {
    const contaId = String(e.conta ?? '')
    const janela = (this.d.principal() as BrowserWindow | null) ?? null
    if (e.tipo === 'popup') {
      const url = String(e.url ?? '')
      // RN-151: login abre na sessão da conta (e fecha sozinho ao voltar ao jogo).
      const decisao = decidirPopup(url, { ligado: this.d.modoTeste })
      if (decisao === 'login') {
        const atual = this.paginas.get(contaId)?.urlAtual() ?? this.urls.get(contaId) ?? ''
        return { acao: 'login', fecharEm: dominioDe(atual) }
      }
      if (decisao === 'negar') return { acao: 'negar' }
      const r = await this.d.perguntador.perguntar({
        mensagem: `${t('dialogo.popup')}\n${urlSemParametros(url)}`,
        botoes: [t('dialogo.popupAbrir'), t('dialogo.popupNavegador'), t('comum.cancelar')],
        janela,
      })
      if (r === 0) return { acao: 'abrir' }
      if (r === 1 && podeAbrirFora(url)) void shell.openExternal(url)
      return { acao: 'negar' }
    }
    if (e.tipo === 'download') {
      // RN-150: executáveis sempre bloqueados; o resto pede confirmação.
      const nome = String(e.nome ?? '')
      const origem = urlSemParametros(String(e.url ?? ''))
      if (downloadBloqueado(nome)) {
        this.d.log.aviso('download bloqueado', { nome, origem })
        this.d.aoBloquearDownload(nome)
        void this.d.perguntador.informar(t('dialogo.downloadBloqueado', { nome }))
        return { baixar: false }
      }
      const tam = Number(e.tamanho ?? 0)
      const tamanho = tam > 0 ? `${Math.max(1, Math.round(tam / 1024))} KB` : '?'
      const r = await this.d.perguntador.perguntar({
        mensagem: t('dialogo.download', { nome, tamanho, origem }),
        botoes: [t('dialogo.baixar'), t('comum.cancelar')],
        janela,
      })
      return { baixar: r === 0 }
    }
    return null
  }
}

/**
 * Sessões das contas no motor antigo (partições do Electron): não servem mais para nada depois da
 * troca para o WebView2. São apagadas uma vez para liberar o disco.
 */
export function apagarParticoesAntigas(pastaDados: string, log: Log): void {
  const pasta = join(pastaDados, 'Partitions')
  if (!existsSync(pasta)) return
  for (const n of readdirSync(pasta)) {
    if (!n.startsWith('conta-')) continue
    try {
      rmSync(join(pasta, n), { recursive: true, force: true })
    } catch (e) {
      log.aviso('partição antiga não saiu', { pasta: n, erro: String(e) })
    }
  }
}

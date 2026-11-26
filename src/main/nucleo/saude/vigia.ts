import type { Config } from '@shared/config/esquema.ts'
import { PADROES } from '@shared/dados/padroes-config.ts'
import type { Jogo, TipoEventoConta } from '@shared/tipos/dominio.ts'
import type { EventoEstado } from '../contas/estado.ts'
import type { Cancelar, Rede, Relogio } from '../portas.ts'
import { esperaDaTentativa } from './backoff.ts'

export type MotivoRecarga =
  | 'queda'
  | 'travou'
  | 'fechou'
  | 'site_fora'
  | 'internet'
  | 'programada'
  | 'memoria'
  | 'manual'
  | 'suspensao'

export type DecisoesSaude = {
  recarregar(motivo: MotivoRecarga): void
  avisar(
    tipo: 'caiu' | 'sem_dados' | 'travou' | 'fechou' | 'site_fora',
    dados: Record<string, string | number>,
  ): void
  resolverAviso(tipo: 'sem_dados'): void
  registrar(tipo: TipoEventoConta, motivo: string): void
  estado(ev: EventoEstado): void
}

type InfoWs = { url: string; quadros: number; abertoEm: number }

/**
 * Saúde de uma conta (Seção 6): decide quedas, travamentos, recargas e avisos.
 * Recebe os eventos da página e do vigia de rede; não toca em nada da página (só decide).
 */
export class VigiaSaude {
  private falhas = 0
  private ws = new Map<string, InfoWs>()
  private principal: string | null = null
  private principalFixada = false
  /** Conexões que já existiam quando a principal caiu: não podem virar a nova principal (chat etc.). */
  private secundarias = new Set<string>()
  private jaTeveWs = false
  private carregadaEm = 0
  private ultimoDado: number | null = null
  private semDadosAvisado = false
  private esperaQueda: Cancelar | null = null
  private esperaTravada: Cancelar | null = null
  private esperaRecarga: Cancelar | null = null
  private esperaWsAposCarga: Cancelar | null = null
  private timerSemDados: Cancelar | null = null
  private aguardandoInternet = false
  private parado = false
  private travada = false

  constructor(
    private readonly relogio: Relogio,
    private readonly config: () => Config,
    private readonly jogo: () => Jogo | undefined,
    private readonly rede: Rede,
    private readonly d: DecisoesSaude,
  ) {
    this.carregadaEm = relogio.agora()
    this.timerSemDados = relogio.aCada(15_000, () => this.conferirSemDados())
  }

  /** Quantas falhas seguidas (para o Painel e os testes). */
  falhasSeguidas(): number {
    return this.falhas
  }

  wsPrincipal(): string | null {
    return this.principal
  }

  ultimoDadoEm(): number | null {
    return this.ultimoDado
  }

  esperandoInternet(): boolean {
    return this.aguardandoInternet
  }

  desistiu(): boolean {
    return this.parado
  }

  // ---- eventos da página ----

  /** Nova navegação: as conexões da página anterior não existem mais. */
  comecouCarregar(): void {
    this.ws.clear()
    this.secundarias.clear()
    this.principal = null
    this.principalFixada = false
    this.carregadaEm = this.relogio.agora()
  }

  carregou(): void {
    this.cancelar('esperaRecarga')
    this.cancelar('esperaQueda')
    this.travada = false
    this.ultimoDado = this.relogio.agora()
    this.aguardandoInternet = false
    this.d.estado({ tipo: 'carregou' })
    if (!this.jaTeveWs) {
      this.sucesso()
      return
    }
    // RN-061: só conta como carregamento bem-sucedido quando a conexão principal volta.
    const espera =
      esperaDaTentativa(this.falhas, this.config().queda.esperaQuedaSeg) ?? PADROES.backoffSeg.at(-1)! * 1000
    this.cancelar('esperaWsAposCarga')
    this.esperaWsAposCarga = this.relogio.depois(espera, () => {
      this.esperaWsAposCarga = null
      if (this.principal === null) this.queda('a conexão principal não voltou', true)
    })
  }

  falhouCarregar(codigo: number, descricao: string): void {
    // -3 = carregamento abortado (ex.: nova navegação); não é falha.
    if (codigo === -3) return
    if (!this.rede.online()) {
      this.semInternet()
      return
    }
    this.siteFora(`${codigo} ${descricao}`)
  }

  statusPrincipal(status: number): void {
    if (status >= 500) this.siteFora(`HTTP ${status}`)
  }

  wsAbriu(id: string, url: string): void {
    this.ws.set(id, { url, quadros: 0, abertoEm: this.relogio.agora() })
    const padrao = this.jogo()?.wsPrincipal ?? null
    const ehPrincipal = padrao ? url.includes(padrao) : this.principal === null
    if (ehPrincipal) {
      const estavaCaida = this.esperaQueda !== null
      this.principal = id
      this.principalFixada = padrao !== null
      this.jaTeveWs = true
      if (estavaCaida) {
        this.cancelar('esperaQueda')
        this.d.registrar('voltou', 'a conexão voltou sozinha')
        this.d.estado({ tipo: 'carregou' })
      }
      if (this.esperaWsAposCarga) {
        this.cancelar('esperaWsAposCarga')
        this.sucesso()
      }
    }
  }

  dado(wsId: string | null): void {
    // RN-064: com a conexão principal conhecida, só os dados dela contam (o chat não engana).
    if (this.principal === null || wsId === this.principal || (wsId === null && !this.jaTeveWs))
      this.ultimoDado = this.relogio.agora()
    if (this.semDadosAvisado && this.ultimoDado === this.relogio.agora()) {
      this.semDadosAvisado = false
      this.d.resolverAviso('sem_dados')
    }
    if (wsId === null) return
    let info = this.ws.get(wsId)
    if (!info) {
      // O vigia pode ter ligado depois de a conexão abrir: ela passa a ser conhecida pelo primeiro quadro.
      info = { url: '', quadros: 0, abertoEm: this.relogio.agora() }
      this.ws.set(wsId, info)
    }
    info.quadros++
    // RN-062: sem declaração no catálogo, a principal é a que mais recebeu no primeiro minuto.
    if (this.secundarias.has(wsId)) return
    if (!this.principalFixada || this.principal === null) {
      if (this.principal === null || this.relogio.agora() - this.carregadaEm <= PADROES.janelaWsPrincipalSeg * 1000) {
        const atual = this.principal ? this.ws.get(this.principal) : undefined
        if (!atual || info.quadros > atual.quadros) this.principal = wsId
        this.jaTeveWs = true
      } else {
        this.principalFixada = true
      }
    }
    // A conexão principal voltou depois de recarregar (mesmo que o vigia só a conheça pelos quadros).
    if (wsId === this.principal && this.esperaWsAposCarga) {
      this.cancelar('esperaWsAposCarga')
      this.sucesso()
    }
    if (wsId === this.principal && this.esperaQueda) {
      this.cancelar('esperaQueda')
      this.d.registrar('voltou', 'a conexão voltou sozinha')
      this.d.estado({ tipo: 'carregou' })
    }
  }

  wsFechou(id: string): void {
    const eraPrincipal = id === this.principal
    this.ws.delete(id)
    if (!eraPrincipal) return // RN-062: chat, anúncios etc. não derrubam a conta.
    this.principal = null
    this.secundarias = new Set(this.ws.keys())
    this.queda('a conexão principal fechou')
  }

  travou(): void {
    if (this.travada) return
    this.travada = true
    this.d.estado({ tipo: 'travou' })
    this.d.registrar('travou', 'a página parou de responder')
    const cfg = this.config().queda
    if (!cfg.recarregarSeTravar) return
    this.esperaTravada = this.relogio.depois(cfg.travadaSeg * 1000, () => {
      this.esperaTravada = null
      if (!this.travada) return
      this.d.avisar('travou', {})
      this.recarregar('travou')
    })
  }

  respondeu(): void {
    if (!this.travada) return
    this.travada = false
    this.cancelar('esperaTravada')
    this.d.estado({ tipo: 'respondeu' })
  }

  processoMorreu(motivo: string): void {
    this.cancelar('esperaTravada')
    this.travada = false
    this.d.registrar('fechou', motivo)
    this.d.estado({ tipo: 'erro', motivo })
    if (!this.config().queda.recarregarSeFechar) return
    this.d.avisar('fechou', { motivo })
    this.tentarDeNovo('fechou')
  }

  internetVoltou(): void {
    if (!this.aguardandoInternet) return
    this.aguardandoInternet = false
    this.recarregar('internet')
  }

  /** Recarga feita por fora (manual, programada, memória): zera esperas pendentes. */
  recarregouPorFora(): void {
    this.cancelar('esperaQueda')
    this.cancelar('esperaRecarga')
    this.cancelar('esperaTravada')
    this.travada = false
    this.parado = false
  }

  desligar(): void {
    for (const k of [
      'esperaQueda',
      'esperaTravada',
      'esperaRecarga',
      'esperaWsAposCarga',
      'timerSemDados',
    ] as const)
      this.cancelar(k)
  }

  // ---- decisões ----

  private sucesso(): void {
    this.falhas = 0
    this.parado = false
  }

  /**
   * @param jaEsperou true quando a espera já passou (a conexão não voltou depois de recarregar):
   * recarrega de novo sem esperar outra vez.
   */
  private queda(motivo: string, jaEsperou = false): void {
    if (this.esperaQueda || this.parado) return
    this.d.estado({ tipo: 'caiu' })
    this.d.registrar('queda', motivo)
    const cfg = this.config().queda
    if (!cfg.recarregarQuandoCair) return
    const espera = esperaDaTentativa(this.falhas, cfg.esperaQuedaSeg)
    if (espera === null) {
      this.desistir()
      return
    }
    const agir = () => {
      this.esperaQueda = null
      if (!this.rede.online()) {
        this.semInternet()
        return
      }
      this.falhas++
      this.recarregar('queda')
    }
    if (jaEsperou) agir()
    else this.esperaQueda = this.relogio.depois(espera, agir)
  }

  private siteFora(motivo: string): void {
    this.d.estado({ tipo: 'erro', motivo: 'site_fora' })
    this.d.registrar('queda', `site fora do ar (${motivo})`)
    this.d.avisar('site_fora', { motivo })
    this.tentarDeNovo('site_fora')
  }

  private semInternet(): void {
    // RN-067: espera a internet voltar; quem confere a cada 10 s é o motor.
    this.aguardandoInternet = true
    this.d.estado({ tipo: 'erro', motivo: 'sem_internet' })
  }

  /** Recarga com a mesma espera da RN-061. */
  private tentarDeNovo(motivo: MotivoRecarga): void {
    if (this.esperaRecarga || this.parado) return
    const espera = esperaDaTentativa(this.falhas, this.config().queda.esperaQuedaSeg)
    if (espera === null) {
      this.desistir()
      return
    }
    this.esperaRecarga = this.relogio.depois(espera, () => {
      this.esperaRecarga = null
      if (!this.rede.online()) {
        this.semInternet()
        return
      }
      this.falhas++
      this.recarregar(motivo)
    })
  }

  private desistir(): void {
    this.parado = true
    this.d.avisar('caiu', { n: this.falhas })
  }

  private recarregar(motivo: MotivoRecarga): void {
    this.d.registrar('recarga', motivo)
    this.d.recarregar(motivo)
  }

  private conferirSemDados(): void {
    if (this.ultimoDado === null || this.semDadosAvisado) return
    const cfg = this.config().queda.avisarSemDadosMin
    const jogo = this.jogo()
    const min = cfg > 0 ? cfg : jogo?.dadosContinuos ? jogo.semDadosMinPadrao : 0
    if (min <= 0) return
    if (this.relogio.agora() - this.ultimoDado >= min * 60_000) {
      this.semDadosAvisado = true
      this.d.registrar('sem_dados', `${min} min sem dados`)
      this.d.avisar('sem_dados', { min })
    }
  }

  private cancelar(
    k: 'esperaQueda' | 'esperaTravada' | 'esperaRecarga' | 'esperaWsAposCarga' | 'timerSemDados',
  ): void {
    this[k]?.()
    this[k] = null
  }
}

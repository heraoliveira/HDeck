import type { Config } from '@shared/config/esquema.ts'
import { PADROES } from '@shared/dados/padroes-config.ts'
import { FilaEscalonada } from '../contas/fila.ts'
import type { Cancelar, Relogio } from '../portas.ts'

export type AcoesOtimizacao = {
  ligadas(): string[]
  /** Conta ativa usada nos últimos 60 s (RN-057). */
  emUso(id: string): boolean
  recarregar(id: string, motivo: 'programada' | 'memoria'): void
  limparCache(id: string): void
  avisarMemoria(id: string, limiteMb: number): void
  /** RN-058: reabre a página num processo novo. */
  otimizar(id: string): void
}

const MIN = 60_000
const HORA = 60 * MIN
const DIA = 24 * HORA

/**
 * Otimização programada (RN-056, RN-057, RN-058). Só "Otimizar sozinho" vem ligado (1 h).
 * Recargas programadas passam por uma fila de 20 s e nunca pegam a conta em uso.
 */
export class AgendaOtimizacao {
  private ultimaRecarga = new Map<string, number>()
  private ultimaOtimizacao = new Map<string, number>()
  private ultimaLimpeza: number
  private timer: Cancelar | null = null
  private readonly fila: FilaEscalonada

  constructor(
    private readonly relogio: Relogio,
    private readonly config: () => Config,
    private readonly acoes: AcoesOtimizacao,
  ) {
    this.fila = new FilaEscalonada(relogio, PADROES.recargaProgramadaIntervaloSeg * 1000)
    this.ultimaLimpeza = relogio.agora()
  }

  iniciar(): void {
    this.timer ??= this.relogio.aCada(MIN, () => this.verificar())
  }

  parar(): void {
    this.timer?.()
    this.timer = null
    this.fila.limpar()
  }

  /** Conta ligada ou recarregada agora: o relógio dela recomeça. */
  marcarRecarga(id: string): void {
    this.ultimaRecarga.set(id, this.relogio.agora())
    this.ultimaOtimizacao.set(id, this.relogio.agora())
  }

  esquecer(id: string): void {
    this.ultimaRecarga.delete(id)
    this.ultimaOtimizacao.delete(id)
    this.fila.remover((k) => k === id || k === `otimizar:${id}`)
  }

  pendentes(): string[] {
    return this.fila.pendentes()
  }

  verificar(): void {
    const cfg = this.config().otimizacao
    const agora = this.relogio.agora()
    if (cfg.recarregarACadaH > 0) {
      const lim = cfg.recarregarACadaH * HORA
      for (const id of this.acoes.ligadas()) {
        const ult = this.ultimaRecarga.get(id)
        if (ult === undefined) {
          this.ultimaRecarga.set(id, agora)
          continue
        }
        if (agora - ult >= lim) this.enfileirar(id)
      }
    }
    if (cfg.otimizarACadaMin > 0) {
      const lim = cfg.otimizarACadaMin * MIN
      for (const id of this.acoes.ligadas()) {
        const ult = this.ultimaOtimizacao.get(id)
        if (ult === undefined) this.ultimaOtimizacao.set(id, agora)
        else if (agora - ult >= lim) this.enfileirarOtimizar(id)
      }
    }
    if (cfg.limparCacheDias > 0 && agora - this.ultimaLimpeza >= cfg.limparCacheDias * DIA) {
      this.ultimaLimpeza = agora
      for (const id of this.acoes.ligadas()) this.acoes.limparCache(id)
    }
  }

  private enfileirar(id: string): void {
    this.fila.adicionar({
      chave: id,
      executar: () => {
        if (!this.acoes.ligadas().includes(id)) return
        if (this.acoes.emUso(id)) {
          // Fica para o fim da fila (RN-057).
          this.enfileirar(id)
          return
        }
        this.ultimaRecarga.set(id, this.relogio.agora())
        this.acoes.recarregar(id, 'programada')
      },
    })
  }

  /** RN-058: otimização automática, também uma por vez e nunca a conta em uso. */
  private enfileirarOtimizar(id: string): void {
    this.fila.adicionar({
      chave: `otimizar:${id}`,
      executar: () => {
        if (!this.acoes.ligadas().includes(id)) return
        if (this.acoes.emUso(id)) {
          this.enfileirarOtimizar(id)
          return
        }
        this.ultimaOtimizacao.set(id, this.relogio.agora())
        this.acoes.otimizar(id)
      },
    })
  }

  /** RN-056: recarrega a conta cuja memória passou do limite. Devolve as recarregadas. */
  verificarMemoria(ramPorConta: ReadonlyMap<string, number>): string[] {
    const lim = this.config().otimizacao.limiteMemoriaMB
    if (lim <= 0) return []
    const out: string[] = []
    for (const [id, mb] of ramPorConta) {
      if (mb > lim) {
        out.push(id)
        this.ultimaRecarga.set(id, this.relogio.agora())
        this.acoes.recarregar(id, 'memoria')
        this.acoes.avisarMemoria(id, lim)
      }
    }
    return out
  }
}

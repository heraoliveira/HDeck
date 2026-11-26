import { PADROES } from '@shared/dados/padroes-config.ts'
import type { Cancelar, Relogio } from '../portas.ts'

/**
 * Regras do cofre (Seção 10) independentes da criptografia:
 * trancar sozinho depois de X min sem uso (RN-141) e mostrar senha por 10 s (RN-143).
 */
export class TravaCofre {
  private destrancado = false
  private timer: Cancelar | null = null
  private mostrando = new Map<string, Cancelar>()

  constructor(
    private readonly relogio: Relogio,
    private readonly minutos: () => number,
    private readonly senhaMestraLigada: () => boolean,
    private readonly aoTrancar: () => void,
  ) {}

  /** Sem senha mestra o cofre está sempre aberto (só o Windows protege). */
  aberto(): boolean {
    return !this.senhaMestraLigada() || this.destrancado
  }

  destrancar(): void {
    this.destrancado = true
    this.usar()
  }

  trancar(): void {
    this.destrancado = false
    this.timer?.()
    this.timer = null
    for (const c of this.mostrando.values()) c()
    this.mostrando.clear()
    this.aoTrancar()
  }

  /** Cada uso empurra o horário de trancar. */
  usar(): void {
    if (!this.senhaMestraLigada() || !this.destrancado) return
    this.timer?.()
    this.timer = this.relogio.depois(this.minutos() * 60_000, () => this.trancar())
  }

  /** RN-143: libera a senha de uma conta por 10 s; devolve false se o cofre estiver trancado. */
  mostrar(contaId: string, aoEsconder: () => void): boolean {
    if (!this.aberto()) return false
    this.usar()
    this.mostrando.get(contaId)?.()
    const c = this.relogio.depois(PADROES.mostrarSenhaSeg * 1000, () => {
      this.mostrando.delete(contaId)
      aoEsconder()
    })
    this.mostrando.set(contaId, c)
    return true
  }

  mostrandoAgora(contaId: string): boolean {
    return this.mostrando.has(contaId)
  }
}

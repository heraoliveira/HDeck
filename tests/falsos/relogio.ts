import type { Cancelar, Relogio } from '../../src/main/nucleo/portas.ts'

type Agendado = { em: number; fn: () => void; repetir: number | null; id: number; vivo: boolean }

/** Relógio controlável: 45 s, 2 h ou 30 dias passam na hora (Seção 15.1). */
export class RelogioFalso implements Relogio {
  private t: number
  private fila: Agendado[] = []
  private seq = 0

  constructor(inicio = Date.UTC(2026, 10, 26, 15, 0, 0)) {
    this.t = inicio
  }

  agora(): number {
    return this.t
  }

  depois(ms: number, fn: () => void): Cancelar {
    return this.agendar(ms, fn, null)
  }

  aCada(ms: number, fn: () => void): Cancelar {
    return this.agendar(ms, fn, Math.max(1, ms))
  }

  pendentes(): number {
    return this.fila.filter((a) => a.vivo).length
  }

  /** Avança o tempo executando, em ordem, tudo o que vencer. */
  avancar(ms: number): void {
    const alvo = this.t + ms
    for (;;) {
      const prox = this.fila
        .filter((a) => a.vivo && a.em <= alvo)
        .sort((a, b) => a.em - b.em || a.id - b.id)[0]
      if (!prox) break
      this.t = Math.max(this.t, prox.em)
      if (prox.repetir !== null) prox.em += prox.repetir
      else prox.vivo = false
      prox.fn()
    }
    this.t = alvo
    this.fila = this.fila.filter((a) => a.vivo)
  }

  /** Avança e deixa as promessas pendentes andarem. */
  async avancarAsync(ms: number, passo = 1000): Promise<void> {
    let resta = ms
    while (resta > 0) {
      const p = Math.min(passo, resta)
      this.avancar(p)
      resta -= p
      for (let i = 0; i < 5; i++) await Promise.resolve()
    }
  }

  private agendar(ms: number, fn: () => void, repetir: number | null): Cancelar {
    const a: Agendado = { em: this.t + Math.max(0, ms), fn, repetir, id: this.seq++, vivo: true }
    this.fila.push(a)
    return () => {
      a.vivo = false
    }
  }
}

export async function esvaziarPromessas(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

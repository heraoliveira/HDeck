import type { Cancelar, Relogio } from '../portas.ts'

/**
 * Fila escalonada (RN-032, RN-057, RN-181): executa uma tarefa a cada `intervaloMs`.
 * A primeira roda na hora. Informa o progresso de cada lote.
 */
export type Tarefa = { chave: string; executar: () => void; lote?: string }
export type Progresso = { lote: string; feitas: number; total: number }

export class FilaEscalonada {
  private fila: Tarefa[] = []
  private timer: Cancelar | null = null
  private ultimaEm = Number.NEGATIVE_INFINITY
  private lotes = new Map<string, { feitas: number; total: number }>()

  constructor(
    private readonly relogio: Relogio,
    private intervaloMs: number,
    private readonly aoProgredir: (p: Progresso) => void = () => {},
  ) {}

  definirIntervalo(ms: number): void {
    this.intervaloMs = ms
  }

  /** Enfileira; uma chave repetida não entra duas vezes. */
  adicionar(t: Tarefa): void {
    if (this.fila.some((x) => x.chave === t.chave)) return
    this.fila.push(t)
    if (t.lote) {
      const l = this.lotes.get(t.lote) ?? { feitas: 0, total: 0 }
      l.total++
      this.lotes.set(t.lote, l)
    }
    this.agendar()
  }

  /** Coloca no fim da fila (ex.: conta ativa em uso, RN-057). */
  adiar(chave: string): boolean {
    const i = this.fila.findIndex((x) => x.chave === chave)
    if (i < 0) return false
    const [t] = this.fila.splice(i, 1)
    this.fila.push(t!)
    return true
  }

  remover(prefixoOuChave: (chave: string) => boolean): void {
    const antes = this.fila.length
    const removidas = this.fila.filter((t) => prefixoOuChave(t.chave))
    this.fila = this.fila.filter((t) => !prefixoOuChave(t.chave))
    for (const t of removidas) this.concluirLote(t)
    if (antes > 0 && this.fila.length === 0) this.pararTimer()
  }

  pendentes(): string[] {
    return this.fila.map((t) => t.chave)
  }

  tamanho(): number {
    return this.fila.length
  }

  limpar(): void {
    this.fila = []
    this.lotes.clear()
    this.pararTimer()
  }

  private pararTimer(): void {
    this.timer?.()
    this.timer = null
  }

  private agendar(): void {
    if (this.timer || this.fila.length === 0) return
    const espera = Math.max(0, this.ultimaEm + this.intervaloMs - this.relogio.agora())
    this.timer = this.relogio.depois(espera, () => {
      this.timer = null
      this.executarProxima()
    })
  }

  private executarProxima(): void {
    const t = this.fila.shift()
    if (!t) return
    this.ultimaEm = this.relogio.agora()
    try {
      t.executar()
    } finally {
      this.concluirLote(t)
      this.agendar()
    }
  }

  private concluirLote(t: Tarefa): void {
    if (!t.lote) return
    const l = this.lotes.get(t.lote)
    if (!l) return
    l.feitas++
    this.aoProgredir({ lote: t.lote, feitas: l.feitas, total: l.total })
    if (l.feitas >= l.total) this.lotes.delete(t.lote)
  }
}

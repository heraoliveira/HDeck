import type { Config } from '@shared/config/esquema.ts'
import { PADROES } from '@shared/dados/padroes-config.ts'
import type { Jogo } from '@shared/tipos/dominio.ts'
import type { Cancelar, ClienteHttp, LinhaPing, Relogio } from '../portas.ts'

export type AvisoPing = { jogo: Jogo; tipo: 'lento'; ms: number } | { jogo: Jogo; tipo: 'erro'; n: number }

/** Resumo para o Painel: atual, média da última hora e a série de 24 h. */
export function resumoPing(linhas: readonly LinhaPing[], jogoId: string, agora: number) {
  const doJogo = linhas.filter((l) => l.jogoId === jogoId).sort((a, b) => a.em - b.em)
  const hora = doJogo.filter((l) => l.em >= agora - 3_600_000 && l.ms !== null)
  const media = hora.length > 0 ? Math.round(hora.reduce((s, l) => s + (l.ms ?? 0), 0) / hora.length) : null
  return {
    atual: doJogo.at(-1)?.ms ?? null,
    media1h: media,
    serie24h: doJogo.filter((l) => l.em >= agora - 86_400_000).map((l) => ({ em: l.em, ms: l.ms })),
  }
}

/**
 * Ping (RN-130): para cada jogo com conta ligada, mede a cada N min o tempo de resposta do site.
 * Avisa acima do limite (1.000 ms) ou com 3 erros seguidos. Não usa as sessões das contas.
 */
export class AgendaPing {
  private timer: Cancelar | null = null
  private intervaloAtual = 0
  private erros = new Map<string, number>()
  private lentos = new Set<string>()

  constructor(
    private readonly relogio: Relogio,
    private readonly config: () => Config,
    private readonly http: ClienteHttp,
    private readonly jogosLigados: () => Jogo[],
    private readonly registrar: (l: LinhaPing) => void,
    private readonly avisar: (a: AvisoPing) => void,
  ) {}

  iniciar(): void {
    const ms = this.config().ping.intervaloMin * 60_000
    if (this.timer && ms === this.intervaloAtual) return
    this.timer?.()
    this.intervaloAtual = ms
    this.timer = this.relogio.aCada(ms, () => void this.medirTodos())
  }

  parar(): void {
    this.timer?.()
    this.timer = null
  }

  async medirTodos(): Promise<void> {
    await Promise.all(this.jogosLigados().map((j) => this.medir(j)))
  }

  async medir(jogo: Jogo): Promise<LinhaPing> {
    const r = await this.http.medir(jogo.urlInicial).catch(() => ({ ms: null, status: 0 }))
    const ok = r.ms !== null && r.status > 0 && r.status < 500
    const linha: LinhaPing = {
      jogoId: jogo.id,
      em: this.relogio.agora(),
      ms: ok ? r.ms : null,
      status: r.status,
    }
    this.registrar(linha)
    const lim = this.config().ping.limiteMs
    if (!ok) {
      const n = (this.erros.get(jogo.id) ?? 0) + 1
      this.erros.set(jogo.id, n)
      if (n === PADROES.pingErrosSeguidos) this.avisar({ jogo, tipo: 'erro', n })
      return linha
    }
    this.erros.set(jogo.id, 0)
    if (r.ms! > lim) {
      if (!this.lentos.has(jogo.id)) {
        this.lentos.add(jogo.id)
        this.avisar({ jogo, tipo: 'lento', ms: r.ms! })
      }
    } else {
      this.lentos.delete(jogo.id)
    }
    return linha
  }
}

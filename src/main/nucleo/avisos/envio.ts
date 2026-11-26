import { PADROES } from '@shared/dados/padroes-config.ts'
import type { Cancelar, ClienteHttp, PedidoHttp, Relogio } from '../portas.ts'

/**
 * Envio para Discord ou Telegram (RN-115): no máximo 1 mensagem a cada 3 s por canal;
 * até 3 novas tentativas (5 s, 30 s, 2 min); respeita o "espere" (429 / retry_after).
 * Mensagens que chegam enquanto o canal espera são juntadas numa só.
 */
export type ResultadoEnvio = 'enviado' | 'desistiu'

export class FilaEnvio {
  private pendentes: string[] = []
  private ocupado = false
  private ultimoEnvio = Number.NEGATIVE_INFINITY
  private timer: Cancelar | null = null
  private ouvintes: ((r: ResultadoEnvio, texto: string) => void)[] = []

  constructor(
    private readonly relogio: Relogio,
    private readonly http: ClienteHttp,
    /** Monta o pedido; null = canal sem configuração (não envia). */
    private readonly montar: (texto: string) => PedidoHttp | null,
    private readonly limiteTexto = 1900,
  ) {}

  aoTerminar(fn: (r: ResultadoEnvio, texto: string) => void): void {
    this.ouvintes.push(fn)
  }

  enviar(texto: string): void {
    this.pendentes.push(texto)
    this.agendar(0)
  }

  /** Envio imediato (botão "Testar"), sem fila. */
  async testar(texto: string): Promise<{ ok: boolean; status: number }> {
    const pedido = this.montar(texto)
    if (!pedido) return { ok: false, status: 0 }
    const r = await this.http.postar(pedido).catch(() => ({ status: 0, esperarSeg: null }))
    return { ok: r.status >= 200 && r.status < 300, status: r.status }
  }

  tamanhoDaFila(): number {
    return this.pendentes.length
  }

  parar(): void {
    this.timer?.()
    this.timer = null
    this.pendentes = []
  }

  private agendar(minimoMs: number): void {
    if (this.ocupado || this.timer || this.pendentes.length === 0) return
    const intervalo = PADROES.intervaloMinimoEnvioSeg * 1000
    const espera = Math.max(minimoMs, this.ultimoEnvio + intervalo - this.relogio.agora(), 0)
    this.timer = this.relogio.depois(espera, () => {
      this.timer = null
      void this.despachar()
    })
  }

  private juntar(): string {
    const partes: string[] = []
    let tam = 0
    while (this.pendentes.length > 0) {
      const prox = this.pendentes[0]!
      if (partes.length > 0 && tam + prox.length + 1 > this.limiteTexto) break
      partes.push(prox.slice(0, this.limiteTexto))
      tam += prox.length + 1
      this.pendentes.shift()
    }
    return partes.join('\n')
  }

  private async despachar(): Promise<void> {
    const texto = this.juntar()
    if (!texto) return
    this.ocupado = true
    const resultado = await this.tentar(texto, 0)
    this.ocupado = false
    for (const fn of this.ouvintes) fn(resultado, texto)
    this.agendar(0)
  }

  private async tentar(texto: string, tentativa: number): Promise<ResultadoEnvio> {
    const pedido = this.montar(texto)
    if (!pedido) return 'desistiu'
    this.ultimoEnvio = this.relogio.agora()
    const r = await this.http.postar(pedido).catch(() => ({ status: 0, esperarSeg: null }))
    if (r.status >= 200 && r.status < 300) return 'enviado'
    const esperas = PADROES.tentativasEnvioSeg
    if (tentativa >= esperas.length) return 'desistiu'
    // 4xx diferente de 429 é erro de configuração: não adianta repetir.
    if (r.status >= 400 && r.status < 500 && r.status !== 429) return 'desistiu'
    const base = esperas[tentativa]! * 1000
    const pedida = r.esperarSeg !== null ? r.esperarSeg * 1000 : 0
    await new Promise<void>((res) => {
      this.relogio.depois(Math.max(base, pedida), res)
    })
    return this.tentar(texto, tentativa + 1)
  }
}

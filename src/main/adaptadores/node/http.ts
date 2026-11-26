import type { ClienteHttp, PedidoHttp, RespostaHttp } from '../../nucleo/portas.ts'

type Buscar = (url: string, init?: RequestInit) => Promise<Response>

/**
 * Cliente HTTP dos avisos (Discord/Telegram) e do Ping (Seção 9). Em produção recebe o
 * `net.fetch` do Electron; nos testes, o `fetch` do Node contra um servidor local.
 */
export class ClienteHttpFetch implements ClienteHttp {
  constructor(
    private readonly buscar: Buscar = globalThis.fetch,
    private readonly agora: () => number = () => performance.now(),
    private readonly limiteMs = 10_000,
  ) {}

  async postar(p: PedidoHttp): Promise<RespostaHttp> {
    try {
      const r = await this.buscar(p.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(p.corpo),
        signal: AbortSignal.timeout(this.limiteMs),
      })
      return { status: r.status, esperarSeg: r.status === 429 ? await lerEspera(r) : null }
    } catch {
      return { status: 0, esperarSeg: null }
    }
  }

  async medir(url: string): Promise<{ ms: number | null; status: number }> {
    const t0 = this.agora()
    try {
      const r = await this.buscar(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(this.limiteMs),
        cache: 'no-store',
      })
      return { ms: Math.round(this.agora() - t0), status: r.status }
    } catch {
      return { ms: null, status: 0 }
    }
  }
}

/** Discord: `retry_after` (segundos) no corpo ou `Retry-After`; Telegram: `parameters.retry_after`. */
export async function lerEspera(r: Response): Promise<number | null> {
  const cab = Number(r.headers.get('retry-after'))
  try {
    const j = (await r.json()) as { retry_after?: number; parameters?: { retry_after?: number } }
    const v = j.retry_after ?? j.parameters?.retry_after
    if (typeof v === 'number' && Number.isFinite(v)) return v
  } catch {
    // corpo não é JSON
  }
  return Number.isFinite(cab) && cab > 0 ? cab : null
}

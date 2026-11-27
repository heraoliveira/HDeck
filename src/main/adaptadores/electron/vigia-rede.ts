import type { WebContents } from 'electron'
import type { EventosPagina, Log } from '../../nucleo/portas.ts'

/**
 * Vigia de rede por conta via CDP (Seção 6, ADR 0005). Só observa: não altera nada na página.
 * Não guarda corpo de resposta nenhuma (buffers zerados) e só repassa eventos ao núcleo.
 */
export class VigiaRede {
  private ligado = false
  private preso = false
  private readonly aoMensagem = (_e: unknown, metodo: string, p: Record<string, unknown>) => {
    switch (metodo) {
      case 'Network.webSocketCreated':
        this.eventos.wsAbriu(String(p.requestId), String(p.url ?? ''))
        break
      case 'Network.webSocketClosed':
        this.eventos.wsFechou(String(p.requestId))
        break
      case 'Network.webSocketFrameReceived':
        this.eventos.dadoRecebido(String(p.requestId))
        break
      case 'Network.responseReceived':
        this.eventos.dadoRecebido(null)
        break
    }
  }
  private readonly aoSoltar = () => {
    this.preso = false
  }

  constructor(
    private readonly wc: WebContents,
    private readonly eventos: EventosPagina,
    private readonly log: Log,
  ) {
    wc.on('devtools-opened', () => {
      // As DevTools usam o mesmo depurador: o vigia se solta e volta depois (Seção 6).
      this.soltar()
      this.eventos.devtools(true)
    })
    wc.on('devtools-closed', () => {
      this.eventos.devtools(false)
      if (this.ligado) void this.prender()
    })
  }

  definir(ligado: boolean): void {
    this.ligado = ligado
    if (ligado) void this.prender()
    else this.soltar()
  }

  private async prender(): Promise<void> {
    if (this.preso || this.wc.isDestroyed() || this.wc.isDevToolsOpened()) return
    try {
      this.wc.debugger.attach('1.3')
      this.preso = true
      this.wc.debugger.on('message', this.aoMensagem as never)
      this.wc.debugger.on('detach', this.aoSoltar)
      await this.wc.debugger.sendCommand('Network.enable', {
        maxTotalBufferSize: 0,
        maxResourceBufferSize: 0,
        maxPostDataSize: 0,
      })
    } catch (e) {
      this.preso = false
      this.log.aviso('vigia de rede não conectou', { erro: String(e) })
    }
  }

  private soltar(): void {
    if (!this.preso || this.wc.isDestroyed()) return
    this.wc.debugger.removeListener('message', this.aoMensagem as never)
    this.wc.debugger.removeListener('detach', this.aoSoltar)
    try {
      this.wc.debugger.detach()
    } catch {
      // já solto
    }
    this.preso = false
  }
}

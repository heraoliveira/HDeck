import type { Aviso } from '@shared/tipos/dominio.ts'
import {
  app,
  type BrowserWindow,
  Notification,
  nativeImage,
  net,
  powerMonitor,
  powerSaveBlocker,
} from 'electron'
import type { CanaisLocais, Metrica, Rede, Sistema } from '../../nucleo/portas.ts'
import { bitmapSelo } from './icones.ts'

/** Métricas dos processos e o bloqueio de suspensão (RN-055, Seção 7.1). */
export class SistemaElectron implements Sistema {
  private bloqueio: number | null = null

  impedirDormir(ligado: boolean): void {
    if (ligado && this.bloqueio === null) this.bloqueio = powerSaveBlocker.start('prevent-app-suspension')
    if (!ligado && this.bloqueio !== null) {
      powerSaveBlocker.stop(this.bloqueio)
      this.bloqueio = null
    }
  }

  impedindo(): boolean {
    return this.bloqueio !== null && powerSaveBlocker.isStarted(this.bloqueio)
  }

  metricas(): Metrica[] {
    return app.getAppMetrics().map((m) => ({
      pid: m.pid,
      ramMb: Math.round((m.memory.workingSetSize / 1024) * 10) / 10,
      cpuPct: Math.round(m.cpu.percentCPUUsage * 10) / 10,
    }))
  }
}

export const redeElectron: Rede = { online: () => net.isOnline() }

/** RN-063: avisa o núcleo quando o PC acorda. */
export function ouvirEnergia(aoAcordar: () => void): void {
  powerMonitor.on('resume', aoAcordar)
}

export type OpcoesLocais = {
  janela: () => BrowserWindow | null
  /** RN-116: clicar na notificação leva à conta. */
  aoClicar: (aviso: Aviso) => void
  /** O som é sintetizado pela interface (Web Audio). */
  tocarSom: () => void
  aoSelo?: (n: number) => void
}

/** Canais locais dos avisos (RN-110): notificação do Windows, som, selo e piscar. */
export class CanaisLocaisElectron implements CanaisLocais {
  private abertas = new Set<Notification>()

  constructor(private readonly o: OpcoesLocais) {}

  notificar(aviso: Aviso, titulo: string): void {
    if (!Notification.isSupported()) return
    const n = new Notification({ title: titulo, body: aviso.mensagem, silent: true })
    n.on('click', () => {
      this.o.aoClicar(aviso)
      this.abertas.delete(n)
    })
    n.on('close', () => this.abertas.delete(n))
    this.abertas.add(n)
    n.show()
  }

  tocarSom(): void {
    this.o.tocarSom()
  }

  selo(naoLidos: number): void {
    const w = this.o.janela()
    this.o.aoSelo?.(naoLidos)
    if (!w || w.isDestroyed()) return
    if (naoLidos <= 0) w.setOverlayIcon(null, '')
    else
      w.setOverlayIcon(
        nativeImage.createFromBitmap(bitmapSelo(naoLidos), { width: 16, height: 16 }),
        String(naoLidos),
      )
  }

  piscar(): void {
    const w = this.o.janela()
    if (w && !w.isDestroyed() && !w.isFocused()) w.flashFrame(true)
  }
}

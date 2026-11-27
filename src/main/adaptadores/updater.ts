import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { Log } from '../nucleo/portas.ts'

export type EstadoAtualizacao =
  | { tipo: 'parado' }
  | { tipo: 'procurando' }
  | { tipo: 'nenhuma' }
  | { tipo: 'baixando'; pct: number }
  | { tipo: 'pronta'; versao: string }
  | { tipo: 'erro' }

/**
 * Atualização automática pelo GitHub Releases (Seção 14, RN-173): baixa sozinha em segundo plano,
 * aplica ao fechar ou em "Reiniciar agora". Nunca reinicia sozinha.
 */
export class Atualizador {
  private estado: EstadoAtualizacao = { tipo: 'parado' }
  private readonly ativo = app.isPackaged && !process.env.HDECK_TESTE

  constructor(
    private readonly log: Log,
    private readonly avisar: (e: EstadoAtualizacao) => void,
  ) {
    if (!this.ativo) return
    const u = electronUpdater.autoUpdater
    u.autoDownload = true
    u.autoInstallOnAppQuit = true
    u.logger = null
    u.on('checking-for-update', () => this.mudar({ tipo: 'procurando' }))
    u.on('update-not-available', () => this.mudar({ tipo: 'nenhuma' }))
    u.on('download-progress', (p) => this.mudar({ tipo: 'baixando', pct: Math.round(p.percent) }))
    u.on('update-downloaded', (i) => this.mudar({ tipo: 'pronta', versao: i.version }))
    u.on('error', (e) => {
      this.log.aviso('atualização falhou', { erro: String(e?.message ?? e) })
      this.mudar({ tipo: 'erro' })
    })
  }

  definirCanal(canal: 'estavel' | 'teste'): void {
    if (!this.ativo) return
    const u = electronUpdater.autoUpdater
    u.allowPrerelease = canal === 'teste'
    u.channel = canal === 'teste' ? 'beta' : 'latest'
  }

  async procurar(): Promise<EstadoAtualizacao> {
    if (!this.ativo) return this.mudar({ tipo: 'nenhuma' })
    try {
      await electronUpdater.autoUpdater.checkForUpdates()
    } catch {
      this.mudar({ tipo: 'erro' })
    }
    return this.estado
  }

  /** "Reiniciar agora" (ação do usuário). */
  reiniciarAgora(): boolean {
    if (!this.ativo || this.estado.tipo !== 'pronta') return false
    electronUpdater.autoUpdater.quitAndInstall(true, true)
    return true
  }

  atual(): EstadoAtualizacao {
    return this.estado
  }

  private mudar(e: EstadoAtualizacao): EstadoAtualizacao {
    this.estado = e
    this.avisar(e)
    return e
  }
}

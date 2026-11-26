import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

const autoUpdater = Object.assign(new EventEmitter(), {
  autoDownload: false,
  autoInstallOnAppQuit: false,
  allowPrerelease: false,
  channel: 'latest',
  logger: {} as unknown,
  checkForUpdates: vi.fn(async () => {
    autoUpdater.emit('checking-for-update')
    autoUpdater.emit('download-progress', { percent: 50 })
    autoUpdater.emit('update-downloaded', { version: '2026.12.1' })
  }),
  quitAndInstall: vi.fn(),
})

vi.mock('electron', () => ({ app: { isPackaged: true } }))
vi.mock('electron-updater', () => ({ default: { autoUpdater } }))

describe('atualizador', () => {
  it('RN-173 baixa sozinho, aplica ao fechar ou em "Reiniciar agora" e nunca reinicia sozinho', async () => {
    delete process.env.HDECK_TESTE
    const { Atualizador } = await import('../../src/main/adaptadores/updater.ts')
    const estados: string[] = []
    const u = new Atualizador({ info() {}, aviso() {}, erro() {} }, (e) => estados.push(e.tipo))
    expect(autoUpdater.autoDownload).toBe(true)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(true)
    expect(u.reiniciarAgora()).toBe(false) // nada baixado ainda
    await u.procurar()
    expect(estados).toEqual(['procurando', 'baixando', 'pronta'])
    // Baixar não reinicia o app.
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    expect(u.reiniciarAgora()).toBe(true)
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1)
    u.definirCanal('teste')
    expect(autoUpdater.allowPrerelease).toBe(true)
    expect(autoUpdater.channel).toBe('beta')
    autoUpdater.emit('error', new Error('rede'))
    expect(u.atual().tipo).toBe('erro')
    autoUpdater.checkForUpdates.mockRejectedValueOnce(new Error('x'))
    expect((await u.procurar()).tipo).toBe('erro')
    process.env.HDECK_TESTE = '1'
  })
})

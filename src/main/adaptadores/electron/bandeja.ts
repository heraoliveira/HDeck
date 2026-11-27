import { t } from '@shared/i18n/index.ts'
import { Menu, nativeImage, Tray } from 'electron'
import { bitmapLogo } from './icones.ts'

export type AcoesBandeja = {
  mostrar(): void
  economia(): boolean
  alternarEconomia(): void
  silenciado(): boolean
  alternarSilencio(): void
  pausarAvisos(): void
  sair(): void
  contasLigadas(): number
}

/** Bandeja (Seção 12.2): Mostrar, Modo econômico, Silenciar tudo, Pausar avisos 1 h, Sair. */
export class Bandeja {
  private tray: Tray | null = null

  constructor(private readonly a: AcoesBandeja) {}

  criar(): void {
    const icone = nativeImage.createFromBitmap(bitmapLogo(32), { width: 32, height: 32 })
    this.tray = new Tray(icone.resize({ width: 16, height: 16 }))
    this.tray.on('click', () => this.a.mostrar())
    this.tray.on('double-click', () => this.a.mostrar())
    this.atualizar()
  }

  atualizar(naoLidos = 0): void {
    if (!this.tray || this.tray.isDestroyed()) return
    const n = this.a.contasLigadas()
    this.tray.setToolTip(
      `${t('bandeja.dica', { n })}${naoLidos > 0 ? ` · ${naoLidos} ${t('titulo.avisos').toLowerCase()}` : ''}`,
    )
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: t('bandeja.mostrar'), click: () => this.a.mostrar() },
        { type: 'separator' },
        {
          label: t('bandeja.economia'),
          type: 'checkbox',
          checked: this.a.economia(),
          click: () => this.a.alternarEconomia(),
        },
        {
          label: t('bandeja.silenciar'),
          type: 'checkbox',
          checked: this.a.silenciado(),
          click: () => this.a.alternarSilencio(),
        },
        { label: t('bandeja.pausar'), click: () => this.a.pausarAvisos() },
        { type: 'separator' },
        { label: t('bandeja.sair'), click: () => this.a.sair() },
      ]),
    )
  }

  destruir(): void {
    this.tray?.destroy()
    this.tray = null
  }
}

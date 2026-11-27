// App mínimo das provas técnicas (Seção 16, passo 2). Usa as mesmas flags do HDeck (ADR 0002).
// Os testes em provas.spec.ts dirigem este processo pelo `electronApp.evaluate`.
import { app, BrowserWindow, WebContentsView } from 'electron'

for (const flag of [
  'disable-renderer-backgrounding',
  'disable-background-timer-throttling',
  'disable-backgrounding-occluded-windows',
]) {
  app.commandLine.appendSwitch(flag)
}
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,IntensiveWakeUpThrottling')
if (process.env.PROVA_SEM_FLAGS) app.commandLine.removeSwitch('disable-features')

const urlJogo = process.env.PROVA_URL_JOGO

app.whenReady().then(() => {
  const janela = new BrowserWindow({ width: 1000, height: 700, show: true })
  globalThis.prova = { janela, views: [] }
  for (let i = 0; i < 2; i++) {
    const view = new WebContentsView({
      webPreferences: {
        partition: `persist:prova-${i}`,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
    janela.contentView.addChildView(view)
    view.setBounds({ x: i * 500, y: 0, width: 500, height: 700 })
    view.webContents.loadURL(`${urlJogo}/jogo`)
    globalThis.prova.views.push(view)
  }
})

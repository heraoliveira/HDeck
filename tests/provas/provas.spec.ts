/**
 * Provas técnicas (Seção 16, passo 2). Cada uma mede um risco do produto e grava o resultado em
 * test-results/provas.json, que alimenta docs/MEDICOES.md. Duração por cenário: PROVA_SEG (padrão 60 s).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, _electron as electron, expect, test } from '@playwright/test'
import { iniciarServidorFalso, type ServidorFalso } from '../fixtures/servidor.ts'

const SEG = Number(process.env.PROVA_SEG ?? 60)
const resultados: Record<string, unknown> = {}
let servidor: ServidorFalso
let app: ElectronApplication

test.beforeAll(async () => {
  servidor = await iniciarServidorFalso()
  app = await electron.launch({
    args: [join(import.meta.dirname, 'app-prova.mjs')],
    env: { ...process.env, PROVA_URL_JOGO: servidor.url },
  })
  await expect
    .poll(() =>
      app.evaluate(() => globalThis.prova?.views?.every((v: any) => !v.webContents.isLoading()) ?? false),
    )
    .toBe(true)
})

test.afterAll(async () => {
  await app?.close()
  await servidor?.fechar()
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/provas.json', JSON.stringify(resultados, null, 2))
  console.log(JSON.stringify(resultados, null, 2))
})

// Timers, fotos e vigia de rede das contas agora são provados com o motor WebView2 (webview2.spec.ts, ADR 0014).

test('RN-083 RN-084 prova: live offscreen toca escondida a 1 quadro/s', async () => {
  await app.evaluate(({ BrowserWindow }, url) => {
    const w = new BrowserWindow({
      show: false,
      width: 480,
      height: 270,
      webPreferences: {
        offscreen: true,
        partition: 'persist:prova-0',
        sandbox: true,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    })
    w.webContents.setFrameRate(1)
    w.webContents.setAudioMuted(true)
    w.loadURL(`${url}/live/prova`)
    globalThis.prova.live = w
  }, servidor.url)
  await new Promise((r) => setTimeout(r, 3000))
  await app.evaluate(({ app }) => app.getAppMetrics())
  await new Promise((r) => setTimeout(r, SEG * 1000))
  const r = await app.evaluate(async ({ app }) => {
    const w = globalThis.prova.live
    const live = await w.webContents.executeJavaScript(
      '({...window.__live, pausado: document.getElementById("v").paused, vis: document.visibilityState})',
    )
    const pid = w.webContents.getOSProcessId()
    const m = app.getAppMetrics().find((x) => x.pid === pid)
    return {
      ...live,
      cpuPct: m?.cpu.percentCPUUsage ?? -1,
      memMB: Math.round((m?.memory.workingSetSize ?? 0) / 1024),
    }
  })
  resultados['live.offscreen'] = {
    ...r,
    seg: SEG,
    assistidoServidor: servidor.estado.lives.prova?.assistidoSeg,
  }
  expect(r.pausado).toBe(false)
  expect(r.vis).toBe('visible')
  expect(r.pausas).toBe(0)
  expect(r.assistidoSeg).toBeGreaterThanOrEqual(SEG * 0.95)
})

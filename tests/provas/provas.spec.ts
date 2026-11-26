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

type Contagem = { intervalo: number; raf: number; ws: number; visivelSempre: boolean }
const contagem = (i: number) =>
  app.evaluate(
    (_e, i) => globalThis.prova.views[i].webContents.executeJavaScript('({...window.__contagem})'),
    i,
  ) as Promise<Contagem>

async function medir(nome: string, preparar: () => Promise<void>, desfazer: () => Promise<void>) {
  await preparar()
  const antes = await contagem(0)
  const t0 = Date.now()
  await new Promise((r) => setTimeout(r, SEG * 1000))
  const depois = await contagem(0)
  const seg = (Date.now() - t0) / 1000
  await desfazer()
  const esperado = seg * 4
  const r = {
    seg: Math.round(seg),
    intervaloPct: Math.round(((depois.intervalo - antes.intervalo) / esperado) * 1000) / 10,
    rafPorSeg: Math.round((depois.raf - antes.raf) / seg),
    wsPorSeg: Math.round(((depois.ws - antes.ws) / seg) * 10) / 10,
    visivelSempre: depois.visivelSempre,
  }
  resultados[`timers.${nome}`] = r
  return r
}

test('RN-050 prova: timers seguem ≥ 95% com a janela minimizada', async () => {
  const r = await medir(
    'minimizada',
    () => app.evaluate(() => globalThis.prova.janela.minimize()),
    () => app.evaluate(() => globalThis.prova.janela.restore()),
  )
  expect(r.intervaloPct).toBeGreaterThanOrEqual(95)
  expect(r.visivelSempre).toBe(true)
})

test('RN-050 prova: timers seguem ≥ 95% com a janela na bandeja (escondida)', async () => {
  const r = await medir(
    'bandeja',
    () => app.evaluate(() => globalThis.prova.janela.hide()),
    () => app.evaluate(() => globalThis.prova.janela.show()),
  )
  expect(r.intervaloPct).toBeGreaterThanOrEqual(95)
  expect(r.visivelSempre).toBe(true)
})

test('RN-050 prova: timers seguem ≥ 95% com a janela coberta', async () => {
  const r = await medir(
    'coberta',
    () =>
      app.evaluate(({ BrowserWindow }) => {
        const b = globalThis.prova.janela.getBounds()
        const capa = new BrowserWindow({ ...b, alwaysOnTop: true, frame: false, backgroundColor: '#000' })
        globalThis.prova.capa = capa
      }),
    () => app.evaluate(() => globalThis.prova.capa.close()),
  )
  expect(r.intervaloPct).toBeGreaterThanOrEqual(95)
  expect(r.visivelSempre).toBe(true)
})

test('RN-052 prova: foto de conta destacada da janela', async () => {
  const modos = ['destacada', 'invisivel', 'fora-da-area'] as const
  for (const modo of modos) {
    const r = await app.evaluate(async (_e, modo) => {
      const { janela, views } = globalThis.prova
      const v = views[0]
      if (modo === 'destacada') janela.contentView.removeChildView(v)
      if (modo === 'invisivel') v.setVisible(false)
      if (modo === 'fora-da-area') v.setBounds({ x: -20000, y: 0, width: 500, height: 700 })
      const capturar = () =>
        Promise.race([v.webContents.capturePage(), new Promise<null>((r) => setTimeout(() => r(null), 3000))])
      await new Promise((r) => setTimeout(r, 1500))
      const a = await capturar()
      await new Promise((r) => setTimeout(r, 1500))
      const b = await capturar()
      const ticksAntes = await v.webContents.executeJavaScript('window.__contagem.intervalo')
      await new Promise((r) => setTimeout(r, 2000))
      const ticksDepois = await v.webContents.executeJavaScript('window.__contagem.intervalo')
      // desfaz
      if (modo === 'destacada') janela.contentView.addChildView(v)
      if (modo === 'invisivel') v.setVisible(true)
      v.setBounds({ x: 0, y: 0, width: 500, height: 700 })
      return {
        travou: a === null || b === null,
        vazia: a === null || a.isEmpty(),
        tamanho: a?.getSize() ?? null,
        atualiza: !!a && !!b && !a.isEmpty() && !a.toBitmap().equals(b.toBitmap()),
        ticksEm2s: ticksDepois - ticksAntes,
      }
    }, modo)
    resultados[`foto.${modo}`] = r
  }
  // Pelo menos um modo precisa dar foto atualizada com a página rodando (plano da ADR 0003).
  const algum = modos.some((m) => {
    const r = resultados[`foto.${m}`] as { vazia: boolean; atualiza: boolean; ticksEm2s: number }
    return !r.vazia && r.atualiza && r.ticksEm2s >= 7
  })
  expect(algum).toBe(true)
})

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

test('prova: custo do vigia de rede (CDP) por conta', async () => {
  servidor.estado.intervaloDadosMs = 50
  const medirCpu = async (s: number) => {
    await app.evaluate(({ app }) => app.getAppMetrics())
    await new Promise((r) => setTimeout(r, s * 1000))
    return app.evaluate(({ app }) => {
      const pid = globalThis.prova.views[1].webContents.getOSProcessId()
      const pidMain = process.pid
      const ms = app.getAppMetrics()
      return {
        conta: ms.find((x) => x.pid === pid)?.cpu.percentCPUUsage ?? -1,
        main: ms.find((x) => x.pid === pidMain)?.cpu.percentCPUUsage ?? -1,
      }
    })
  }
  const sem = await medirCpu(Math.min(SEG, 30))
  await app.evaluate(async () => {
    const wc = globalThis.prova.views[1].webContents
    wc.debugger.attach('1.3')
    globalThis.prova.ultimoDado = 0
    wc.debugger.on('message', (_e: unknown, metodo: string) => {
      if (metodo === 'Network.webSocketFrameReceived') globalThis.prova.ultimoDado = Date.now()
    })
    await wc.debugger.sendCommand('Network.enable', {
      maxTotalBufferSize: 0,
      maxResourceBufferSize: 0,
      maxPostDataSize: 0,
    })
  })
  const com = await medirCpu(Math.min(SEG, 30))
  const recebeu = await app.evaluate(() => Date.now() - globalThis.prova.ultimoDado < 2000)
  resultados.cdp = { semVigia: sem, comVigia: com, recebeuQuadros: recebeu, msgPorSeg: 20 }
  servidor.estado.intervaloDadosMs = 250
  expect(recebeu).toBe(true)
  expect(com.conta + com.main - (sem.conta + sem.main)).toBeLessThanOrEqual(2)
})

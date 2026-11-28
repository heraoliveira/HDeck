/**
 * Provas técnicas do motor WebView2 (ADR 0014), com o HDeck de verdade: as contas rodam no motor
 * .NET, penduradas na janela do Electron. Grava o resultado em test-results/provas-webview2.json.
 * Duração por cenário: PROVA_SEG (padrão 60 s).
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { type App, abrirApp, criarContas, esperarEstado, garantirJogoFalso, naConta } from '../e2e/ajuda.ts'

type H = any
const SEG = Number(process.env.PROVA_SEG ?? 60)
const resultados: Record<string, unknown> = {}
let a: App
let ids: string[] = []

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  a = await abrirApp()
  await garantirJogoFalso(a)
  await a.app.evaluate(() => {
    const m = (globalThis as H).hdeckTeste.motor
    m.alterarConfig('economia.modoEconomico', false)
    // Estas provas são do "Manter farmando" (RN-050): a conta fora da tela segue visível para a página.
    m.definirPolitica(m.listarGrupos()[0].id, 'falso', 'manter')
  })
  ids = await criarContas(a, 2)
  for (const id of ids) await esperarEstado(a, id, ['ativa', 'escondida', 'economica'])
})

test.afterAll(async () => {
  await a?.fechar()
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/provas-webview2.json', JSON.stringify(resultados, null, 2))
  console.log(JSON.stringify(resultados, null, 2))
})

type Contagem = { intervalo: number; raf: number; ws: number; visivelSempre: boolean }
const contagem = (id: string) => naConta<Contagem>(a, id, '({...window.__contagem})')

async function medir(nome: string, preparar: () => Promise<unknown>, desfazer: () => Promise<unknown>) {
  await preparar()
  const antes = await Promise.all(ids.map(contagem))
  const t0 = Date.now()
  await new Promise((r) => setTimeout(r, SEG * 1000))
  const depois = await Promise.all(ids.map(contagem))
  const seg = (Date.now() - t0) / 1000
  await desfazer()
  const esperado = seg * 4
  const r = ids.map((_, i) => ({
    intervaloPct: Math.round(((depois[i]!.intervalo - antes[i]!.intervalo) / esperado) * 1000) / 10,
    wsPorSeg: Math.round(((depois[i]!.ws - antes[i]!.ws) / seg) * 10) / 10,
    visivelSempre: depois[i]!.visivelSempre,
  }))
  resultados[`timers.${nome}`] = { seg: Math.round(seg), ativa: r[0], foraDaTela: r[1] }
  return r
}

for (const [nome, preparar, desfazer] of [
  [
    'minimizada',
    () => a.app.evaluate(() => (globalThis as H).hdeckTeste.janelas.principal.minimize()),
    () => a.app.evaluate(() => (globalThis as H).hdeckTeste.janelas.principal.restore()),
  ],
  [
    'bandeja',
    () => a.app.evaluate(() => (globalThis as H).hdeckTeste.janelas.principal.hide()),
    () => a.app.evaluate(() => (globalThis as H).hdeckTeste.janelas.principal.show()),
  ],
  [
    'coberta',
    () =>
      a.app.evaluate(({ BrowserWindow }) => {
        const t = (globalThis as H).hdeckTeste
        const capa = new BrowserWindow({
          ...t.janelas.principal.getBounds(),
          alwaysOnTop: true,
          frame: false,
          backgroundColor: '#000',
        })
        t.capa = capa
      }),
    () => a.app.evaluate(() => (globalThis as H).hdeckTeste.capa.close()),
  ],
] as const) {
  test(`RN-050 prova WebView2: timers seguem ≥ 95% com a janela ${nome}`, async () => {
    const r = await medir(nome, preparar, desfazer)
    for (const x of r) {
      expect(x.intervaloPct).toBeGreaterThanOrEqual(95)
      expect(x.visivelSempre).toBe(true)
    }
  })
}

test('RN-052 prova WebView2: foto da conta fora da tela, atualizada, com a página rodando', async () => {
  const id = ids[1]!
  await a.app.evaluate(
    (_e, id) => (globalThis as H).hdeckTeste.fabrica.pagina(id).exibir({ modo: 'foto' }),
    id,
  )
  const foto = () =>
    a.app.evaluate(async (_e, id) => {
      const b = await (globalThis as H).hdeckTeste.fabrica.pagina(id).capturar(480, 300)
      return b ? Buffer.from(b).toString('base64') : null
    }, id)
  await new Promise((r) => setTimeout(r, 1500))
  const f1 = await foto()
  const t1 = (await contagem(id)).intervalo
  await new Promise((r) => setTimeout(r, 2000))
  const f2 = await foto()
  const t2 = (await contagem(id)).intervalo
  const nativo = await a.app.evaluate(
    (_e, id) => (globalThis as H).hdeckTeste.fabrica.pagina(id).nativo(),
    id,
  )
  resultados['foto.foraDaTela'] = {
    bytes: f1 ? Buffer.from(f1, 'base64').length : null,
    atualiza: !!f1 && !!f2 && f1 !== f2,
    ticksEm2s: t2 - t1,
    naTela: nativo.naTela,
  }
  if (f1) {
    mkdirSync('test-results', { recursive: true })
    writeFileSync('test-results/prova-foto-webview2.jpg', Buffer.from(f1, 'base64'))
  }
  expect(f1).not.toBeNull()
  expect(f1 !== f2).toBe(true)
  expect(t2 - t1).toBeGreaterThanOrEqual(7)
  expect(nativo.naTela).toBe(false)
})

/** Tempo de CPU (s) de um processo, pelo Windows. */
function cpuSeg(pid: number): number {
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).TotalProcessorTime.TotalSeconds`],
    {
      encoding: 'utf8',
    },
  )
  return Number(String(r.stdout).trim().replace(',', '.')) || 0
}

test('prova WebView2: custo do vigia de rede (CDP) com 20 mensagens/s', async () => {
  a.servidor.estado.intervaloDadosMs = 50
  const id = ids[0]!
  const pids = await a.app.evaluate((_e, id) => {
    const t = (globalThis as H).hdeckTeste
    return { motor: t.fabrica.d?.motor?.pid ?? null, conta: t.fabrica.pagina(id).pid() }
  }, id)
  const medirCpu = async (s: number) => {
    const ps = [pids.motor, pids.conta].filter((p): p is number => typeof p === 'number')
    const antes = ps.map(cpuSeg)
    await new Promise((r) => setTimeout(r, s * 1000))
    const depois = ps.map(cpuSeg)
    return (
      Math.round(((depois.reduce((x, y) => x + y, 0) - antes.reduce((x, y) => x + y, 0)) * 1000) / s) / 10
    )
  }
  const vigiar = (ligado: boolean) =>
    a.app.evaluate((_e, { id, ligado }) => (globalThis as H).hdeckTeste.fabrica.pagina(id).vigiar(ligado), {
      id,
      ligado,
    })
  await vigiar(false)
  const sem = await medirCpu(Math.min(SEG, 30))
  await vigiar(true)
  const com = await medirCpu(Math.min(SEG, 30))
  resultados.cdp = { cpuPctSemVigia: sem, cpuPctComVigia: com, msgPorSeg: 20, pids }
  a.servidor.estado.intervaloDadosMs = 250
  expect(com - sem).toBeLessThanOrEqual(2)
})

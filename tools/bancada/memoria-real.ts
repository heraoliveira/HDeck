/**
 * Diagnóstico de memória com um jogo real (sem login): abre o HDeck com UMA conta na URL dada
 * e lista RAM/CPU por processo do Chromium depois de N segundos. Uso:
 *   node tools/bancada/memoria-real.ts https://pokeidle.io/ 60
 */
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'

type H = any
const url = process.argv[2] ?? 'https://pokeidle.io/'
const seg = Number(process.argv[3] ?? 60)
const pasta = mkdtempSync(join(os.tmpdir(), 'hdeck-mem-'))
const app = await electron.launch({
  args: [
    join(process.cwd(), 'out/main/index.js'),
    ...(process.env.FLAGS ? process.env.FLAGS.split(' ') : []),
  ],
  env: { ...process.env, HDECK_TESTE: '1', HDECK_DADOS: pasta },
})
await app.firstWindow()
await app.evaluate((_e, url) => {
  const m = (globalThis as H).hdeckTeste.motor
  const g = m.listarGrupos()[0].id
  m.salvarJogo({
    id: 'real',
    nome: 'Real',
    dominios: [new URL(url).hostname],
    urlInicial: url,
    icone: '🎮',
    farmaEscondido: false,
    dadosContinuos: false,
    semDadosMinPadrao: 0,
    limiteContas: null,
    bonusLive: false,
    plataformasLive: [],
    wsPrincipal: null,
    seletoresLogin: null,
    seletorPedeLogin: null,
    canvas: false,
    origem: 'usuario',
  })
  m.adicionarConta({ grupoId: g, jogoId: 'real', url, nome: 'Conta' })
  m.ligarGrupo(g, true, true)
}, url)
for (let t = 0; t < seg; t += 15) {
  await new Promise((r) => setTimeout(r, 15_000))
  const ms = await app.evaluate(({ app, webContents }) => {
    const nomes = new Map(
      webContents.getAllWebContents().map((w) => [w.getOSProcessId(), w.getURL().slice(0, 60)]),
    )
    return app.getAppMetrics().map((m) => ({
      tipo: m.type,
      pid: m.pid,
      mb: Math.round(m.memory.workingSetSize / 1024),
      privado: Math.round((m.memory.privateBytes ?? 0) / 1024),
      cpu: Math.round(m.cpu.percentCPUUsage * 10) / 10,
      url: nomes.get(m.pid) ?? '',
    }))
  })
  const total = ms.reduce((s, m) => s + m.mb, 0)
  const cpu = ms.reduce((s, m) => s + m.cpu, 0)
  console.log(`\n${t + 15}s · total ${total} MB · CPU ${cpu.toFixed(1)}%`)
  for (const m of ms)
    console.log(
      `  ${m.tipo.padEnd(8)} ${String(m.mb).padStart(6)} MB (priv ${m.privado}) cpu ${m.cpu}% ${m.url}`,
    )
}
await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
await new Promise((r) => setTimeout(r, 2000))
try {
  rmSync(pasta, { recursive: true, force: true, maxRetries: 5 })
} catch {}

/**
 * `pnpm bancada` (Seção 13): mede as metas de desempenho com o jogo falso e grava o resultado em
 * tools/bancada/resultados/<data>.json, imprimindo a tabela para o docs/MEDICOES.md.
 * Variáveis: BANCADA_MIN (minutos do teste escondido, padrão 15), BANCADA_CONTAS (padrão 30).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication } from '@playwright/test'
import { iniciarServidorFalso } from '../../tests/fixtures/servidor.ts'

const MIN = Number(process.env.BANCADA_MIN ?? 15)
const CONTAS = Number(process.env.BANCADA_CONTAS ?? 30)
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))
type H = any

const servidor = await iniciarServidorFalso()
const pasta = mkdtempSync(join(os.tmpdir(), 'hdeck-bancada-'))
const resultado: Record<string, unknown> = {
  data: new Date().toISOString(),
  maquina: { cpu: os.cpus()[0]?.model, nucleos: os.cpus().length, ramGb: Math.round(os.totalmem() / 1024 ** 3), so: `${os.type()} ${os.release()}` },
}

const t0 = Date.now()
const app: ElectronApplication = await electron.launch({
  args: [join(process.cwd(), 'out/main/index.js')],
  env: { ...process.env, HDECK_TESTE: '1', HDECK_DADOS: pasta },
})
const janela = await app.firstWindow()
await janela.getByText('Bem-vinda ao HDeck').waitFor({ timeout: 20_000 })
resultado.aberturaMs = Date.now() - t0
resultado.versao = await app.evaluate(({ app }) => ({ app: app.getVersion(), electron: process.versions.electron }))

/** Soma RAM (MB) e CPU (%) de todos os processos, medindo a CPU numa janela de `seg`. */
async function medir(seg: number) {
  await app.evaluate(({ app }) => app.getAppMetrics())
  await espera(seg * 1000)
  return app.evaluate(({ app }) => {
    const ms = app.getAppMetrics()
    const t = (globalThis as H).hdeckTeste
    const pidsContas = new Set<number>(
      t.motor.idsLigadas().map((id: string) => t.fabrica.view(id)?.webContents.getOSProcessId()),
    )
    let ram = 0
    let cpu = 0
    let ramContas = 0
    let cpuContas = 0
    for (const m of ms) {
      ram += m.memory.workingSetSize / 1024
      cpu += m.cpu.percentCPUUsage
      if (pidsContas.has(m.pid)) {
        ramContas += m.memory.workingSetSize / 1024
        cpuContas += m.cpu.percentCPUUsage
      }
    }
    return { ramMb: Math.round(ram), cpuPct: Math.round(cpu * 10) / 10, ramContasMb: Math.round(ramContas), cpuContasPct: Math.round(cpuContas * 10) / 10 }
  })
}

// 1. Interface parada, sem contas.
await espera(5000)
resultado.ociosa = await medir(20)

// 2. Contas do jogo falso: 9 primeiro (grade 3×3), ao vivo × econômico.
await app.evaluate((_e, url) => {
  const m = (globalThis as H).hdeckTeste.motor
  m.salvarJogo({
    id: 'falso', nome: 'Jogo Falso', dominios: ['localhost'], urlInicial: `${url}/jogo`, icone: '🎲',
    farmaEscondido: false, dadosContinuos: false, semDadosMinPadrao: 0, limiteContas: null, bonusLive: false,
    plataformasLive: [], wsPrincipal: null, seletoresLogin: null, seletorPedeLogin: null, canvas: false, origem: 'usuario',
  })
  m.alterarConfig('geral.abrirAosPoucosSeg', 0)
  const g = m.listarGrupos()[0].id
  m.definirLayout(g, 'grade', { divisao: '3x3' })
  for (let i = 0; i < 9; i++) m.adicionarConta({ grupoId: g, jogoId: 'falso', url: `${url}/jogo`, nome: `C${i + 1}` })
  m.ligarGrupo(g, true, true)
}, servidor.url)
await espera(15_000)
await app.evaluate(() => {
  const m = (globalThis as H).hdeckTeste.motor
  m.alterarConfig('economia.modoEconomico', false)
})
await espera(5000)
const aoVivo = await medir(30)
await app.evaluate(() => (globalThis as H).hdeckTeste.motor.alterarConfig('economia.modoEconomico', true))
await espera(5000)
const economico = await medir(30)
resultado.grade9 = { aoVivo, economico, razaoCpu: Math.round((economico.cpuPct / Math.max(0.1, aoVivo.cpuPct)) * 100) / 100 }

// 3. Custo extra por conta: o que o HDeck gasta (main + interface + GPU) por conta ligada.
const com9 = economico
const extra = {
  ramPorContaMb: Math.round(((com9.ramMb - com9.ramContasMb - (resultado.ociosa as { ramMb: number }).ramMb) / 9) * 10) / 10,
  cpuPorContaPct: Math.round(((com9.cpuPct - com9.cpuContasPct - (resultado.ociosa as { cpuPct: number }).cpuPct) / 9) * 100) / 100,
}
resultado.custoExtra = extra

// 4. 30 contas, 9 visíveis em econômico: quadros da interface ao rolar a barra lateral.
await app.evaluate((_e, { url, n }) => {
  const m = (globalThis as H).hdeckTeste.motor
  const g = m.listarGrupos()[0].id
  for (let i = 9; i < n; i++) m.adicionarConta({ grupoId: g, jogoId: 'falso', url: `${url}/jogo`, nome: `C${i + 1}` })
  for (let i = 0; i < 20; i++) m.criarGrupo(`Grupo ${i + 2}`)
}, { url: servidor.url, n: CONTAS })
await espera(20_000)
resultado.contas30 = await medir(20)
resultado.fpsLateral = await janela.evaluate(async () => {
  const ul = document.querySelector('.lateral ul') as HTMLElement
  let quadros = 0
  let fim = false
  const contar = () => {
    quadros++
    if (!fim) requestAnimationFrame(contar)
  }
  requestAnimationFrame(contar)
  const t0 = performance.now()
  while (performance.now() - t0 < 3000) {
    ul.scrollTop = (ul.scrollTop + 7) % Math.max(1, ul.scrollHeight - ul.clientHeight)
    await new Promise((r) => setTimeout(r, 8))
  }
  fim = true
  return Math.round(quadros / 3)
})

// 5. Contas escondidas por MIN minutos (minimizada, bandeja e coberta, um terço cada).
const id = await app.evaluate(() => (globalThis as H).hdeckTeste.motor.idsLigadas()[0])
const ticks = () => app.evaluate(async (_e, id) => (globalThis as H).hdeckTeste.fabrica.view(id).webContents.executeJavaScript('window.__contagem.intervalo'), id)
const antes = await ticks()
const tIni = Date.now()
const terco = (MIN * 60_000) / 3
await app.evaluate(() => (globalThis as H).hdeckTeste.janelas.principal.minimize())
await espera(terco)
await app.evaluate(() => {
  const j = (globalThis as H).hdeckTeste.janelas.principal
  j.restore()
  j.hide()
})
await espera(terco)
await app.evaluate(({ BrowserWindow }) => {
  const j = (globalThis as H).hdeckTeste.janelas.principal
  j.show()
  ;(globalThis as H).capa = new BrowserWindow({ ...j.getBounds(), alwaysOnTop: true, frame: false })
})
await espera(terco)
await app.evaluate(() => (globalThis as H).capa.close())
const depois = await ticks()
resultado.escondida = { minutos: MIN, pct: Math.round(((depois - antes) / (((Date.now() - tIni) / 1000) * 4)) * 1000) / 10 }

await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
await app.close().catch(() => {})
await servidor.fechar()
rmSync(pasta, { recursive: true, force: true, maxRetries: 5 })

mkdirSync('tools/bancada/resultados', { recursive: true })
const arq = `tools/bancada/resultados/${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`
writeFileSync(arq, JSON.stringify(resultado, null, 2))
console.log(JSON.stringify(resultado, null, 2))
console.log(`\nResultado em ${arq}`)

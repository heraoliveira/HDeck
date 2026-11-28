/**
 * Mede a CPU por processo com N contas num jogo real (ADR 0014): abre o HDeck no modo de teste,
 * cria as contas, espera e mede por 20 s com o Windows (Get-Process). Uso:
 *   node tools/bancada/cpu-real.ts <url> <contas> <economico:0|1>
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { _electron as electron } from '@playwright/test'

const [url = 'https://pokeafk.io/', n = '3', eco = '1', politica = 'padrao_do_jogo'] = process.argv.slice(2)
const pasta = mkdtempSync(join(tmpdir(), 'hdeck-cpu-'))
const app = await electron.launch({
  args: [join(process.cwd(), 'out/main/index.js')],
  env: { ...process.env, HDECK_TESTE: '1', HDECK_DADOS: pasta },
})
await app.firstWindow()
await new Promise((r) => setTimeout(r, 3000))
await app.evaluate(
  (_e, { url, n, eco, politica }) => {
    const m = (globalThis as any).hdeckTeste.motor
    m.alterarConfig('economia.modoEconomico', eco)
    const g = m.listarGrupos()[0].id
    for (let i = 0; i < n; i++) {
      const r = m.adicionarConta({ grupoId: g, url, nome: `C${i + 1}` })
      if (r.ok) m.editarConta(r.valor.id, { politicaForaTela: politica })
    }
    m.ligarGrupo(g, true, true)
  },
  { url, n: Number(n), eco: eco === '1', politica },
)
await new Promise((r) => setTimeout(r, 40_000))
console.log(
  JSON.stringify(
    await app.evaluate(async () => {
      const t = (globalThis as any).hdeckTeste
      const s = t.motor.snapshot()
      return Promise.all(
        s.contas.map(async (c: any) => ({
          nome: c.nome,
          estado: s.estados[c.id].estado,
          ...(await t.fabrica.pagina(c.id).nativo()),
        })),
      )
    }),
  ),
)
const ps = `
$ids = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -or $_.Name -eq 'hdeck-motor.exe' -or ($_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -like '*${basename(pasta)}*') } | ForEach-Object { $t = if ($_.CommandLine -match '--type=(S+)') { $matches[1] } else { 'principal' }; [pscustomobject]@{Id=[int]$_.ProcessId; Nome=$_.Name; Tipo=$t} }
$a = @{}; foreach ($p in $ids) { $g = Get-Process -Id $p.Id -EA SilentlyContinue; if ($g) { $a[$p.Id] = $g.TotalProcessorTime.TotalMilliseconds } }
Start-Sleep -Seconds 20
$n = [Environment]::ProcessorCount; $tot = 0
foreach ($p in $ids) { $g = Get-Process -Id $p.Id -EA SilentlyContinue; if ($g -and $a.ContainsKey($p.Id)) { $pct = ($g.TotalProcessorTime.TotalMilliseconds - $a[$p.Id]) / 20000 / $n * 100; $tot += $pct; if ($pct -gt 0.05) { "{0,-20} {1,-14} {2,6:N2}%" -f $p.Nome, $p.Tipo, $pct } } }
"TOTAL {0:N2}% (de {1} nucleos)" -f $tot, $n`
const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' })
console.log(r.stdout, r.stderr)
await app.evaluate(async ({ app }) => {
  await (globalThis as any).hdeckTeste.encerrar()
  setTimeout(() => app.exit(0), 200)
})
await app.close().catch(() => {})

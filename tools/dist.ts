/**
 * `pnpm dist`: gera o instalador com uma versão nova a cada build (AAAA.MDD.HHmm), para o Windows e o
 * instalador sempre trocarem o app antigo pelo novo (com o mesmo número, a instalação por cima podia
 * deixar a versão velha). A pasta dist é limpa antes; se o HDeck estiver aberto de dentro dela, avisa.
 */
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'

const d = new Date()

// Semver sem zeros à esquerda: AAAA.(mês*100+dia).(hora*100+minuto), sempre crescente.
const versao = `${d.getFullYear()}.${(d.getMonth() + 1) * 100 + d.getDate()}.${d.getHours() * 100 + d.getMinutes()}`
try {
  rmSync('dist', { recursive: true, force: true, maxRetries: 3 })
} catch {
  console.error(
    'A pasta dist está em uso (o HDeck foi aberto de dentro dela?). Feche o HDeck e rode de novo.',
  )
  process.exit(1)
}
console.log(`HDeck ${versao}`)
const r = spawnSync(
  'pnpm',
  [
    'exec',
    'electron-builder',
    '--config',
    'build/electron-builder.yml',
    '--win',
    `-c.extraMetadata.version=${versao}`,
  ],
  { stdio: 'inherit', shell: true },
)
process.exit(r.status ?? 1)

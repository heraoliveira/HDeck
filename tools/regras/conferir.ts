/**
 * `pnpm regras` (Seção 15.1): toda RN ativa do docs/REGRAS.md precisa de pelo menos um teste
 * que a cite, e nenhum teste pode citar RN inexistente. Gera docs/rastreio.md (RN → testes).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const raiz = process.cwd()
const livro = readFileSync(join(raiz, 'docs/REGRAS.md'), 'utf8')

type Regra = { codigo: string; texto: string; revogada: boolean }
const regras = new Map<string, Regra>()
for (const linha of livro.split(/\r?\n/)) {
  const m = linha.match(/^\s*-\s+\*\*(RN-\d{3})\*\*\s*(.*)$/)
  if (!m) continue
  const [, codigo, texto] = m as unknown as [string, string, string]
  regras.set(codigo, { codigo, texto: texto.slice(0, 90), revogada: /\[revogada em/i.test(texto) })
}

const arquivos: string[] = []
const andar = (d: string) => {
  for (const n of readdirSync(d)) {
    if (n === 'node_modules' || n === 'fixtures') continue
    const p = join(d, n)
    if (statSync(p).isDirectory()) andar(p)
    else if (/\.(ts|mjs|js)$/.test(n)) arquivos.push(p)
  }
}
andar(join(raiz, 'tests'))

const citacoes = new Map<string, Set<string>>()
const inexistentes: string[] = []
for (const a of arquivos) {
  const s = readFileSync(a, 'utf8')
  for (const m of s.matchAll(/RN-\d{3}/g)) {
    const codigo = m[0]
    const rel = relative(raiz, a).replaceAll('\\', '/')
    if (!regras.has(codigo)) inexistentes.push(`${codigo} em ${rel}`)
    const set = citacoes.get(codigo) ?? new Set<string>()
    set.add(rel)
    citacoes.set(codigo, set)
  }
}

const ativas = [...regras.values()].filter((r) => !r.revogada)
const semTeste = ativas.filter((r) => !citacoes.has(r.codigo))
const citamRevogada = [...regras.values()].filter((r) => r.revogada && citacoes.has(r.codigo))

const linhas = [
  '# Rastreio RN → testes',
  '',
  '> Gerado por `pnpm regras`. Não editar à mão.',
  '',
  `Regras ativas: ${ativas.length} · com teste: ${ativas.length - semTeste.length}`,
  '',
  '| RN | Regra | Testes |',
  '|---|---|---|',
  ...[...regras.values()].map(
    (r) =>
      `| ${r.codigo}${r.revogada ? ' (revogada)' : ''} | ${r.texto.replaceAll('|', '\\|')}… | ${[...(citacoes.get(r.codigo) ?? [])].sort().join('<br>') || '—'} |`,
  ),
  '',
]
writeFileSync(join(raiz, 'docs/rastreio.md'), linhas.join('\n'))

let falhou = false
if (semTeste.length > 0) {
  falhou = true
  console.error(`RN ativas sem teste (${semTeste.length}): ${semTeste.map((r) => r.codigo).join(', ')}`)
}
if (inexistentes.length > 0) {
  falhou = true
  console.error(`Testes citam RN inexistente:\n  ${inexistentes.join('\n  ')}`)
}
if (citamRevogada.length > 0)
  console.warn(`Aviso: testes citam RN revogada: ${citamRevogada.map((r) => r.codigo).join(', ')}`)
if (falhou) process.exit(1)
console.log(`OK: ${ativas.length} regras ativas, todas com teste. docs/rastreio.md atualizado.`)

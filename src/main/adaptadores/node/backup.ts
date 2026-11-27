import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { configSchema } from '@shared/config/esquema.ts'
import {
  contaSchema,
  grupoSchema,
  jogoSchema,
  liveSchema,
  textoVigiadoSchema,
} from '@shared/tipos/dominio.ts'
import { z } from 'zod'
import type { Armazem, ArmazemConfig } from '../../nucleo/portas.ts'
import type { Cofre } from './cofre.ts'
import { criarZip, type EntradaZip, lerZip } from './zip.ts'

/**
 * Backup `.hdeck` (RN-160 a RN-162): configurações, grupos, contas, lives e textos vigiados;
 * cofre só cifrado com a senha do backup; sessões (cookies) só se pedido.
 */

const manifestoSchema = z.object({
  formato: z.literal('hdeck-backup'),
  versao: z.literal(1),
  criadoEm: z.number(),
})
const dadosSchema = z.object({
  jogos: z.array(jogoSchema),
  grupos: z.array(grupoSchema),
  contas: z.array(contaSchema),
  lives: z.array(liveSchema),
  textos: z.array(textoVigiadoSchema),
})
const cofreSchema = z.object({ sal: z.string(), dados: z.string() })

export type OpcoesExportar = {
  incluirCofre: boolean
  senhaBackup?: string | undefined
  /** Pasta dos perfis do WebView2 (EBWebView); com ela, as sessões entram no backup (RN-161). */
  pastaSessoes?: string | undefined
}

export type ErroBackup = 'senha' | 'trancado' | 'formato' | 'sem_protecao'

function arquivosDe(pasta: string): string[] {
  if (!existsSync(pasta)) return []
  const out: string[] = []
  const andar = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      const s = statSync(p)
      if (s.isDirectory()) andar(p)
      else if (s.size < 512 * 1024 * 1024) out.push(p)
    }
  }
  andar(pasta)
  return out
}

export function exportarBackup(
  deps: { armazem: Armazem; config: ArmazemConfig; cofre: Cofre; agora: number },
  op: OpcoesExportar,
): Buffer | ErroBackup {
  const a = deps.armazem
  const entradas: EntradaZip[] = [
    {
      nome: 'manifesto.json',
      dados: Buffer.from(JSON.stringify({ formato: 'hdeck-backup', versao: 1, criadoEm: deps.agora })),
    },
    { nome: 'config.json', dados: Buffer.from(JSON.stringify(deps.config.ler())) },
    {
      nome: 'dados.json',
      dados: Buffer.from(
        JSON.stringify({
          jogos: a.listarJogos(),
          grupos: a.listarGrupos(),
          contas: a.listarContas(),
          lives: a.listarLives(),
          textos: a.listarTextos(),
        }),
      ),
    },
  ]
  if (op.incluirCofre) {
    if (!op.senhaBackup) return 'senha'
    const pacote = deps.cofre.exportar(op.senhaBackup)
    if (typeof pacote === 'string') return pacote
    entradas.push({ nome: 'cofre.json', dados: Buffer.from(JSON.stringify(pacote)) })
  }
  if (op.pastaSessoes) {
    for (const c of a.listarContas()) {
      const pasta = join(op.pastaSessoes, `WV2Profile_conta-${c.id}`)
      for (const arq of arquivosDe(pasta)) {
        try {
          entradas.push({
            nome: `sessoes/WV2Profile_conta-${c.id}/${relative(pasta, arq)}`,
            dados: readFileSync(arq),
          })
        } catch {
          // arquivo travado pelo Chromium: pulado (as contas ficam desligadas durante a cópia)
        }
      }
    }
  }
  return criarZip(entradas)
}

export type ResumoImportacao = {
  grupos: number
  contas: number
  textos: number
  logins: number
  sessoes: number
}

/** RN-162: restaura tudo o que foi exportado numa pasta de dados (nova ou não). */
export function importarBackup(
  arquivo: Uint8Array,
  deps: { armazem: Armazem; config: ArmazemConfig; cofre: Cofre; pastaSessoes: string },
  senhaBackup?: string,
): ResumoImportacao | ErroBackup {
  let entradas: EntradaZip[]
  try {
    entradas = lerZip(arquivo)
  } catch {
    return 'formato'
  }
  const ler = (nome: string) => entradas.find((e) => e.nome === nome)?.dados
  try {
    manifestoSchema.parse(JSON.parse(String(ler('manifesto.json') ?? '')))
  } catch {
    return 'formato'
  }
  const dados = dadosSchema.safeParse(JSON.parse(String(ler('dados.json') ?? '{}')))
  const config = configSchema.safeParse(JSON.parse(String(ler('config.json') ?? '{}')))
  if (!dados.success || !config.success) return 'formato'
  const cofreBruto = ler('cofre.json')
  let logins = 0
  if (cofreBruto) {
    if (!senhaBackup) return 'senha'
    const r = deps.cofre.importar(cofreSchema.parse(JSON.parse(String(cofreBruto))), senhaBackup)
    if (typeof r === 'string') return r
    logins = r
  }
  const a = deps.armazem
  a.transacao(() => {
    for (const j of dados.data.jogos) a.salvarJogo(j)
    for (const g of dados.data.grupos) a.salvarGrupo(g)
    for (const c of dados.data.contas) a.salvarConta(c)
    for (const l of dados.data.lives) a.salvarLive(l)
    for (const t of dados.data.textos) a.salvarTexto(t)
  })
  deps.config.gravar(config.data)
  let sessoes = 0
  for (const e of entradas.filter((x) => x.nome.startsWith('sessoes/'))) {
    const destino = join(deps.pastaSessoes, e.nome.slice('sessoes/'.length))
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, e.dados)
    sessoes++
  }
  return {
    grupos: dados.data.grupos.length,
    contas: dados.data.contas.length,
    textos: dados.data.textos.length,
    logins,
    sessoes,
  }
}

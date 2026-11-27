import { z } from 'zod'
import { tiposAviso } from '../tipos/dominio.ts'

/**
 * Configuração do HDeck. Todos os padrões são os das capturas e do REGRAS.md.
 * `prefault` faz o Zod preencher os padrões aninhados a partir de `{}`.
 */

const umDe = <T extends readonly [number, ...number[]]>(valores: T, padrao: T[number]) =>
  z
    .number()
    .refine((v) => (valores as readonly number[]).includes(v), { message: 'valor fora das opções' })
    .default(padrao)

export const OPCOES = {
  restaurar: ['ligados', 'todos', 'nenhum'] as const,
  tema: ['escuro', 'claro', 'sistema'] as const,
  semDadosMin: [0, 1, 2, 5, 10, 30] as const,
  fotoSeg: [1, 2, 5, 10, 30] as const,
  voltarFotoSeg: [0, 30, 60, 300] as const,
  recarregarH: [0, 2, 4, 6, 12, 24] as const,
  memoriaMB: [0, 1024, 1536, 2048, 3072] as const,
  cacheDias: [0, 1, 7] as const,
  otimizarMin: [0, 30, 60, 120, 240] as const,
  qualidade: ['160p', '360p', '480p', '720p', 'auto'] as const,
  livesPorConta: [0, 1, 2, 3, 5] as const,
  religarMin: [30, 60, 120, 240, 360] as const,
  som: ['todas', 'ativa', 'nenhuma'] as const,
  somAviso: ['sino', 'bip', 'gota', 'arquivo'] as const,
  canalAtualizacao: ['estavel', 'teste'] as const,
} as const

const canaisDoTipo = z
  .object({
    windows: z.boolean().default(true),
    som: z.boolean().default(true),
    selo: z.boolean().default(true),
    discord: z.boolean().default(true),
    telegram: z.boolean().default(true),
  })
  .prefault({})

const tiposAvisoConfig = z
  .object(
    Object.fromEntries(tiposAviso.map((t) => [t, canaisDoTipo])) as Record<
      (typeof tiposAviso)[number],
      typeof canaisDoTipo
    >,
  )
  .prefault({})

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

export const configSchema = z.object({
  versao: z.literal(2).default(2),
  geral: z
    .object({
      iniciarComWindows: z.boolean().default(false),
      abrirNaBandeja: z.boolean().default(false),
      fecharVaiParaBandeja: z.boolean().default(true),
      restaurarAoAbrir: z.enum(OPCOES.restaurar).default('ligados'),
      abrirAosPoucosSeg: z.number().int().min(0).max(60).default(3),
      impedirDormir: z.boolean().default(true),
      tema: z.enum(OPCOES.tema).default('escuro'),
      confirmarAoSair: z.boolean().default(true),
      atalhos: z.record(z.string(), z.string().max(40)).default({}),
    })
    .prefault({}),
  queda: z
    .object({
      recarregarQuandoCair: z.boolean().default(true),
      esperaQuedaSeg: z.number().int().min(15).max(300).default(45),
      recarregarAoAcordar: z.boolean().default(true),
      avisarSemDadosMin: umDe(OPCOES.semDadosMin, 0),
      recarregarSeTravar: z.boolean().default(true),
      travadaSeg: z.number().int().min(5).max(300).default(30),
      recarregarSeFechar: z.boolean().default(true),
    })
    .prefault({}),
  economia: z
    .object({
      modoEconomico: z.boolean().default(true),
      fotoACadaSeg: umDe(OPCOES.fotoSeg, 1),
      voltarAFotoSeg: umDe(OPCOES.voltarFotoSeg, 0),
    })
    .prefault({}),
  otimizacao: z
    .object({
      recarregarACadaH: umDe(OPCOES.recarregarH, 0),
      limiteMemoriaMB: umDe(OPCOES.memoriaMB, 0),
      limparCacheDias: umDe(OPCOES.cacheDias, 0),
      otimizarACadaMin: umDe(OPCOES.otimizarMin, 60),
    })
    .prefault({}),
  lives: z
    .object({
      ligadas: z.boolean().default(true),
      economico: z.boolean().default(true),
      qualidade: z.enum(OPCOES.qualidade).default('160p'),
      porConta: umDe(OPCOES.livesPorConta, 0),
      voltarAoCanal: z.boolean().default(true),
      desligarEncerrada: z.boolean().default(true),
      religar: z.boolean().default(false),
      religarACadaMin: umDe(OPCOES.religarMin, 120),
      mostrarEmTodas: z.boolean().default(false),
    })
    .prefault({}),
  som: z.object({ modo: z.enum(OPCOES.som).default('todas') }).prefault({}),
  avisos: z
    .object({
      windows: z.boolean().default(true),
      som: z.boolean().default(true),
      selo: z.boolean().default(true),
      piscar: z.boolean().default(false),
      discord: z.boolean().default(false),
      telegram: z.boolean().default(false),
      telegramChatId: z.string().max(40).default(''),
      somEscolhido: z.enum(OPCOES.somAviso).default('sino'),
      somArquivo: z.string().max(500).default(''),
      volume: z.number().min(0).max(1).default(0.7),
      tipos: tiposAvisoConfig,
      semInternetMin: z.number().int().min(1).max(120).default(5),
      silencio: z
        .object({
          ligado: z.boolean().default(false),
          inicio: hora.default('23:00'),
          fim: hora.default('07:00'),
        })
        .prefault({}),
      varreduraSeg: z.number().int().min(2).max(60).default(5),
    })
    .prefault({}),
  cofre: z
    .object({
      senhaMestra: z.boolean().default(false),
      trancarAposMin: z.number().int().min(1).max(240).default(15),
    })
    .prefault({}),
  ping: z
    .object({
      intervaloMin: z.number().int().min(1).max(30).default(5),
      limiteMs: z.number().int().min(100).max(10000).default(1000),
    })
    .prefault({}),
  atualizacao: z.object({ canal: z.enum(OPCOES.canalAtualizacao).default('estavel') }).prefault({}),
  avancado: z.object({ aceleracaoHardware: z.boolean().default(true) }).prefault({}),
})

export type Config = z.infer<typeof configSchema>

export const configPadrao = (): Config => configSchema.parse({})

/**
 * Migração por versão. v1 (pré-lançamento) guardava `economia.fotoMs` em milissegundos.
 * Qualquer versão desconhecida volta aos padrões preservando o que ainda for válido.
 */
export function migrarConfig(bruto: unknown): Config {
  const obj = (typeof bruto === 'object' && bruto !== null ? { ...bruto } : {}) as Record<string, unknown>
  if (obj.versao === 1) {
    const eco = (obj.economia ?? {}) as Record<string, unknown>
    if (typeof eco.fotoMs === 'number') {
      eco.fotoACadaSeg = Math.round(eco.fotoMs / 1000)
      delete eco.fotoMs
    }
    obj.economia = eco
    obj.versao = 2
  }
  const r = configSchema.safeParse(obj)
  if (r.success) return r.data
  // Campo inválido: descarta só as seções com problema.
  const limpo: Record<string, unknown> = { versao: 2 }
  for (const [chave, valor] of Object.entries(obj)) {
    if (chave === 'versao') continue
    const parcial = configSchema.safeParse({ versao: 2, [chave]: valor })
    if (parcial.success) limpo[chave] = valor
  }
  return configSchema.parse(limpo)
}

/** Lê e grava um caminho "a.b.c" na config, validando o resultado inteiro. */
export function lerCaminho(config: Config, caminho: string): unknown {
  return caminho.split('.').reduce<unknown>((acc, parte) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[parte]
    return undefined
  }, config)
}

export function alterarCaminho(config: Config, caminho: string, valor: unknown): Config | null {
  const partes = caminho.split('.')
  if (
    partes.length === 0 ||
    partes.some((p) => p === '__proto__' || p === 'constructor' || p === 'prototype')
  )
    return null
  const copia = structuredClone(config) as Record<string, unknown>
  let alvo: Record<string, unknown> = copia
  for (const parte of partes.slice(0, -1)) {
    const prox = alvo[parte]
    if (!prox || typeof prox !== 'object') return null
    alvo = prox as Record<string, unknown>
  }
  const ultima = partes.at(-1)!
  if (!(ultima in alvo) && !caminho.startsWith('geral.atalhos.')) return null
  alvo[ultima] = valor
  const r = configSchema.safeParse(copia)
  return r.success ? r.data : null
}

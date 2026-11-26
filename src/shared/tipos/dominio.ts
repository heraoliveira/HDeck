import { z } from 'zod'

export const idSchema = z.string().min(1).max(64)
export const corSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const politicaForaTelaSchema = z.enum(['manter', 'economizar'])
export type PoliticaForaTela = z.infer<typeof politicaForaTelaSchema>

export const plataformaLiveSchema = z.enum(['twitch', 'kick'])
export type PlataformaLive = z.infer<typeof plataformaLiveSchema>

export const jogoSchema = z.object({
  id: idSchema,
  nome: z.string().min(1).max(80),
  dominios: z.array(z.string().min(1).max(253)).min(1).max(20),
  urlInicial: z.url(),
  icone: z.string().max(8).default('🎮'),
  farmaEscondido: z.boolean().default(true),
  dadosContinuos: z.boolean().default(false),
  semDadosMinPadrao: z.number().int().min(0).max(30).default(0),
  limiteContas: z.number().int().positive().nullable().default(null),
  bonusLive: z.boolean().default(false),
  plataformasLive: z.array(plataformaLiveSchema).default([]),
  wsPrincipal: z.string().max(200).nullable().default(null),
  seletoresLogin: z
    .object({ usuario: z.string().max(200), senha: z.string().max(200) })
    .nullable()
    .default(null),
  seletorPedeLogin: z.string().max(200).nullable().default(null),
  canvas: z.boolean().default(false),
  origem: z.enum(['catalogo', 'usuario']).default('usuario'),
})
export type Jogo = z.infer<typeof jogoSchema>

export const visaoSchema = z.enum(['grade', 'principal', 'foco', 'painel'])
export type Visao = z.infer<typeof visaoSchema>

export const divisaoSchema = z.enum([
  'auto',
  '1',
  '2h',
  '2v',
  '1+2',
  '1+3',
  '2x2',
  '3x2',
  '3x3',
  '4x4',
  'personalizada',
])
export type Divisao = z.infer<typeof divisaoSchema>

/** Retângulo normalizado (0..1) de uma divisão personalizada. */
export const retanguloNormSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  l: z.number().min(0.02).max(1),
  a: z.number().min(0.02).max(1),
})
export type RetanguloNorm = z.infer<typeof retanguloNormSchema>

export const layoutGrupoSchema = z.object({
  divisao: divisaoSchema.default('auto'),
  personalizada: z.array(retanguloNormSchema).max(16).default([]),
  /** Conta escolhida para cada espaço; null = Automático (ordem do grupo). */
  espacos: z.array(idSchema.nullable()).max(16).default([]),
  proporcao169: z.boolean().default(false),
  faixaMiniaturas: z.enum(['direita', 'embaixo']).default('direita'),
  /** Política fora da tela por jogo dentro deste grupo (RN-051). */
  politicas: z.record(idSchema, politicaForaTelaSchema).default({}),
})
export type LayoutGrupo = z.infer<typeof layoutGrupoSchema>

export const grupoSchema = z.object({
  id: idSchema,
  nome: z.string().min(1).max(60),
  cor: corSchema,
  ordem: z.number().int().min(0),
  ligado: z.boolean(),
  visao: visaoSchema,
  layout: layoutGrupoSchema,
})
export type Grupo = z.infer<typeof grupoSchema>

export const contaSchema = z.object({
  id: idSchema,
  grupoId: idSchema,
  jogoId: idSchema,
  nome: z.string().min(1).max(60),
  cor: corSchema,
  icone: z.string().max(8),
  ordem: z.number().int().min(0),
  url: z.url(),
  zoom: z.number().min(0.25).max(3),
  som: z.boolean(),
  politicaForaTela: z.enum(['padrao_do_jogo', 'manter', 'economizar']),
  notificacoesDaPagina: z.boolean(),
  notas: z.string().max(2000),
  criadaEm: z.number().int(),
})
export type Conta = z.infer<typeof contaSchema>

export const liveSchema = z.object({
  id: idSchema,
  contaId: idSchema,
  plataforma: plataformaLiveSchema,
  canal: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[A-Za-z0-9_-]+$/),
  ligada: z.boolean(),
  ordem: z.number().int().min(0),
})
export type Live = z.infer<typeof liveSchema>

export const escopoTextoSchema = z.enum(['todas', 'grupo', 'conta'])
export const textoVigiadoSchema = z.object({
  id: idSchema,
  texto: z.string().min(1).max(200),
  escopo: escopoTextoSchema,
  alvoId: idSchema.nullable(),
  ativo: z.boolean(),
})
export type TextoVigiado = z.infer<typeof textoVigiadoSchema>

export const estadosConta = [
  'desligada',
  'carregando',
  'ativa',
  'economica',
  'escondida',
  'caida',
  'recarregando',
  'travada',
  'com_aviso',
  'erro',
] as const
export type EstadoConta = (typeof estadosConta)[number]

export const tiposAviso = [
  'caiu',
  'sem_dados',
  'texto_vigiado',
  'travou',
  'site_fora',
  'sem_internet',
  'memoria',
  'live',
  'login_pedido',
  'limite_contas',
] as const
export type TipoAviso = (typeof tiposAviso)[number]

export type Aviso = {
  id: string
  contaId: string | null
  tipo: TipoAviso
  mensagem: string
  criadoEm: number
  lido: boolean
}

export const tiposEventoConta = [
  'queda',
  'recarga',
  'travou',
  'sem_dados',
  'voltou',
  'fechou',
  'limpou_cache',
] as const
export type TipoEventoConta = (typeof tiposEventoConta)[number]

export type EventoConta = { contaId: string; tipo: TipoEventoConta; motivo: string; em: number }

export type EstadoLive = 'desligada' | 'abrindo' | 'tocando' | 'encerrada' | 'pede_login' | 'conferindo'

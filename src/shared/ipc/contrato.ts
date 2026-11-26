import { z } from 'zod'
import type { Config } from '../config/esquema.ts'
import {
  type Conta,
  corSchema,
  type EstadoConta,
  type EstadoLive,
  type EventoConta,
  escopoTextoSchema,
  type Grupo,
  idSchema,
  type Jogo,
  jogoSchema,
  type Live,
  layoutGrupoSchema,
  plataformaLiveSchema,
  politicaForaTelaSchema,
  type TextoVigiado,
  visaoSchema,
} from '../tipos/dominio.ts'

/**
 * Contrato único do IPC (Seção 4.4). Cada canal tem esquema de entrada; o preload expõe
 * só funções geradas a partir daqui e o main valida tudo com estes esquemas.
 */

export type EstadoDaConta = {
  estado: EstadoConta
  motivo: string | null
  falhas: number
  vigiaPausado: boolean
  googleRecusou: boolean
  ultimoDado: number | null
  onlineDesde: number | null
  solta: boolean
}

export type Snapshot = {
  config: Config
  jogos: Jogo[]
  grupos: Grupo[]
  contas: Conta[]
  lives: Live[]
  textos: TextoVigiado[]
  estados: Record<string, EstadoDaConta>
  livesEstado: Record<string, EstadoLive>
  ativaId: string | null
  grupoAtualId: string | null
  silenciarTudo: boolean
  avisosPausados: boolean
  naoLidos: number
  cofre: { senhaMestra: boolean; aberto: boolean; comLogin: string[] }
  segredos: { discord: boolean; telegram: boolean }
  versao: { app: string; electron: string; dados: string }
  dialogoAberto: boolean
}

export type MetricasEvento = {
  porConta: Record<string, { ramMb: number; cpuPct: number }>
  total: { ramMb: number; cpuPct: number }
}

export type PainelDados = {
  serie24h: { em: number; ramMb: number; cpuPct: number }[]
  serie30d: { em: number; ramMb: number; cpuPct: number }[]
  contas: Record<
    string,
    { quedasHoje: number; recargasHoje: number; onlineDesde: number | null; ultimoDado: number | null }
  >
  ping: Record<
    string,
    { atual: number | null; media1h: number | null; serie24h: { em: number; ms: number | null }[] }
  >
  eventos: EventoConta[]
}

export const espacoSchema = z.object({
  contaId: idSchema,
  /** null = espaço fora da área visível (rolagem, aba escondida). */
  retangulo: z
    .object({
      x: z.number().int().min(-100000).max(100000),
      y: z.number().int().min(-100000).max(100000),
      largura: z.number().int().min(0).max(20000),
      altura: z.number().int().min(0).max(20000),
    })
    .nullable(),
  /** "miniatura" = só foto (faixa da visão Principal e cartões do Painel). */
  tipo: z.enum(['conta', 'miniatura']),
})
export type EspacoTela = z.infer<typeof espacoSchema>

export const acoesLote = [
  'recarregar',
  'recarregarSemCache',
  'ligar',
  'desligar',
  'silenciar',
  'ativarSom',
  'economiaLigar',
  'economiaDesligar',
  'manter',
  'economizar',
  'zoom',
  'preencher',
  'livesLigar',
  'livesDesligar',
  'limparCache',
  'fotos',
  'mover',
] as const
export type AcaoLote = (typeof acoesLote)[number]

const vazio = z.object({}).strict()
const comId = z.object({ id: idSchema }).strict()

export const canais = {
  'estado.obter': vazio,
  'config.alterar': z.object({ caminho: z.string().max(100), valor: z.unknown() }).strict(),
  'config.redefinir': vazio,

  'grupos.criar': z.object({ nome: z.string().min(1).max(60), cor: corSchema.optional() }).strict(),
  'grupos.editar': z
    .object({ id: idSchema, nome: z.string().min(1).max(60).optional(), cor: corSchema.optional() })
    .strict(),
  'grupos.apagar': comId,
  'grupos.ligar': z
    .object({ id: idSchema, ligado: z.boolean(), confirmado: z.boolean().optional() })
    .strict(),
  'grupos.trocar': z.object({ id: idSchema, confirmado: z.boolean().optional() }).strict(),
  'grupos.selecionar': comId,
  'grupos.layout': z
    .object({ id: idSchema, visao: visaoSchema.optional(), layout: layoutGrupoSchema.partial().optional() })
    .strict(),
  'grupos.reordenar': z.object({ ids: z.array(idSchema).max(200) }).strict(),
  'grupos.politica': z
    .object({ grupoId: idSchema, jogoId: idSchema, politica: politicaForaTelaSchema })
    .strict(),
  'grupos.menu': z.object({ id: idSchema, x: z.number().int(), y: z.number().int() }).strict(),
  'grupos.janela': comId,

  'contas.adicionar': z
    .object({
      grupoId: idSchema,
      jogoId: idSchema,
      url: z.url().max(2000),
      nome: z.string().max(60).optional(),
      cor: corSchema.optional(),
      icone: z.string().max(8).optional(),
      notas: z.string().max(2000).optional(),
      som: z.boolean().optional(),
      notificacoesDaPagina: z.boolean().optional(),
    })
    .strict(),
  'contas.editar': z
    .object({
      id: idSchema,
      nome: z.string().min(1).max(60).optional(),
      cor: corSchema.optional(),
      icone: z.string().max(8).optional(),
      url: z.url().max(2000).optional(),
      zoom: z.number().min(0.25).max(3).optional(),
      som: z.boolean().optional(),
      politicaForaTela: z.enum(['padrao_do_jogo', 'manter', 'economizar']).optional(),
      notificacoesDaPagina: z.boolean().optional(),
      notas: z.string().max(2000).optional(),
      jogoId: idSchema.optional(),
    })
    .strict(),
  'contas.apagar': z.object({ id: idSchema, apagarLogin: z.boolean() }).strict(),
  'contas.mover': z
    .object({ id: idSchema, grupoId: idSchema, posicao: z.number().int().min(0).max(1000) })
    .strict(),
  'contas.ativar': comId,
  'contas.duplicar': comId,
  'contas.soltar': comId,
  'contas.menu': z.object({ id: idSchema, x: z.number().int(), y: z.number().int() }).strict(),
  'contas.lote': z
    .object({
      ids: z.array(idSchema).min(1).max(500),
      acao: z.enum(acoesLote),
      zoom: z.number().min(0.25).max(3).optional(),
      grupoId: idSchema.optional(),
      confirmado: z.boolean().optional(),
    })
    .strict(),
  'contas.espacos': z.object({ espacos: z.array(espacoSchema).max(200) }).strict(),
  'contas.sugerirJogo': z.object({ url: z.string().max(2000) }).strict(),
  'contas.devtools': comId,

  'dialogo.estado': z.object({ aberto: z.boolean() }).strict(),

  'jogos.salvar': jogoSchema,
  'jogos.apagar': comId,

  'lives.adicionar': z
    .object({ contaId: idSchema, plataforma: plataformaLiveSchema, canal: z.string().min(1).max(60) })
    .strict(),
  'lives.remover': comId,
  'lives.ligar': z.object({ id: idSchema, ligada: z.boolean() }).strict(),
  'lives.mostrar': z.object({ id: idSchema, som: z.boolean() }).strict(),
  'lives.entrar': comId,

  'textos.salvar': z
    .object({
      id: idSchema.optional(),
      texto: z.string().min(1).max(200),
      escopo: escopoTextoSchema,
      alvoId: idSchema.nullable(),
      ativo: z.boolean(),
    })
    .strict(),
  'textos.apagar': comId,

  'avisos.listar': z.object({ limite: z.number().int().min(1).max(1000) }).strict(),
  'avisos.marcarLidos': vazio,
  'avisos.testar': z.object({ canal: z.enum(['discord', 'telegram', 'windows', 'som']) }).strict(),
  'avisos.segredo': z.object({ canal: z.enum(['discord', 'telegram']), valor: z.string().max(500) }).strict(),
  'avisos.somArquivo': vazio,

  'cofre.criarSenha': z.object({ senha: z.string().min(4).max(200) }).strict(),
  'cofre.removerSenha': z.object({ senha: z.string().max(200) }).strict(),
  'cofre.destrancar': z.object({ senha: z.string().max(200) }).strict(),
  'cofre.trancar': vazio,
  'cofre.salvar': z
    .object({
      contaId: idSchema,
      usuario: z.string().max(200),
      senha: z.string().max(500),
      seletores: z
        .object({ usuario: z.string().max(200), senha: z.string().max(200) })
        .nullable()
        .optional(),
    })
    .strict(),
  'cofre.obter': z.object({ contaId: idSchema }).strict(),
  'cofre.mostrarSenha': z.object({ contaId: idSchema }).strict(),
  'cofre.apagar': z.object({ contaId: idSchema }).strict(),
  'cofre.preencher': z.object({ ids: z.array(idSchema).min(1).max(500) }).strict(),
  'cofre.ensinar': z.object({ contaId: idSchema }).strict(),

  'painel.dados': vazio,
  'painel.aberto': z.object({ aberto: z.boolean() }).strict(),

  'backup.exportar': z
    .object({
      incluirCofre: z.boolean(),
      senhaBackup: z.string().max(200).optional(),
      incluirSessoes: z.boolean(),
    })
    .strict(),
  'backup.importar': z.object({ senhaBackup: z.string().max(200).optional() }).strict(),

  'app.verificarAtualizacao': vazio,
  'app.reiniciarAtualizar': vazio,
  'app.abrirPasta': z.object({ qual: z.enum(['logs', 'dados']) }).strict(),
  'app.limparCacheTodas': vazio,
  'app.sair': vazio,
  'app.silenciarTudo': z.object({ ligado: z.boolean() }).strict(),
  'app.telaCheia': vazio,
} as const

export type Canal = keyof typeof canais
export type Entrada<C extends Canal> = z.infer<(typeof canais)[C]>

export { canalIpc, type Evento, eventoIpc } from './nomes.ts'

export const nomesDosCanais = Object.keys(canais) as Canal[]

export type RespostaIpc<T = unknown> = { ok: true; valor: T } | { ok: false; erro: string }

import type { MetricasEvento, Snapshot } from '@shared/ipc/contrato.ts'
import type { Conta, Grupo } from '@shared/tipos/dominio.ts'
import { chamar, ouvir } from './api.ts'

export type Mensagem = { id: number; tipo: 'ok' | 'aviso' | 'erro'; texto: string }
export type DialogoAberto =
  | { qual: 'configuracoes'; secao?: string; busca?: string }
  | { qual: 'adicionarConta'; grupoId?: string }
  | { qual: 'editarConta' | 'apagarConta' | 'lives' | 'cofre'; id: string }
  | { qual: 'editarGrupo' | 'apagarGrupo'; id: string }
  | { qual: 'novoGrupo' }
  | { qual: 'paleta' }
  | { qual: 'avisos' }
  | { qual: 'divisao' }
  | { qual: 'limite'; texto: string; aoConfirmar: () => void }

const params = new URLSearchParams(location.search)

/** Estado da interface: espelho do que o main manda (o main é o dono da verdade). */
export const loja = $state({
  snap: null as Snapshot | null,
  fotos: {} as Record<string, string>,
  metricas: null as MetricasEvento | null,
  janela: params.get('janela') ?? 'principal',
  /** Janela de grupo: só mostra este grupo. */
  grupoFixo: params.get('grupo'),
  dialogos: [] as DialogoAberto[],
  mensagens: [] as Mensagem[],
  /** Contas escolhidas no Painel (Ctrl/Shift + clique). */
  selecao: [] as string[],
  focoContaId: null as string | null,
  lateralRecolhida: false,
  atualizacao: null as null | { tipo: string; pct?: number; versao?: string },
  senhaVisivel: {} as Record<string, string>,
})

let seqMsg = 0
export function mensagem(tipo: Mensagem['tipo'], texto: string): void {
  const id = ++seqMsg
  loja.mensagens.push({ id, tipo, texto })
  setTimeout(() => {
    loja.mensagens = loja.mensagens.filter((m) => m.id !== id)
  }, 5000)
}

export function grupoAtual(): Grupo | null {
  const s = loja.snap
  if (!s) return null
  const id = loja.grupoFixo ?? s.grupoAtualId
  return s.grupos.find((g) => g.id === id) ?? s.grupos[0] ?? null
}

export function contasDoGrupo(grupoId: string | undefined): Conta[] {
  if (!loja.snap || !grupoId) return []
  return loja.snap.contas.filter((c) => c.grupoId === grupoId).sort((a, b) => a.ordem - b.ordem)
}

export function abrirDialogo(d: DialogoAberto): void {
  loja.dialogos.push(d)
}

export function fecharDialogo(): void {
  loja.dialogos.pop()
}

/** RN-044: com algo por cima das contas, o main mostra fotos no lugar delas. */
let ultimoDialogo = false
$effect.root(() => {
  $effect(() => {
    const aberto = loja.dialogos.length > 0
    if (aberto !== ultimoDialogo) {
      ultimoDialogo = aberto
      void chamar('dialogo.estado', { aberto }).catch(() => {})
    }
  })
})

export async function iniciarLoja(): Promise<void> {
  ouvir('estado', (s) => {
    loja.snap = s as Snapshot
  })
  ouvir('conta.foto', (d) => {
    const { contaId, dados } = d as { contaId: string; dados: Uint8Array }
    const url = URL.createObjectURL(new Blob([dados as BlobPart], { type: 'image/jpeg' }))
    const velha = loja.fotos[contaId]
    loja.fotos[contaId] = url
    if (velha) setTimeout(() => URL.revokeObjectURL(velha), 1000)
  })
  ouvir('conta.metricas', (m) => {
    loja.metricas = m as MetricasEvento
  })
  ouvir('atualizacao.estado', (e) => {
    loja.atualizacao = e as typeof loja.atualizacao
  })
  ouvir('mensagem', (m) => {
    const x = m as { tipo: string; texto?: string; contaId?: string }
    if (x.tipo === 'esconderSenha' && x.contaId) delete loja.senhaVisivel[x.contaId]
    else if (x.texto) mensagem(x.tipo === 'ok' ? 'ok' : 'aviso', x.texto)
  })
  loja.snap = await chamar<'estado.obter', Snapshot>('estado.obter')
}

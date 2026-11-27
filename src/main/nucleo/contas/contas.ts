import { CORES_CONTA } from '@shared/dados/padroes-config.ts'
import { type Conta, contaSchema, type Grupo, type Jogo } from '@shared/tipos/dominio.ts'
import { falha, ok, type Resultado } from '@shared/tipos/resultado.ts'
import { dominioDe, dominioPertence } from '@shared/util/texto.ts'

/** RN-013: o domínio da URL sugere o jogo do catálogo. */
export function sugerirJogo(url: string, jogos: readonly Jogo[]): Jogo | null {
  const host = dominioDe(url)
  if (!host) return null
  return jogos.find((j) => j.dominios.some((d) => dominioPertence(host, d))) ?? null
}

/** RN-018: recarregar mantém a URL atual se for do domínio do jogo; senão volta à cadastrada. */
export function urlDeRecarga(urlAtual: string, conta: Conta, jogo: Jogo | undefined): string {
  const host = dominioDe(urlAtual)
  const dominios = [...(jogo?.dominios ?? []), dominioDe(conta.url) ?? '']
  if (host && dominios.some((d) => d && dominioPertence(host, d))) return urlAtual
  return conta.url
}

export type NovaConta = {
  grupoId: string
  jogoId: string
  url: string
  nome?: string | undefined
  cor?: string | undefined
  icone?: string | undefined
  notas?: string | undefined
  som?: boolean | undefined
  notificacoesDaPagina?: boolean | undefined
}

/** RN-012 e RN-014: toda conta pertence a um grupo e a um jogo e tem todos os campos. */
export function criarConta(
  dados: NovaConta,
  ctx: {
    id: string
    agora: number
    grupos: readonly Grupo[]
    jogos: readonly Jogo[]
    contas: readonly Conta[]
  },
): Resultado<Conta, 'grupo' | 'jogo' | 'invalida'> {
  if (!ctx.grupos.some((g) => g.id === dados.grupoId)) return falha('grupo')
  const jogo = ctx.jogos.find((j) => j.id === dados.jogoId)
  if (!jogo) return falha('jogo')
  const doGrupo = ctx.contas.filter((c) => c.grupoId === dados.grupoId)
  const n = ctx.contas.length
  const candidata = {
    id: ctx.id,
    grupoId: dados.grupoId,
    jogoId: dados.jogoId,
    nome: dados.nome?.trim() || `${jogo.nome} ${doGrupo.filter((c) => c.jogoId === jogo.id).length + 1}`,
    cor: dados.cor ?? CORES_CONTA[n % CORES_CONTA.length],
    icone: dados.icone ?? jogo.icone,
    ordem: doGrupo.length,
    url: dados.url,
    zoom: 1,
    som: dados.som ?? true,
    politicaForaTela: 'padrao_do_jogo' as const,
    notificacoesDaPagina: dados.notificacoesDaPagina ?? false,
    notas: dados.notas ?? '',
    criadaEm: ctx.agora,
  }
  const r = contaSchema.safeParse(candidata)
  if (!r.success) return falha('invalida')
  if (!/^https?:$/.test(new URL(r.data.url).protocol)) return falha('invalida')
  return ok(r.data)
}

/** RN-016: mesma configuração, sessão nova (id novo = partição nova e vazia). */
export function duplicarConta(
  c: Conta,
  novoId: string,
  agora: number,
  nomeCopia: string,
  ordem: number,
): Conta {
  return { ...c, id: novoId, nome: nomeCopia.slice(0, 60), criadaEm: agora, ordem }
}

/** RN-036: move uma conta para um grupo/posição e renumera as ordens. */
export function moverConta(contas: readonly Conta[], id: string, grupoId: string, posicao: number): Conta[] {
  const movida = contas.find((c) => c.id === id)
  if (!movida) return [...contas]
  const destino = contas.filter((c) => c.grupoId === grupoId && c.id !== id).sort((a, b) => a.ordem - b.ordem)
  const pos = Math.max(0, Math.min(posicao, destino.length))
  destino.splice(pos, 0, { ...movida, grupoId })
  const novasOrdens = new Map(destino.map((c, i) => [c.id, { ...c, ordem: i }]))
  const origem = contas
    .filter((c) => c.grupoId === movida.grupoId && c.id !== id && movida.grupoId !== grupoId)
    .sort((a, b) => a.ordem - b.ordem)
  for (const [i, c] of origem.entries()) novasOrdens.set(c.id, { ...c, ordem: i })
  return contas.map((c) => novasOrdens.get(c.id) ?? c)
}

export function contasDoGrupo(contas: readonly Conta[], grupoId: string): Conta[] {
  return contas.filter((c) => c.grupoId === grupoId).sort((a, b) => a.ordem - b.ordem)
}

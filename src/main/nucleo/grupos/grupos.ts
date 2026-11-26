import type { Config } from '@shared/config/esquema.ts'
import type { Conta, Grupo, Jogo } from '@shared/tipos/dominio.ts'

/** RN-031: trocar para um grupo desliga todos os outros e liga este. */
export function planoDeTroca(
  grupos: readonly Grupo[],
  alvoId: string,
): { desligar: string[]; ligar: string[] } {
  return {
    desligar: grupos.filter((g) => g.id !== alvoId && g.ligado).map((g) => g.id),
    ligar: grupos.some((g) => g.id === alvoId) ? [alvoId] : [],
  }
}

/** RN-033: quais grupos ligar ao abrir o app. */
export function gruposAoAbrir(config: Config, grupos: readonly Grupo[]): string[] {
  switch (config.geral.restaurarAoAbrir) {
    case 'todos':
      return grupos.map((g) => g.id)
    case 'nenhum':
      return []
    case 'ligados':
      return grupos.filter((g) => g.ligado).map((g) => g.id)
  }
}

export type Excesso = { jogoId: string; jogoNome: string; limite: number; total: number }

/**
 * RN-034: se ligar `novas` contas fizer algum jogo passar do limite declarado, devolve o excesso.
 * O app avisa e pede confirmação; nunca impede.
 */
export function excessosDeLimite(
  jogos: readonly Jogo[],
  contas: readonly Conta[],
  ligadas: ReadonlySet<string>,
  novas: readonly string[],
): Excesso[] {
  const final = new Set([...ligadas, ...novas])
  const out: Excesso[] = []
  for (const j of jogos) {
    if (j.limiteContas === null) continue
    const total = contas.filter((c) => c.jogoId === j.id && final.has(c.id)).length
    const antes = contas.filter((c) => c.jogoId === j.id && ligadas.has(c.id)).length
    if (total > j.limiteContas && total > antes)
      out.push({ jogoId: j.id, jogoNome: j.nome, limite: j.limiteContas, total })
  }
  return out
}

/** "Perto do limite" (RN-111): chegou a 80% ou mais do limite declarado. */
export function pertoDoLimite(jogo: Jogo, ligadasDoJogo: number): boolean {
  return jogo.limiteContas !== null && ligadasDoJogo >= Math.ceil(jogo.limiteContas * 0.8)
}

export function reordenarGrupos(grupos: readonly Grupo[], ids: readonly string[]): Grupo[] {
  const pos = new Map(ids.map((id, i) => [id, i]))
  return [...grupos]
    .sort((a, b) => (pos.get(a.id) ?? a.ordem + ids.length) - (pos.get(b.id) ?? b.ordem + ids.length))
    .map((g, i) => ({ ...g, ordem: i }))
}

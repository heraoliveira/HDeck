import textos from './pt-BR.json' with { type: 'json' }

export type ChaveTexto = keyof typeof textos
const tabela: Record<string, string> = textos

/** RN-006: toda frase da interface vem deste arquivo, por chave. */
export function t(chave: ChaveTexto, vars?: Record<string, string | number>): string {
  const base = tabela[chave] ?? chave
  if (!vars) return base
  return base.replace(/\{(\w+)\}/g, (_, nome: string) => (nome in vars ? String(vars[nome]) : `{${nome}}`))
}

/** Para chaves montadas em tempo de execução (ex.: `estado.${estado}`). */
export function tDinamico(chave: string, vars?: Record<string, string | number>): string {
  return t(chave as ChaveTexto, vars)
}

export function existeTexto(chave: string): boolean {
  return chave in tabela
}

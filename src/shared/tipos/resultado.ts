/** Erros esperados viram valores; exceções ficam para o inesperado (Seção 4.1). */
export type Resultado<T, E = string> = { ok: true; valor: T } | { ok: false; erro: E }

export const ok = <T>(valor: T): Resultado<T, never> => ({ ok: true, valor })
export const falha = <E>(erro: E): Resultado<never, E> => ({ ok: false, erro })

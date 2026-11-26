import type { Canal, Entrada, Evento, RespostaIpc } from '@shared/ipc/contrato.ts'

type Ponte = Record<string, Record<string, (dados?: unknown) => Promise<RespostaIpc>>> & {
  ouvir(evento: Evento, cb: (dados: unknown) => void): () => void
}

declare global {
  interface Window {
    hdeck: Ponte
  }
}

/** Chama um canal do contrato; devolve o valor ou lança com o código do erro. */
export async function chamar<C extends Canal, R = unknown>(canal: C, dados?: Entrada<C>): Promise<R> {
  const [grupo, nome] = canal.split('.') as [string, string]
  const r = await window.hdeck[grupo]![nome]!(dados ?? {})
  if (!r.ok) throw new Error(r.erro)
  return r.valor as R
}

/** Igual a `chamar`, mas sem lançar (para ações de botão). */
export async function tentar<C extends Canal, R = unknown>(canal: C, dados?: Entrada<C>): Promise<R | null> {
  try {
    return await chamar<C, R>(canal, dados)
  } catch {
    return null
  }
}

export function ouvir(evento: Evento, cb: (dados: unknown) => void): () => void {
  return window.hdeck.ouvir(evento, cb)
}

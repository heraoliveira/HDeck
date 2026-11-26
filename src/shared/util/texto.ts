/** RN-121: comparação sem maiúsculas e sem acentos. */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function dominioDe(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** `sub.exemplo.com` pertence a `exemplo.com`. */
export function dominioPertence(host: string, dominio: string): boolean {
  const h = host.toLowerCase()
  const d = dominio.toLowerCase().replace(/^\*\./, '')
  return h === d || h.endsWith(`.${d}`)
}

export function formatarDuracao(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h} h ${m} min`
  if (m > 0) return `${m} min`
  return `${s} s`
}

/** Tira parâmetros de uma URL antes de ir para o log (Seção 3, logs). */
export function urlSemParametros(url: string): string {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}${u.pathname}`
  } catch {
    return '[url inválida]'
  }
}

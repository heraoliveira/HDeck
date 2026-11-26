import { PADROES } from '@shared/dados/padroes-config.ts'

/**
 * RN-061: espera antes da tentativa `n` (0 = primeira): 45 s (configurável) → 2 min → 5 min → 15 min.
 * Depois de 4 falhas seguidas devolve null: para e avisa.
 */
export function esperaDaTentativa(n: number, primeiraSeg: number): number | null {
  if (n < 0) return primeiraSeg * 1000
  if (n >= PADROES.maxFalhasSeguidas) return null
  if (n === 0) return primeiraSeg * 1000
  return PADROES.backoffSeg[n - 1]! * 1000
}

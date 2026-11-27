import { PADROES } from '@shared/dados/padroes-config.ts'
import type { Conta, TextoVigiado } from '@shared/tipos/dominio.ts'
import { normalizar } from '@shared/util/texto.ts'
import { z } from 'zod'

/** RN-121: textos que valem para esta conta (todas, o grupo dela ou ela). */
export function textosDaConta(textos: readonly TextoVigiado[], conta: Conta): TextoVigiado[] {
  return textos.filter((t) => {
    if (!t.ativo) return false
    if (t.escopo === 'todas') return true
    if (t.escopo === 'grupo') return t.alvoId === conta.grupoId
    return t.alvoId === conta.id
  })
}

/** O que a página devolve é dado não confiável (Seção 11): valida e limita. */
export const encontradosSchema = z
  .array(z.string().max(PADROES.maxTamanhoTexto))
  .max(PADROES.maxTextosEncontrados)

export function validarEncontrados(bruto: unknown): string[] {
  const r = encontradosSchema.safeParse(bruto)
  return r.success ? r.data : []
}

/**
 * Procura os textos (normalizados) num conjunto de trechos de texto da página.
 * Mesma regra que o script do mundo isolado usa; fica aqui para ser testada.
 */
export function procurarEmTrechos(trechos: readonly string[], procurados: readonly string[]): string[] {
  const alvo = procurados.map(normalizar).filter(Boolean)
  const achados = new Set<string>()
  for (const trecho of trechos) {
    const n = normalizar(trecho)
    for (const p of alvo) if (n.includes(p)) achados.add(p)
    if (achados.size === alvo.length) break
  }
  return [...achados]
}

/**
 * RN-123: o mesmo texto na mesma conta avisa uma vez; só avisa de novo depois de sumir e voltar.
 */
export class DetectorTextos {
  private vistos = new Map<string, Set<string>>()

  /** Recebe o que foi encontrado agora; devolve só os textos que acabaram de aparecer. */
  atualizar(contaId: string, encontrados: readonly string[]): string[] {
    const antes = this.vistos.get(contaId) ?? new Set<string>()
    const agora = new Set(encontrados.map(normalizar))
    const novos = [...agora].filter((t) => !antes.has(t))
    this.vistos.set(contaId, agora)
    return novos
  }

  esquecer(contaId: string): void {
    this.vistos.delete(contaId)
  }

  ativos(contaId: string): string[] {
    return [...(this.vistos.get(contaId) ?? [])]
  }
}

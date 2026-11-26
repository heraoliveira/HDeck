import { PADROES } from '@shared/dados/padroes-config.ts'
import type { EventoConta } from '@shared/tipos/dominio.ts'
import type { LinhaMetrica, Metrica } from '../portas.ts'

/** Início do dia local de `agora`. */
export function inicioDoDia(agora: number): number {
  const d = new Date(agora)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export type ResumoConta = {
  quedasHoje: number
  recargasHoje: number
  onlineDesde: number | null
  ultimoDado: number | null
  ramMb: number
  cpuPct: number
}

/** RN-045: números de cada conta no Painel. */
export function resumirConta(
  eventos: readonly EventoConta[],
  contaId: string,
  agora: number,
  extra: { onlineDesde: number | null; ultimoDado: number | null; ramMb: number; cpuPct: number },
): ResumoConta {
  const hoje = inicioDoDia(agora)
  const daConta = eventos.filter((e) => e.contaId === contaId && e.em >= hoje)
  return {
    quedasHoje: daConta.filter((e) => e.tipo === 'queda').length,
    recargasHoje: daConta.filter((e) => e.tipo === 'recarga').length,
    ...extra,
  }
}

/** Soma as métricas dos processos de cada conta (página + lives) pelo PID. */
export function metricasPorConta(
  metricas: readonly Metrica[],
  pidParaConta: ReadonlyMap<number, string>,
): Map<string, { ramMb: number; cpuPct: number }> {
  const out = new Map<string, { ramMb: number; cpuPct: number }>()
  for (const m of metricas) {
    const conta = pidParaConta.get(m.pid)
    if (!conta) continue
    const atual = out.get(conta) ?? { ramMb: 0, cpuPct: 0 }
    out.set(conta, { ramMb: atual.ramMb + m.ramMb, cpuPct: atual.cpuPct + m.cpuPct })
  }
  return out
}

export function totais(metricas: readonly Metrica[]): { ramMb: number; cpuPct: number } {
  return metricas.reduce((s, m) => ({ ramMb: s.ramMb + m.ramMb, cpuPct: s.cpuPct + m.cpuPct }), {
    ramMb: 0,
    cpuPct: 0,
  })
}

/**
 * RN-163: métricas por minuto até 48 h; mais velhas viram média por hora; mais de 30 dias saem.
 * Devolve o conjunto final de linhas (o armazém troca as antigas por estas).
 */
export function aplicarRetencaoMetricas(linhas: readonly LinhaMetrica[], agora: number): LinhaMetrica[] {
  const limiteApagar = agora - PADROES.retencaoDias * 86_400_000
  const limiteAgrupar = agora - PADROES.agruparMetricasAposH * 3_600_000
  const recentes: LinhaMetrica[] = []
  const porHora = new Map<string, LinhaMetrica[]>()
  for (const l of linhas) {
    if (l.minuto < limiteApagar) continue
    if (l.minuto >= limiteAgrupar) {
      recentes.push(l)
      continue
    }
    const hora = Math.floor(l.minuto / 3_600_000) * 3_600_000
    const chave = `${l.contaId}|${hora}`
    const lista = porHora.get(chave) ?? []
    lista.push(l)
    porHora.set(chave, lista)
  }
  const agrupadas = [...porHora.entries()].map(([chave, lista]) => {
    const [contaId, hora] = chave.split('|') as [string, string]
    return {
      contaId,
      minuto: Number(hora),
      ramMb: Math.round(lista.reduce((s, l) => s + l.ramMb, 0) / lista.length),
      cpuPct: Math.round((lista.reduce((s, l) => s + l.cpuPct, 0) / lista.length) * 10) / 10,
      estado: lista.at(-1)!.estado,
    }
  })
  return [...agrupadas, ...recentes].sort((a, b) => a.minuto - b.minuto)
}

export function eventosParaApagar(eventos: readonly EventoConta[], agora: number): EventoConta[] {
  const lim = agora - PADROES.retencaoDias * 86_400_000
  return eventos.filter((e) => e.em < lim)
}

/** Série total (todas as contas) por instante, para o gráfico de 24 h e de 30 dias. */
export function serieTotal(
  linhas: readonly LinhaMetrica[],
  desde: number,
): { em: number; ramMb: number; cpuPct: number }[] {
  const por = new Map<number, { ramMb: number; cpuPct: number }>()
  for (const l of linhas) {
    if (l.minuto < desde) continue
    const a = por.get(l.minuto) ?? { ramMb: 0, cpuPct: 0 }
    por.set(l.minuto, { ramMb: a.ramMb + l.ramMb, cpuPct: a.cpuPct + l.cpuPct })
  }
  return [...por.entries()].sort((a, b) => a[0] - b[0]).map(([em, v]) => ({ em, ...v }))
}

/** RN-070: o app pode se reabrir sozinho? No máximo 3 vezes em 10 min. */
export function podeReabrir(reaberturas: readonly number[], agora: number): boolean {
  const janela = PADROES.janelaReaberturasMin * 60_000
  return reaberturas.filter((t) => agora - t < janela).length < PADROES.maxReaberturas
}

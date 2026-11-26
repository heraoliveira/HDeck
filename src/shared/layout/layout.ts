import type { Divisao, RetanguloNorm } from '../tipos/dominio.ts'

/**
 * Cálculo das divisões de tela (Seção 7.2, RN-041, RN-042). Puro e usado pela interface
 * (para desenhar as molduras) e pelos testes de propriedade.
 * Fica em `shared` porque a interface e o main precisam da mesma conta.
 */

export type Area = { largura: number; altura: number }
export type Ret = { x: number; y: number; largura: number; altura: number }

const grade = (colunas: number, linhas: number) => ({ colunas, linhas })

/** Grade automática pela quantidade de contas: 1, 2, 2×2, 3×2, 3×3, 4×3, 4×4. */
export function gradeAutomatica(n: number): { colunas: number; linhas: number } {
  if (n <= 1) return grade(1, 1)
  if (n === 2) return grade(2, 1)
  if (n <= 4) return grade(2, 2)
  if (n <= 6) return grade(3, 2)
  if (n <= 9) return grade(3, 3)
  if (n <= 12) return grade(4, 3)
  return grade(4, 4)
}

/** Corta [0, total) em `partes` faixas inteiras e contíguas. */
function cortes(total: number, partes: number): number[] {
  const out: number[] = []
  for (let i = 0; i <= partes; i++) out.push(Math.round((i * total) / partes))
  return out
}

function celulasDeGrade(area: Area, colunas: number, linhas: number): Ret[] {
  const xs = cortes(area.largura, colunas)
  const ys = cortes(area.altura, linhas)
  const out: Ret[] = []
  for (let l = 0; l < linhas; l++)
    for (let c = 0; c < colunas; c++)
      out.push({ x: xs[c]!, y: ys[l]!, largura: xs[c + 1]! - xs[c]!, altura: ys[l + 1]! - ys[l]! })
  return out
}

function grandeMaisColuna(area: Area, pequenas: number): Ret[] {
  const corte = Math.round((area.largura * 2) / 3)
  const ys = cortes(area.altura, pequenas)
  const out: Ret[] = [{ x: 0, y: 0, largura: corte, altura: area.altura }]
  for (let i = 0; i < pequenas; i++)
    out.push({ x: corte, y: ys[i]!, largura: area.largura - corte, altura: ys[i + 1]! - ys[i]! })
  return out
}

/** Converte a divisão personalizada; descarta espaços que se sobrepõem a outro já aceito (RN-042). */
export function espacosPersonalizados(area: Area, rets: readonly RetanguloNorm[]): Ret[] {
  const aceitos: Ret[] = []
  for (const r of rets) {
    const x0 = Math.round(Math.min(Math.max(r.x, 0), 1) * area.largura)
    const y0 = Math.round(Math.min(Math.max(r.y, 0), 1) * area.altura)
    const x1 = Math.round(Math.min(r.x + r.l, 1) * area.largura)
    const y1 = Math.round(Math.min(r.y + r.a, 1) * area.altura)
    const ret = { x: x0, y: y0, largura: x1 - x0, altura: y1 - y0 }
    if (ret.largura <= 0 || ret.altura <= 0) continue
    if (aceitos.some((a) => sobrepoe(a, ret))) continue
    aceitos.push(ret)
  }
  return aceitos.length > 0 ? aceitos : [{ x: 0, y: 0, largura: area.largura, altura: area.altura }]
}

export function quantidadeDeEspacos(
  divisao: Divisao,
  contas: number,
  personalizada: readonly RetanguloNorm[] = [],
): number {
  switch (divisao) {
    case 'auto': {
      const g = gradeAutomatica(contas)
      return g.colunas * g.linhas
    }
    case '1':
      return 1
    case '2h':
    case '2v':
      return 2
    case '1+2':
      return 3
    case '1+3':
    case '2x2':
      return 4
    case '3x2':
      return 6
    case '3x3':
      return 9
    case '4x4':
      return 16
    case 'personalizada':
      return Math.max(1, personalizada.length)
  }
}

/** Espaços em pixels, relativos ao canto da área. */
export function calcularEspacos(
  divisao: Divisao,
  area: Area,
  opcoes: { contas: number; personalizada?: readonly RetanguloNorm[]; proporcao169?: boolean } = {
    contas: 1,
  },
): Ret[] {
  const a = { largura: Math.max(0, Math.floor(area.largura)), altura: Math.max(0, Math.floor(area.altura)) }
  let rets: Ret[]
  switch (divisao) {
    case 'auto': {
      const g = gradeAutomatica(opcoes.contas)
      rets = celulasDeGrade(a, g.colunas, g.linhas)
      break
    }
    case '1':
      rets = celulasDeGrade(a, 1, 1)
      break
    case '2h':
      rets = celulasDeGrade(a, 2, 1)
      break
    case '2v':
      rets = celulasDeGrade(a, 1, 2)
      break
    case '1+2':
      rets = grandeMaisColuna(a, 2)
      break
    case '1+3':
      rets = grandeMaisColuna(a, 3)
      break
    case '2x2':
      rets = celulasDeGrade(a, 2, 2)
      break
    case '3x2':
      rets = celulasDeGrade(a, 3, 2)
      break
    case '3x3':
      rets = celulasDeGrade(a, 3, 3)
      break
    case '4x4':
      rets = celulasDeGrade(a, 4, 4)
      break
    case 'personalizada':
      rets = espacosPersonalizados(a, opcoes.personalizada ?? [])
      break
  }
  return opcoes.proporcao169 ? rets.map(travar169) : rets
}

/** Encaixa um 16:9 centralizado dentro do espaço. */
export function travar169(r: Ret): Ret {
  const alvo = 16 / 9
  if (r.altura === 0 || r.largura === 0) return r
  if (r.largura / r.altura > alvo) {
    const l = Math.floor(r.altura * alvo)
    return { x: r.x + Math.floor((r.largura - l) / 2), y: r.y, largura: l, altura: r.altura }
  }
  const h = Math.floor(r.largura / alvo)
  return { x: r.x, y: r.y + Math.floor((r.altura - h) / 2), largura: r.largura, altura: h }
}

/** Visão Principal + miniaturas: uma grande e uma faixa de fotos (direita ou embaixo). */
export function principalComMiniaturas(
  area: Area,
  miniaturas: number,
  faixa: 'direita' | 'embaixo',
): { principal: Ret; miniaturas: Ret[] } {
  const a = { largura: Math.floor(area.largura), altura: Math.floor(area.altura) }
  if (miniaturas <= 0) return { principal: { x: 0, y: 0, ...a }, miniaturas: [] }
  if (faixa === 'direita') {
    const lf = Math.min(Math.round(a.largura * 0.22), 320)
    const ys = cortes(a.altura, Math.max(miniaturas, 4))
    return {
      principal: { x: 0, y: 0, largura: a.largura - lf, altura: a.altura },
      miniaturas: Array.from({ length: miniaturas }, (_, i) => ({
        x: a.largura - lf,
        y: ys[i]!,
        largura: lf,
        altura: ys[i + 1]! - ys[i]!,
      })),
    }
  }
  const af = Math.min(Math.round(a.altura * 0.22), 200)
  const xs = cortes(a.largura, Math.max(miniaturas, 4))
  return {
    principal: { x: 0, y: 0, largura: a.largura, altura: a.altura - af },
    miniaturas: Array.from({ length: miniaturas }, (_, i) => ({
      x: xs[i]!,
      y: a.altura - af,
      largura: xs[i + 1]! - xs[i]!,
      altura: af,
    })),
  }
}

export function sobrepoe(a: Ret, b: Ret): boolean {
  return a.x < b.x + b.largura && b.x < a.x + a.largura && a.y < b.y + b.altura && b.y < a.y + a.altura
}

/** RN-041: cada espaço mostra a conta escolhida ou, em "Automático", a próxima da ordem do grupo. */
export function contasNosEspacos(
  espacos: number,
  escolhidas: readonly (string | null)[],
  ordemDoGrupo: readonly string[],
): (string | null)[] {
  const fixas = new Set(escolhidas.filter((x): x is string => x !== null && ordemDoGrupo.includes(x)))
  const livres = ordemDoGrupo.filter((id) => !fixas.has(id))
  const out: (string | null)[] = []
  const usadas = new Set<string>()
  for (let i = 0; i < espacos; i++) {
    const e = escolhidas[i] ?? null
    if (e !== null && fixas.has(e) && !usadas.has(e)) {
      out.push(e)
      usadas.add(e)
    } else {
      const prox = livres.shift() ?? null
      out.push(prox)
      if (prox) usadas.add(prox)
    }
  }
  return out
}

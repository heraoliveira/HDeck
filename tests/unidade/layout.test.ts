import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  calcularEspacos,
  contasNosEspacos,
  espacosPersonalizados,
  gradeAutomatica,
  principalComMiniaturas,
  quantidadeDeEspacos,
  sobrepoe,
  travar169,
} from '../../src/shared/layout/layout.ts'
import { divisaoSchema } from '../../src/shared/tipos/dominio.ts'

const divisoes = divisaoSchema.options

describe('layout das divisões', () => {
  it('RN-041 todas as divisões existem com o número certo de espaços', () => {
    const area = { largura: 1200, altura: 800 }
    const esperado: Record<string, number> = {
      '1': 1,
      '2h': 2,
      '2v': 2,
      '1+2': 3,
      '1+3': 4,
      '2x2': 4,
      '3x2': 6,
      '3x3': 9,
      '4x4': 16,
    }
    for (const [d, n] of Object.entries(esperado)) {
      expect(calcularEspacos(d as never, area, { contas: 1 })).toHaveLength(n)
      expect(quantidadeDeEspacos(d as never, 1)).toBe(n)
    }
    expect(quantidadeDeEspacos('personalizada', 0, [])).toBe(1)
    expect(quantidadeDeEspacos('auto', 5)).toBe(6)
  })

  it('RN-041 grade automática: 1, 2, 2×2, 3×2, 3×3, 4×3, 4×4', () => {
    expect([1, 2, 3, 5, 7, 10, 13, 40].map((n) => gradeAutomatica(n))).toEqual([
      { colunas: 1, linhas: 1 },
      { colunas: 2, linhas: 1 },
      { colunas: 2, linhas: 2 },
      { colunas: 3, linhas: 2 },
      { colunas: 3, linhas: 3 },
      { colunas: 4, linhas: 3 },
      { colunas: 4, linhas: 4 },
      { colunas: 4, linhas: 4 },
    ])
  })

  it('RN-041 personalizada converte retângulos e descarta sobreposições', () => {
    const r = espacosPersonalizados({ largura: 1000, altura: 500 }, [
      { x: 0, y: 0, l: 0.5, a: 1 },
      { x: 0.25, y: 0, l: 0.5, a: 1 },
      { x: 0.5, y: 0, l: 0.5, a: 0.5 },
    ])
    expect(r).toEqual([
      { x: 0, y: 0, largura: 500, altura: 500 },
      { x: 500, y: 0, largura: 500, altura: 250 },
    ])
    expect(espacosPersonalizados({ largura: 10, altura: 10 }, [])).toHaveLength(1)
  })

  it('RN-041 cada espaço mostra a conta escolhida ou a próxima do grupo', () => {
    expect(contasNosEspacos(4, ['c', null, 'zz', 'c'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b', null])
    expect(contasNosEspacos(2, [], ['a'])).toEqual(['a', null])
  })

  it('RN-040 principal + miniaturas à direita e embaixo; 16:9 travado', () => {
    const d = principalComMiniaturas({ largura: 1000, altura: 600 }, 3, 'direita')
    expect(d.miniaturas).toHaveLength(3)
    expect(d.principal.largura + d.miniaturas[0]!.largura).toBe(1000)
    const e = principalComMiniaturas({ largura: 1000, altura: 600 }, 2, 'embaixo')
    expect(e.principal.altura + e.miniaturas[0]!.altura).toBe(600)
    expect(principalComMiniaturas({ largura: 10, altura: 10 }, 0, 'direita').miniaturas).toEqual([])
    const t = travar169({ x: 0, y: 0, largura: 1000, altura: 1000 })
    expect(t.largura / t.altura).toBeCloseTo(16 / 9, 1)
    const t2 = travar169({ x: 0, y: 0, largura: 2000, altura: 500 })
    expect(t2.altura).toBe(500)
    expect(travar169({ x: 0, y: 0, largura: 0, altura: 5 })).toEqual({ x: 0, y: 0, largura: 0, altura: 5 })
  })

  const rnArb = fc.record({
    x: fc.double({ min: 0, max: 1, noNaN: true }),
    y: fc.double({ min: 0, max: 1, noNaN: true }),
    l: fc.double({ min: 0.02, max: 1, noNaN: true }),
    a: fc.double({ min: 0.02, max: 1, noNaN: true }),
  })

  it('RN-042 propriedade: espaços nunca se sobrepõem e sempre cabem, em qualquer tamanho', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...divisoes),
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 0, max: 3000 }),
        fc.integer({ min: 0, max: 30 }),
        fc.boolean(),
        fc.array(rnArb, { maxLength: 8 }),
        (d, largura, altura, contas, p169, pers) => {
          const rets = calcularEspacos(
            d,
            { largura, altura },
            { contas, personalizada: pers, proporcao169: p169 },
          )
          for (const r of rets) {
            expect(r.x).toBeGreaterThanOrEqual(0)
            expect(r.y).toBeGreaterThanOrEqual(0)
            expect(r.x + r.largura).toBeLessThanOrEqual(largura)
            expect(r.y + r.altura).toBeLessThanOrEqual(altura)
          }
          for (let i = 0; i < rets.length; i++)
            for (let j = i + 1; j < rets.length; j++) expect(sobrepoe(rets[i]!, rets[j]!)).toBe(false)
        },
      ),
    )
  })

  it('RN-042 propriedade: a faixa de miniaturas cabe na área sem cobrir a principal', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 50, max: 4000 }),
        fc.integer({ min: 50, max: 3000 }),
        fc.integer({ min: 0, max: 12 }),
        fc.constantFrom('direita' as const, 'embaixo' as const),
        (largura, altura, n, faixa) => {
          const r = principalComMiniaturas({ largura, altura }, n, faixa)
          for (const m of r.miniaturas) {
            expect(sobrepoe(m, r.principal)).toBe(false)
            expect(m.x + m.largura).toBeLessThanOrEqual(largura)
            expect(m.y + m.altura).toBeLessThanOrEqual(altura)
          }
        },
      ),
    )
  })
})

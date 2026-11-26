import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { FilaEscalonada } from '../../src/main/nucleo/contas/fila.ts'
import {
  excessosDeLimite,
  gruposAoAbrir,
  pertoDoLimite,
  planoDeTroca,
  reordenarGrupos,
} from '../../src/main/nucleo/grupos/grupos.ts'
import { configPadrao } from '../../src/shared/config/esquema.ts'
import { layoutGrupoSchema } from '../../src/shared/tipos/dominio.ts'
import { jogoFalso } from '../falsos/montar-motor.ts'
import { RelogioFalso } from '../falsos/relogio.ts'

const g = (id: string, ligado: boolean, ordem = 0) => ({
  id,
  nome: id,
  cor: '#7c6cf0',
  ordem,
  ligado,
  visao: 'grade' as const,
  layout: layoutGrupoSchema.parse({}),
})

describe('fila escalonada', () => {
  it('RN-032 liga uma conta a cada N s, a primeira na hora', () => {
    const r = new RelogioFalso()
    const feitas: [string, number][] = []
    const f = new FilaEscalonada(r, 3000)
    const t0 = r.agora()
    for (const id of ['a', 'b', 'c'])
      f.adicionar({ chave: id, executar: () => feitas.push([id, r.agora() - t0]) })
    r.avancar(0)
    expect(feitas).toEqual([['a', 0]])
    r.avancar(3000)
    r.avancar(3000)
    expect(feitas).toEqual([
      ['a', 0],
      ['b', 3000],
      ['c', 6000],
    ])
  })

  it('RN-181 mostra o progresso do lote e não repete a mesma chave', () => {
    const r = new RelogioFalso()
    const prog: string[] = []
    const f = new FilaEscalonada(r, 1000, (p) => prog.push(`${p.feitas}/${p.total}`))
    f.adicionar({ chave: 'a', executar: () => {}, lote: 'L' })
    f.adicionar({ chave: 'a', executar: () => {}, lote: 'L' })
    f.adicionar({ chave: 'b', executar: () => {}, lote: 'L' })
    expect(f.tamanho()).toBe(2)
    r.avancar(5000)
    expect(prog).toEqual(['1/2', '2/2'])
  })

  it('RN-057 adiar põe no fim da fila; remover tira e conclui o lote', () => {
    const r = new RelogioFalso()
    const f = new FilaEscalonada(r, 1000)
    for (const id of ['a', 'b', 'c']) f.adicionar({ chave: id, executar: () => {}, lote: 'x' })
    expect(f.adiar('a')).toBe(true)
    expect(f.adiar('z')).toBe(false)
    expect(f.pendentes()).toEqual(['b', 'c', 'a'])
    f.remover((k) => k !== 'a')
    expect(f.pendentes()).toEqual(['a'])
    f.remover(() => true)
    expect(f.tamanho()).toBe(0)
    f.definirIntervalo(10)
    f.limpar()
    expect(f.tamanho()).toBe(0)
  })

  it('RN-032 propriedade: nunca roda duas tarefas no mesmo intervalo', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 100, max: 5000 }), (n, intervalo) => {
        const r = new RelogioFalso()
        const tempos: number[] = []
        const f = new FilaEscalonada(r, intervalo)
        for (let i = 0; i < n; i++) f.adicionar({ chave: String(i), executar: () => tempos.push(r.agora()) })
        r.avancar(n * intervalo + 1)
        expect(tempos.length).toBe(n)
        for (let i = 1; i < tempos.length; i++)
          expect(tempos[i]! - tempos[i - 1]!).toBeGreaterThanOrEqual(intervalo)
      }),
    )
  })
})

describe('grupos', () => {
  it('RN-031 trocar desliga os outros ligados e liga o alvo', () => {
    expect(planoDeTroca([g('a', true), g('b', false), g('c', true)], 'b')).toEqual({
      desligar: ['a', 'c'],
      ligar: ['b'],
    })
    expect(planoDeTroca([g('a', true)], 'x')).toEqual({ desligar: ['a'], ligar: [] })
  })

  it('RN-033 ao abrir: os ligados (padrão), todos ou nenhum', () => {
    const gs = [g('a', true), g('b', false)]
    const cfg = configPadrao()
    expect(gruposAoAbrir(cfg, gs)).toEqual(['a'])
    expect(gruposAoAbrir({ ...cfg, geral: { ...cfg.geral, restaurarAoAbrir: 'todos' } }, gs)).toEqual([
      'a',
      'b',
    ])
    expect(gruposAoAbrir({ ...cfg, geral: { ...cfg.geral, restaurarAoAbrir: 'nenhum' } }, gs)).toEqual([])
  })

  it('RN-034 avisa quando passa do limite declarado pelo jogo', () => {
    const jogo = { ...jogoFalso, limiteContas: 2 }
    const contas = ['a', 'b', 'c'].map((id) => ({ id, jogoId: 'falso' }) as never)
    expect(excessosDeLimite([jogo], contas, new Set(['a']), ['b'])).toEqual([])
    expect(excessosDeLimite([jogo], contas, new Set(['a', 'b']), ['c'])).toEqual([
      { jogoId: 'falso', jogoNome: 'Jogo Falso', limite: 2, total: 3 },
    ])
    expect(excessosDeLimite([jogoFalso], contas, new Set(), ['a', 'b', 'c'])).toEqual([])
    expect(pertoDoLimite(jogo, 2)).toBe(true)
    expect(pertoDoLimite(jogo, 1)).toBe(false)
    expect(pertoDoLimite(jogoFalso, 99)).toBe(false)
  })

  it('RN-036 reordenar grupos', () => {
    const r = reordenarGrupos([g('a', false, 0), g('b', false, 1), g('c', false, 2)], ['c', 'a'])
    expect(r.map((x) => [x.id, x.ordem])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ])
  })
})

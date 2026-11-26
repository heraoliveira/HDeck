import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  type EventoEstado,
  estadoInicial,
  estadoVisivel,
  estaLigada,
  podeRecarregar,
  transicionar,
} from '../../src/main/nucleo/contas/estado.ts'
import { estadosConta } from '../../src/shared/tipos/dominio.ts'

const aplicar = (...evs: EventoEstado[]) => evs.reduce(transicionar, estadoInicial)

describe('máquina de estados da conta', () => {
  it('RN-017 começa desligada e passa por carregando até ativa', () => {
    expect(estadoVisivel(estadoInicial)).toBe('desligada')
    const ligada = aplicar({ tipo: 'ligar' })
    expect(estadoVisivel(ligada)).toBe('carregando')
    const viva = aplicar({ tipo: 'ligar' }, { tipo: 'carregou' }, { tipo: 'exibir', modo: 'viva' })
    expect(estadoVisivel(viva)).toBe('ativa')
  })

  it('RN-017 mostra foto, fora da tela, caída, recarregando, travada, com aviso e erro', () => {
    const rodando = aplicar({ tipo: 'ligar' }, { tipo: 'carregou' })
    expect(estadoVisivel(transicionar(rodando, { tipo: 'exibir', modo: 'foto' }))).toBe('economica')
    expect(estadoVisivel(rodando)).toBe('escondida')
    expect(estadoVisivel(transicionar(rodando, { tipo: 'caiu' }))).toBe('caida')
    expect(estadoVisivel(transicionar(rodando, { tipo: 'recarregar' }))).toBe('recarregando')
    expect(estadoVisivel(transicionar(rodando, { tipo: 'travou' }))).toBe('travada')
    expect(estadoVisivel(transicionar(rodando, { tipo: 'aviso', chave: 'x' }))).toBe('com_aviso')
    const erro = transicionar(rodando, { tipo: 'erro', motivo: 'site_fora' })
    expect(estadoVisivel(erro)).toBe('erro')
    expect(erro.motivoErro).toBe('site_fora')
  })

  it('RN-017 aviso some quando resolvido e recarregar limpa os avisos', () => {
    const comAviso = aplicar({ tipo: 'ligar' }, { tipo: 'carregou' }, { tipo: 'aviso', chave: 'a' })
    expect(estadoVisivel(transicionar(comAviso, { tipo: 'avisoResolvido', chave: 'a' }))).toBe('escondida')
    const recarregada = transicionar(comAviso, { tipo: 'recarregar' })
    expect(recarregada.avisos.size).toBe(0)
    expect(transicionar(comAviso, { tipo: 'avisoResolvido', chave: 'nada' })).toBe(comAviso)
    expect(transicionar(comAviso, { tipo: 'aviso', chave: 'a' })).toBe(comAviso)
  })

  it('RN-017 desligar volta ao estado inicial e eventos inválidos são ignorados', () => {
    const r = aplicar({ tipo: 'ligar' }, { tipo: 'carregou' }, { tipo: 'desligar' })
    expect(r).toBe(estadoInicial)
    expect(transicionar(estadoInicial, { tipo: 'carregou' })).toBe(estadoInicial)
    expect(transicionar(estadoInicial, { tipo: 'aviso', chave: 'x' })).toBe(estadoInicial)
    const travada = aplicar({ tipo: 'ligar' }, { tipo: 'carregou' }, { tipo: 'travou' })
    expect(estadoVisivel(transicionar(travada, { tipo: 'respondeu' }))).toBe('escondida')
    expect(estaLigada(travada)).toBe(true)
    expect(estaLigada(estadoInicial)).toBe(false)
  })

  it('RN-017 erro pode religar ou recarregar e mantém o motivo', () => {
    const erro = aplicar({ tipo: 'ligar' }, { tipo: 'erro', motivo: 'x' })
    expect(transicionar(erro, { tipo: 'ligar' }).fase).toBe('carregando')
    expect(transicionar(erro, { tipo: 'recarregar' }).fase).toBe('recarregando')
    expect(transicionar(erro, { tipo: 'exibir', modo: 'fora' })).toBe(erro)
  })

  const eventoArb: fc.Arbitrary<EventoEstado> = fc.oneof(
    fc.constantFrom<EventoEstado>(
      { tipo: 'ligar' },
      { tipo: 'carregou' },
      { tipo: 'caiu' },
      { tipo: 'recarregar' },
      { tipo: 'travou' },
      { tipo: 'respondeu' },
      { tipo: 'desligar' },
    ),
    fc.record({ tipo: fc.constant('erro' as const), motivo: fc.string({ maxLength: 5 }) }),
    fc.record({
      tipo: fc.constant('exibir' as const),
      modo: fc.constantFrom('viva' as const, 'foto' as const, 'fora' as const),
    }),
    fc.record({ tipo: fc.constant('aviso' as const), chave: fc.constantFrom('a', 'b') }),
    fc.record({ tipo: fc.constant('avisoResolvido' as const), chave: fc.constantFrom('a', 'b') }),
  )

  it('RN-017 propriedade: nenhuma sequência leva a estado inválido nem a duas recargas juntas', () => {
    fc.assert(
      fc.property(fc.array(eventoArb, { maxLength: 60 }), (evs) => {
        let e = estadoInicial
        for (const ev of evs) {
          const antes = e
          e = transicionar(e, ev)
          expect(estadosConta).toContain(estadoVisivel(e))
          // Recarga só começa se não houver outra em andamento.
          if (ev.tipo === 'recarregar' && antes.fase === 'recarregando') expect(e).toBe(antes)
          if (e.fase === 'recarregando') expect(podeRecarregar(e)).toBe(false)
          if (e.fase === 'desligada') expect(e.avisos.size).toBe(0)
        }
      }),
    )
  })
})

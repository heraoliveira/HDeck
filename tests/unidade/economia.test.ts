import { describe, expect, it } from 'vitest'
import {
  contaMuda,
  decidirExibicao,
  deveEstrangular,
  deveVoltarAFoto,
  intervaloDaFotoMs,
  politicaEfetiva,
  precisaDeFoto,
} from '../../src/main/nucleo/economia/economia.ts'
import { AgendaOtimizacao } from '../../src/main/nucleo/economia/otimizacao.ts'
import { type Config, configPadrao } from '../../src/shared/config/esquema.ts'
import { type Conta, layoutGrupoSchema } from '../../src/shared/tipos/dominio.ts'
import { RelogioFalso } from '../falsos/relogio.ts'

const conta = (p: Partial<Conta> = {}): Conta => ({
  id: 'c1',
  grupoId: 'g',
  jogoId: 'j',
  nome: 'n',
  cor: '#000000',
  icone: '',
  ordem: 0,
  url: 'https://a.b/',
  zoom: 1,
  som: true,
  politicaForaTela: 'padrao_do_jogo',
  notificacoesDaPagina: false,
  notas: '',
  criadaEm: 0,
  otimizarAuto: { modo: 'desligado' as const, aCadaMin: 60, limiteMb: 800 },
  ...p,
})
const grupo = (politicas = {}) => ({
  id: 'g',
  nome: 'g',
  cor: '#000000',
  ordem: 0,
  ligado: true,
  visao: 'grade' as const,
  layout: layoutGrupoSchema.parse({ politicas }),
})

describe('economia', () => {
  it('RN-051 política por jogo no grupo, padrão Economizar, exceção da conta vence', () => {
    expect(politicaEfetiva(conta(), grupo(), undefined)).toBe('economizar')
    expect(politicaEfetiva(conta(), grupo({ j: 'manter' }), undefined)).toBe('manter')
    expect(politicaEfetiva(conta(), grupo({ j: 'economizar' }), undefined)).toBe('economizar')
    expect(
      politicaEfetiva(conta({ politicaForaTela: 'manter' }), grupo({ j: 'economizar' }), undefined),
    ).toBe('manter')
    expect(politicaEfetiva(conta(), undefined, undefined)).toBe('economizar')
  })

  it('RN-050 Manter farmando nunca é estrangulada; Economizar quando não está ao vivo', () => {
    for (const m of ['viva', 'foto', 'fora'] as const) expect(deveEstrangular('manter', m)).toBe(false)
    expect(deveEstrangular('economizar', 'fora')).toBe(true)
    expect(deveEstrangular('economizar', 'foto')).toBe(true) // para de desenhar; acorda só para a foto
    expect(deveEstrangular('economizar', 'viva')).toBe(false)
  })

  it('RN-052 com modo econômico, visíveis não ativas viram foto', () => {
    const r = decidirExibicao(['a', 'b', 'c'], 'b', true)
    expect([...r]).toEqual([
      ['a', 'foto'],
      ['b', 'viva'],
      ['c', 'foto'],
    ])
    expect([...decidirExibicao(['a', 'b'], 'b', false).values()]).toEqual(['viva', 'viva'])
    expect(decidirExibicao(['a'], null, true, new Set(['a'])).get('a')).toBe('viva')
  })

  it('RN-052 intervalo da foto segue a configuração com jitter pequeno', () => {
    const cfg = configPadrao()
    const a = intervaloDaFotoMs(cfg, 'conta-a')
    const b = intervaloDaFotoMs({ ...cfg, economia: { ...cfg.economia, fotoACadaSeg: 10 } }, 'conta-a')
    expect(Math.abs(a - 5000)).toBeLessThanOrEqual(500) // padrão: 5 s
    expect(Math.abs(b - 10000)).toBeLessThanOrEqual(100)
    expect(intervaloDaFotoMs(cfg, 'x')).not.toBe(intervaloDaFotoMs(cfg, 'conta-b'))
  })

  it('RN-054 não captura foto de espaço fora da tela', () => {
    expect(precisaDeFoto('foto', true)).toBe(true)
    expect(precisaDeFoto('foto', false)).toBe(false)
    expect(precisaDeFoto('viva', true)).toBe(false)
  })

  it('RN-053 voltar a ser foto depois de X s sem mexer (desligado por padrão)', () => {
    const cfg = configPadrao()
    expect(deveVoltarAFoto(cfg, 0, 10_000_000)).toBe(false)
    const com = { ...cfg, economia: { ...cfg.economia, voltarAFotoSeg: 30 } }
    expect(deveVoltarAFoto(com, 0, 29_000)).toBe(false)
    expect(deveVoltarAFoto(com, 0, 30_000)).toBe(true)
  })

  it('RN-100 som: todas, só a ativa, nenhuma; o som da conta vale por cima', () => {
    const cfg = configPadrao()
    const modo = (m: Config['som']['modo']) => ({ ...cfg, som: { modo: m } })
    expect(contaMuda(cfg, conta(), null, false)).toBe(false)
    expect(contaMuda(modo('nenhuma'), conta(), 'c1', false)).toBe(true)
    expect(contaMuda(modo('ativa'), conta(), 'c1', false)).toBe(false)
    expect(contaMuda(modo('ativa'), conta(), 'outra', false)).toBe(true)
    expect(contaMuda(cfg, conta({ som: false }), 'c1', false)).toBe(true)
    expect(contaMuda(cfg, conta(), 'c1', true)).toBe(true)
  })
})

describe('otimização programada', () => {
  const montar = (oti: Partial<Config['otimizacao']>, emUso = new Set<string>()) => {
    const r = new RelogioFalso()
    const cfg = configPadrao()
    const config = { ...cfg, otimizacao: { ...cfg.otimizacao, ...oti } }
    const feitas: [string, string, number][] = []
    const caches: string[] = []
    const memoria: string[] = []
    const otimizadas: string[] = []
    const ligadas = ['a', 'b', 'c']
    const ag = new AgendaOtimizacao(r, () => config, {
      ligadas: () => ligadas,
      emUso: (id) => emUso.has(id),
      recarregar: (id, motivo) => feitas.push([id, motivo, r.agora()]),
      limparCache: (id) => caches.push(id),
      planoDe: () => null,
      avisarMemoria: (id) => memoria.push(id),
      otimizar: (id) => otimizadas.push(id),
    })
    return { r, ag, feitas, caches, memoria, emUso, otimizadas }
  }

  it('RN-056 tudo desligado por padrão', () => {
    const { r, ag, feitas, caches } = montar({})
    ag.iniciar()
    r.avancar(30 * 86_400_000)
    expect(feitas).toEqual([])
    expect(caches).toEqual([])
    expect(ag.verificarMemoria(new Map([['a', 99999]]))).toEqual([])
  })

  it('RN-056 RN-057 recarrega a cada 2 h, uma por vez com 20 s entre elas', () => {
    const { r, ag, feitas } = montar({ recarregarACadaH: 2 })
    ag.iniciar()
    r.avancar(60_000) // primeira verificação marca o início
    const inicio = r.agora()
    r.avancar(2 * 3_600_000 + 60_000)
    r.avancar(60_000)
    expect(feitas.map((f) => f[0])).toEqual(['a', 'b', 'c'])
    expect(feitas.every((f) => f[1] === 'programada')).toBe(true)
    expect(feitas[1]![2] - feitas[0]![2]).toBeGreaterThanOrEqual(20_000)
    expect(feitas[0]![2] - inicio).toBeGreaterThanOrEqual(2 * 3_600_000)
  })

  it('RN-057 nunca recarrega a conta ativa em uso: fica para o fim da fila', () => {
    const { r, ag, feitas, emUso } = montar({ recarregarACadaH: 2 }, new Set(['a']))
    ag.iniciar()
    r.avancar(60_000)
    r.avancar(2 * 3_600_000 + 60_000)
    r.avancar(60_000)
    expect(feitas.map((f) => f[0])).toEqual(['b', 'c'])
    expect(ag.pendentes()).toContain('a')
    emUso.clear()
    r.avancar(60_000)
    expect(feitas.map((f) => f[0])).toContain('a')
    ag.esquecer('a')
    ag.parar()
  })

  it('RN-056 recarrega a conta que passou do limite de memória e avisa', () => {
    const { ag, feitas, memoria } = montar({ limiteMemoriaMB: 1024 })
    expect(
      ag.verificarMemoria(
        new Map([
          ['a', 900],
          ['b', 1500],
        ]),
      ),
    ).toEqual(['b'])
    expect(feitas.map((f) => [f[0], f[1]])).toEqual([['b', 'memoria']])
    expect(memoria).toEqual(['b'])
  })

  it('RN-056 limpa o cache a cada 1 dia', () => {
    const { r, ag, caches } = montar({ limparCacheDias: 1 })
    ag.iniciar()
    r.avancar(23 * 3_600_000)
    expect(caches).toEqual([])
    r.avancar(2 * 3_600_000)
    expect(caches).toEqual(['a', 'b', 'c'])
    ag.marcarRecarga('a')
  })
})

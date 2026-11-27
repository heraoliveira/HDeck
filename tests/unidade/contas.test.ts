import { describe, expect, it } from 'vitest'
import {
  contasDoGrupo,
  criarConta,
  duplicarConta,
  moverConta,
  sugerirJogo,
  urlDeRecarga,
} from '../../src/main/nucleo/contas/contas.ts'
import { catalogoDeJogos } from '../../src/shared/dados/catalogo.ts'
import { layoutGrupoSchema } from '../../src/shared/tipos/dominio.ts'
import { jogoFalso } from '../falsos/montar-motor.ts'

const grupos = [
  {
    id: 'g1',
    nome: 'A',
    cor: '#7c6cf0',
    ordem: 0,
    ligado: false,
    visao: 'grade' as const,
    layout: layoutGrupoSchema.parse({}),
  },
  {
    id: 'g2',
    nome: 'B',
    cor: '#7c6cf0',
    ordem: 1,
    ligado: false,
    visao: 'grade' as const,
    layout: layoutGrupoSchema.parse({}),
  },
]
const jogos = [jogoFalso, ...catalogoDeJogos()]
const ctx = (id: string, contas = [] as ReturnType<typeof nova>[]) => ({
  id,
  agora: 1,
  grupos,
  jogos,
  contas,
})
function nova(id: string, grupoId = 'g1', ordem = 0) {
  const r = criarConta({ grupoId, jogoId: 'falso', url: 'https://jogo.test/' }, ctx(id))
  if (!r.ok) throw new Error(r.erro)
  return { ...r.valor, ordem }
}

describe('contas', () => {
  it('RN-013 o domínio da URL sugere o jogo do catálogo', () => {
    expect(sugerirJogo('https://pokeidle.io/play', jogos)?.id).toBe('pokeidle')
    expect(sugerirJogo('https://www.lolidle.com/', jogos)?.id).toBe('lolidle')
    expect(sugerirJogo('https://outro.site/', jogos)).toBeNull()
    expect(sugerirJogo('nada', jogos)).toBeNull()
  })

  it('RN-012 RN-014 a conta pertence a um grupo e a um jogo e tem todos os campos', () => {
    const c = nova('c1')
    expect(c).toMatchObject({
      grupoId: 'g1',
      jogoId: 'falso',
      zoom: 1,
      som: true,
      politicaForaTela: 'padrao_do_jogo',
      notas: '',
    })
    expect(c.nome).toBe('Jogo Falso 1')
    expect(c.cor).toMatch(/^#/)
    expect(c.icone).toBe('🎲')
    expect(criarConta({ grupoId: 'x', jogoId: 'falso', url: 'https://a.b/' }, ctx('c2'))).toEqual({
      ok: false,
      erro: 'grupo',
    })
    expect(criarConta({ grupoId: 'g1', jogoId: 'x', url: 'https://a.b/' }, ctx('c2'))).toEqual({
      ok: false,
      erro: 'jogo',
    })
    expect(criarConta({ grupoId: 'g1', jogoId: 'falso', url: 'ftp://a.b/' }, ctx('c2'))).toEqual({
      ok: false,
      erro: 'invalida',
    })
    expect(criarConta({ grupoId: 'g1', jogoId: 'falso', url: 'lixo' }, ctx('c2'))).toEqual({
      ok: false,
      erro: 'invalida',
    })
  })

  it('RN-018 recarregar mantém a URL do domínio do jogo; senão volta à cadastrada', () => {
    const c = nova('c1')
    expect(urlDeRecarga('https://jogo.test/fase/3', c, jogoFalso)).toBe('https://jogo.test/fase/3')
    expect(urlDeRecarga('https://sub.jogo.test/x', c, jogoFalso)).toBe('https://sub.jogo.test/x')
    expect(urlDeRecarga('https://anuncio.com/', c, jogoFalso)).toBe(c.url)
    expect(urlDeRecarga('lixo', c, undefined)).toBe(c.url)
  })

  it('RN-016 duplicar cria conta com o mesmo jogo e ajustes e id (sessão) novo', () => {
    const c = { ...nova('c1'), zoom: 0.8, som: false }
    const d = duplicarConta(c, 'c9', 50, 'cópia', 3)
    expect(d).toMatchObject({
      id: 'c9',
      jogoId: c.jogoId,
      zoom: 0.8,
      som: false,
      criadaEm: 50,
      ordem: 3,
      nome: 'cópia',
    })
  })

  it('RN-036 mover entre grupos e reordenar renumera as ordens', () => {
    const contas = [nova('a', 'g1', 0), nova('b', 'g1', 1), nova('c', 'g1', 2), nova('d', 'g2', 0)]
    const r1 = moverConta(contas, 'c', 'g1', 0)
    expect(contasDoGrupo(r1, 'g1').map((c) => c.id)).toEqual(['c', 'a', 'b'])
    const r2 = moverConta(contas, 'a', 'g2', 1)
    expect(contasDoGrupo(r2, 'g2').map((c) => c.id)).toEqual(['d', 'a'])
    expect(contasDoGrupo(r2, 'g1').map((c) => [c.id, c.ordem])).toEqual([
      ['b', 0],
      ['c', 1],
    ])
    expect(moverConta(contas, 'x', 'g2', 0)).toEqual(contas)
    expect(contasDoGrupo(moverConta(contas, 'a', 'g2', 99), 'g2').at(-1)?.id).toBe('a')
  })
})

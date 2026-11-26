import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LINHAS } from '../../src/shared/configuracoes/catalogo.ts'
import { estadosConta } from '../../src/shared/tipos/dominio.ts'
import { jogoFalso, montarMotor } from '../falsos/montar-motor.ts'

// Ponte falsa do preload: registra as chamadas e devolve { ok: true }.
const chamadas: { canal: string; dados: unknown }[] = []
const ponte = new Proxy(
  {},
  {
    get(_a, grupo: string) {
      if (grupo === 'ouvir') return () => () => {}
      return new Proxy(
        {},
        {
          get(_b, nome: string) {
            return async (dados: unknown) => {
              chamadas.push({ canal: `${grupo}.${nome}`, dados })
              return { ok: true, valor: { ok: true } }
            }
          },
        },
      )
    },
  },
)
;(globalThis as unknown as { hdeck: unknown }).hdeck = ponte
window.hdeck = ponte as never

const { loja } = await import('../../src/renderer/estado/loja.svelte.ts')
const LinhaConfig = (await import('../../src/renderer/configuracoes/LinhaConfig.svelte')).default
const Configuracoes = (await import('../../src/renderer/configuracoes/Configuracoes.svelte')).default
const Especial = (await import('../../src/renderer/configuracoes/Especial.svelte')).default
const SeloEstado = (await import('../../src/renderer/componentes/SeloEstado.svelte')).default
const SeletorDivisao = (await import('../../src/renderer/componentes/SeletorDivisao.svelte')).default
const VisaoFoco = (await import('../../src/renderer/visoes/foco/VisaoFoco.svelte')).default
const MolduraConta = (await import('../../src/renderer/componentes/MolduraConta.svelte')).default

function preparar(mexer?: (m: ReturnType<typeof montarMotor>) => void) {
  const m = montarMotor({
    jogos: [jogoFalso, { ...jogoFalso, id: 'tela', nome: 'Jogo de Canvas', canvas: true }],
  })
  mexer?.(m)
  m.relogio.avancar(50)
  loja.snap = m.motor.snapshot()
  return m
}

beforeEach(() => {
  chamadas.length = 0
  loja.dialogos = []
})

const linha = (id: string) => LINHAS.find((l) => l.id === id)!

describe('linhas de configuração', () => {
  it('RN-174 interruptor muda o valor na hora (chama o main)', async () => {
    preparar()
    render(LinhaConfig, { linha: linha('recarregarQuandoCair') })
    expect(screen.getByText('Recarregar sozinho quando a conexão cair')).toBeTruthy()
    expect(screen.getByText('Espera 45 s o jogo reconectar antes')).toBeTruthy()
    const sw = screen.getByRole('switch', { name: 'Recarregar sozinho quando a conexão cair' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    await fireEvent.click(sw)
    expect(chamadas).toContainEqual({
      canal: 'config.alterar',
      dados: { caminho: 'queda.recarregarQuandoCair', valor: false },
    })
  })

  it('RN-089 linha dependente fica esmaecida com a principal desligada', () => {
    preparar()
    const { container } = render(LinhaConfig, { linha: linha('livesReligarACada') })
    expect(container.querySelector('.linha-config')!.classList.contains('esmaecida')).toBe(true)
    expect((container.querySelector('select') as HTMLSelectElement).disabled).toBe(true)
  })

  it('RN-174 select manda o valor escolhido; "vale ao reiniciar" aparece', async () => {
    preparar()
    const { container } = render(LinhaConfig, { linha: linha('fotoACadaSeg') })
    const sel = container.querySelector('select') as HTMLSelectElement
    sel.value = '5'
    await fireEvent.change(sel)
    expect(chamadas).toContainEqual({
      canal: 'config.alterar',
      dados: { caminho: 'economia.fotoACadaSeg', valor: 5 },
    })
    render(LinhaConfig, { linha: linha('aceleracao') })
    expect(screen.getByText('vale ao reiniciar')).toBeTruthy()
  })

  it('RN-175 a busca das Configurações acha as opções de live', async () => {
    preparar()
    render(Configuracoes, { aoFechar: () => {} })
    const busca = screen.getByRole('searchbox', { name: 'Buscar configuração' })
    await fireEvent.input(busca, { target: { value: 'live' } })
    expect(screen.getByText('Qualidade das lives')).toBeTruthy()
    expect(screen.getByText('Lives por conta')).toBeTruthy()
    expect(screen.queryByText('Tema')).toBeNull()
    await fireEvent.input(busca, { target: { value: 'nada-disso' } })
    expect(screen.getByText('Nenhuma configuração encontrada.')).toBeTruthy()
  })

  it('RN-124 avisa que jogos desenhados só em canvas não têm texto para ler', () => {
    preparar((m) => m.novaConta({ jogoId: 'tela' }))
    render(Especial, { qual: 'textos' })
    expect(screen.getByText('Jogo de Canvas é desenhado em canvas: o texto não pode ser lido.')).toBeTruthy()
  })
})

describe('contas e visões', () => {
  it('RN-017 o selo mostra cada estado da conta', () => {
    const textos = {
      desligada: 'Desligada',
      ativa: 'Ao vivo',
      economica: 'Foto',
      caida: 'Caiu',
      travada: 'Travada',
      com_aviso: 'Com aviso',
    }
    for (const estado of estadosConta) {
      const { container, unmount } = render(SeloEstado, { estado })
      expect(container.querySelector(`[data-estado="${estado}"]`)).toBeTruthy()
      if (estado in textos) expect(container.textContent).toContain(textos[estado as keyof typeof textos])
      unmount()
    }
  })

  it('RN-043 RN-053 a moldura mostra o nome, o estado e "Clique para jogar" na foto', async () => {
    const m = preparar()
    const c = m.novaConta({ nome: 'Minha conta' })
    m.motor.ligarGrupo(m.grupoId, true)
    m.relogio.avancar(100)
    m.paginas.de(c.id).ev.carregou(c.url)
    m.relogio.avancar(50)
    loja.snap = m.motor.snapshot()
    render(MolduraConta, { conta: loja.snap.contas[0]! })
    expect(screen.getByText('Minha conta')).toBeTruthy()
    const foto = screen.getByRole('button', { name: 'Clique para jogar' })
    await fireEvent.click(foto)
    expect(chamadas).toContainEqual({ canal: 'contas.ativar', dados: { id: c.id } })
  })

  it('RN-041 o seletor de divisão tem todas as divisões e grava a escolhida', async () => {
    preparar()
    render(SeletorDivisao, { grupo: loja.snap!.grupos[0]!, aoFechar: vi.fn() })
    const opcoes = screen.getAllByRole('radio')
    expect(opcoes).toHaveLength(11)
    await fireEvent.click(screen.getByRole('radio', { name: /1 grande \+ 3/ }))
    expect(chamadas.at(-1)).toEqual({
      canal: 'grupos.layout',
      dados: { id: loja.snap!.grupos[0]!.id, visao: 'grade', layout: { divisao: '1+3' } },
    })
  })

  it('RN-176 visão Foco: abas com Ctrl+N e navegação pelo teclado', async () => {
    const m = preparar()
    const a = m.novaConta({ nome: 'Aba A' })
    const b = m.novaConta({ nome: 'Aba B' })
    m.relogio.avancar(50)
    loja.snap = m.motor.snapshot()
    render(VisaoFoco, { grupo: loja.snap.grupos[0]! })
    const abas = screen.getAllByRole('tab')
    expect(abas).toHaveLength(2)
    expect(abas[0]!.textContent).toContain('Ctrl+1')
    await fireEvent.keyDown(abas[0]!, { key: 'ArrowRight' })
    expect(chamadas).toContainEqual({ canal: 'contas.ativar', dados: { id: b.id } })
    expect(loja.focoContaId).toBe(b.id)
    void a
  })
})

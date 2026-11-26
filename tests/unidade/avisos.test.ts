import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CentralAvisos, emSilencio } from '../../src/main/nucleo/avisos/avisos.ts'
import { FilaEnvio } from '../../src/main/nucleo/avisos/envio.ts'
import {
  DetectorTextos,
  procurarEmTrechos,
  textosDaConta,
  validarEncontrados,
} from '../../src/main/nucleo/avisos/textos.ts'
import { type Config, configPadrao } from '../../src/shared/config/esquema.ts'
import type { TextoVigiado } from '../../src/shared/tipos/dominio.ts'
import { normalizar } from '../../src/shared/util/texto.ts'
import { ArmazemMemoria } from '../falsos/armazem.ts'
import { HttpFalso, LocaisFalsos } from '../falsos/paginas.ts'
import { esvaziarPromessas, RelogioFalso } from '../falsos/relogio.ts'

function montar(mexer: (c: Config) => void = () => {}) {
  const r = new RelogioFalso()
  const config = configPadrao()
  config.avisos.discord = true
  config.avisos.telegram = true
  mexer(config)
  const armazem = new ArmazemMemoria([])
  const locais = new LocaisFalsos()
  const http = new HttpFalso()
  const discord = new FilaEnvio(r, http, (t) => ({ url: 'https://d/', corpo: { content: t } }))
  const telegram = new FilaEnvio(r, http, (t) => ({ url: 'https://t/', corpo: { text: t } }))
  let n = 0
  const central = new CentralAvisos(
    r,
    () => config,
    armazem,
    locais,
    { discord, telegram },
    () => 7,
    () => `a${n++}`,
  )
  return { r, config, armazem, locais, http, central }
}

const aviso = (chave = 'k', mensagem = 'caiu') => ({ tipo: 'caiu' as const, contaId: 'c1', mensagem, chave })

describe('central de avisos', () => {
  it('RN-110 entrega em Windows, som, selo, Discord e Telegram', async () => {
    const m = montar()
    m.central.emitir(aviso())
    m.r.avancar(10_000)
    await esvaziarPromessas()
    expect(m.locais.notificacoes).toHaveLength(1)
    expect(m.locais.sons).toBe(1)
    expect(m.locais.selos).toEqual([7])
    expect(m.http.pedidos.map((p) => p.url).sort()).toEqual(['https://d/', 'https://t/'])
  })

  it('RN-110 cada canal liga e desliga; piscar é opcional', async () => {
    const m = montar((c) => {
      c.avisos.windows = false
      c.avisos.som = false
      c.avisos.discord = false
      c.avisos.piscar = true
    })
    m.central.emitir(aviso())
    m.r.avancar(10_000)
    await esvaziarPromessas()
    expect(m.locais.notificacoes).toHaveLength(0)
    expect(m.locais.sons).toBe(0)
    expect(m.locais.piscadas).toBe(1)
    expect(m.http.pedidos.map((p) => p.url)).toEqual(['https://t/'])
  })

  it('RN-111 cada tipo de aviso liga e desliga por canal', async () => {
    const m = montar((c) => {
      c.avisos.tipos.caiu.windows = false
      c.avisos.tipos.caiu.discord = false
    })
    m.central.emitir(aviso())
    m.r.avancar(10_000)
    await esvaziarPromessas()
    expect(m.locais.notificacoes).toHaveLength(0)
    expect(m.http.pedidos.map((p) => p.url)).toEqual(['https://t/'])
  })

  it('RN-112 iguais em sequência viram um só, e nenhum some do histórico', () => {
    const m = montar()
    for (let i = 0; i < 3; i++)
      m.central.emitir({ ...aviso('caiu:jogo'), agrupado: (n: number) => `${n} contas caíram` })
    m.r.avancar(10_000)
    expect(m.locais.notificacoes.map((x) => x.aviso.mensagem)).toEqual(['3 contas caíram'])
    expect(m.armazem.avisos).toHaveLength(3)
    m.central.emitir(aviso('outro', 'x'))
    m.central.emitir(aviso('outro', 'x'))
    m.central.esvaziar()
    expect(m.locais.notificacoes.at(-1)!.aviso.mensagem).toContain('2 avisos')
  })

  it('RN-112 propriedade: todo aviso emitido fica no histórico', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('a', 'b', 'c'), { maxLength: 40 }), (chaves) => {
        const m = montar()
        for (const k of chaves) m.central.emitir(aviso(k))
        m.central.esvaziar()
        expect(m.armazem.avisos).toHaveLength(chaves.length)
        expect(new Set(m.armazem.avisos.map((a) => a.id)).size).toBe(chaves.length)
      }),
    )
  })

  it('RN-113 horário de silêncio: só registra, sem som e sem notificação', async () => {
    const m = montar((c) => {
      c.avisos.silencio = { ligado: true, inicio: '00:00', fim: '00:00' }
    })
    m.central.emitir(aviso())
    m.r.avancar(10_000)
    await esvaziarPromessas()
    expect(m.armazem.avisos).toHaveLength(1)
    expect(m.locais.notificacoes).toHaveLength(0)
    expect(m.locais.sons).toBe(0)
    expect(m.http.pedidos).toHaveLength(0)
  })

  it('RN-113 faixa de silêncio que passa da meia-noite', () => {
    const cfg = configPadrao()
    cfg.avisos.silencio = { ligado: true, inicio: '23:00', fim: '07:00' }
    const em = (h: number, min = 0) => new Date(2026, 10, 26, h, min).getTime()
    expect(emSilencio(cfg, em(23, 30))).toBe(true)
    expect(emSilencio(cfg, em(3))).toBe(true)
    expect(emSilencio(cfg, em(7))).toBe(false)
    expect(emSilencio(cfg, em(12))).toBe(false)
    cfg.avisos.silencio = { ligado: true, inicio: '09:00', fim: '17:00' }
    expect(emSilencio(cfg, em(10))).toBe(true)
    expect(emSilencio(cfg, em(18))).toBe(false)
    expect(emSilencio(configPadrao(), em(3))).toBe(false)
  })

  it('RN-113 pausar avisos por 1 h (bandeja) também silencia', () => {
    const m = montar()
    m.central.pausar(3_600_000)
    expect(m.central.pausado()).toBe(true)
    m.central.emitir(aviso())
    m.r.avancar(10_000)
    expect(m.locais.notificacoes).toHaveLength(0)
    m.r.avancar(3_600_000)
    expect(m.central.pausado()).toBe(false)
  })

  it('RN-116 a notificação leva o id da conta para o clique', () => {
    const m = montar()
    const ouvidos: string[] = []
    m.central.aoAvisar((a) => ouvidos.push(a.id))
    m.central.emitir({ ...aviso(), titulo: 'Conta 1' })
    m.r.avancar(10_000)
    expect(m.locais.notificacoes[0]!.aviso.contaId).toBe('c1')
    expect(m.locais.notificacoes[0]!.titulo).toBe('Conta 1')
    expect(ouvidos).toHaveLength(1)
  })
})

describe('envio Discord/Telegram', () => {
  it('RN-115 no máximo 1 mensagem a cada 3 s por canal; as que esperam são juntadas', async () => {
    const r = new RelogioFalso()
    const http = new HttpFalso()
    const f = new FilaEnvio(r, http, (t) => ({ url: 'u', corpo: t }))
    f.enviar('um')
    r.avancar(0)
    await esvaziarPromessas()
    f.enviar('dois')
    f.enviar('três')
    r.avancar(1000)
    await esvaziarPromessas()
    expect(http.pedidos).toHaveLength(1)
    r.avancar(2000)
    await esvaziarPromessas()
    expect(http.pedidos.map((p) => p.corpo)).toEqual(['um', 'dois\ntrês'])
    expect(f.tamanhoDaFila()).toBe(0)
  })

  it('RN-115 tenta de novo 3 vezes (5 s, 30 s, 2 min) e respeita o "espere"', async () => {
    const r = new RelogioFalso()
    const http = new HttpFalso()
    http.respostas = [
      { status: 500, esperarSeg: null },
      { status: 429, esperarSeg: 60 },
      { status: 502, esperarSeg: null },
      { status: 500, esperarSeg: null },
    ]
    const resultados: string[] = []
    const f = new FilaEnvio(r, http, (t) => ({ url: 'u', corpo: t }))
    f.aoTerminar((res) => resultados.push(res))
    const t0 = r.agora()
    f.enviar('x')
    const tempos: number[] = []
    for (let i = 0; i < 400; i++) {
      const antes = http.pedidos.length
      await r.avancarAsync(1000, 1000)
      if (http.pedidos.length > antes) tempos.push(r.agora() - t0)
    }
    expect(http.pedidos).toHaveLength(4)
    expect(resultados).toEqual(['desistiu'])
    // 0 s, +5 s, +60 s (pedido pelo 429, maior que 30 s), +2 min
    expect(tempos[1]! - tempos[0]!).toBeGreaterThanOrEqual(5000)
    expect(tempos[2]! - tempos[1]!).toBeGreaterThanOrEqual(60_000)
    expect(tempos[3]! - tempos[2]!).toBeGreaterThanOrEqual(120_000)
  })

  it('RN-115 erro de configuração (4xx) não repete; sem configuração não envia', async () => {
    const r = new RelogioFalso()
    const http = new HttpFalso()
    http.respostas = [{ status: 404, esperarSeg: null }]
    const f = new FilaEnvio(r, http, (t) => ({ url: 'u', corpo: t }))
    f.enviar('x')
    await r.avancarAsync(300_000)
    expect(http.pedidos).toHaveLength(1)
    const semCfg = new FilaEnvio(r, http, () => null)
    expect(await semCfg.testar('t')).toEqual({ ok: false, status: 0 })
    expect(await f.testar('t')).toEqual({ ok: true, status: 204 })
    semCfg.enviar('y')
    await r.avancarAsync(5000)
    expect(http.pedidos).toHaveLength(2)
    f.parar()
  })
})

const tv = (
  texto: string,
  escopo: TextoVigiado['escopo'] = 'todas',
  alvoId: string | null = null,
): TextoVigiado => ({
  id: texto,
  texto,
  escopo,
  alvoId,
  ativo: true,
})

describe('textos vigiados', () => {
  it('RN-120 RN-121 compara sem maiúsculas e sem acentos', () => {
    expect(procurarEmTrechos(['Faça a VERIFICAÇÃO agora'], ['verificacao'])).toEqual(['verificacao'])
    expect(procurarEmTrechos(['nada aqui'], ['captcha'])).toEqual([])
    expect(normalizar('  Você   foi  DESCONECTADO ')).toBe('voce foi desconectado')
  })

  it('RN-121 escopo: todas, um grupo ou uma conta', () => {
    const conta = { id: 'c1', grupoId: 'g1' } as never
    const lista = [
      tv('a'),
      tv('b', 'grupo', 'g1'),
      tv('c', 'grupo', 'g2'),
      tv('d', 'conta', 'c1'),
      { ...tv('e'), ativo: false },
    ]
    expect(textosDaConta(lista, conta).map((t) => t.texto)).toEqual(['a', 'b', 'd'])
  })

  it('RN-123 avisa uma vez; só de novo depois de sumir e voltar', () => {
    const d = new DetectorTextos()
    expect(d.atualizar('c1', ['captcha'])).toEqual(['captcha'])
    expect(d.atualizar('c1', ['captcha'])).toEqual([])
    expect(d.atualizar('c1', [])).toEqual([])
    expect(d.atualizar('c1', ['captcha'])).toEqual(['captcha'])
    expect(d.ativos('c1')).toEqual(['captcha'])
    d.esquecer('c1')
    expect(d.ativos('c1')).toEqual([])
  })

  it('RN-122 o retorno da página é validado e limitado (dado não confiável)', () => {
    expect(validarEncontrados(['a', 'b'])).toEqual(['a', 'b'])
    expect(validarEncontrados('x')).toEqual([])
    expect(validarEncontrados(Array.from({ length: 60 }, () => 'a'))).toEqual([])
    expect(validarEncontrados(['x'.repeat(201)])).toEqual([])
  })
})

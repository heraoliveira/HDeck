import { describe, expect, it } from 'vitest'
import { esperaDaTentativa } from '../../src/main/nucleo/saude/backoff.ts'
import { type DecisoesSaude, VigiaSaude } from '../../src/main/nucleo/saude/vigia.ts'
import { type Config, configPadrao } from '../../src/shared/config/esquema.ts'
import type { Jogo } from '../../src/shared/tipos/dominio.ts'
import { jogoFalso } from '../falsos/montar-motor.ts'
import { RedeFalsa } from '../falsos/paginas.ts'
import { RelogioFalso } from '../falsos/relogio.ts'

function montar(cfgQueda: Partial<Config['queda']> = {}, jogo: Jogo = jogoFalso) {
  const r = new RelogioFalso()
  const rede = new RedeFalsa()
  const base = configPadrao()
  const config = { ...base, queda: { ...base.queda, ...cfgQueda } }
  const log: string[] = []
  const recargas: [string, number][] = []
  const d: DecisoesSaude = {
    recarregar: (m) => recargas.push([m, r.agora()]),
    avisar: (t, dados) => log.push(`aviso:${t}:${JSON.stringify(dados)}`),
    resolverAviso: (t) => log.push(`resolvido:${t}`),
    registrar: (t, m) => log.push(`reg:${t}:${m}`),
    estado: (ev) => log.push(`estado:${ev.tipo}`),
  }
  const v = new VigiaSaude(
    r,
    () => config,
    () => jogo,
    rede,
    d,
  )
  const t0 = r.agora()
  return { r, rede, v, log, recargas, t0, config }
}

/** Página carregada com WS principal recebendo dados. */
function emJogo(m: ReturnType<typeof montar>) {
  m.v.carregou()
  m.v.wsAbriu('ws1', 'wss://jogo.test/ws')
  m.v.wsAbriu('chat', 'wss://jogo.test/chat')
  for (let i = 0; i < 10; i++) m.v.dado('ws1')
  m.v.dado('chat')
}

describe('espera entre tentativas', () => {
  it('RN-061 45 s → 2 min → 5 min → 15 min e para depois de 4', () => {
    expect([0, 1, 2, 3].map((n) => esperaDaTentativa(n, 45))).toEqual([45_000, 120_000, 300_000, 900_000])
    expect(esperaDaTentativa(4, 45)).toBeNull()
    expect(esperaDaTentativa(-1, 30)).toBe(30_000)
    expect(esperaDaTentativa(0, 15)).toBe(15_000)
  })
})

describe('vigia de saúde', () => {
  it('RN-060 conexão principal cai e não volta em 45 s → recarrega', () => {
    const m = montar()
    emJogo(m)
    m.v.wsFechou('ws1')
    m.r.avancar(44_000)
    expect(m.recargas).toEqual([])
    m.r.avancar(1_000)
    expect(m.recargas.map((x) => x[0])).toEqual(['queda'])
    expect(m.log).toContain('estado:caiu')
  })

  it('RN-060 se a conexão voltar sozinha antes do tempo, não recarrega', () => {
    const m = montar()
    emJogo(m)
    m.v.wsFechou('ws1')
    m.r.avancar(10_000)
    m.v.wsAbriu('ws2', 'wss://jogo.test/ws')
    m.r.avancar(60_000)
    expect(m.recargas).toEqual([])
    expect(m.log.some((l) => l.startsWith('reg:voltou'))).toBe(true)
  })

  it('RN-060 tempo de espera configurável e opção desligada não recarrega', () => {
    const m = montar({ esperaQuedaSeg: 15 })
    emJogo(m)
    m.v.wsFechou('ws1')
    m.r.avancar(15_000)
    expect(m.recargas).toHaveLength(1)
    const d = montar({ recarregarQuandoCair: false })
    emJogo(d)
    d.v.wsFechou('ws1')
    d.r.avancar(3_600_000)
    expect(d.recargas).toEqual([])
  })

  it('RN-061 recargas seguidas usam a espera crescente e param depois de 4 falhas, avisando', () => {
    const m = montar()
    emJogo(m)
    m.v.wsFechou('ws1')
    const esperas = [45_000, 120_000, 300_000, 900_000]
    for (const e of esperas) {
      const antes = m.recargas.length
      m.r.avancar(e)
      expect(m.recargas.length).toBe(antes + 1)
      m.v.carregou() // recarregou, mas a conexão principal não volta
    }
    m.r.avancar(3_600_000)
    expect(m.recargas).toHaveLength(4)
    expect(m.v.desistiu()).toBe(true)
    expect(m.log.some((l) => l.startsWith('aviso:caiu'))).toBe(true)
  })

  it('RN-061 um carregamento bem-sucedido zera a contagem', () => {
    const m = montar()
    emJogo(m)
    m.v.wsFechou('ws1')
    m.r.avancar(45_000)
    expect(m.v.falhasSeguidas()).toBe(1)
    emJogo(m)
    expect(m.v.falhasSeguidas()).toBe(0)
  })

  it('RN-062 sem declaração, a principal é a que mais recebeu; o chat cair não recarrega', () => {
    const m = montar()
    emJogo(m)
    expect(m.v.wsPrincipal()).toBe('ws1')
    m.v.wsFechou('chat')
    m.r.avancar(3_600_000)
    expect(m.recargas).toEqual([])
  })

  it('RN-062 a principal declarada no catálogo vence', () => {
    const m = montar({}, { ...jogoFalso, wsPrincipal: '/game' })
    m.v.carregou()
    m.v.wsAbriu('a', 'wss://x/chat')
    m.v.wsAbriu('b', 'wss://x/game')
    for (let i = 0; i < 20; i++) m.v.dado('a')
    m.v.dado('b')
    expect(m.v.wsPrincipal()).toBe('b')
    m.v.wsFechou('a')
    m.r.avancar(60_000)
    expect(m.recargas).toEqual([])
    m.v.wsFechou('b')
    m.r.avancar(45_000)
    expect(m.recargas).toHaveLength(1)
  })

  it('RN-062 RN-064 conexão aberta antes do vigia vale pelo primeiro quadro; o chat não conta como dado', () => {
    const m = montar({ avisarSemDadosMin: 1 })
    m.v.comecouCarregar()
    m.v.carregou()
    for (let i = 0; i < 5; i++) m.v.dado('principal-desconhecida')
    m.v.wsAbriu('chat', 'wss://x/chat')
    m.v.dado('chat')
    expect(m.v.wsPrincipal()).toBe('principal-desconhecida')
    for (let i = 0; i < 8; i++) {
      m.r.avancar(10_000)
      m.v.dado('chat')
    }
    expect(m.log.some((l) => l.startsWith('aviso:sem_dados'))).toBe(true)
    m.v.dado('principal-desconhecida')
    expect(m.log).toContain('resolvido:sem_dados')
  })

  it('RN-062 depois do primeiro minuto a escolha fica fixa', () => {
    const m = montar()
    m.v.carregou()
    m.v.wsAbriu('a', 'wss://x/a')
    m.v.dado('a')
    m.r.avancar(61_000)
    m.v.wsAbriu('b', 'wss://x/b')
    for (let i = 0; i < 10; i++) m.v.dado('b')
    expect(m.v.wsPrincipal()).toBe('a')
    m.v.dado('desconhecido')
  })

  it('RN-064 avisa sem dados só quando configurado, e resolve quando volta', () => {
    const m = montar({ avisarSemDadosMin: 2 })
    emJogo(m)
    m.r.avancar(119_000)
    expect(m.log.some((l) => l.startsWith('aviso:sem_dados'))).toBe(false)
    m.r.avancar(16_000)
    expect(m.log.some((l) => l.startsWith('aviso:sem_dados'))).toBe(true)
    m.v.dado('ws1')
    expect(m.log).toContain('resolvido:sem_dados')
    const nunca = montar()
    emJogo(nunca)
    nunca.r.avancar(3_600_000)
    expect(nunca.log.some((l) => l.startsWith('aviso:sem_dados'))).toBe(false)
  })

  it('RN-064 o padrão de cada jogo vem do catálogo (jogos que mandam dados o tempo todo)', () => {
    const m = montar({}, { ...jogoFalso, dadosContinuos: true, semDadosMinPadrao: 1 })
    emJogo(m)
    m.r.avancar(75_000)
    expect(m.log.some((l) => l.startsWith('aviso:sem_dados'))).toBe(true)
  })

  it('RN-065 página travada por mais de 30 s recarrega; se responder antes, não', () => {
    const m = montar()
    emJogo(m)
    m.v.travou()
    m.v.travou()
    m.r.avancar(10_000)
    m.v.respondeu()
    m.r.avancar(60_000)
    expect(m.recargas).toEqual([])
    m.v.travou()
    m.r.avancar(30_000)
    expect(m.recargas.map((x) => x[0])).toEqual(['travou'])
    m.v.respondeu()
    const des = montar({ recarregarSeTravar: false })
    emJogo(des)
    des.v.travou()
    des.r.avancar(600_000)
    expect(des.recargas).toEqual([])
  })

  it('RN-066 página que fechou sozinha recarrega com a espera da RN-061 e guarda o motivo', () => {
    const m = montar()
    emJogo(m)
    m.v.processoMorreu('oom')
    expect(m.log).toContain('reg:fechou:oom')
    m.r.avancar(45_000)
    expect(m.recargas.map((x) => x[0])).toEqual(['fechou'])
    const des = montar({ recarregarSeFechar: false })
    emJogo(des)
    des.v.processoMorreu('crashed')
    des.r.avancar(600_000)
    expect(des.recargas).toEqual([])
  })

  it('RN-067 sem internet: espera e, quando volta, recarrega a conta que caiu', () => {
    const m = montar()
    emJogo(m)
    m.rede.ligada = false
    m.v.wsFechou('ws1')
    m.r.avancar(45_000)
    expect(m.recargas).toEqual([])
    expect(m.v.esperandoInternet()).toBe(true)
    m.rede.ligada = true
    m.v.internetVoltou()
    expect(m.recargas.map((x) => x[0])).toEqual(['internet'])
    m.v.internetVoltou()
    expect(m.recargas).toHaveLength(1)
  })

  it('RN-067 falha ao carregar sem internet não é site fora do ar', () => {
    const m = montar()
    m.rede.ligada = false
    m.v.falhouCarregar(-106, 'ERR_INTERNET_DISCONNECTED')
    expect(m.v.esperandoInternet()).toBe(true)
    expect(m.log.some((l) => l.startsWith('aviso:site_fora'))).toBe(false)
  })

  it('RN-068 site fora do ar: avisa e tenta de novo com a mesma espera', () => {
    const m = montar()
    m.v.falhouCarregar(-105, 'ERR_NAME_NOT_RESOLVED')
    expect(m.log.some((l) => l.startsWith('aviso:site_fora'))).toBe(true)
    m.r.avancar(45_000)
    expect(m.recargas.map((x) => x[0])).toEqual(['site_fora'])
    m.v.statusPrincipal(503)
    m.r.avancar(120_000)
    expect(m.recargas).toHaveLength(2)
    m.v.statusPrincipal(200)
    m.v.falhouCarregar(-3, 'ERR_ABORTED')
    expect(m.recargas).toHaveLength(2)
  })

  it('RN-068 site fora quando a internet cai durante a espera vira sem internet', () => {
    const m = montar()
    m.v.statusPrincipal(500)
    m.rede.ligada = false
    m.r.avancar(45_000)
    expect(m.recargas).toEqual([])
    expect(m.v.esperandoInternet()).toBe(true)
  })

  it('RN-069 queda, recarga, travamento e volta ficam registrados', () => {
    const m = montar()
    emJogo(m)
    m.v.wsFechou('ws1')
    m.r.avancar(45_000)
    m.v.travou()
    expect(m.log.filter((l) => l.startsWith('reg:')).map((l) => l.split(':')[1])).toEqual([
      'queda',
      'recarga',
      'travou',
    ])
  })

  it('RN-061 recarga por fora zera esperas e um jogo sem WS conta sucesso no carregamento', () => {
    const m = montar()
    emJogo(m)
    m.v.wsFechou('ws1')
    m.v.recarregouPorFora()
    m.r.avancar(3_600_000)
    expect(m.recargas).toEqual([])
    const semWs = montar()
    semWs.v.carregou()
    expect(semWs.v.falhasSeguidas()).toBe(0)
    expect(semWs.v.ultimoDadoEm()).toBe(semWs.r.agora())
    semWs.v.desligar()
  })
})

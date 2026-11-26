import { describe, expect, it } from 'vitest'
import { ControleLives } from '../../src/main/nucleo/lives/lives.ts'
import { type Config, configPadrao } from '../../src/shared/config/esquema.ts'
import type { Live } from '../../src/shared/tipos/dominio.ts'
import { FabricaLivesFalsa } from '../falsos/paginas.ts'
import { esvaziarPromessas, RelogioFalso } from '../falsos/relogio.ts'

const live = (id: string, contaId = 'c1', p: Partial<Live> = {}): Live => ({
  id,
  contaId,
  plataforma: 'twitch',
  canal: `canal${id}`,
  ligada: true,
  ordem: 0,
  ...p,
})

function montar(cfgLives: Partial<Config['lives']> = {}) {
  const r = new RelogioFalso()
  const base = configPadrao()
  const config = { ...base, lives: { ...base.lives, ...cfgLives } }
  const fab = new FabricaLivesFalsa()
  const avisos: string[] = []
  const c = new ControleLives(r, () => config, fab, {
    encerrou: (l) => avisos.push(`encerrou:${l.id}`),
    voltou: (l) => avisos.push(`voltou:${l.id}`),
    pedeLogin: (l) => avisos.push(`login:${l.id}`),
    mudou: () => {},
  })
  c.iniciar()
  return { r, config, fab, avisos, c }
}

describe('lives', () => {
  it('RN-080 uma conta pode ter várias lives, Twitch ou Kick', () => {
    const m = montar()
    m.c.sincronizar([live('a'), live('b', 'c1', { plataforma: 'kick' })], new Set(['c1']))
    expect(m.fab.abertas().map((p) => p.carregamentos[0]!.url)).toEqual([
      'https://www.twitch.tv/canala',
      'https://kick.com/canalb',
    ])
    expect(m.c.abertasDaConta('c1')).toBe(2)
  })

  it('RN-081 a live é criada para a conta dela (mesma sessão)', () => {
    const m = montar()
    m.c.sincronizar([live('a', 'conta-x')], new Set(['conta-x']))
    expect(m.fab.criadas[0]!.live.contaId).toBe('conta-x')
  })

  it('RN-082 com Lives nas contas desligado, nenhuma live fica aberta', () => {
    const m = montar()
    m.c.sincronizar([live('a')], new Set(['c1']))
    m.config.lives.ligadas = false
    m.c.sincronizar([live('a')], new Set(['c1']))
    expect(m.fab.abertas()).toEqual([])
    m.c.sincronizar([live('a')], new Set())
    expect(m.c.estado('a')).toBe('desligada')
  })

  it('RN-083 RN-101 lives tocam escondidas e mudas; Mostrar abre e pode ligar o som', () => {
    const m = montar()
    m.c.sincronizar([live('a')], new Set(['c1']))
    const p = m.fab.abertas()[0]!
    expect(p.visivel).toBe(false)
    expect(m.c.mostrar('a', true)).toBe(true)
    expect(p.visivel).toBe(true)
    expect(p.som).toBe(true)
    m.c.esconder('a')
    expect(p.visivel).toBe(false)
    expect(p.som).toBe(false)
    expect(m.c.mostrar('zz', false)).toBe(false)
    m.c.esconder('zz')
  })

  it('RN-084 modo econômico das lives desenha no mínimo', () => {
    const m = montar()
    m.c.sincronizar([live('a')], new Set(['c1']))
    const p = m.fab.abertas()[0]!
    expect(p.economico).toBe(true)
    m.config.lives.economico = false
    m.c.aplicarEconomia()
    expect(p.economico).toBe(false)
  })

  it('RN-085 qualidade vale para as que abrirem ou recarregarem depois', () => {
    const m = montar()
    m.c.sincronizar([live('a')], new Set(['c1']))
    expect(m.fab.abertas()[0]!.carregamentos[0]!.qualidade).toBe('160p')
    m.config.lives.qualidade = '720p'
    m.c.sincronizar([live('a'), live('b')], new Set(['c1']))
    expect(m.fab.abertas()[1]!.carregamentos[0]!.qualidade).toBe('720p')
    expect(m.fab.abertas()[0]!.carregamentos).toHaveLength(1)
    m.c.recarregarDaConta('c1')
    expect(m.fab.abertas()[0]!.carregamentos.at(-1)!.qualidade).toBe('720p')
  })

  it('RN-086 limite por conta: diminuir não fecha as abertas, só impede novas', () => {
    const m = montar({ porConta: 2 })
    m.c.sincronizar([live('a'), live('b'), live('c')], new Set(['c1']))
    expect(m.c.abertasDaConta('c1')).toBe(2)
    expect(m.c.cabeMaisUma('c1')).toBe(false)
    m.config.lives.porConta = 1
    m.c.sincronizar([live('a'), live('b'), live('c')], new Set(['c1']))
    expect(m.c.abertasDaConta('c1')).toBe(2)
    m.config.lives.porConta = 0
    expect(m.c.cabeMaisUma('c1')).toBe(true)
  })

  it('RN-087 depois de um raid volta ao canal cadastrado', () => {
    const m = montar()
    m.c.sincronizar([live('a')], new Set(['c1']))
    const p = m.fab.abertas()[0]!
    p.ev.navegou('https://www.twitch.tv/outrocanal')
    expect(p.carregamentos.at(-1)!.url).toBe('https://www.twitch.tv/canala')
    p.ev.navegou('https://www.twitch.tv/CANALA')
    expect(p.carregamentos).toHaveLength(2)
    m.config.lives.voltarAoCanal = false
    p.ev.navegou('https://www.twitch.tv/outro')
    expect(p.carregamentos).toHaveLength(2)
  })

  it('RN-088 live encerrada sai da memória e fica como encerrada', async () => {
    const m = montar()
    m.c.sincronizar([live('a')], new Set(['c1']))
    const p = m.fab.abertas()[0]!
    p.ev.carregou('x')
    expect(m.c.estado('a')).toBe('tocando')
    p.estadoLido = { aoVivo: false, offline: true, pedeLogin: false, tocando: false }
    await m.c.lerTodas()
    expect(p.fechada).toBe(true)
    expect(m.c.estado('a')).toBe('encerrada')
    expect(m.avisos).toEqual(['encerrou:a'])
    // Continua na lista: sincronizar de novo não reabre.
    m.c.sincronizar([live('a')], new Set(['c1']))
    expect(m.fab.abertas()).toEqual([])
  })

  it('RN-088 com a opção desligada a live encerrada continua aberta', async () => {
    const m = montar({ desligarEncerrada: false })
    m.c.sincronizar([live('a')], new Set(['c1']))
    const p = m.fab.abertas()[0]!
    p.estadoLido = { aoVivo: false, offline: true, pedeLogin: false, tocando: false }
    await m.c.ler('a')
    expect(p.fechada).toBe(false)
    expect(m.c.estado('a')).toBe('encerrada')
  })

  it('RN-089 religar quando voltar ao vivo, conferindo a cada 2 h', async () => {
    const m = montar({ religar: true })
    m.c.sincronizar([live('a')], new Set(['c1']))
    const p1 = m.fab.abertas()[0]!
    p1.estadoLido = { aoVivo: false, offline: true, pedeLogin: false, tocando: false }
    await m.c.ler('a')
    expect(m.fab.abertas()).toEqual([])
    m.r.avancar(2 * 3_600_000 - 1000)
    expect(m.fab.abertas()).toEqual([])
    m.r.avancar(1000)
    const p2 = m.fab.abertas()[0]!
    expect(m.c.estado('a')).toBe('conferindo')
    p2.estadoLido = { aoVivo: false, offline: true, pedeLogin: false, tocando: false }
    m.r.avancar(20_000)
    await esvaziarPromessas()
    expect(p2.fechada).toBe(true)
    expect(m.c.estado('a')).toBe('encerrada')
    m.r.avancar(2 * 3_600_000)
    const p3 = m.fab.abertas()[0]!
    p3.estadoLido = { aoVivo: true, offline: false, pedeLogin: false, tocando: true }
    m.r.avancar(20_000)
    await esvaziarPromessas()
    expect(m.c.estado('a')).toBe('tocando')
    expect(m.avisos).toContain('voltou:a')
  })

  it('RN-089 sem a opção ligada não confere de novo', async () => {
    const m = montar()
    m.c.sincronizar([live('a')], new Set(['c1']))
    m.fab.abertas()[0]!.estadoLido = { aoVivo: false, offline: true, pedeLogin: false, tocando: false }
    await m.c.ler('a')
    m.r.avancar(24 * 3_600_000)
    expect(m.fab.abertas()).toEqual([])
  })

  it('RN-091 live que pede login avisa uma vez', async () => {
    const m = montar()
    m.c.sincronizar([live('a')], new Set(['c1']))
    m.fab.abertas()[0]!.estadoLido = { aoVivo: false, offline: false, pedeLogin: true, tocando: false }
    await m.c.ler('a')
    await m.c.ler('a')
    expect(m.c.estado('a')).toBe('pede_login')
    expect(m.avisos).toEqual(['login:a'])
  })

  it('RN-090 o controle só abre, lê e fecha (a interface da página não tem clicar)', () => {
    const m = montar()
    m.c.sincronizar([live('a')], new Set(['c1']))
    const p = m.fab.abertas()[0]!
    expect(Object.keys(p).some((k) => /clic/i.test(k))).toBe(false)
    p.ev.morreu()
    expect(p.carregamentos).toHaveLength(2)
    expect(m.c.pids().size).toBe(1)
    expect(m.c.estados()).toEqual({ a: 'abrindo' })
    m.c.parar()
    expect(m.fab.abertas()).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { TravaCofre } from '../../src/main/nucleo/cofre/cofre.ts'
import {
  aplicarRetencaoMetricas,
  eventosParaApagar,
  inicioDoDia,
  metricasPorConta,
  podeReabrir,
  resumirConta,
  serieTotal,
  totais,
} from '../../src/main/nucleo/painel/painel.ts'
import { AgendaPing, type AvisoPing, resumoPing } from '../../src/main/nucleo/ping/ping.ts'
import type { LinhaMetrica, LinhaPing } from '../../src/main/nucleo/portas.ts'
import { configPadrao } from '../../src/shared/config/esquema.ts'
import { jogoFalso } from '../falsos/montar-motor.ts'
import { HttpFalso } from '../falsos/paginas.ts'
import { esvaziarPromessas, RelogioFalso } from '../falsos/relogio.ts'

describe('ping', () => {
  function montar() {
    const r = new RelogioFalso()
    const http = new HttpFalso()
    const cfg = configPadrao()
    const linhas: LinhaPing[] = []
    const avisos: AvisoPing[] = []
    const ag = new AgendaPing(
      r,
      () => cfg,
      http,
      () => [jogoFalso],
      (l) => linhas.push(l),
      (a) => avisos.push(a),
    )
    return { r, http, cfg, linhas, avisos, ag }
  }

  it('RN-130 mede a cada 5 min cada jogo com conta ligada', async () => {
    const m = montar()
    m.ag.iniciar()
    m.ag.iniciar()
    m.r.avancar(5 * 60_000 - 1)
    expect(m.linhas).toHaveLength(0)
    m.r.avancar(1)
    await esvaziarPromessas()
    expect(m.linhas).toHaveLength(1)
    m.cfg.ping.intervaloMin = 1
    m.ag.iniciar()
    m.r.avancar(60_000)
    await esvaziarPromessas()
    expect(m.linhas).toHaveLength(2)
    m.ag.parar()
  })

  it('RN-130 avisa acima de 1.000 ms (uma vez) ou com 3 erros seguidos', async () => {
    const m = montar()
    m.http.medicoes = [
      { ms: 1500, status: 200 },
      { ms: 1600, status: 200 },
      { ms: 200, status: 200 },
      { ms: null, status: 0 },
      { ms: 10, status: 503 },
      { ms: null, status: 0 },
    ]
    for (let i = 0; i < 6; i++) await m.ag.medir(jogoFalso)
    expect(m.avisos.map((a) => a.tipo)).toEqual(['lento', 'erro'])
  })

  it('RN-130 resumo: atual, média da última hora e série de 24 h', () => {
    const agora = 10 * 3_600_000
    const linhas: LinhaPing[] = [
      { jogoId: 'falso', em: agora - 7_200_000, ms: 900, status: 200 },
      { jogoId: 'falso', em: agora - 1_800_000, ms: 100, status: 200 },
      { jogoId: 'falso', em: agora - 60_000, ms: 300, status: 200 },
      { jogoId: 'outro', em: agora, ms: 5, status: 200 },
    ]
    const r = resumoPing(linhas, 'falso', agora)
    expect(r.atual).toBe(300)
    expect(r.media1h).toBe(200)
    expect(r.serie24h).toHaveLength(3)
    expect(resumoPing([], 'falso', agora)).toEqual({ atual: null, media1h: null, serie24h: [] })
  })
})

describe('painel', () => {
  it('RN-045 quedas e recargas de hoje, tempo online e último dado', () => {
    const agora = new Date(2026, 10, 26, 15).getTime()
    const ontem = agora - 86_400_000
    const r = resumirConta(
      [
        { contaId: 'c1', tipo: 'queda', motivo: '', em: agora - 1000 },
        { contaId: 'c1', tipo: 'queda', motivo: '', em: ontem },
        { contaId: 'c1', tipo: 'recarga', motivo: '', em: agora - 500 },
        { contaId: 'c2', tipo: 'queda', motivo: '', em: agora },
      ],
      'c1',
      agora,
      { onlineDesde: 1, ultimoDado: 2, ramMb: 3, cpuPct: 4 },
    )
    expect(r).toEqual({ quedasHoje: 1, recargasHoje: 1, onlineDesde: 1, ultimoDado: 2, ramMb: 3, cpuPct: 4 })
    expect(inicioDoDia(agora)).toBe(new Date(2026, 10, 26).getTime())
  })

  it('RN-045 RAM e CPU por conta somam página e lives pelo PID', () => {
    const m = metricasPorConta(
      [
        { pid: 1, ramMb: 100, cpuPct: 1 },
        { pid: 2, ramMb: 50, cpuPct: 0.5 },
        { pid: 3, ramMb: 999, cpuPct: 9 },
      ],
      new Map([
        [1, 'c1'],
        [2, 'c1'],
      ]),
    )
    expect(m.get('c1')).toEqual({ ramMb: 150, cpuPct: 1.5 })
    expect(totais([{ pid: 1, ramMb: 1, cpuPct: 2 }])).toEqual({ ramMb: 1, cpuPct: 2 })
  })

  it('RN-163 métricas: por minuto até 48 h, por hora depois, apagadas após 30 dias', () => {
    const agora = 100 * 86_400_000
    const h = 3_600_000
    const linhas: LinhaMetrica[] = [
      { contaId: 'c1', minuto: agora - 31 * 86_400_000, ramMb: 1, cpuPct: 1, estado: 'ativa' },
      { contaId: 'c1', minuto: agora - 72 * h, ramMb: 100, cpuPct: 1, estado: 'ativa' },
      { contaId: 'c1', minuto: agora - 72 * h + 60_000, ramMb: 200, cpuPct: 3, estado: 'economica' },
      { contaId: 'c1', minuto: agora - h, ramMb: 50, cpuPct: 1, estado: 'ativa' },
    ]
    const r = aplicarRetencaoMetricas(linhas, agora)
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ ramMb: 150, cpuPct: 2, estado: 'economica' })
    expect(r[1]!.ramMb).toBe(50)
    expect(eventosParaApagar([{ contaId: 'c', tipo: 'queda', motivo: '', em: 0 }], agora)).toHaveLength(1)
    expect(serieTotal(linhas, agora - 2 * h)).toEqual([{ em: agora - h, ramMb: 50, cpuPct: 1 }])
  })

  it('RN-070 reabre sozinho no máximo 3 vezes em 10 min', () => {
    const agora = 1_000_000
    expect(podeReabrir([], agora)).toBe(true)
    expect(podeReabrir([agora - 1000, agora - 2000], agora)).toBe(true)
    expect(podeReabrir([agora - 1000, agora - 2000, agora - 3000], agora)).toBe(false)
    expect(podeReabrir([agora - 11 * 60_000, agora - 2000, agora - 3000], agora)).toBe(true)
  })
})

describe('trava do cofre', () => {
  it('RN-141 com senha mestra tranca sozinho após 15 min sem uso', () => {
    const r = new RelogioFalso()
    let trancou = 0
    const t = new TravaCofre(
      r,
      () => 15,
      () => true,
      () => trancou++,
    )
    expect(t.aberto()).toBe(false)
    t.destrancar()
    expect(t.aberto()).toBe(true)
    r.avancar(10 * 60_000)
    t.usar()
    r.avancar(10 * 60_000)
    expect(t.aberto()).toBe(true)
    r.avancar(5 * 60_000)
    expect(t.aberto()).toBe(false)
    expect(trancou).toBe(1)
  })

  it('RN-141 sem senha mestra o cofre fica aberto (protegido pelo Windows)', () => {
    const r = new RelogioFalso()
    const t = new TravaCofre(
      r,
      () => 15,
      () => false,
      () => {},
    )
    expect(t.aberto()).toBe(true)
    t.usar()
    r.avancar(60 * 60_000)
    expect(t.aberto()).toBe(true)
  })

  it('RN-143 mostrar senha exige cofre aberto e dura 10 s', () => {
    const r = new RelogioFalso()
    let escondeu = 0
    const t = new TravaCofre(
      r,
      () => 15,
      () => true,
      () => {},
    )
    expect(t.mostrar('c1', () => escondeu++)).toBe(false)
    t.destrancar()
    expect(t.mostrar('c1', () => escondeu++)).toBe(true)
    expect(t.mostrar('c1', () => escondeu++)).toBe(true)
    expect(t.mostrandoAgora('c1')).toBe(true)
    r.avancar(10_000)
    expect(t.mostrandoAgora('c1')).toBe(false)
    expect(escondeu).toBe(1)
    t.mostrar('c2', () => {})
    t.trancar()
    expect(t.mostrandoAgora('c2')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { jogoFalso, montarMotor } from '../falsos/montar-motor.ts'
import { esvaziarPromessas } from '../falsos/relogio.ts'

const ret = (x = 0, largura = 400) => ({ x, y: 0, largura, altura: 300 })

function ligadas(m: ReturnType<typeof montarMotor>, n: number) {
  const contas = Array.from({ length: n }, () => m.novaConta())
  m.motor.ligarGrupo(m.grupoId, true)
  m.relogio.avancar(n * 3000)
  for (const c of contas) m.paginas.de(c.id).ev.carregou(c.url)
  return contas
}

describe('motor: casos de borda', () => {
  it('RN-130 aviso de ping lento e de erro chega à central', async () => {
    const m = montarMotor()
    ligadas(m, 1)
    m.http.medicoes = [
      { ms: 5000, status: 200 },
      { ms: null, status: 0 },
      { ms: null, status: 0 },
      { ms: null, status: 0 },
    ]
    for (let i = 0; i < 4; i++) {
      m.relogio.avancar(5 * 60_000)
      await esvaziarPromessas()
    }
    // Fica no histórico (tipo próprio "ping"), mas por padrão não notifica (RN-111).
    expect(m.armazem.avisos.filter((a) => a.tipo === 'ping').map((a) => a.mensagem)).toHaveLength(2)
    expect(m.locais.notificacoes?.length ?? 0).toBe(0)
    expect(m.eventos.some((e) => e.evento === 'ping.resultado')).toBe(true)
  })

  it('RN-114 Telegram sem chat id ou sem token não envia', async () => {
    const m = montarMotor()
    m.segredos.telegram = 'TK'
    m.motor.alterarConfig('avisos.telegram', true)
    m.motor.avisoDeTeste()
    m.relogio.avancar(10_000)
    await esvaziarPromessas()
    expect(m.http.pedidos).toHaveLength(0)
    expect(await m.motor.testarCanal('telegram')).toEqual({ ok: false, status: 0 })
    expect(m.motor.snapshot().segredos).toEqual({ discord: false, telegram: true })
  })

  it('RN-174 mudar ping, varredura, cofre, queda e lives reagenda na hora', async () => {
    const m = montarMotor()
    const [a] = ligadas(m, 1)
    m.motor.alterarConfig('ping.intervaloMin', 1)
    m.relogio.avancar(60_000)
    await esvaziarPromessas()
    expect(m.armazem.pings).toHaveLength(1)
    m.motor.alterarConfig('avisos.varreduraSeg', 2)
    m.motor.salvarTexto({ texto: 'x', escopo: 'todas', alvoId: null, ativo: true })
    m.paginas.de(a!.id).textosNaTela = ['x']
    m.relogio.avancar(2000)
    await esvaziarPromessas()
    expect(m.armazem.avisos.some((x) => x.tipo === 'texto_vigiado')).toBe(true)
    m.motor.alterarConfig('cofre.trancarAposMin', 5)
    m.motor.alterarConfig('queda.recarregarQuandoCair', false)
    expect(m.paginas.de(a!.id).vigiando).toBe(false)
    m.motor.alterarConfig('queda.avisarSemDadosMin', 5)
    expect(m.paginas.de(a!.id).vigiando).toBe(true)
    m.motor.alterarConfig('lives.economico', false)
  })

  it('RN-064 sem dados chega como aviso e estado com aviso', () => {
    const m = montarMotor()
    m.motor.alterarConfig('queda.avisarSemDadosMin', 1)
    const [a] = ligadas(m, 1)
    m.relogio.avancar(75_000)
    expect(m.armazem.avisos.some((x) => x.tipo === 'sem_dados')).toBe(true)
    expect(m.motor.snapshot().estados[a!.id]!.estado).toBe('com_aviso')
    m.paginas.de(a!.id).ev.dadoRecebido(null)
    expect(m.motor.snapshot().estados[a!.id]!.estado).not.toBe('com_aviso')
  })

  it('RN-061 avisos de queda de várias contas do mesmo jogo são agrupados', () => {
    const m = montarMotor()
    const contas = ligadas(m, 3)
    for (const c of contas) {
      const p = m.paginas.de(c.id)
      p.ev.wsAbriu('w', 'wss://x/ws')
      p.ev.dadoRecebido('w')
      p.ev.wsFechou('w')
    }
    for (const e of [45_000, 120_000, 300_000, 900_000, 900_000]) {
      m.relogio.avancar(e)
      for (const c of contas) m.paginas.de(c.id).ev.carregou(c.url)
    }
    m.relogio.avancar(60_000)
    expect(m.locais.notificacoes.some((n) => n.aviso.mensagem.includes('3 contas'))).toBe(true)
  })

  it('RN-019 desligar uma conta solta devolve a janela', () => {
    const m = montarMotor()
    const [a] = ligadas(m, 1)
    m.motor.soltar(a!.id)
    expect(m.motor.soltar(a!.id)).toBe(false)
    m.motor.definirEspacos('principal', [{ contaId: a!.id, retangulo: ret(), tipo: 'conta' }])
    expect(m.paginas.de(a!.id).exibicao.modo).toBe('fora')
    m.motor.definirDialogo(true)
    m.motor.definirEspacos(`solta:${a!.id}`, [{ contaId: a!.id, retangulo: ret(), tipo: 'conta' }])
    expect(m.paginas.de(a!.id).exibicao.modo).toBe('viva')
    m.motor.desligarConta(a!.id)
    expect(m.devolvidas).toEqual([a!.id])
    m.motor.devolvida('x')
  })

  it('RN-045 miniaturas do Painel são só foto e atualizam a cada 10 s', async () => {
    const m = montarMotor()
    const [a] = ligadas(m, 1)
    m.motor.definirPainelAberto(true)
    m.motor.definirEspacos('principal', [
      { contaId: a!.id, retangulo: ret(), tipo: 'miniatura' },
      { contaId: a!.id, retangulo: ret(), tipo: 'miniatura' },
      { contaId: 'nao-existe', retangulo: ret(), tipo: 'conta' },
    ])
    const p = m.paginas.de(a!.id)
    expect(p.exibicao.modo).toBe('foto')
    const antes = p.capturas
    m.relogio.avancar(10_000)
    await esvaziarPromessas()
    expect(p.capturas - antes).toBe(1)
    m.motor.definirEspacos('principal', [{ contaId: a!.id, retangulo: ret(0, 0), tipo: 'miniatura' }])
    expect(await m.motor.capturarFoto(a!.id)).toBe(false)
  })

  it('RN-016 RN-036 operações com ids desconhecidos não quebram', async () => {
    const m = montarMotor()
    expect(m.motor.editarConta('x', { nome: 'a' })).toBe(false)
    expect(m.motor.editarConta('x', { jogoId: 'nada' })).toBe(false)
    expect(m.motor.ligarGrupo('x', true)).toEqual({ ok: true, valor: { ligadas: 0 } })
    m.motor.definirPolitica('x', 'falso', 'manter')
    m.motor.ligarConta('x')
    m.motor.desligarConta('x')
    m.motor.ativar('x')
    m.motor.telaCheia()
    m.motor.abrirDevtools('x')
    await m.motor.limparCache('x')
    expect(await m.motor.fotosDe(['x'])).toEqual([])
    expect(m.motor.recarregar('x', false)).toBe(false)
    m.motor.entrarNaLive('x')
    m.motor.esconderLive('x')
    expect(m.motor.mostrarLive('x', false)).toBe(false)
    expect((await m.motor.lote(['x'], 'recarregar')).ok).toBe(true)
  })

  it('RN-013 RN-014 editar URL recarrega na nova; editar jogo valida', () => {
    const m = montarMotor({ jogos: [jogoFalso, { ...jogoFalso, id: 'outro', nome: 'Outro' }] })
    const [a] = ligadas(m, 1)
    m.motor.editarConta(a!.id, { url: 'https://jogo.test/novo' })
    expect(m.paginas.de(a!.id).carregamentos.at(-1)).toBe('https://jogo.test/novo')
    expect(m.motor.editarConta(a!.id, { jogoId: 'outro', som: false })).toBe(true)
    expect(m.paginas.de(a!.id).mudo).toBe(true)
  })

  it('RN-031 trocar de grupo acima do limite pede confirmação', () => {
    const m = montarMotor({ jogos: [{ ...jogoFalso, limiteContas: 1 }] })
    const b = m.motor.criarGrupo('B')
    m.novaConta({ grupoId: b.id })
    m.novaConta({ grupoId: b.id })
    expect(m.motor.trocarGrupo(b.id).ok).toBe(false)
    expect(m.motor.trocarGrupo(b.id, true).ok).toBe(true)
  })

  it('RN-063 RN-180 zoom em lote sem valor usa o da primeira conta', async () => {
    const m = montarMotor()
    const [a, b] = ligadas(m, 2)
    m.motor.editarConta(a!.id, { zoom: 1.5 })
    await m.motor.lote([a!.id, b!.id], 'zoom')
    expect(m.paginas.de(b!.id).zoom).toBe(1.5)
  })

  it('RN-142 preencher usa os seletores ensinados ou os do catálogo', async () => {
    const m = montarMotor()
    const [a] = ligadas(m, 1)
    m.cofre.logins.set(a!.id, { usuario: 'u', senha: 's', seletores: { usuario: '#x', senha: '#y' } })
    expect((await m.motor.preencherLogin([a!.id])).preenchidas).toEqual([a!.id])
  })

  it('RN-091 live da Kick pedindo login usa o nome da plataforma', async () => {
    const m = montarMotor()
    const [a] = ligadas(m, 1)
    m.motor.adicionarLive(a!.id, 'kick', 'k')
    m.lives.abertas()[0]!.estadoLido = { aoVivo: false, offline: false, pedeLogin: true, tocando: false }
    await m.motor.lerLives()
    expect(m.armazem.avisos.at(-1)!.mensagem).toContain('Kick')
  })

  it('RN-088 RN-089 avisos de live encerrada e voltou', async () => {
    const m = montarMotor()
    m.motor.alterarConfig('lives.religar', true)
    const [a] = ligadas(m, 1)
    m.motor.adicionarLive(a!.id, 'twitch', 'c')
    m.lives.abertas()[0]!.estadoLido = { aoVivo: false, offline: true, pedeLogin: false, tocando: false }
    await m.motor.lerLives()
    expect(m.armazem.avisos.at(-1)!.mensagem).toContain('encerrou')
    m.relogio.avancar(2 * 3_600_000)
    m.lives.abertas()[0]!.ev.carregou('x')
    m.relogio.avancar(20_000)
    await esvaziarPromessas()
    expect(m.armazem.avisos.at(-1)!.mensagem).toContain('voltou')
  })

  it('RN-163 a retenção roda a cada hora', () => {
    const m = montarMotor()
    m.armazem.metricas.push({ contaId: 'x', minuto: 0, ramMb: 1, cpuPct: 1, estado: 'ativa' })
    m.relogio.avancar(3_600_000)
    expect(m.armazem.metricas).toHaveLength(0)
  })
})

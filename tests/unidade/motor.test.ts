import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../../src/shared/ipc/contrato.ts'
import { jogoFalso, montarMotor } from '../falsos/montar-motor.ts'
import { esvaziarPromessas } from '../falsos/relogio.ts'

const ret = (x = 0) => ({ x, y: 0, largura: 400, altura: 300 })

function ligarTudo(m: ReturnType<typeof montarMotor>, n = 3) {
  const contas = Array.from({ length: n }, (_, i) => m.novaConta({ nome: `C${i}` }))
  const r = m.motor.ligarGrupo(m.grupoId, true)
  expect(r.ok).toBe(true)
  m.relogio.avancar(n * 3000)
  for (const c of contas) m.paginas.de(c.id).ev.carregou(c.url)
  return contas
}

const ultimoSnapshot = (m: ReturnType<typeof montarMotor>) => {
  m.relogio.avancar(50)
  return [...m.eventos].reverse().find((e) => e.evento === 'estado')!.dados as Snapshot
}

describe('motor: grupos e contas', () => {
  it('RN-030 grupo desligado não tem nenhuma conta na memória', () => {
    const m = montarMotor()
    const contas = ligarTudo(m)
    expect(m.motor.contasLigadas()).toBe(3)
    m.motor.ligarGrupo(m.grupoId, false)
    expect(m.motor.contasLigadas()).toBe(0)
    for (const c of contas) expect(m.paginas.de(c.id).fechada).toBe(true)
  })

  it('RN-032 ligar um grupo abre uma conta a cada 3 s', () => {
    const m = montarMotor()
    for (let i = 0; i < 3; i++) m.novaConta()
    m.motor.ligarGrupo(m.grupoId, true)
    m.relogio.avancar(0)
    expect(m.motor.contasLigadas()).toBe(1)
    expect(m.motor.pendentesDeLigar()).toHaveLength(2)
    m.relogio.avancar(3000)
    expect(m.motor.contasLigadas()).toBe(2)
    m.relogio.avancar(3000)
    expect(m.motor.contasLigadas()).toBe(3)
    expect(ultimoSnapshot(m).estados[m.motor.listarContas()[0]!.id]!.estado).toBe('carregando')
  })

  it('RN-031 trocar para outro grupo desliga o atual e liga o novo aos poucos', () => {
    const m = montarMotor()
    ligarTudo(m, 2)
    const b = m.motor.criarGrupo('B')
    const cb = [m.novaConta({ grupoId: b.id }), m.novaConta({ grupoId: b.id })]
    m.motor.trocarGrupo(b.id)
    m.relogio.avancar(0)
    expect(m.motor.idsLigadas()).toEqual([cb[0]!.id])
    m.relogio.avancar(3000)
    expect(m.motor.idsLigadas().sort()).toEqual(cb.map((c) => c.id).sort())
    expect(m.motor.listarGrupos().find((g) => g.id === m.grupoId)!.ligado).toBe(false)
    expect(ultimoSnapshot(m).grupoAtualId).toBe(b.id)
  })

  it('RN-033 ao abrir, restaura os grupos que estavam ligados', () => {
    const m = montarMotor()
    ligarTudo(m, 1)
    const m2 = montarMotor()
    // Mesmo armazém e config: simula reabrir o app.
    for (const g of m.armazem.listarGrupos()) m2.armazem.salvarGrupo(g)
    for (const c of m.armazem.listarContas()) m2.armazem.salvarConta(c)
    m2.motor.encerrar()
    m2.motor.iniciar()
    m2.relogio.avancar(3000)
    expect(m2.motor.contasLigadas()).toBe(1)
  })

  it('RN-034 avisa e pede confirmação quando passa do limite do jogo; não impede', () => {
    const m = montarMotor({ jogos: [{ ...jogoFalso, limiteContas: 1 }] })
    m.novaConta()
    m.novaConta()
    const r = m.motor.ligarGrupo(m.grupoId, true)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro.excessos[0]).toMatchObject({ limite: 1, total: 2 })
    expect(m.motor.ligarGrupo(m.grupoId, true, true).ok).toBe(true)
    m.relogio.avancar(6000)
    expect(m.motor.contasLigadas()).toBe(2)
    expect(m.armazem.avisos.some((a) => a.tipo === 'limite_contas')).toBe(true)
  })

  it('RN-035 o grupo lembra visão e divisão', () => {
    const m = montarMotor()
    expect(m.motor.definirLayout(m.grupoId, 'foco', { divisao: '2x2', proporcao169: true })).toBe(true)
    const g = m.armazem.grupos.get(m.grupoId)!
    expect(g.visao).toBe('foco')
    expect(g.layout).toMatchObject({ divisao: '2x2', proporcao169: true })
    expect(m.motor.definirLayout('x', 'grade')).toBe(false)
    expect(m.motor.definirLayout(m.grupoId, 'grade', { divisao: 'zzz' as never })).toBe(false)
  })

  it('RN-036 mover conta para grupo desligado a desliga; para ligado a liga', () => {
    const m = montarMotor()
    const [c] = ligarTudo(m, 1)
    const b = m.motor.criarGrupo('B')
    expect(m.motor.moverConta(c!.id, b.id, 0)).toBe(true)
    expect(m.motor.contasLigadas()).toBe(0)
    m.motor.ligarGrupo(b.id, true)
    m.relogio.avancar(0)
    m.motor.moverConta(c!.id, m.grupoId, 0)
    expect(m.motor.moverConta('x', b.id, 0)).toBe(false)
    m.motor.reordenarGrupos([b.id, m.grupoId])
    expect(m.motor.listarGrupos().find((g) => g.id === b.id)!.ordem).toBe(0)
  })

  it('RN-015 apagar a conta apaga a sessão dela do disco, mesmo sem marcar', async () => {
    const m = montarMotor()
    const [c] = ligarTudo(m, 1)
    m.cofre.logins.set(c!.id, { usuario: 'u', senha: 's', seletores: null })
    await m.motor.apagarConta(c!.id, false)
    expect(m.paginas.sessoesApagadas).toEqual([c!.id])
    expect(m.cofre.logins.has(c!.id)).toBe(false)
    expect(m.motor.listarContas()).toEqual([])
    expect(await m.motor.apagarConta('x', true)).toBe(false)
  })

  it('RN-016 duplicar configuração cria conta nova com sessão nova', () => {
    const m = montarMotor()
    const [c] = ligarTudo(m, 1)
    m.motor.editarConta(c!.id, { zoom: 0.75 })
    const d = m.motor.duplicar(c!.id)!
    expect(d.id).not.toBe(c!.id)
    expect(d.zoom).toBe(0.75)
    expect(d.nome).toContain('cópia')
    m.relogio.avancar(3000)
    expect(m.paginas.de(d.id)).not.toBe(m.paginas.de(c!.id))
    expect(m.motor.duplicar('x')).toBeNull()
  })

  it('RN-019 conta solta continua a mesma página e volta ao grupo ao fechar', () => {
    const m = montarMotor()
    const [c] = ligarTudo(m, 1)
    const pagina = m.paginas.de(c!.id)
    expect(m.motor.soltar(c!.id)).toBe(true)
    expect(m.soltas).toEqual([c!.id])
    m.motor.definirEspacos(`solta:${c!.id}`, [{ contaId: c!.id, retangulo: ret(), tipo: 'conta' }])
    expect(pagina.exibicao).toMatchObject({ modo: 'viva', janela: `solta:${c!.id}` })
    expect(pagina.carregamentos).toHaveLength(1)
    m.motor.devolvida(c!.id)
    expect(m.paginas.de(c!.id)).toBe(pagina)
    expect(m.motor.soltar('x')).toBe(false)
  })

  it('RN-012 adicionar conta exige grupo e jogo válidos e liga se o grupo estiver ligado', () => {
    const m = montarMotor()
    m.motor.ligarGrupo(m.grupoId, true)
    m.novaConta()
    m.relogio.avancar(0)
    expect(m.motor.contasLigadas()).toBe(1)
    expect(m.motor.adicionarConta({ grupoId: 'x', jogoId: 'falso', url: 'https://a.b/' }).ok).toBe(false)
  })

  it('RN-018 recarregar volta à URL cadastrada se a página saiu do domínio', () => {
    const m = montarMotor()
    const [c] = ligarTudo(m, 1)
    const p = m.paginas.de(c!.id)
    p.url = 'https://anuncio.com/'
    m.motor.recarregar(c!.id, false)
    expect(p.carregamentos.at(-1)).toBe(c!.url)
    p.ev.carregou(c!.url)
    p.url = 'https://jogo.test/fase2'
    m.motor.recarregar(c!.id, false)
    expect(p.recargas.at(-1)).toEqual({ semCache: false })
    p.ev.carregou(c!.url)
    m.motor.recarregar(c!.id, true)
    expect(p.recargas.at(-1)).toEqual({ semCache: true })
    expect(m.motor.recarregar(c!.id, false)).toBe(false)
  })
})

describe('motor: exibição e economia', () => {
  it('RN-043 RN-052 só a ativa fica ao vivo; as outras visíveis viram foto', () => {
    const m = montarMotor()
    const [a, b] = ligarTudo(m, 2)
    m.motor.definirEspacos('principal', [
      { contaId: a!.id, retangulo: ret(0), tipo: 'conta' },
      { contaId: b!.id, retangulo: ret(400), tipo: 'conta' },
    ])
    m.motor.ativar(a!.id)
    expect(m.paginas.de(a!.id).exibicao.modo).toBe('viva')
    expect(m.paginas.de(b!.id).exibicao.modo).toBe('foto')
    m.motor.ativar(b!.id)
    expect(m.paginas.de(a!.id).exibicao.modo).toBe('foto')
    expect(m.paginas.de(b!.id).exibicao.modo).toBe('viva')
    expect(ultimoSnapshot(m).ativaId).toBe(b!.id)
  })

  it('RN-052 a foto é atualizada a cada 1 s e continua farmando (sem estrangular)', async () => {
    const m = montarMotor()
    const [a, b] = ligarTudo(m, 2)
    m.motor.definirEspacos('principal', [
      { contaId: a!.id, retangulo: ret(0), tipo: 'conta' },
      { contaId: b!.id, retangulo: ret(400), tipo: 'conta' },
    ])
    m.motor.ativar(a!.id)
    const pb = m.paginas.de(b!.id)
    const antes = pb.capturas
    m.relogio.avancar(5_000)
    await esvaziarPromessas()
    expect(pb.capturas - antes).toBeGreaterThanOrEqual(4)
    expect(pb.estrangulada).toBe(false)
    expect(m.eventos.some((e) => e.evento === 'conta.foto')).toBe(true)
  })

  it('RN-052 com o modo econômico desligado todas ficam ao vivo', () => {
    const m = montarMotor()
    const [a, b] = ligarTudo(m, 2)
    m.motor.alterarConfig('economia.modoEconomico', false)
    m.motor.definirEspacos('principal', [
      { contaId: a!.id, retangulo: ret(0), tipo: 'conta' },
      { contaId: b!.id, retangulo: ret(400), tipo: 'conta' },
    ])
    expect(m.paginas.de(b!.id).exibicao.modo).toBe('viva')
    m.motor.alternarEconomia()
    // RN-043: a última conta criada é a ativa e continua ao vivo; a outra vira foto.
    expect(m.paginas.de(b!.id).exibicao.modo).toBe('viva')
    expect(m.paginas.de(a!.id).exibicao.modo).toBe('foto')
  })

  it('RN-053 clicar numa foto põe ao vivo; volta a ser foto depois de X s sem mexer', () => {
    const m = montarMotor()
    const [a] = ligarTudo(m, 1)
    m.motor.alterarConfig('economia.voltarAFotoSeg', 30)
    m.motor.definirEspacos('principal', [{ contaId: a!.id, retangulo: ret(), tipo: 'conta' }])
    m.motor.ativar(a!.id)
    expect(m.paginas.de(a!.id).exibicao.modo).toBe('viva')
    m.relogio.avancar(35_000)
    expect(m.paginas.de(a!.id).exibicao.modo).toBe('foto')
    m.motor.ativar(a!.id)
    expect(m.paginas.de(a!.id).exibicao.modo).toBe('viva')
    m.motor.usou(a!.id)
    m.motor.usou('x')
  })

  it('RN-054 sem espaço na tela não tira foto', async () => {
    const m = montarMotor()
    const [a, b] = ligarTudo(m, 2)
    m.motor.definirEspacos('principal', [
      { contaId: a!.id, retangulo: ret(), tipo: 'conta' },
      { contaId: b!.id, retangulo: null, tipo: 'conta' },
    ])
    m.motor.ativar(a!.id)
    const pb = m.paginas.de(b!.id)
    m.relogio.avancar(10_000)
    await esvaziarPromessas()
    expect(pb.capturas).toBe(0)
    expect(pb.exibicao.modo).toBe('fora')
    expect(await m.motor.capturarFoto(b!.id)).toBe(false)
  })

  it('RN-044 com um diálogo aberto as contas viram foto e continuam rodando', () => {
    const m = montarMotor()
    const [a] = ligarTudo(m, 1)
    m.motor.definirEspacos('principal', [{ contaId: a!.id, retangulo: ret(), tipo: 'conta' }])
    m.motor.ativar(a!.id)
    m.motor.definirDialogo(true)
    const p = m.paginas.de(a!.id)
    expect(p.exibicao.modo).toBe('foto')
    expect(p.fechada).toBe(false)
    expect(p.estrangulada).toBe(false)
    m.motor.definirDialogo(false)
    expect(p.exibicao.modo).toBe('viva')
  })

  it('RN-050 RN-051 fora da tela: Manter farmando segue a 100%; Economizar deixa desacelerar', () => {
    const m = montarMotor()
    const [a] = ligarTudo(m, 1)
    m.motor.definirEspacos('principal', [])
    const p = m.paginas.de(a!.id)
    expect(p.exibicao.modo).toBe('fora')
    expect(p.estrangulada).toBe(false)
    m.motor.definirPolitica(m.grupoId, 'falso', 'economizar')
    expect(p.estrangulada).toBe(true)
    m.motor.editarConta(a!.id, { politicaForaTela: 'manter' })
    expect(p.estrangulada).toBe(false)
  })

  it('RN-055 impede o PC de dormir só com contas ligadas e a opção ligada', () => {
    const m = montarMotor()
    expect(m.sistema.acordado).toBe(false)
    ligarTudo(m, 1)
    expect(m.sistema.acordado).toBe(true)
    m.motor.alterarConfig('geral.impedirDormir', false)
    expect(m.sistema.acordado).toBe(false)
    m.motor.alterarConfig('geral.impedirDormir', true)
    m.motor.ligarGrupo(m.grupoId, false)
    expect(m.sistema.acordado).toBe(false)
  })

  it('RN-100 som só da conta ativa', () => {
    const m = montarMotor()
    const [a, b] = ligarTudo(m, 2)
    m.motor.alterarConfig('som.modo', 'ativa')
    m.motor.ativar(a!.id)
    expect(m.paginas.de(a!.id).mudo).toBe(false)
    expect(m.paginas.de(b!.id).mudo).toBe(true)
    m.motor.silenciar(true)
    expect(m.paginas.de(a!.id).mudo).toBe(true)
  })

  it('RN-174 mudar a configuração vale na hora e é gravada', () => {
    const m = montarMotor()
    const antes = m.configArquivo.gravacoes
    expect(m.motor.alterarConfig('queda.esperaQuedaSeg', 90).ok).toBe(true)
    expect(m.configArquivo.atual.queda.esperaQuedaSeg).toBe(90)
    expect(m.configArquivo.gravacoes).toBe(antes + 1)
    expect(m.motor.alterarConfig('queda.esperaQuedaSeg', 1).ok).toBe(false)
    m.motor.redefinirConfig()
    expect(m.motor.obterConfig().queda.esperaQuedaSeg).toBe(45)
  })
})

describe('motor: saúde, avisos e lote', () => {
  it('RN-060 RN-069 queda da conexão principal recarrega e fica no histórico', () => {
    const m = montarMotor()
    const [a] = ligarTudo(m, 1)
    const p = m.paginas.de(a!.id)
    p.ev.wsAbriu('w', 'wss://jogo.test/ws')
    p.ev.dadoRecebido('w')
    p.ev.wsFechou('w')
    expect(ultimoSnapshot(m).estados[a!.id]!.estado).toBe('caida')
    m.relogio.avancar(45_000)
    expect(p.recargas).toHaveLength(1)
    expect(m.armazem.eventos.map((e) => e.tipo)).toEqual(['queda', 'recarga'])
    expect(ultimoSnapshot(m).estados[a!.id]!.estado).toBe('recarregando')
  })

  it('RN-061 depois de 4 falhas avisa que a conta caiu e não voltou', () => {
    const m = montarMotor()
    const [a] = ligarTudo(m, 1)
    const p = m.paginas.de(a!.id)
    p.ev.wsAbriu('w', 'wss://x/ws')
    p.ev.dadoRecebido('w')
    p.ev.wsFechou('w')
    for (const e of [45_000, 120_000, 300_000, 900_000, 900_000]) {
      m.relogio.avancar(e)
      p.ev.carregou(p.url)
    }
    m.relogio.avancar(3_600_000)
    expect(m.armazem.avisos.some((x) => x.tipo === 'caiu')).toBe(true)
    expect(ultimoSnapshot(m).estados[a!.id]!.falhas).toBe(4)
  })

  it('RN-063 ao acordar o PC recarrega as contas ligadas aos poucos, depois que a internet volta', () => {
    const m = montarMotor()
    const contas = ligarTudo(m, 2)
    m.rede.ligada = false
    m.motor.aoAcordar()
    m.relogio.avancar(20_000)
    expect(contas.every((c) => m.paginas.de(c.id).recargas.length === 0)).toBe(true)
    m.rede.ligada = true
    m.relogio.avancar(10_000)
    expect(m.paginas.de(contas[0]!.id).recargas.length + m.paginas.de(contas[1]!.id).recargas.length).toBe(1)
    m.relogio.avancar(3000)
    expect(contas.every((c) => m.paginas.de(c.id).recargas.length === 1)).toBe(true)
    m.motor.alterarConfig('queda.recarregarAoAcordar', false)
    m.motor.aoAcordar()
  })

  it('RN-067 RN-111 sem internet: avisa depois de 5 min e recarrega só as que caíram quando volta', () => {
    const m = montarMotor()
    const [a, b] = ligarTudo(m, 2)
    const pa = m.paginas.de(a!.id)
    m.rede.ligada = false
    pa.ev.falhouCarregar(-106, 'ERR_INTERNET_DISCONNECTED')
    m.relogio.avancar(5 * 60_000 + 10_000)
    expect(m.armazem.avisos.some((x) => x.tipo === 'sem_internet')).toBe(true)
    m.rede.ligada = true
    m.relogio.avancar(10_000)
    expect(pa.carregamentos.length + pa.recargas.length).toBe(2)
    expect(m.paginas.de(b!.id).recargas).toHaveLength(0)
  })

  it('RN-065 RN-066 travou e fechou sozinha avisam', () => {
    const m = montarMotor()
    const [a] = ligarTudo(m, 1)
    const p = m.paginas.de(a!.id)
    p.ev.travou()
    expect(ultimoSnapshot(m).estados[a!.id]!.estado).toBe('travada')
    m.relogio.avancar(30_000)
    expect(p.recargas).toHaveLength(1)
    p.ev.carregou(p.url)
    p.ev.processoMorreu('crashed')
    m.relogio.avancar(45_000)
    expect(m.armazem.eventos.some((e) => e.tipo === 'fechou' && e.motivo === 'crashed')).toBe(true)
    expect(m.armazem.avisos.filter((x) => x.tipo === 'travou')).toHaveLength(2)
  })

  it('RN-068 site fora do ar avisa', () => {
    const m = montarMotor()
    const [a] = ligarTudo(m, 1)
    m.paginas.de(a!.id).ev.statusPrincipal(503)
    expect(m.armazem.avisos.some((x) => x.tipo === 'site_fora')).toBe(true)
    expect(ultimoSnapshot(m).estados[a!.id]!.estado).toBe('erro')
  })

  it('RN-120 RN-123 texto vigiado avisa uma vez e de novo só depois de sumir', async () => {
    const m = montarMotor()
    const [a] = ligarTudo(m, 1)
    m.motor.salvarTexto({ texto: 'Verificação', escopo: 'todas', alvoId: null, ativo: true })
    const p = m.paginas.de(a!.id)
    p.textosNaTela = ['por favor faça a verificacao']
    await m.motor.varrer()
    await m.motor.varrer()
    expect(m.armazem.avisos.filter((x) => x.tipo === 'texto_vigiado')).toHaveLength(1)
    expect(ultimoSnapshot(m).estados[a!.id]!.estado).toBe('com_aviso')
    p.textosNaTela = []
    await m.motor.varrer()
    expect(ultimoSnapshot(m).estados[a!.id]!.estado).not.toBe('com_aviso')
    p.textosNaTela = ['VERIFICACAO']
    await m.motor.varrer()
    expect(m.armazem.avisos.filter((x) => x.tipo === 'texto_vigiado')).toHaveLength(2)
    const t = m.motor.snapshot().textos[0]!
    m.motor.apagarTexto(t.id)
    expect(m.motor.snapshot().textos).toEqual([])
  })

  it('RN-122 a varredura roda a cada 5 s e inclui contas em foto ou fora da tela', async () => {
    const m = montarMotor()
    const [a] = ligarTudo(m, 1)
    m.motor.definirEspacos('principal', [])
    m.motor.salvarTexto({ texto: 'captcha', escopo: 'conta', alvoId: a!.id, ativo: true })
    m.paginas.de(a!.id).textosNaTela = ['captcha']
    m.relogio.avancar(5000)
    await esvaziarPromessas()
    expect(m.armazem.avisos.some((x) => x.tipo === 'texto_vigiado')).toBe(true)
  })

  it('RN-111 login pedido avisa quando o formulário do catálogo aparece', async () => {
    const m = montarMotor()
    const [a] = ligarTudo(m, 1)
    m.paginas.de(a!.id).seletoresExistentes.add('#form-login')
    await m.motor.varrer()
    await m.motor.varrer()
    expect(m.armazem.avisos.filter((x) => x.tipo === 'login_pedido')).toHaveLength(1)
    m.paginas.de(a!.id).seletoresExistentes.clear()
    await m.motor.varrer()
  })

  it('RN-114 Discord e Telegram funcionam com o cofre trancado', async () => {
    const m = montarMotor()
    m.segredos.discord = 'https://discord.test/api/webhooks/1/x'
    m.segredos.telegram = 'TOKEN'
    m.motor.alterarConfig('avisos.discord', true)
    m.motor.alterarConfig('avisos.telegram', true)
    m.motor.alterarConfig('avisos.telegramChatId', '123')
    m.cofre.trancado = true
    m.motor.avisoDeTeste()
    m.relogio.avancar(10_000)
    await esvaziarPromessas()
    expect(m.http.pedidos.map((p) => p.url)).toEqual([
      'https://discord.test/api/webhooks/1/x',
      'https://api.telegram.org/botTOKEN/sendMessage',
    ])
    expect(await m.motor.testarCanal('discord')).toEqual({ ok: true, status: 204 })
  })

  it('RN-112 avisos não lidos, marcar como lidos e listar', () => {
    const m = montarMotor()
    m.motor.avisoDeTeste()
    expect(ultimoSnapshot(m).naoLidos).toBe(1)
    m.motor.marcarAvisosLidos()
    expect(m.motor.snapshot().naoLidos).toBe(0)
    expect(m.motor.listarAvisos(10)).toHaveLength(1)
    m.motor.pausarAvisos(1000)
    expect(m.motor.snapshot().avisosPausados).toBe(true)
  })

  it('RN-056 limite de memória recarrega a conta e avisa', () => {
    const m = montarMotor()
    const [a] = ligarTudo(m, 1)
    m.motor.alterarConfig('otimizacao.limiteMemoriaMB', 1024)
    m.sistema.ms = [{ pid: m.paginas.de(a!.id).meuPid, ramMb: 2000, cpuPct: 5 }]
    const ev = m.motor.coletarMetricas()
    expect(ev.porConta[a!.id]).toEqual({ ramMb: 2000, cpuPct: 5 })
    expect(m.paginas.de(a!.id).recargas).toHaveLength(1)
    expect(m.armazem.avisos.some((x) => x.tipo === 'memoria')).toBe(true)
    expect(m.armazem.metricas).toHaveLength(1)
    expect(m.motor.metricasAtuais()).toBe(ev)
  })

  it('RN-045 dados do Painel trazem quedas, recargas, ping e séries', () => {
    const m = montarMotor()
    const [a] = ligarTudo(m, 1)
    m.motor.recarregar(a!.id, false)
    m.motor.definirPainelAberto(true)
    m.sistema.ms = [{ pid: m.paginas.de(a!.id).meuPid, ramMb: 300, cpuPct: 2 }]
    m.relogio.avancar(5000)
    const d = m.motor.dadosDoPainel()
    expect(d.contas[a!.id]!.recargasHoje).toBe(1)
    expect(d.serie24h.length).toBeGreaterThan(0)
    expect(d.ping.falso).toBeDefined()
    m.motor.definirPainelAberto(false)
  })

  it('RN-130 ping mede os jogos com conta ligada', async () => {
    const m = montarMotor()
    ligarTudo(m, 1)
    m.relogio.avancar(5 * 60_000)
    await esvaziarPromessas()
    expect(m.armazem.pings).toHaveLength(1)
  })

  it('RN-142 preencher login só preenche (nunca envia) e respeita o cofre trancado', async () => {
    const m = montarMotor()
    const [a, b] = ligarTudo(m, 2)
    m.cofre.logins.set(a!.id, { usuario: 'eu', senha: 'segredo', seletores: null })
    const r = await m.motor.preencherLogin([a!.id, b!.id])
    expect(r).toEqual({ preenchidas: [a!.id], semLogin: [b!.id], semCampos: [] })
    expect(m.paginas.de(a!.id).campos).toEqual({ usuario: 'eu', senha: 'segredo' })
    expect(m.paginas.de(a!.id).enviou).toBe(false)
    m.paginas.de(a!.id).temCampos = false
    expect((await m.motor.preencherLogin([a!.id])).semCampos).toEqual([a!.id])
    m.cofre.senhaMestra = true
    expect((await m.motor.preencherLogin([a!.id])).semLogin).toEqual([a!.id])
  })

  it('RN-143 mostrar senha exige cofre aberto e some depois de 10 s', () => {
    const m = montarMotor()
    const [a] = ligarTudo(m, 1)
    m.cofre.logins.set(a!.id, { usuario: 'eu', senha: 'segredo', seletores: null })
    let escondeu = false
    expect(m.motor.mostrarSenha(a!.id, () => (escondeu = true))).toBe('segredo')
    m.relogio.avancar(10_000)
    expect(escondeu).toBe(true)
    expect(m.motor.mostrarSenha('x', () => {})).toBeNull()
    m.cofre.senhaMestra = true
    expect(m.motor.cofreAberto()).toBe(false)
    m.motor.cofreDestrancado()
    expect(m.motor.cofreAberto()).toBe(true)
    m.motor.usarCofre()
    m.motor.trancarCofre()
    expect(m.cofre.trancado).toBe(true)
  })

  it('RN-180 RN-181 ações em lote: recarregar escalonado, silenciar, zoom, política, mover, lives', async () => {
    const m = montarMotor()
    const contas = ligarTudo(m, 3)
    const ids = contas.map((c) => c.id)
    await m.motor.lote(ids, 'recarregar')
    m.relogio.avancar(0)
    expect(contas.filter((c) => m.paginas.de(c.id).recargas.length > 0)).toHaveLength(1)
    m.relogio.avancar(6000)
    expect(contas.filter((c) => m.paginas.de(c.id).recargas.length > 0)).toHaveLength(3)
    expect(m.eventos.some((e) => e.evento === 'lote.progresso')).toBe(true)
    await m.motor.lote(ids, 'silenciar')
    expect(m.motor.listarContas().every((c) => !c.som)).toBe(true)
    await m.motor.lote(ids, 'ativarSom')
    await m.motor.lote(ids, 'zoom', { zoom: 0.5 })
    expect(contas.every((c) => m.paginas.de(c.id).zoom === 0.5)).toBe(true)
    await m.motor.lote(ids, 'economizar')
    expect(m.motor.listarContas().every((c) => c.politicaForaTela === 'economizar')).toBe(true)
    await m.motor.lote(ids, 'manter')
    await m.motor.lote(ids, 'economiaDesligar')
    expect(m.motor.obterConfig().economia.modoEconomico).toBe(false)
    await m.motor.lote(ids, 'economiaLigar')
    await m.motor.lote(ids, 'limparCache')
    expect(contas.every((c) => m.paginas.de(c.id).cacheLimpo === 1)).toBe(true)
    await m.motor.lote(ids, 'recarregarSemCache')
    await m.motor.lote(ids, 'preencher')
    await m.motor.lote(ids, 'fotos')
    expect((await m.motor.fotosDe(ids)).length).toBe(3)
    const b = m.motor.criarGrupo('B')
    expect((await m.motor.lote(ids, 'mover')).ok).toBe(false)
    await m.motor.lote([ids[0]!], 'mover', { grupoId: b.id })
    expect(m.motor.conta(ids[0]!)!.grupoId).toBe(b.id)
    await m.motor.lote(ids, 'desligar')
    expect(m.motor.contasLigadas()).toBe(0)
    await m.motor.lote(ids, 'ligar')
    m.relogio.avancar(30000)
    expect(m.motor.contasLigadas()).toBe(3)
    m.motor.adicionarLive(ids[1]!, 'twitch', 'canal')
    await m.motor.lote(ids, 'livesDesligar')
    expect(m.lives.abertas()).toHaveLength(0)
    await m.motor.lote(ids, 'livesLigar')
    expect(m.lives.abertas()).toHaveLength(1)
  })

  it('RN-034 lote "ligar" também pede confirmação acima do limite', async () => {
    const m = montarMotor({ jogos: [{ ...jogoFalso, limiteContas: 1 }] })
    const a = m.novaConta()
    const b = m.novaConta()
    const r = await m.motor.lote([a.id, b.id], 'ligar')
    expect(r.ok).toBe(false)
    expect((await m.motor.lote([a.id, b.id], 'ligar', { confirmado: true })).ok).toBe(true)
  })
})

describe('motor: lives, jogos e grupos', () => {
  it('RN-080 RN-086 lives da conta abrem com a conta ligada e respeitam o limite', () => {
    const m = montarMotor()
    const [a] = ligarTudo(m, 1)
    m.motor.alterarConfig('lives.porConta', 1)
    const l1 = m.motor.adicionarLive(a!.id, 'twitch', '@Canal_1')
    expect(l1.ok && l1.valor.canal).toBe('Canal_1')
    const l2 = m.motor.adicionarLive(a!.id, 'kick', 'outro')
    expect(m.lives.abertas()).toHaveLength(1)
    if (l2.ok) {
      m.motor.ligarLive(l2.valor.id, false)
      expect(m.motor.ligarLive(l2.valor.id, true)).toEqual({ ok: false, erro: 'limite' })
    }
    expect(m.motor.adicionarLive(a!.id, 'kick', 'nome com espaço').ok).toBe(false)
    expect(m.motor.adicionarLive('x', 'kick', 'a').ok).toBe(false)
    expect(m.motor.ligarLive('x', true).ok).toBe(false)
    m.motor.ligarGrupo(m.grupoId, false)
    expect(m.lives.abertas()).toHaveLength(0)
  })

  it('RN-083 RN-091 mostrar, esconder, entrar na Twitch e ler o estado', async () => {
    const m = montarMotor()
    const [a] = ligarTudo(m, 1)
    const l = m.motor.adicionarLive(a!.id, 'twitch', 'canal')
    if (!l.ok) throw new Error()
    expect(m.motor.mostrarLive(l.valor.id, false)).toBe(true)
    m.motor.esconderLive(l.valor.id)
    m.motor.entrarNaLive(l.valor.id)
    expect(m.lives.logins).toEqual([l.valor.id])
    m.lives.abertas()[0]!.estadoLido = { aoVivo: false, offline: false, pedeLogin: true, tocando: false }
    await m.motor.lerLives()
    expect(m.motor.snapshot().livesEstado[l.valor.id]).toBe('pede_login')
    expect(m.armazem.avisos.some((x) => x.tipo === 'login_pedido')).toBe(true)
    m.motor.removerLive(l.valor.id)
    expect(m.lives.abertas()).toHaveLength(0)
  })

  it('RN-082 desligar "Lives nas contas" fecha todas', () => {
    const m = montarMotor()
    const [a] = ligarTudo(m, 1)
    m.motor.adicionarLive(a!.id, 'twitch', 'canal')
    m.motor.alterarConfig('lives.ligadas', false)
    expect(m.lives.abertas()).toHaveLength(0)
  })

  it('RN-012 jogo com contas não pode ser apagado', () => {
    const m = montarMotor()
    m.novaConta()
    expect(m.motor.apagarJogo('falso')).toBe(false)
    m.motor.salvarJogo({ ...jogoFalso, id: 'novo', nome: 'Novo' })
    expect(m.motor.listarJogos().map((j) => j.id)).toContain('novo')
    expect(m.motor.apagarJogo('novo')).toBe(true)
  })

  it('RN-030 apagar grupo apaga as contas dele; sempre sobra um grupo', async () => {
    const m = montarMotor()
    m.novaConta()
    expect(await m.motor.apagarGrupo(m.grupoId)).toBe(true)
    expect(m.motor.listarGrupos()).toHaveLength(1)
    expect(m.motor.listarContas()).toHaveLength(0)
    expect(await m.motor.apagarGrupo('x')).toBe(false)
    const g = m.motor.listarGrupos()[0]!
    expect(m.motor.editarGrupo(g.id, { nome: 'Novo nome', cor: '#123456' })).toBe(true)
    expect(m.motor.editarGrupo('x', {})).toBe(false)
    m.motor.selecionarGrupo(g.id)
    m.motor.selecionarGrupo('x')
    expect(m.motor.snapshot().grupoAtualId).toBe(g.id)
  })

  it('RN-154 avisa na conta quando o Google recusa o login', () => {
    const m = montarMotor()
    const [a] = ligarTudo(m, 1)
    const p = m.paginas.de(a!.id)
    p.url = 'https://accounts.google.com/v3/signin/rejected'
    p.ev.tituloMudou('Couldn’t sign you in')
    expect(ultimoSnapshot(m).estados[a!.id]!.googleRecusou).toBe(true)
  })

  it('RN-017 vigia pausado com as ferramentas do desenvolvedor abertas', () => {
    const m = montarMotor()
    const [a] = ligarTudo(m, 1)
    m.motor.abrirDevtools(a!.id)
    m.paginas.de(a!.id).ev.devtools(true)
    expect(ultimoSnapshot(m).estados[a!.id]!.vigiaPausado).toBe(true)
    m.motor.telaCheia(a!.id)
    m.motor.ativar(a!.id)
    m.motor.telaCheia()
    expect(m.paginas.de(a!.id).emTelaCheia).toBe(2)
    expect(m.motor.estadoInterno(a!.id)?.fase).toBe('rodando')
    expect(m.motor.pagina(a!.id)).toBe(m.paginas.de(a!.id))
    m.motor.encerrar()
    expect(m.motor.contasLigadas()).toBe(0)
  })
})

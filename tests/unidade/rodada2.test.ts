import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AgendaOtimizacao } from '../../src/main/nucleo/economia/otimizacao.ts'
import {
  cabecalhosLoginGoogle,
  ehLoginGoogle,
  UA_LOGIN_GOOGLE,
} from '../../src/main/nucleo/seguranca/politicas.ts'
import { configPadrao } from '../../src/shared/config/esquema.ts'
import { montarMotor } from '../falsos/montar-motor.ts'
import { RelogioFalso } from '../falsos/relogio.ts'

function arquivos(d: string): string[] {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n)
    return statSync(p).isDirectory() ? arquivos(p) : [p]
  })
}

describe('pedidos de 2026-11-27', () => {
  it('RN-007 nenhum menu nativo dentro do app: só a bandeja usa Menu', () => {
    const usos = arquivos('src')
      .filter((a) => /\.(ts|svelte)$/.test(a))
      .filter((a) => /Menu\.(buildFromTemplate|popup)|\.popup\(/.test(readFileSync(a, 'utf8')))
      .map((a) => a.replaceAll('\\', '/'))
    expect(usos).toEqual(['src/main/adaptadores/electron/bandeja.ts'])
    // Painéis usam só os tokens do tema (nenhuma cor do tema antigo).
    const css = arquivos('src/renderer')
      .map((a) => readFileSync(a, 'utf8'))
      .join('\n')
    expect(css).not.toMatch(/#7c6cf0|#161a24|#0f1117/i)
  })

  it('RN-037 conta nova começa no endereço padrão do grupo e o jogo sai do endereço', () => {
    const m = montarMotor()
    // Sem endereço no grupo e sem URL: recusa.
    expect(m.motor.adicionarConta({ grupoId: m.grupoId }).ok).toBe(false)
    m.motor.definirLayout(m.grupoId, undefined, { urlPadrao: 'https://jogo.test/inicio' })
    const r = m.motor.adicionarConta({ grupoId: m.grupoId })
    expect(r.ok && r.valor).toMatchObject({ url: 'https://jogo.test/inicio', jogoId: 'falso' })
    // O usuário pode trocar o endereço; domínio desconhecido vira um jogo do usuário.
    const r2 = m.motor.adicionarConta({ grupoId: m.grupoId, url: 'https://www.outro-jogo.com/play' })
    expect(r2.ok && r2.valor.jogoId).toBe('jogo-outro-jogo-com')
    expect(m.motor.listarJogos().find((j) => j.id === 'jogo-outro-jogo-com')?.dominios).toEqual([
      'outro-jogo.com',
    ])
    // O primeiro endereço usado vira o padrão de um grupo sem padrão.
    const b = m.motor.criarGrupo('B')
    m.motor.adicionarConta({ grupoId: b.id, url: 'https://jogo.test/b' })
    expect(m.motor.listarGrupos().find((g) => g.id === b.id)?.layout.urlPadrao).toBe('https://jogo.test/b')
    expect(m.motor.adicionarConta({ grupoId: 'x' }).ok).toBe(false)
    expect(m.motor.adicionarConta({ grupoId: m.grupoId, url: 'ftp://x' }).ok).toBe(false)
    expect(m.motor.jogoParaUrl('lixo')).toBeNull()
  })

  it('RN-058 Otimizar reabre a página num processo novo sem perder o login', async () => {
    const m = montarMotor()
    const c = m.novaConta()
    m.motor.ligarGrupo(m.grupoId, true)
    m.relogio.avancar(0)
    const p = m.paginas.de(c.id)
    p.ev.carregou(c.url)
    expect(m.motor.otimizar(c.id)).toBe(true)
    expect(p.renovacoes).toBe(1)
    expect(m.motor.otimizar(c.id)).toBe(false) // já está recarregando
    expect(m.armazem.eventos.at(-1)).toMatchObject({ tipo: 'recarga', motivo: 'otimizar' })
    p.ev.carregou(c.url)
    await m.motor.lote([c.id], 'otimizar')
    m.relogio.avancar(3000)
    expect(p.renovacoes).toBe(2)
    expect(m.motor.otimizar('x')).toBe(false)
    expect(m.motor.irParaInicio(c.id)).toBe(true)
    expect(p.carregamentos.at(-1)).toBe(c.url)
    expect(m.motor.irParaInicio('x')).toBe(false)
    expect(await m.motor.limparDados(c.id)).toBe(true)
    expect(m.paginas.sessoesApagadas).toContain(c.id)
    expect(await m.motor.limparDados('x')).toBe(false)
  })

  it('RN-058 cada conta tem o seu Otimizar sozinho; por tempo, uma por vez, nunca a conta em uso', () => {
    const r = new RelogioFalso()
    const cfg = configPadrao()
    // Por conta: a e b a cada 1 h; c desligada (mesmo grupo, configurações diferentes).
    const planos: Record<
      string,
      { modo: 'desligado' | 'tempo' | 'memoria'; aCadaMin: number; limiteMb: number }
    > = {
      a: { modo: 'tempo', aCadaMin: 60, limiteMb: 800 },
      b: { modo: 'tempo', aCadaMin: 60, limiteMb: 800 },
      c: { modo: 'desligado', aCadaMin: 60, limiteMb: 800 },
    }
    const feitas: string[] = []
    const emUso = new Set(['a'])
    const ag = new AgendaOtimizacao(r, () => cfg, {
      ligadas: () => ['a', 'b', 'c'],
      emUso: (id) => emUso.has(id),
      recarregar: () => {},
      limparCache: () => {},
      avisarMemoria: () => {},
      otimizar: (id) => feitas.push(id),
      planoDe: (id) => planos[id] ?? null,
    })
    ag.iniciar()
    r.avancar(60_000)
    r.avancar(60 * 60_000)
    r.avancar(60_000)
    expect(feitas).toEqual(['b'])
    emUso.clear()
    r.avancar(60_000)
    expect(feitas).toContain('a')
    expect(feitas).not.toContain('c')
    ag.esquecer('a')
    planos.a!.modo = 'desligado'
    planos.b!.modo = 'desligado'
    r.avancar(5 * 3_600_000)
    expect(feitas.length).toBeLessThanOrEqual(3)
  })

  it('RN-154 RN-002 só o login do Google sai como Firefox, sem client hints', () => {
    expect(ehLoginGoogle('https://accounts.google.com/o/oauth2/v2/auth?x=1')).toBe(true)
    expect(ehLoginGoogle('https://accounts.youtube.com/accounts/SetSID')).toBe(true)
    expect(ehLoginGoogle('https://pokeidle.io/')).toBe(false)
    expect(ehLoginGoogle('https://google.com.evil.com/')).toBe(false)
    expect(ehLoginGoogle('lixo')).toBe(false)
    const h = cabecalhosLoginGoogle({
      'user-agent': 'Mozilla/5.0 Chrome/156',
      'sec-ch-ua': '"Chromium";v="156"',
      'sec-ch-ua-platform': '"Windows"',
      Accept: 'text/html',
    })
    expect(h).toEqual({ Accept: 'text/html', 'User-Agent': UA_LOGIN_GOOGLE })
    expect(UA_LOGIN_GOOGLE).toContain('Firefox/')
  })
})

describe('conta nova pronta', () => {
  it('RN-043 sem conta ativa na tela, a primeira visível vira a ativa e abre ao vivo sem clique', () => {
    const m = montarMotor()
    const c = m.novaConta()
    m.motor.ligarGrupo(m.grupoId, true)
    m.relogio.avancar(0)
    m.motor.definirEspacos('principal', [
      { contaId: c.id, retangulo: { x: 0, y: 0, largura: 800, altura: 600 }, tipo: 'conta' },
    ])
    expect(m.paginas.de(c.id).exibicao).toMatchObject({
      modo: 'viva',
      retangulo: { largura: 800, altura: 600 },
    })
    expect(m.motor.snapshot().ativaId).toBe(c.id)
    // Uma conta criada depois já entra como a ativa.
    const d = m.novaConta()
    m.relogio.avancar(3000)
    m.motor.definirEspacos('principal', [
      { contaId: c.id, retangulo: { x: 0, y: 0, largura: 400, altura: 600 }, tipo: 'conta' },
      { contaId: d.id, retangulo: { x: 400, y: 0, largura: 400, altura: 600 }, tipo: 'conta' },
    ])
    expect(m.paginas.de(d.id).exibicao.modo).toBe('viva')
  })
})

describe('pedidos de 2026-11-27 (rodada 5)', () => {
  it('RN-018 a conta volta no link em que estava; o endereço cadastrado só vale na primeira vez', () => {
    const m = montarMotor()
    const c = m.novaConta({ url: 'https://jogo.test/jogar' })
    m.motor.ligarGrupo(m.grupoId, true, true)
    m.relogio.avancar(5000)
    const p1 = m.paginas.de(c.id)
    expect(p1.carregamentos).toEqual(['https://jogo.test/jogar'])
    // O jogo navegou para outra tela: o link é guardado.
    p1.url = 'https://jogo.test/mapa/7'
    p1.ev.navegou('https://jogo.test/mapa/7')
    // Login de terceiros (outro domínio) não substitui o link do jogo.
    p1.ev.navegou('https://accounts.google.com/signin')
    expect(m.armazem.ultimaUrl(c.id)).toBe('https://jogo.test/mapa/7')
    // Desligar e ligar de novo (ou reabrir o app): abre no link guardado.
    m.motor.desligarConta(c.id)
    m.motor.ligarGrupo(m.grupoId, false)
    m.motor.ligarGrupo(m.grupoId, true, true)
    m.relogio.avancar(5000)
    expect(m.paginas.de(c.id).carregamentos).toEqual(['https://jogo.test/mapa/7'])
    // Recarregar fica no link atual.
    const p2 = m.paginas.de(c.id)
    m.motor.recarregar(c.id, false)
    expect(p2.carregamentos.at(-1)).toBe('https://jogo.test/mapa/7')
    // Mudar o endereço da conta esquece o link antigo.
    m.motor.editarConta(c.id, { url: 'https://jogo.test/novo' })
    expect(m.armazem.ultimaUrl(c.id)).toBeNull()
  })

  it('RN-058 sem a dona ligar, nada recarrega sozinho por otimização', () => {
    const r = new RelogioFalso()
    const feitas: string[] = []
    const ag = new AgendaOtimizacao(r, () => configPadrao(), {
      ligadas: () => ['a', 'b'],
      emUso: () => false,
      recarregar: (id) => feitas.push(`recarga:${id}`),
      limparCache: () => {},
      avisarMemoria: () => {},
      otimizar: (id) => feitas.push(`otimizar:${id}`),
      planoDe: () => null,
    })
    ag.iniciar()
    r.avancar(24 * 3_600_000)
    expect(feitas).toEqual([])
  })
})

describe('pedidos de 2026-11-27 (rodada 6)', () => {
  it('RN-030 grupo novo já vem ligado e a conta que entra nele abre sozinha', () => {
    const m = montarMotor()
    const g = m.motor.criarGrupo('Novo')
    expect(g.ligado).toBe(true)
    const c = m.novaConta({ grupoId: g.id })
    m.relogio.avancar(5000)
    expect(m.paginas.paginas.has(c.id)).toBe(true)
  })
})

describe('pedidos de 2026-11-27 (rodada 7)', () => {
  it('RN-041 RN-052 miniatura proporcional: a página é desenhada no tamanho do espaço grande e a foto só reduz', async () => {
    const m = montarMotor()
    const a = m.novaConta({ nome: 'A' })
    const b = m.novaConta({ nome: 'B' })
    m.motor.ligarGrupo(m.grupoId, true, true)
    m.relogio.avancar(10_000)
    // "Principal + miniaturas": A grande ao vivo, B numa miniatura pequena (foto).
    m.motor.definirEspacos('principal', [
      { contaId: a.id, retangulo: { x: 0, y: 0, largura: 1200, altura: 700 }, tipo: 'conta' },
      { contaId: b.id, retangulo: { x: 0, y: 710, largura: 240, altura: 140 }, tipo: 'conta' },
    ])
    m.motor.ativar(a.id)
    await m.motor.capturarFoto(b.id)
    expect(m.paginas.de(b.id).ultimaCaptura).toEqual({
      largura: 240,
      altura: 140,
      natural: { largura: 1200, altura: 700 },
    })
  })

  it('RN-058 otimizar à mão (ou pelo grupo) zera o relógio do Otimizar sozinho da conta', () => {
    const m = montarMotor()
    const c = m.novaConta()
    m.motor.editarConta(c.id, { otimizarAuto: { modo: 'tempo', aCadaMin: 60, limiteMb: 800 } })
    m.motor.ligarGrupo(m.grupoId, true, true)
    m.relogio.avancar(5000)
    m.relogio.avancar(60_000)
    const antes = m.motor.detalheConta(c.id).proximaOtimizacao!
    m.relogio.avancar(20 * 60_000)
    m.motor.otimizar(c.id)
    const depois = m.motor.detalheConta(c.id).proximaOtimizacao!
    expect(depois - antes).toBeGreaterThanOrEqual(20 * 60_000)
  })

  it('RN-058 Otimizar sozinho por RAM: só a conta que passou do limite dela', () => {
    const r = new RelogioFalso()
    const feitas: string[] = []
    const ag = new AgendaOtimizacao(r, () => configPadrao(), {
      ligadas: () => ['a', 'b'],
      emUso: () => false,
      recarregar: () => {},
      limparCache: () => {},
      avisarMemoria: () => {},
      otimizar: (id) => feitas.push(id),
      planoDe: (id) => ({ modo: id === 'a' ? 'memoria' : 'desligado', aCadaMin: 60, limiteMb: 500 }),
    })
    ag.verificarMemoria(
      new Map([
        ['a', 900],
        ['b', 900],
      ]),
    )
    r.avancar(60_000)
    expect(feitas).toEqual(['a'])
  })
})

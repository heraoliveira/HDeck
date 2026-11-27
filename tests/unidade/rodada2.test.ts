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

  it('RN-058 otimiza sozinho a cada 1 h, uma por vez, nunca a conta em uso', () => {
    const r = new RelogioFalso()
    const cfg = configPadrao()
    const feitas: string[] = []
    const emUso = new Set(['a'])
    const ag = new AgendaOtimizacao(r, () => cfg, {
      ligadas: () => ['a', 'b'],
      emUso: (id) => emUso.has(id),
      recarregar: () => {},
      limparCache: () => {},
      avisarMemoria: () => {},
      otimizar: (id) => feitas.push(id),
    })
    ag.iniciar()
    r.avancar(60_000)
    r.avancar(60 * 60_000)
    r.avancar(60_000)
    expect(feitas).toEqual(['b'])
    emUso.clear()
    r.avancar(60_000)
    expect(feitas).toContain('a')
    ag.esquecer('a')
    cfg.otimizacao.otimizarACadaMin = 0
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

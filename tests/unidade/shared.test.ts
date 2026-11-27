import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { alterarCaminho, configPadrao, lerCaminho, migrarConfig } from '../../src/shared/config/esquema.ts'
import { buscarConfiguracoes, LINHAS } from '../../src/shared/configuracoes/catalogo.ts'
import {
  ATALHOS_PADRAO,
  COMANDOS,
  comandoDaTecla,
  mapaDeAtalhos,
  normalizarAtalho,
  textoDaTecla,
} from '../../src/shared/dados/atalhos.ts'
import { catalogoDeJogos, seletoresDasLives } from '../../src/shared/dados/catalogo.ts'
import { existeTexto, t, tDinamico } from '../../src/shared/i18n/index.ts'
import textos from '../../src/shared/i18n/pt-BR.json' with { type: 'json' }
import { canais, canalIpc, eventoIpc, nomesDosCanais } from '../../src/shared/ipc/contrato.ts'
import { NOMES_CANAIS } from '../../src/shared/ipc/nomes.ts'
import { dominioDe, dominioPertence, formatarDuracao, urlSemParametros } from '../../src/shared/util/texto.ts'

describe('configuração', () => {
  it('RN-060 RN-063 RN-064 RN-065 RN-066 padrões de "Se a conta cair" iguais às capturas', () => {
    const c = configPadrao()
    expect(c.queda).toEqual({
      recarregarQuandoCair: true,
      esperaQuedaSeg: 45,
      recarregarAoAcordar: true,
      avisarSemDadosMin: 0,
      recarregarSeTravar: true,
      travadaSeg: 30,
      recarregarSeFechar: true,
    })
  })

  it('RN-052 RN-053 RN-056 RN-100 padrões de economia, otimização e som', () => {
    const c = configPadrao()
    expect(c.economia).toEqual({ modoEconomico: true, fotoACadaSeg: 1, voltarAFotoSeg: 0 })
    expect(c.otimizacao).toEqual({
      recarregarACadaH: 0,
      limiteMemoriaMB: 0,
      limparCacheDias: 0,
      otimizarACadaMin: 60,
    }) // RN-058
    expect(c.som.modo).toBe('todas')
  })

  it('RN-082 RN-084 RN-085 RN-086 RN-087 RN-088 RN-089 padrões das lives iguais às capturas', () => {
    expect(configPadrao().lives).toEqual({
      ligadas: true,
      economico: true,
      qualidade: '160p',
      porConta: 0,
      voltarAoCanal: true,
      desligarEncerrada: true,
      religar: false,
      religarACadaMin: 120,
      mostrarEmTodas: false,
    })
  })

  it('RN-055 RN-170 RN-171 RN-033 RN-032 padrões gerais', () => {
    const g = configPadrao().geral
    expect(g.impedirDormir).toBe(true)
    expect(g.iniciarComWindows).toBe(false)
    expect(g.fecharVaiParaBandeja).toBe(true)
    expect(g.restaurarAoAbrir).toBe('ligados')
    expect(g.abrirAosPoucosSeg).toBe(3)
    expect(g.confirmarAoSair).toBe(true)
  })

  it('RN-113 RN-122 RN-130 RN-141 padrões de avisos, ping e cofre', () => {
    const c = configPadrao()
    expect(c.avisos.silencio.ligado).toBe(false)
    expect(c.avisos.varreduraSeg).toBe(5)
    expect(c.avisos.semInternetMin).toBe(5)
    expect(c.ping).toEqual({ intervaloMin: 5, limiteMs: 1000 })
    expect(c.cofre).toEqual({ senhaMestra: false, trancarAposMin: 15 })
  })

  it('RN-174 alterar um caminho valida o resultado inteiro', () => {
    const c = configPadrao()
    expect(alterarCaminho(c, 'queda.esperaQuedaSeg', 60)?.queda.esperaQuedaSeg).toBe(60)
    expect(alterarCaminho(c, 'queda.esperaQuedaSeg', 5)).toBeNull()
    expect(alterarCaminho(c, 'economia.fotoACadaSeg', 3)).toBeNull()
    expect(alterarCaminho(c, 'nao.existe', 1)).toBeNull()
    expect(alterarCaminho(c, 'queda.inventado', 1)).toBeNull()
    expect(alterarCaminho(c, '__proto__.x', 1)).toBeNull()
    expect(alterarCaminho(c, 'geral.atalhos.paleta', 'Ctrl+P')?.geral.atalhos.paleta).toBe('Ctrl+P')
    expect(lerCaminho(c, 'lives.qualidade')).toBe('160p')
    expect(lerCaminho(c, 'x.y.z')).toBeUndefined()
  })

  it('RN-174 migra da versão 1 e descarta só as seções inválidas', () => {
    const m = migrarConfig({ versao: 1, economia: { fotoMs: 5000 }, queda: { esperaQuedaSeg: 'lixo' } })
    expect(m.versao).toBe(2)
    expect(m.economia.fotoACadaSeg).toBe(5)
    expect(m.queda.esperaQuedaSeg).toBe(45)
    expect(migrarConfig(null)).toEqual(configPadrao())
    expect(migrarConfig({ versao: 1 }).versao).toBe(2)
  })
})

describe('busca das configurações', () => {
  it('RN-175 encontra pelo título, pela descrição e por palavras-chave', () => {
    expect(buscarConfiguracoes('live').map((l) => l.id)).toEqual(
      expect.arrayContaining(['livesLigadas', 'livesQualidade', 'livesPorConta', 'livesReligarACada']),
    )
    expect(buscarConfiguracoes('reconectar').map((l) => l.id)).toContain('recarregarQuandoCair')
    expect(buscarConfiguracoes('raid').map((l) => l.id)).toEqual(['livesVoltarAoCanal'])
    expect(buscarConfiguracoes('SUSPENSÃO').map((l) => l.id)).toContain('recarregarAoAcordar')
    expect(buscarConfiguracoes('').length).toBe(LINHAS.length)
    expect(buscarConfiguracoes('xyzxyz')).toEqual([])
  })

  it('RN-174 todo caminho do catálogo existe na configuração; "vale ao reiniciar" marcado', () => {
    const c = configPadrao()
    for (const l of LINHAS) if (l.caminho) expect(lerCaminho(c, l.caminho), l.caminho).not.toBeUndefined()
    for (const l of LINHAS)
      if (l.dependeDe) expect(lerCaminho(c, l.dependeDe), l.dependeDe).not.toBeUndefined()
    expect(LINHAS.filter((l) => l.valeAoReiniciar).map((l) => l.id)).toEqual(['aceleracao'])
  })

  it('RN-089 "Conferir se a live voltou a cada" depende de religar', () => {
    expect(LINHAS.find((l) => l.id === 'livesReligarACada')?.dependeDe).toBe('lives.religar')
  })
})

describe('atalhos', () => {
  it('RN-176 atalhos padrão', () => {
    expect(ATALHOS_PADRAO['conta.1']).toBe('Ctrl+1')
    expect(ATALHOS_PADRAO['grupo.9']).toBe('Ctrl+Alt+9')
    expect(ATALHOS_PADRAO['conta.recarregar']).toBe('F5')
    expect(ATALHOS_PADRAO['grupo.recarregar']).toBe('Ctrl+Shift+R')
    expect(ATALHOS_PADRAO.paleta).toBe('Ctrl+K')
    expect(ATALHOS_PADRAO.configuracoes).toBe('Ctrl+,')
    expect(ATALHOS_PADRAO['conta.preencherLogin']).toBe('Ctrl+L')
    expect(COMANDOS.every((c) => ATALHOS_PADRAO[c])).toBe(true)
  })

  it('RN-176 editáveis e reconhecidos a partir da tecla', () => {
    const mapa = mapaDeAtalhos({ paleta: 'ctrl + p' })
    const tecla = (key: string, mod: Partial<{ control: boolean; shift: boolean; alt: boolean }> = {}) => ({
      key,
      control: false,
      shift: false,
      alt: false,
      meta: false,
      ...mod,
    })
    expect(comandoDaTecla(mapa, tecla('p', { control: true }))).toBe('paleta')
    expect(comandoDaTecla(mapa, tecla('k', { control: true }))).toBeUndefined()
    expect(comandoDaTecla(mapa, tecla('R', { control: true, shift: true }))).toBe('grupo.recarregar')
    expect(comandoDaTecla(mapa, tecla('3', { control: true, alt: true }))).toBe('grupo.3')
    expect(comandoDaTecla(mapa, tecla('F5'))).toBe('conta.recarregar')
    expect(textoDaTecla(tecla(' ', { control: true }))).toBe('Ctrl+Space')
    expect(textoDaTecla({ ...tecla('Shift'), shift: true })).toBe('Shift')
    expect(normalizarAtalho('Cmd+Shift+tab')).toBe('Ctrl+Shift+Tab')
  })
})

describe('textos e dados', () => {
  it('RN-006 toda chave usada no código existe no arquivo de textos pt-BR', () => {
    const arquivos: string[] = []
    const andar = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n)
        if (statSync(p).isDirectory()) andar(p)
        else if (/\.(ts|svelte)$/.test(n)) arquivos.push(p)
      }
    }
    andar('src')
    const faltando = new Set<string>()
    for (const a of arquivos) {
      const s = readFileSync(a, 'utf8')
      for (const m of s.matchAll(/\bt\(\s*'([a-zA-Z0-9_.+-]+)'/g))
        if (!existeTexto(m[1]!)) faltando.add(m[1]!)
    }
    expect([...faltando]).toEqual([])
  })

  it('RN-006 textos curtos, em português e com variáveis', () => {
    expect(t('cfg.recarregarQuandoCair.d', { n: 45 })).toBe('Espera 45 s o jogo reconectar antes')
    expect(tDinamico('estado.caida')).toBe('Caiu')
    expect(t('avisos.caiu', {})).toContain('{conta}')
    for (const v of Object.values(textos)) expect(v.length).toBeLessThan(200)
  })

  it('RN-012 catálogo de jogos e seletores das lives são válidos', () => {
    const jogos = catalogoDeJogos()
    expect(jogos.length).toBeGreaterThan(0)
    expect(jogos.every((j) => j.origem === 'catalogo')).toBe(true)
    const s = seletoresDasLives()
    expect(s.twitch.urlCanal).toContain('{canal}')
    expect(s.kick.qualidade.valores['160p']).toBeDefined()
  })

  it('RN-004 contrato IPC com prefixo próprio e esquemas estritos', () => {
    expect(canalIpc('estado.obter')).toBe('hdeck:estado.obter')
    expect(eventoIpc('estado')).toBe('hdeck-evento:estado')
    expect(nomesDosCanais.length).toBeGreaterThan(40)
    expect([...NOMES_CANAIS].sort()).toEqual([...nomesDosCanais].sort())
    expect(canais['contas.ativar'].safeParse({ id: 'a', extra: 1 }).success).toBe(false)
    expect(canais['contas.adicionar'].safeParse({ grupoId: 'g', jogoId: 'j', url: 'nada' }).success).toBe(
      false,
    )
  })

  it('RN-153 utilitários de URL e duração', () => {
    expect(dominioDe('https://A.b.com/x')).toBe('a.b.com')
    expect(dominioDe('lixo')).toBeNull()
    expect(dominioPertence('x.jogo.com', '*.jogo.com')).toBe(true)
    expect(dominioPertence('jogo.com.br', 'jogo.com')).toBe(false)
    expect(urlSemParametros('https://a.com/b?token=1#x')).toBe('https://a.com/b')
    expect(urlSemParametros('lixo')).toBe('[url inválida]')
    expect(formatarDuracao(3_720_000)).toBe('1 h 2 min')
    expect(formatarDuracao(120_000)).toBe('2 min')
    expect(formatarDuracao(5000)).toBe('5 s')
  })
})

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ArmazemSqlite } from '../../src/main/adaptadores/node/armazem-sqlite.ts'
import { exportarBackup, importarBackup } from '../../src/main/adaptadores/node/backup.ts'
import { Cofre, type ProtecaoSistema } from '../../src/main/adaptadores/node/cofre.ts'
import { ConfigArquivo } from '../../src/main/adaptadores/node/config-arquivo.ts'
import { cifrar, decifrar, derivarChave, novaChave } from '../../src/main/adaptadores/node/cripto.ts'
import { ClienteHttpFetch, lerEspera } from '../../src/main/adaptadores/node/http.ts'
import { criarZip, lerZip } from '../../src/main/adaptadores/node/zip.ts'
import { FilaEnvio } from '../../src/main/nucleo/avisos/envio.ts'
import { configPadrao } from '../../src/shared/config/esquema.ts'
import { layoutGrupoSchema } from '../../src/shared/tipos/dominio.ts'
import { jogoFalso } from '../falsos/montar-motor.ts'
import { RelogioFalso } from '../falsos/relogio.ts'
import { iniciarServidorFalso } from '../fixtures/servidor.ts'

const pastas: string[] = []
const pasta = () => {
  const p = mkdtempSync(join(tmpdir(), 'hdeck-int-'))
  pastas.push(p)
  return p
}
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true })
})

/** safeStorage falso: XOR com uma chave fixa (o suficiente para ida e volta). */
const protecao: ProtecaoSistema = {
  disponivel: () => true,
  proteger: (d) => Buffer.from(d).map((b) => b ^ 0x5a),
  desproteger: (d) => Buffer.from(d).map((b) => b ^ 0x5a),
}
const custoBaixo = { N: 2 ** 10, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

const grupo = {
  id: 'g1',
  nome: 'G',
  cor: '#7c6cf0',
  ordem: 0,
  ligado: true,
  visao: 'grade' as const,
  layout: layoutGrupoSchema.parse({}),
}
const conta = {
  id: 'c1',
  grupoId: 'g1',
  jogoId: 'falso',
  nome: 'Conta 1',
  cor: '#7c6cf0',
  icone: '🎲',
  ordem: 0,
  url: 'https://jogo.test/',
  zoom: 1,
  som: true,
  politicaForaTela: 'padrao_do_jogo' as const,
  notificacoesDaPagina: false,
  notas: 'x',
  criadaEm: 1,
}

describe('armazém SQLite', () => {
  it('RN-011 os dados sobrevivem a fechar e reabrir; WAL ligado; migrações sobem e descem', () => {
    const arq = join(pasta(), 'hdeck.db')
    const a = new ArmazemSqlite(arq)
    expect(a.modoJournal()).toBe('wal')
    expect(a.versao()).toBe(2)
    a.salvarJogo(jogoFalso)
    a.salvarGrupo(grupo)
    a.salvarConta(conta)
    a.salvarLive({ id: 'l1', contaId: 'c1', plataforma: 'twitch', canal: 'x', ligada: true, ordem: 0 })
    a.salvarTexto({ id: 't1', texto: 'captcha', escopo: 'todas', alvoId: null, ativo: true })
    a.salvarUltimaUrl('c1', 'https://jogo.exemplo/mapa/3')
    a.fechar()
    const b = new ArmazemSqlite(arq)
    expect(b.listarJogos()).toEqual([jogoFalso])
    expect(b.listarGrupos()).toEqual([grupo])
    expect(b.listarContas()).toEqual([conta])
    expect(b.listarLives()).toHaveLength(1)
    expect(b.listarTextos()).toHaveLength(1)
    // RN-018: o link em que a conta estava sobrevive a reabrir; apagar a conta apaga o link.
    expect(b.ultimaUrl('c1')).toBe('https://jogo.exemplo/mapa/3')
    b.migrarPara(0)
    expect(b.versao()).toBe(0)
    b.migrarPara(1)
    expect(b.listarContas()).toEqual([])
    b.fechar()
  })

  it('RN-163 avisos, eventos, métricas, ping e retenção de 30 dias', () => {
    const a = new ArmazemSqlite(':memory:')
    const agora = 100 * 86_400_000
    a.registrarAviso({ id: 'a1', contaId: 'c1', tipo: 'caiu', mensagem: 'm', criadoEm: agora, lido: false })
    a.registrarAviso({
      id: 'a0',
      contaId: null,
      tipo: 'caiu',
      mensagem: 'velho',
      criadoEm: agora - 40 * 86_400_000,
      lido: false,
    })
    expect(a.contarNaoLidos()).toBe(2)
    a.marcarAvisosLidos()
    expect(a.listarAvisos(10).every((x) => x.lido)).toBe(true)
    a.registrarEvento({ contaId: 'c1', tipo: 'queda', motivo: 'x', em: agora - 31 * 86_400_000 })
    a.registrarEvento({ contaId: 'c1', tipo: 'recarga', motivo: 'x', em: agora })
    a.registrarMetricas([
      { contaId: 'c1', minuto: agora - 72 * 3_600_000, ramMb: 100, cpuPct: 1, estado: 'ativa' },
      { contaId: 'c1', minuto: agora - 72 * 3_600_000 + 60_000, ramMb: 300, cpuPct: 3, estado: 'ativa' },
      { contaId: 'c1', minuto: agora - 60_000, ramMb: 50, cpuPct: 1, estado: 'ativa' },
    ])
    a.registrarPing({ jogoId: 'falso', em: agora - 40 * 86_400_000, ms: 1, status: 200 })
    a.registrarPing({ jogoId: 'falso', em: agora, ms: null, status: 0 })
    a.aplicarRetencao(agora)
    expect(a.listarEventos(0).map((e) => e.tipo)).toEqual(['recarga'])
    expect(a.listarEventos(0, 'outra')).toEqual([])
    expect(a.listarMetricas(0).map((m) => m.ramMb)).toEqual([200, 50])
    expect(a.listarPing(0)).toEqual([{ jogoId: 'falso', em: agora, ms: null, status: 0 }])
    expect(a.listarAvisos(10)).toHaveLength(1)
  })

  it('RN-015 apagar conta apaga as lives e o login salvo dela', () => {
    const a = new ArmazemSqlite(':memory:')
    a.salvarConta(conta)
    a.salvarLive({ id: 'l1', contaId: 'c1', plataforma: 'kick', canal: 'x', ligada: false, ordem: 0 })
    a.gravarCofre('c1', Buffer.from('u'), Buffer.from('s'), null)
    a.apagarConta('c1')
    expect(a.listarLives()).toEqual([])
    expect(a.lerCofre()).toEqual([])
    a.salvarJogo(jogoFalso)
    a.apagarJogo('falso')
    a.salvarGrupo(grupo)
    a.apagarGrupo('g1')
    a.salvarTexto({ id: 't', texto: 'a', escopo: 'todas', alvoId: null, ativo: true })
    a.apagarTexto('t')
    a.apagarLive('l1')
    expect(a.listarJogos().length + a.listarGrupos().length + a.listarTextos().length).toBe(0)
    expect(() =>
      a.transacao(() => {
        throw new Error('x')
      }),
    ).toThrow()
  })
})

describe('config em arquivo', () => {
  it('RN-174 escrita atômica e volta ao backup se o arquivo corromper', () => {
    const arq = join(pasta(), 'config.json')
    const c = new ConfigArquivo(arq)
    expect(c.ler()).toEqual(configPadrao())
    const um = { ...configPadrao(), ping: { intervaloMin: 7, limiteMs: 1000 } }
    c.gravar(um)
    c.gravar({ ...um, ping: { intervaloMin: 9, limiteMs: 1000 } })
    expect(c.ler().ping.intervaloMin).toBe(9)
    // Interrupção simulada: o arquivo principal ficou pela metade.
    writeFileSync(arq, '{"versao": 2, "geral": {')
    expect(c.ler().ping.intervaloMin).toBe(7)
    c.gravar(configPadrao())
    expect(JSON.parse(readFileSync(arq, 'utf8')).ping.intervaloMin).toBe(5)
  })
})

describe('cofre', () => {
  it('RN-140 ida e volta cifrada, guardada só neste PC e ligada ao usuário do Windows', () => {
    const a = new ArmazemSqlite(':memory:')
    const c = new Cofre(a, protecao, custoBaixo)
    c.iniciar()
    expect(c.aberto()).toBe(true)
    expect(c.salvar('c1', 'eu@x.com', 'segredo', { usuario: '#u', senha: '#s' })).toBeNull()
    expect(c.dados('c1')).toEqual({
      usuario: 'eu@x.com',
      senha: 'segredo',
      seletores: { usuario: '#u', senha: '#s' },
    })
    expect(c.usuario('c1')).toBe('eu@x.com')
    const bruto = a.lerCofre()[0]!
    expect(Buffer.from(bruto.senha).includes(Buffer.from('segredo'))).toBe(false)
    expect(c.contasComLogin()).toEqual(['c1'])
    // Reabrir com a mesma proteção do Windows: continua lendo.
    const c2 = new Cofre(a, protecao, custoBaixo)
    c2.iniciar()
    expect(c2.dados('c1')?.senha).toBe('segredo')
    // Outro usuário do Windows (outra proteção): não lê.
    const outro = new Cofre(a, { ...protecao, desproteger: (d) => Buffer.from(d) }, custoBaixo)
    outro.iniciar()
    expect(outro.dados('c1')).toBeNull()
    c.apagar('c1')
    expect(c.dados('c1')).toBeNull()
  })

  it('RN-140 o Windows não abre a chave: o app abre com o cofre fechado e nada é apagado', () => {
    const a = new ArmazemSqlite(':memory:')
    const c = new Cofre(a, protecao, custoBaixo)
    c.iniciar()
    c.salvar('c1', 'u', 's')
    const quebrada = new Cofre(
      a,
      {
        ...protecao,
        desproteger: () => {
          throw new Error('Error while decrypting the ciphertext')
        },
      },
      custoBaixo,
    )
    expect(quebrada.iniciar()).toBe('sem_chave')
    expect(quebrada.aberto()).toBe(false)
    expect(quebrada.contasComLogin()).toEqual(['c1'])
    // Quando o Windows voltar a abrir a chave, os logins continuam lá.
    const depois = new Cofre(a, protecao, custoBaixo)
    expect(depois.iniciar()).toBe('ok')
    expect(depois.dados('c1')?.senha).toBe('s')
  })

  it('RN-141 senha mestra: pede ao abrir, senha errada falha, trancar fecha', () => {
    const a = new ArmazemSqlite(':memory:')
    const c = new Cofre(a, protecao, custoBaixo)
    c.iniciar()
    c.salvar('c1', 'u', 's')
    expect(c.criarSenhaMestra('mestra123')).toBeNull()
    expect(c.senhaMestraLigada()).toBe(true)
    c.trancar()
    expect(c.aberto()).toBe(false)
    expect(c.dados('c1')).toBeNull()
    expect(c.salvar('c2', 'u', 's')).toBe('trancado')
    expect(c.criarSenhaMestra('x')).toBe('trancado')
    const reaberto = new Cofre(a, protecao, custoBaixo)
    reaberto.iniciar()
    expect(reaberto.aberto()).toBe(false)
    expect(reaberto.destrancar('errada')).toBe('senha')
    expect(reaberto.destrancar('mestra123')).toBeNull()
    expect(reaberto.dados('c1')?.senha).toBe('s')
    expect(reaberto.removerSenhaMestra('errada')).toBe('senha')
    expect(reaberto.removerSenhaMestra('mestra123')).toBeNull()
    expect(reaberto.senhaMestraLigada()).toBe(false)
    reaberto.trancar()
    expect(reaberto.aberto()).toBe(true)
    expect(reaberto.destrancar('qualquer')).toBeNull()
  })

  it('RN-140 adulteração é detectada pelo GCM', () => {
    const k = novaChave()
    const blob = cifrar(k, Buffer.from('oi'))
    expect(decifrar(k, blob).toString()).toBe('oi')
    const ruim = Buffer.from(blob)
    ruim[ruim.length - 1]! ^= 1
    expect(() => decifrar(k, ruim)).toThrow()
    expect(() => decifrar(k, Buffer.from([9, 9]))).toThrow()
    expect(() => decifrar(novaChave(), blob)).toThrow()
    // Custo real do scrypt (N=2^17) roda e é determinístico.
    const sal = Buffer.alloc(16, 1)
    expect(derivarChave('a', sal).equals(derivarChave('a', sal))).toBe(true)
  })

  it('RN-114 segredos dos avisos só com o Windows: funcionam com o cofre trancado', () => {
    const a = new ArmazemSqlite(':memory:')
    const c = new Cofre(a, protecao, custoBaixo)
    c.iniciar()
    c.criarSenhaMestra('m')
    c.definirSegredo('discord', 'https://discord.com/api/webhooks/1/abc')
    c.trancar()
    expect(c.segredo('discord')).toBe('https://discord.com/api/webhooks/1/abc')
    expect(c.segredo('telegram')).toBeNull()
    c.definirSegredo('discord', '')
    expect(c.segredo('discord')).toBeNull()
    const quebrado = new Cofre(
      a,
      {
        ...protecao,
        desproteger: () => {
          throw new Error()
        },
      },
      custoBaixo,
    )
    c.definirSegredo('telegram', 'x')
    expect(quebrado.segredo('telegram')).toBeNull()
  })
})

describe('backup', () => {
  it('RN-160 RN-162 exportar e importar numa pasta de dados vazia: grupos, contas, textos e cofre voltam', () => {
    const origem = new ArmazemSqlite(':memory:')
    const cfgOrigem = new ConfigArquivo(join(pasta(), 'c.json'))
    cfgOrigem.gravar({ ...configPadrao(), ping: { intervaloMin: 12, limiteMs: 500 } })
    const cofre = new Cofre(origem, protecao, custoBaixo)
    cofre.iniciar()
    origem.salvarJogo(jogoFalso)
    origem.salvarGrupo(grupo)
    origem.salvarConta(conta)
    origem.salvarTexto({ id: 't1', texto: 'captcha', escopo: 'todas', alvoId: null, ativo: true })
    cofre.salvar('c1', 'eu', 'senha-secreta')
    expect(
      exportarBackup({ armazem: origem, config: cfgOrigem, cofre, agora: 1 }, { incluirCofre: true }),
    ).toBe('senha')
    const arquivo = exportarBackup(
      { armazem: origem, config: cfgOrigem, cofre, agora: 1 },
      { incluirCofre: true, senhaBackup: 'bkp' },
    )
    if (typeof arquivo === 'string') throw new Error(arquivo)
    // O cofre não sai em texto claro.
    expect(arquivo.includes(Buffer.from('senha-secreta'))).toBe(false)

    const destino = new ArmazemSqlite(':memory:')
    const cfgDestino = new ConfigArquivo(join(pasta(), 'c.json'))
    const cofreDestino = new Cofre(destino, protecao, custoBaixo)
    cofreDestino.iniciar()
    const deps = { armazem: destino, config: cfgDestino, cofre: cofreDestino, pastaSessoes: pasta() }
    expect(importarBackup(arquivo, deps)).toBe('senha')
    expect(importarBackup(arquivo, deps, 'errada')).toBe('senha')
    expect(importarBackup(arquivo, deps, 'bkp')).toEqual({
      grupos: 1,
      contas: 1,
      textos: 1,
      logins: 1,
      sessoes: 0,
    })
    expect(destino.listarContas()).toEqual([conta])
    expect(destino.listarGrupos()).toEqual([grupo])
    expect(destino.listarTextos()).toHaveLength(1)
    expect(cofreDestino.dados('c1')?.senha).toBe('senha-secreta')
    expect(cfgDestino.ler().ping.intervaloMin).toBe(12)
    expect(importarBackup(Buffer.from('lixo'), deps)).toBe('formato')
    expect(importarBackup(criarZip([{ nome: 'manifesto.json', dados: Buffer.from('{}') }]), deps)).toBe(
      'formato',
    )
  })

  it('RN-161 incluir as sessões copia as pastas das contas', () => {
    const origem = new ArmazemSqlite(':memory:')
    origem.salvarConta(conta)
    const sessoes = pasta()
    mkdirSync(join(sessoes, 'WV2Profile_conta-c1', 'Local Storage'), { recursive: true })
    writeFileSync(join(sessoes, 'WV2Profile_conta-c1', 'Cookies'), 'biscoito')
    writeFileSync(join(sessoes, 'WV2Profile_conta-c1', 'Local Storage', 'x.log'), 'ls')
    const cofre = new Cofre(origem, protecao, custoBaixo)
    cofre.iniciar()
    const cfg = new ConfigArquivo(join(pasta(), 'c.json'))
    const arq = exportarBackup(
      { armazem: origem, config: cfg, cofre, agora: 1 },
      { incluirCofre: false, pastaSessoes: sessoes },
    )
    if (typeof arq === 'string') throw new Error(arq)
    const destino = pasta()
    const r = importarBackup(arq, {
      armazem: new ArmazemSqlite(':memory:'),
      config: cfg,
      cofre,
      pastaSessoes: destino,
    })
    expect(r).toMatchObject({ sessoes: 2 })
    expect(readFileSync(join(destino, 'WV2Profile_conta-c1', 'Cookies'), 'utf8')).toBe('biscoito')
  })

  it('RN-160 zip: ida e volta, CRC conferido e caminhos perigosos recusados', () => {
    const z = criarZip([
      { nome: 'a.txt', dados: Buffer.from('olá') },
      { nome: 'pasta\\b.bin', dados: Buffer.alloc(1000, 7) },
    ])
    const lidos = lerZip(z)
    expect(lidos.map((e) => e.nome)).toEqual(['a.txt', 'pasta/b.bin'])
    expect(Buffer.from(lidos[0]!.dados).toString()).toBe('olá')
    expect(() => lerZip(criarZip([{ nome: '../fora.txt', dados: Buffer.from('x') }]))).toThrow()
    expect(() => lerZip(Buffer.from('nada'))).toThrow()
  })
})

describe('Discord e Telegram contra servidor local', () => {
  it('RN-115 repete depois de 429 respeitando o retry_after e entrega', async () => {
    const s = await iniciarServidorFalso()
    try {
      s.estado.discord429 = 1
      const r = new RelogioFalso()
      const http = new ClienteHttpFetch()
      const f = new FilaEnvio(r, http, (t) => ({ url: `${s.url}/discord/hook`, corpo: { content: t } }))
      const fim = new Promise<string>((res) => f.aoTerminar((x) => res(x)))
      f.enviar('caiu')
      for (let i = 0; i < 50 && s.estado.discord.length === 0; i++) {
        r.avancar(1000)
        await new Promise((res) => setTimeout(res, 20))
      }
      expect(await fim).toBe('enviado')
      expect(s.estado.discord).toEqual([{ content: 'caiu' }])
      const tg = await http.postar({
        url: `${s.url}/telegram/bot1/sendMessage`,
        corpo: { chat_id: '1', text: 'oi' },
      })
      expect(tg.status).toBe(200)
      expect(s.estado.telegram).toEqual([{ chat_id: '1', text: 'oi' }])
      const ping = await http.medir(`${s.url}/ping`)
      expect(ping.status).toBe(200)
      expect(ping.ms).not.toBeNull()
      expect((await http.medir('http://127.0.0.1:1/')).ms).toBeNull()
      expect((await http.postar({ url: 'http://127.0.0.1:1/', corpo: {} })).status).toBe(0)
    } finally {
      await s.fechar()
    }
  })

  it('RN-115 lê o "espere" do Discord, do Telegram e do cabeçalho', async () => {
    expect(await lerEspera(new Response(JSON.stringify({ retry_after: 1.5 }), { status: 429 }))).toBe(1.5)
    expect(
      await lerEspera(new Response(JSON.stringify({ parameters: { retry_after: 7 } }), { status: 429 })),
    ).toBe(7)
    expect(await lerEspera(new Response('x', { status: 429, headers: { 'retry-after': '3' } }))).toBe(3)
    expect(await lerEspera(new Response('x', { status: 429 }))).toBeNull()
  })
})

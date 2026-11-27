/** Fluxos E2E 11, 12, 13, 14 e 17 (Seção 15.2): downloads e pop-ups, cofre, lives, Configurações e backup. */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { iniciarServidorFalso } from '../fixtures/servidor.ts'
import { abrirApp, criarContas, esperarEstado, garantirJogoFalso, naConta } from './ajuda.ts'

type H = any

test('RN-150 RN-151 .exe bloqueado; pop-up de login na mesma sessão fecha sozinho; pop-up comum pede confirmação', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c] = await criarContas(a, 1)
    await naConta(a, c!, "document.getElementById('baixar-exe').click()")
    await expect
      .poll(() => a.app.evaluate(() => (globalThis as H).hdeckTeste.perguntador.informacoes.join('|')))
      .toContain('instalador.exe')
    // Download comum pede confirmação com nome, origem e tamanho.
    await naConta(a, c!, "location.href = '/arquivo.txt'")
    await expect
      .poll(() =>
        a.app.evaluate(() =>
          (globalThis as H).hdeckTeste.perguntador.perguntas
            .map((p: { mensagem: string }) => p.mensagem)
            .join('|'),
        ),
      )
      .toContain('a.txt')
    // Pop-up de OAuth falso: abre na sessão da conta (o cookie fica na conta) e fecha sozinho.
    const popups = () => a.app.evaluate(() => (globalThis as H).hdeckTeste.fabrica.popups())
    const janelasAntes = await popups()
    await naConta(a, c!, "window.open('/oauth/login', 'oauth', 'width=400,height=400')")
    await expect.poll(popups).toBe(janelasAntes + 1)
    await expect.poll(popups, { timeout: 10_000 }).toBe(janelasAntes)
    expect(await naConta<string>(a, c!, 'document.cookie')).toContain('oauth=1')
    // Pop-up comum: pede confirmação mostrando o endereço (o teste responde "cancelar").
    await naConta(a, c!, "window.open('/comum')")
    await expect
      .poll(() =>
        a.app.evaluate(() =>
          (globalThis as H).hdeckTeste.perguntador.perguntas
            .map((p: { mensagem: string }) => p.mensagem)
            .join('|'),
        ),
      )
      .toContain('/comum')
  } finally {
    await a.fechar()
  }
})

test('RN-140 RN-141 RN-142 RN-114 cofre: salvar, trancar, destrancar, preencher sem enviar; Discord chega com o cofre trancado', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c] = await criarContas(a, 1)
    await a.app.evaluate(
      (_e, { id, hook }) => {
        const t = (globalThis as H).hdeckTeste
        t.cofre.salvar(id, 'eu@jogo.com', 'segredo123', null)
        t.cofre.criarSenhaMestra('mestra')
        t.motor.alterarConfig('cofre.senhaMestra', true)
        t.cofre.definirSegredo('discord', hook)
        t.motor.alterarConfig('avisos.discord', true)
        t.cofre.trancar()
        t.motor.trancarCofre()
      },
      { id: c!, hook: `${a.servidor.url}/discord/hook` },
    )
    // Trancado: não preenche.
    const trancado = await a.app.evaluate(
      (_e, id) => (globalThis as H).hdeckTeste.motor.preencherLogin([id]),
      c!,
    )
    expect(trancado.preenchidas).toEqual([])
    // Aviso pelo Discord mesmo com o cofre trancado.
    await a.app.evaluate(() => (globalThis as H).hdeckTeste.motor.avisoDeTeste())
    await expect.poll(() => a.servidor.estado.discord.length, { timeout: 20_000 }).toBeGreaterThan(0)
    // Destranca e preenche.
    await a.app.evaluate(() => {
      const t = (globalThis as H).hdeckTeste
      if (t.cofre.destrancar('mestra') === null) t.motor.cofreDestrancado()
    })
    const r = await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.motor.preencherLogin([id]), c!)
    expect(r.preenchidas).toEqual([c])
    expect(await naConta(a, c!, "document.getElementById('usuario-campo').value")).toBe('eu@jogo.com')
    expect(await naConta(a, c!, "document.getElementById('senha-campo').value")).toBe('segredo123')
    expect(await naConta(a, c!, 'window.__contagem.inputs')).toBeGreaterThan(0)
    await new Promise((r) => setTimeout(r, 1000))
    expect(await naConta(a, c!, 'window.__contagem.submits')).toBe(0)
    expect(a.servidor.estado.submits).toBe(0)
  } finally {
    await a.fechar()
  }
})

test('RN-081 RN-083 RN-087 RN-088 RN-089 live falsa: muda e offscreen, volta após raid, desliga ao encerrar, religa quando volta', async () => {
  const a = await abrirApp({ env: { HDECK_TESTE_ACELERAR: '60' } })
  try {
    await garantirJogoFalso(a)
    const [c] = await criarContas(a, 1)
    await a.app.evaluate(() => {
      const m = (globalThis as H).hdeckTeste.motor
      m.alterarConfig('lives.religar', true)
      m.alterarConfig('lives.religarACadaMin', 30)
    })
    await a.app.evaluate(
      (_e, id) => (globalThis as H).hdeckTeste.motor.adicionarLive(id, 'twitch', 'canalx'),
      c!,
    )
    const janelaLive = () =>
      a.app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('/live/'))
        if (!w) return null
        return {
          url: w.webContents.getURL(),
          mudo: w.webContents.isAudioMuted(),
          visivel: w.isVisible(),
          offscreen: w.webContents.isOffscreen(),
        }
      })
    await expect.poll(janelaLive).toMatchObject({ mudo: true, visivel: false, offscreen: true })
    expect((await janelaLive())!.url).toContain('/live/canalx')
    // Raid para outro canal → volta ao cadastrado.
    a.servidor.estado.lives.canalx = { aoVivo: true, raidPara: 'outro', assistidoSeg: 0 }
    // A página foi para o outro canal (o servidor viu) e o HDeck a trouxe de volta.
    await expect.poll(() => a.servidor.estado.lives.outro !== undefined, { timeout: 15_000 }).toBe(true)
    a.servidor.estado.lives.canalx.raidPara = null
    await expect
      .poll(async () => (await janelaLive())?.url ?? '', { timeout: 15_000 })
      .toContain('/live/canalx')
    // Encerra → sai da memória e fica "encerrada".
    a.servidor.estado.lives.canalx.aoVivo = false
    await expect.poll(janelaLive, { timeout: 20_000 }).toBeNull()
    const estado = () =>
      a.app.evaluate(
        () => Object.values((globalThis as H).hdeckTeste.motor.snapshot().livesEstado)[0],
      ) as Promise<string>
    expect(await estado()).toBe('encerrada')
    // Volta ao vivo → religa na próxima conferência (relógio acelerado).
    a.servidor.estado.lives.canalx.aoVivo = true
    await expect.poll(estado, { timeout: 60_000 }).toBe('tocando')
  } finally {
    await a.fechar()
  }
})

test('RN-174 RN-175 Configurações: buscar "live" encontra as opções; mudar vale na hora e persiste', async () => {
  const servidor = await iniciarServidorFalso()
  const a = await abrirApp({ servidor })
  try {
    await a.janela.getByRole('button', { name: 'Configurações' }).click()
    await a.janela.getByRole('searchbox', { name: 'Buscar configuração' }).fill('live')
    await expect(a.janela.getByText('Qualidade das lives')).toBeVisible()
    await expect(a.janela.getByText('Voltar sozinha ao canal cadastrado')).toBeVisible()
    await expect(a.janela.getByText('Conferir se a live voltou a cada')).toBeVisible()
    await a.janela.getByRole('switch', { name: 'Ligar de novo quando voltar ao vivo' }).click()
    await expect
      .poll(() => a.app.evaluate(() => (globalThis as H).hdeckTeste.motor.obterConfig().lives.religar))
      .toBe(true)
  } finally {
    await a.fechar(false)
  }
  const b = await abrirApp({ pasta: a.pasta, servidor })
  try {
    expect(await b.app.evaluate(() => (globalThis as H).hdeckTeste.motor.obterConfig().lives.religar)).toBe(
      true,
    )
  } finally {
    await b.fechar()
    await servidor.fechar()
  }
})

test('RN-160 RN-162 exportar backup e importar numa pasta de dados vazia', async () => {
  const servidor = await iniciarServidorFalso()
  const a = await abrirApp({ servidor })
  const arquivo = join(mkdtempSync(join(tmpdir(), 'hdeck-bkp-')), 'teste.hdeck')
  let ids: string[] = []
  try {
    await garantirJogoFalso(a)
    ids = await criarContas(a, 2)
    await a.app.evaluate(
      (_e, { id, arquivo }) => {
        const t = (globalThis as H).hdeckTeste
        t.motor.salvarTexto({ texto: 'captcha', escopo: 'todas', alvoId: null, ativo: true })
        t.cofre.salvar(id, 'u', 's3nha', null)
        t.proximoArquivo = arquivo
      },
      { id: ids[0]!, arquivo },
    )
    const r = await a.janela.evaluate(() =>
      (window as H).hdeck.backup.exportar({ incluirCofre: true, senhaBackup: 'bkp', incluirSessoes: false }),
    )
    expect(r.ok && r.valor.ok).toBe(true)
  } finally {
    await a.fechar()
  }
  const b = await abrirApp({ servidor })
  try {
    await b.app.evaluate((_e, arquivo) => {
      ;(globalThis as H).hdeckTeste.proximoArquivo = arquivo
    }, arquivo)
    const r = await b.janela.evaluate(() => (window as H).hdeck.backup.importar({ senhaBackup: 'bkp' }))
    expect(r.valor.ok).toBe(true)
    expect(r.valor.resumo).toMatchObject({ contas: 2, textos: 1, logins: 1 })
    const dados = await b.app.evaluate((_e, id) => {
      const t = (globalThis as H).hdeckTeste
      return {
        contas: t.armazem.listarContas().length,
        textos: t.armazem.listarTextos().length,
        senha: t.cofre.dados(id)?.senha,
      }
    }, ids[0]!)
    expect(dados).toEqual({ contas: 2, textos: 1, senha: 's3nha' })
  } finally {
    await b.fechar()
    await servidor.fechar()
  }
  void esperarEstado
})

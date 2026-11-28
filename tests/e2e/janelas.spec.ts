/**
 * RN-092: nenhuma janela fica aberta escondida (lives, logins, pop-ups), e nada sobra depois de sair.
 * RN-154: todo login abre no motor do Edge; o da Twitch/Kick vai para a sessão das lives da conta.
 */
import { expect, test } from '@playwright/test'
import { abrirApp, criarContas, esperarEstado, garantirJogoFalso, naConta } from './ajuda.ts'

type H = any

const vivo = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test('RN-092 live desligada ou conta desligada fecha o player escondido; o zelador fecha janela escondida órfã', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c] = await criarContas(a, 1)
    await esperarEstado(a, c!, ['ativa', 'economica', 'escondida'])
    const players = () =>
      a.app.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().filter(
            (w) => !w.isDestroyed() && w.webContents.getURL().includes('/live/'),
          ).length,
      )
    const l = await a.app.evaluate(
      (_e, id) => (globalThis as H).hdeckTeste.motor.adicionarLive(id, 'twitch', 'canalum'),
      c!,
    )
    await expect.poll(players).toBe(1)
    // Desligar a live fecha o player escondido.
    await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.motor.ligarLive(id, false), l.valor.id)
    await expect.poll(players).toBe(0)
    // Ligar de novo e desligar a conta: o player também fecha.
    await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.motor.ligarLive(id, true), l.valor.id)
    await expect.poll(players).toBe(1)
    await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.motor.desligarConta(id), c!)
    await expect.poll(players).toBe(0)
    // Uma janela escondida que ninguém controla (ex.: pop-up de página oculta) é fechada pelo zelador.
    const fechadas = await a.app.evaluate(({ BrowserWindow }) => {
      const orfa = new BrowserWindow({ show: false })
      void orfa.loadURL('about:blank')
      ;(globalThis as H).orfa = orfa
      return (globalThis as H).hdeckTeste.zelarJanelas()
    })
    expect(fechadas).toBe(1)
    expect(await a.app.evaluate(() => (globalThis as H).orfa.isDestroyed())).toBe(true)
    // E a interface (mesmo escondida na bandeja) nunca é fechada pelo zelador.
    await a.app.evaluate(() => (globalThis as H).hdeckTeste.janelas.principal.hide())
    expect(await a.app.evaluate(() => (globalThis as H).hdeckTeste.zelarJanelas())).toBe(0)
    await a.app.evaluate(() => (globalThis as H).hdeckTeste.janelas.principal.show())
  } finally {
    await a.fechar()
  }
})

test('RN-092 pop-up de uma conta fecha junto com ela; ao sair do HDeck não sobra motor nem navegador', async () => {
  const a = await abrirApp()
  const popups = () => a.app.evaluate(() => (globalThis as H).hdeckTeste.fabrica.popups())
  let pidMotor = 0
  let pidsNavegador: number[] = []
  try {
    await garantirJogoFalso(a)
    const [c] = await criarContas(a, 1)
    await esperarEstado(a, c!, ['ativa', 'economica', 'escondida'])
    // Pop-up comum com "Abrir" (o teste responde 0): abre no motor.
    await a.app.evaluate(() => (globalThis as H).hdeckTeste.perguntador.respostas.push(0))
    await naConta(a, c!, "window.open('/comum')")
    await expect.poll(popups).toBe(1)
    pidMotor = (await a.app.evaluate(() => (globalThis as H).hdeckTeste.fabrica.d.motor.pid)) as number
    pidsNavegador = (
      await a.app.evaluate(() => (globalThis as H).hdeckTeste.fabrica.d.motor.pedir('processos'))
    ).map((p: { pid: number }) => p.pid)
    await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.motor.desligarConta(id), c!)
    await expect.poll(popups).toBe(0)
    expect(pidMotor).toBeGreaterThan(0)
    expect(pidsNavegador.length).toBeGreaterThan(0)
  } finally {
    await a.fechar()
  }
  await expect.poll(() => vivo(pidMotor), { timeout: 20_000 }).toBe(false)
  await expect.poll(() => pidsNavegador.filter(vivo), { timeout: 20_000 }).toEqual([])
})

test('RN-154 RN-081 login da live abre no motor do Edge e o login vai para a sessão das lives da conta', async () => {
  const a = await abrirApp({ env: { HDECK_TESTE_LOGIN_MOTOR: '1' } })
  try {
    await garantirJogoFalso(a)
    const [c] = await criarContas(a, 1)
    await esperarEstado(a, c!, ['ativa', 'economica', 'escondida'])
    await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.motor.entrarNaPlataforma(id, 'twitch'), c!)
    await expect.poll(() => a.app.evaluate(() => (globalThis as H).hdeckTeste.fabrica.popups())).toBe(1)
    // O cookie do login chega à sessão das lives desta conta (no Electron).
    await expect
      .poll(
        () =>
          a.app.evaluate(async ({ session }, id) => {
            const cs = await session.fromPartition(`persist:live-${id}`).cookies.get({ name: 'twitch_auth' })
            return cs.map((x) => x.value)
          }, c!),
        { timeout: 20_000 },
      )
      .toEqual(['ok'])
    // Fechar a janela de login não deixa nada para trás.
    await a.app.evaluate(() => (globalThis as H).hdeckTeste.fabrica.d.motor.pedir('fecharPopups'))
    await expect.poll(() => a.app.evaluate(() => (globalThis as H).hdeckTeste.fabrica.popups())).toBe(0)
  } finally {
    await a.fechar()
  }
})

test('RN-080 depois de conectar a Twitch, a conta aparece como conectada (o botão de conectar some)', async () => {
  const a = await abrirApp({ env: { HDECK_TESTE_LOGIN_MOTOR: '1' } })
  try {
    await garantirJogoFalso(a)
    const [c] = await criarContas(a, 1)
    await esperarEstado(a, c!, ['ativa', 'economica', 'escondida'])
    const conexoes = () =>
      a.janela.evaluate(async (id) => (await (window as H).hdeck.lives.conexoes({ contaId: id })).valor, c!)
    expect(await conexoes()).toEqual({ twitch: false, kick: false })
    await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.motor.entrarNaPlataforma(id, 'twitch'), c!)
    await expect.poll(conexoes, { timeout: 20_000 }).toEqual({ twitch: true, kick: false })
    // Na janela de lives, a Twitch aparece como conectada e o "Conectar Twitch" sumiu.
    await a.janela.evaluate((id) => (window as H).hdeck.lives.janela({ contaId: id }), c!)
    const janela = await a.app.waitForEvent('window', { predicate: (p) => p.url().includes('janela=lives') })
    await expect(janela.locator('.conectada')).toContainText('Twitch')
    await expect(janela.getByRole('button', { name: 'Conectar Twitch' })).toHaveCount(0)
    await expect(janela.getByRole('button', { name: 'Conectar Kick' }).first()).toBeVisible()
  } finally {
    await a.fechar()
  }
})

test('RN-080 RN-092 live selecionada aparece dentro da janela de lives (com o chat) e some ao fechar a janela', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c] = await criarContas(a, 1)
    await esperarEstado(a, c!, ['ativa', 'economica', 'escondida'])
    await a.app.evaluate(
      (_e, id) => (globalThis as H).hdeckTeste.motor.adicionarLive(id, 'twitch', 'canalvisto'),
      c!,
    )
    await a.janela.evaluate((id) => (window as H).hdeck.lives.janela({ contaId: id }), c!)
    const janela = await a.app.waitForEvent('window', { predicate: (p) => p.url().includes('janela=lives') })
    await janela.getByText('canalvisto').first().click()
    const urlsNaJanela = () =>
      a.app.evaluate(() => {
        const w = (globalThis as H).hdeckTeste.janelas.lives
        return w ? w.contentView.children.map((v: H) => v.webContents.getURL()) : []
      })
    await expect.poll(urlsNaJanela).toEqual([expect.stringContaining('/live/canalvisto')])
    // Sem som até ligar.
    expect(
      await a.app.evaluate(() =>
        (globalThis as H).hdeckTeste.janelas.lives.contentView.children[0].webContents.isAudioMuted(),
      ),
    ).toBe(true)
    await janela.getByRole('button', { name: 'Som' }).click()
    await expect
      .poll(() =>
        a.app.evaluate(() =>
          (globalThis as H).hdeckTeste.janelas.lives.contentView.children[0].webContents.isAudioMuted(),
        ),
      )
      .toBe(false)
    // Fechar a janela de lives não deixa a página da live para trás.
    const antes = await a.app.evaluate(
      ({ webContents }) =>
        webContents.getAllWebContents().filter((w) => w.getURL().includes('/live/canalvisto')).length,
    )
    await a.app.evaluate(() => (globalThis as H).hdeckTeste.janelas.lives.close())
    await expect
      .poll(() =>
        a.app.evaluate(
          ({ webContents }) =>
            webContents
              .getAllWebContents()
              .filter((w) => !w.isDestroyed() && w.getURL().includes('/live/canalvisto')).length,
        ),
      )
      .toBe(antes - 1)
  } finally {
    await a.fechar()
  }
})

test('RN-080 RN-092 desligar a live pelo botão da lista desliga de verdade; janela reabre do tamanho em que fechou; consumo por live', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c] = await criarContas(a, 1)
    await esperarEstado(a, c!, ['ativa', 'economica', 'escondida'])
    const l = await a.app.evaluate(
      (_e, id) => (globalThis as H).hdeckTeste.motor.adicionarLive(id, 'twitch', 'canaldois'),
      c!,
    )
    // RAM/CPU da live entram na conta e aparecem por live.
    await expect
      .poll(
        async () =>
          (await a.app.evaluate(() => (globalThis as H).hdeckTeste.motor.coletarMetricas())).porLive?.[
            l.valor.id
          ]?.ramMb ?? 0,
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0)
    // Abre a janela já na live.
    await a.janela.evaluate(
      ({ id, live }) => (window as H).hdeck.lives.janela({ contaId: id, liveId: live }),
      { id: c!, live: l.valor.id },
    )
    const janela = await a.app.waitForEvent('window', { predicate: (p) => p.url().includes('janela=lives') })
    expect(janela.url()).toContain(`live=${l.valor.id}`)
    const filhos = () =>
      a.app.evaluate(() => (globalThis as H).hdeckTeste.janelas.lives.contentView.children.length)
    await expect.poll(filhos).toBe(1)
    const players = () =>
      a.app.evaluate(
        ({ webContents }) =>
          webContents
            .getAllWebContents()
            .filter((w) => !w.isDestroyed() && w.getURL().includes('/live/canaldois')).length,
      )
    // O botão verde/vermelho desliga: nada da live continua tocando (nem o player escondido, nem o da janela).
    await janela.getByRole('button', { name: 'Desligar esta live' }).first().click()
    await expect
      .poll(
        async () =>
          (await a.app.evaluate(() => (globalThis as H).hdeckTeste.motor.snapshot())).lives[0].ligada,
      )
      .toBe(false)
    await expect.poll(players).toBe(0)
    await expect.poll(filhos).toBe(0)
    // Tamanho lembrado: muda, fecha e abre de novo do mesmo tamanho.
    await a.app.evaluate(() =>
      (globalThis as H).hdeckTeste.janelas.lives.setBounds({ x: 120, y: 90, width: 900, height: 640 }),
    )
    await a.app.evaluate(() => (globalThis as H).hdeckTeste.janelas.lives.close())
    await expect
      .poll(() => a.app.evaluate(() => (globalThis as H).hdeckTeste.janelas.lives === null))
      .toBe(true)
    await a.janela.evaluate((id) => (window as H).hdeck.lives.janela({ contaId: id }), c!)
    await expect
      .poll(() => a.app.evaluate(() => (globalThis as H).hdeckTeste.janelas.lives?.getBounds()))
      .toMatchObject({ width: 900, height: 640 })
  } finally {
    await a.fechar()
  }
})

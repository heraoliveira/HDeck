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

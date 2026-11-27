/** Fluxos E2E 3, 4, 5, 6 e 15 (Seção 15.2): quedas, sem dados, travamento, textos vigiados e otimização. */
import { expect, test } from '@playwright/test'
import { abrirApp, criarContas, garantirJogoFalso, naConta } from './ajuda.ts'

type H = any
const eventos = (a: Awaited<ReturnType<typeof abrirApp>>, id: string) =>
  a.app.evaluate(
    (_e, id) =>
      (globalThis as H).hdeckTeste.armazem
        .listarEventos(0, id)
        .map((e: { tipo: string; motivo: string }) => `${e.tipo}:${e.motivo}`),
    id,
  ) as Promise<string[]>
const avisos = (a: Awaited<ReturnType<typeof abrirApp>>) =>
  a.app.evaluate(() =>
    (globalThis as H).hdeckTeste.armazem.listarAvisos(100).map((x: { tipo: string }) => x.tipo),
  ) as Promise<string[]>
const config = (a: Awaited<ReturnType<typeof abrirApp>>, caminho: string, valor: unknown) =>
  a.app.evaluate(
    (_e, { caminho, valor }) => (globalThis as H).hdeckTeste.motor.alterarConfig(caminho, valor),
    { caminho, valor },
  )

test('RN-060 RN-062 WS principal cai → recarrega após o tempo; WS do chat caindo não recarrega', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    await config(a, 'queda.esperaQuedaSeg', 15)
    const [c] = await criarContas(a, 1)
    await new Promise((r) => setTimeout(r, 1500))
    a.servidor.derrubarWs(false) // chat
    await new Promise((r) => setTimeout(r, 17_000))
    expect((await eventos(a, c!)).filter((e) => e.startsWith('recarga'))).toEqual([])
    const t0 = Date.now()
    a.servidor.derrubarWs(true)
    await expect.poll(() => eventos(a, c!), { timeout: 30_000 }).toContain('recarga:queda')
    expect(Date.now() - t0).toBeGreaterThanOrEqual(14_000)
    // A conta volta a jogar depois da recarga.
    await expect
      .poll(() => naConta<number>(a, c!, 'window.__contagem?.ws ?? 0'), { timeout: 15_000 })
      .toBeGreaterThan(2)
  } finally {
    await a.fechar()
  }
})

test('RN-061 queda permanente: para depois das tentativas e avisa', async () => {
  const a = await abrirApp({ env: { HDECK_TESTE_ACELERAR: '40' } })
  try {
    await garantirJogoFalso(a)
    const [c] = await criarContas(a, 1)
    await new Promise((r) => setTimeout(r, 500))
    a.servidor.estado.aceitarWs = false
    a.servidor.derrubarWs(true)
    await expect
      .poll(() => avisos(a), { timeout: 90_000, intervals: [1000] })
      .toContain('caiu')
      .catch(async (e) => {
        console.log('EVENTOS', JSON.stringify(await eventos(a, c!)))
        throw e
      })
    const recargas = (await eventos(a, c!)).filter((e) => e === 'recarga:queda')
    expect(recargas.length).toBe(4)
  } finally {
    await a.fechar()
  }
})

test('RN-064 parar de mandar dados → aviso "sem dados"', async () => {
  const a = await abrirApp({ env: { HDECK_TESTE_ACELERAR: '20' } })
  try {
    await garantirJogoFalso(a)
    await config(a, 'queda.avisarSemDadosMin', 1)
    await config(a, 'queda.recarregarQuandoCair', false)
    await criarContas(a, 1)
    a.servidor.estado.intervaloDadosMs = 0
    await expect.poll(() => avisos(a), { timeout: 30_000 }).toContain('sem_dados')
  } finally {
    await a.fechar()
  }
})

test('RN-065 RN-066 página travada recarrega; processo morto recarrega com o motivo registrado', async () => {
  test.setTimeout(3 * 60_000)
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    await config(a, 'queda.travadaSeg', 5)
    await config(a, 'queda.esperaQuedaSeg', 15)
    const [c] = await criarContas(a, 1)
    await new Promise((r) => setTimeout(r, 1000))
    a.servidor.enviarParaPaginas({ travar: 60_000 })
    await expect
      .poll(() => eventos(a, c!), { timeout: 90_000, intervals: [1000] })
      .toContain('recarga:travou')
    await expect
      .poll(() => naConta<number>(a, c!, 'window.__contagem?.intervalo ?? 0'), { timeout: 30_000 })
      .toBeGreaterThan(2)
    await a.app.evaluate(
      (_e, id) => (globalThis as H).hdeckTeste.fabrica.view(id).webContents.forcefullyCrashRenderer(),
      c!,
    )
    await expect.poll(() => eventos(a, c!), { timeout: 40_000 }).toContain('recarga:fechou')
    expect((await eventos(a, c!)).some((e) => e.startsWith('fechou:'))).toBe(true)
  } finally {
    await a.fechar()
  }
})

test('RN-120 RN-123 texto vigiado aparece → avisa uma vez; some e volta → avisa de novo', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    await config(a, 'avisos.varreduraSeg', 2)
    await a.app.evaluate(() =>
      (globalThis as H).hdeckTeste.motor.salvarTexto({
        texto: 'Verificação',
        escopo: 'todas',
        alvoId: null,
        ativo: true,
      }),
    )
    await criarContas(a, 1)
    a.servidor.enviarParaPaginas({ texto: 'Faça a VERIFICACAO humana' })
    await expect
      .poll(async () => (await avisos(a)).filter((x) => x === 'texto_vigiado').length, { timeout: 15_000 })
      .toBe(1)
    await new Promise((r) => setTimeout(r, 5000))
    expect((await avisos(a)).filter((x) => x === 'texto_vigiado').length).toBe(1)
    a.servidor.enviarParaPaginas({ texto: '' })
    await new Promise((r) => setTimeout(r, 5000))
    a.servidor.enviarParaPaginas({ texto: 'verificação' })
    await expect
      .poll(async () => (await avisos(a)).filter((x) => x === 'texto_vigiado').length, { timeout: 15_000 })
      .toBe(2)
  } finally {
    await a.fechar()
  }
})

test('RN-056 RN-057 otimização programada recarrega escalonado e nunca a conta em uso', async () => {
  const a = await abrirApp({ env: { HDECK_TESTE_ACELERAR: '600' } })
  try {
    await garantirJogoFalso(a)
    await config(a, 'otimizacao.otimizarACadaMin', 0)
    const ids = await criarContas(a, 3)
    await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.motor.ativar(id), ids[0]!)
    // Mantém a conta 1 "em uso" o tempo todo.
    await a.app.evaluate((_e, id) => {
      ;(globalThis as H).usando = setInterval(() => (globalThis as H).hdeckTeste.motor.usou(id), 20)
    }, ids[0]!)
    await config(a, 'otimizacao.recarregarACadaH', 2)
    await expect
      .poll(
        async () => {
          const todas = await Promise.all(ids.map((id) => eventos(a, id)))
          const n = todas.map((ev) => ev.filter((e) => e === 'recarga:programada').length)
          return n[1]! >= 1 && n[2]! >= 1 ? n[0] : -1
        },
        { timeout: 60_000 },
      )
      .toBe(0)
    const [, r2, r3] = await Promise.all(ids.map((id) => eventos(a, id)))
    expect(r2!.filter((e) => e === 'recarga:programada').length).toBeGreaterThanOrEqual(1)
    expect(r3!.filter((e) => e === 'recarga:programada').length).toBeGreaterThanOrEqual(1)
    const tempos = await a.app.evaluate(() =>
      (globalThis as H).hdeckTeste.armazem
        .listarEventos(0)
        .filter((e: { motivo: string }) => e.motivo === 'programada')
        .map((e: { em: number }) => e.em),
    )
    for (let i = 1; i < tempos.length; i++) expect(tempos[i] - tempos[i - 1]).toBeGreaterThanOrEqual(19_000)
    await a.app.evaluate(() => clearInterval((globalThis as H).usando))
  } finally {
    await a.fechar()
  }
})

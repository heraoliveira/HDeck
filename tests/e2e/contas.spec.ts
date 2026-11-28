/**
 * Fluxos E2E 1, 2, 7, 8, 9, 10 e 16 (Seção 15.2): isolamento, contas escondidas, modo econômico,
 * troca de grupo, divisões, conta solta e queda da interface.
 */
import { expect, test } from '@playwright/test'
import { iniciarServidorFalso } from '../fixtures/servidor.ts'
import { abrirApp, criarContas, esperarEstado, garantirJogoFalso, naConta } from './ajuda.ts'

type H = any
const h = (s: string) => `(globalThis.hdeckTeste)${s}`

test('RN-010 RN-011 cada conta tem login próprio e ele continua depois de reabrir o app', async () => {
  const servidor = await iniciarServidorFalso()
  const a = await abrirApp({ servidor })
  const [c1, c2] = await (async () => {
    await garantirJogoFalso(a)
    return criarContas(a, 2)
  })()
  for (const [id, usuario] of [
    [c1!, 'alice'],
    [c2!, 'bruno'],
  ] as const) {
    await a.app.evaluate((_e, { id, url }) => (globalThis as H).hdeckTeste.motor.pagina(id).carregar(url), {
      id,
      url: `${a.servidor.url}/definir-login?u=${usuario}`,
    })
  }
  await expect.poll(() => naConta(a, c1!, "document.getElementById('usuario')?.textContent")).toBe('alice')
  await expect.poll(() => naConta(a, c2!, "document.getElementById('usuario')?.textContent")).toBe('bruno')
  const pasta = a.pasta
  await a.fechar(false)

  const b = await abrirApp({ pasta, servidor })
  try {
    await esperarEstado(b, c1!, ['ativa', 'economica', 'escondida'])
    await esperarEstado(b, c2!, ['ativa', 'economica', 'escondida'])
    await expect.poll(() => naConta(b, c1!, "document.getElementById('usuario')?.textContent")).toBe('alice')
    await expect.poll(() => naConta(b, c2!, "document.getElementById('usuario')?.textContent")).toBe('bruno')
  } finally {
    await b.fechar()
    await servidor.fechar()
  }
})

test('RN-050 minimizada, na bandeja e coberta por 2 min: os timers seguem', async () => {
  test.setTimeout(4 * 60_000)
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c] = await criarContas(a, 1)
    const ticks = () =>
      naConta<{ intervalo: number; visivelSempre: boolean }>(a, c!, '({...window.__contagem})')
    const antes = await ticks()
    const t0 = Date.now()
    await a.app.evaluate(() => (globalThis as H).hdeckTeste.janelas.principal.minimize())
    await new Promise((r) => setTimeout(r, 40_000))
    await a.app.evaluate(() => {
      const j = (globalThis as H).hdeckTeste.janelas.principal
      j.restore()
      j.hide()
    })
    await new Promise((r) => setTimeout(r, 40_000))
    await a.app.evaluate(({ BrowserWindow }) => {
      const j = (globalThis as H).hdeckTeste.janelas.principal
      j.show()
      ;(globalThis as H).capa = new BrowserWindow({ ...j.getBounds(), alwaysOnTop: true, frame: false })
    })
    await new Promise((r) => setTimeout(r, 40_000))
    await a.app.evaluate(() => (globalThis as H).capa.close())
    const depois = await ticks()
    const esperado = ((Date.now() - t0) / 1000) * 4
    const pct = ((depois.intervalo - antes.intervalo) / esperado) * 100
    console.log(`timers escondidos: ${pct.toFixed(1)}%`)
    expect(pct).toBeGreaterThanOrEqual(95)
    expect(depois.visivelSempre).toBe(true)
  } finally {
    await a.fechar()
  }
})

test('RN-051 Economizar (padrão): a conta em foto não desenha, mas os timers seguem a 100% e a foto atualiza', async () => {
  test.setTimeout(2 * 60_000)
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c1, c2] = await criarContas(a, 2)
    await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.motor.ativar(id), c1!)
    await esperarEstado(a, c2!, ['economica'])
    await expect
      .poll(
        async () =>
          (await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.fabrica.pagina(id).nativo(), c2!))
            .visivel,
      )
      .toBe(false)
    const ticks = () => naConta<{ intervalo: number }>(a, c2!, '({...window.__contagem})')
    const antes = await ticks()
    const t0 = Date.now()
    const f1 = await a.app.evaluate(async (_e, id) => {
      const b = await (globalThis as H).hdeckTeste.fabrica.pagina(id).capturar(320, 200)
      return b ? Buffer.from(b).toString('base64') : null
    }, c2!)
    await new Promise((r) => setTimeout(r, 30_000))
    const depois = await ticks()
    const pct = ((depois.intervalo - antes.intervalo) / (((Date.now() - t0) / 1000) * 4)) * 100
    console.log(`timers da conta em foto (Economizar): ${pct.toFixed(1)}%`)
    expect(pct).toBeGreaterThanOrEqual(95)
    // A foto acorda a página só para ela: sai uma imagem nova (o contador mudou) e a página volta a dormir.
    const f2 = await a.app.evaluate(async (_e, id) => {
      const b = await (globalThis as H).hdeckTeste.fabrica.pagina(id).capturar(320, 200)
      return b ? Buffer.from(b).toString('base64') : null
    }, c2!)
    expect(f1).not.toBeNull()
    expect(f2).not.toBeNull()
    expect(f2).not.toBe(f1)
    await expect
      .poll(
        async () =>
          (await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.fabrica.pagina(id).nativo(), c2!))
            .visivel,
      )
      .toBe(false)
  } finally {
    await a.fechar()
  }
})

test('RN-052 RN-053 RN-044 modo econômico: foto continua farmando, clique põe ao vivo, diálogo vira foto', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c1, c2] = await criarContas(a, 2)
    await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.motor.ativar(id), c1!)
    await esperarEstado(a, c1!, ['ativa'])
    await esperarEstado(a, c2!, ['economica'])
    const antes = await naConta<number>(a, c2!, 'window.__contagem.intervalo')
    await new Promise((r) => setTimeout(r, 3000))
    expect(await naConta<number>(a, c2!, 'window.__contagem.intervalo')).toBeGreaterThan(antes + 9)
    // A foto chega à interface.
    await expect(a.janela.locator(`[data-conta="${c2}"] .foto img`)).toHaveCount(1, { timeout: 10_000 })
    // Clicar na foto põe ao vivo.
    await a.janela.locator(`[data-conta="${c2}"] .foto`).click()
    await esperarEstado(a, c2!, ['ativa'])
    await esperarEstado(a, c1!, ['economica'])
    // Abrir as Configurações troca as views por fotos; fechar devolve.
    await a.janela.getByRole('button', { name: 'Configurações' }).click()
    await esperarEstado(a, c2!, ['economica'])
    const naTela = await a.app.evaluate(
      async (_e, id) => (await (globalThis as H).hdeckTeste.fabrica.pagina(id).nativo()).naTela,
      c2!,
    )
    expect(naTela).toBe(false)
    await a.janela.keyboard.press('Escape')
    await esperarEstado(a, c2!, ['ativa'])
  } finally {
    await a.fechar()
  }
})

test('RN-031 RN-032 trocar para o grupo B desliga o A e abre o B aos poucos', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const ids = await criarContas(a, 2)
    for (const id of ids) await esperarEstado(a, id, ['ativa', 'economica', 'escondida'])
    const pidsA = await a.app.evaluate(
      (_e, ids) => ids.map((id: string) => (globalThis as H).hdeckTeste.fabrica.pagina(id).pid()),
      ids,
    )
    expect(pidsA.every((p: number | null) => typeof p === 'number')).toBe(true)
    const { b, contasB } = await a.app.evaluate((_e, url) => {
      const m = (globalThis as H).hdeckTeste.motor
      const b = m.criarGrupo('B')
      const contasB = [0, 1].map(
        (i) => m.adicionarConta({ grupoId: b.id, jogoId: 'falso', url, nome: `B${i}` }).valor.id,
      )
      return { b: b.id, contasB }
    }, `${a.servidor.url}/jogo`)
    const t0 = Date.now()
    await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.motor.trocarGrupo(id, true), b)
    await expect
      .poll(() => a.app.evaluate(() => (globalThis as H).hdeckTeste.motor.contasLigadas()))
      .toBeLessThanOrEqual(2)
    for (const id of ids) await esperarEstado(a, id, ['desligada'])
    // Processos do grupo A fechados.
    const vivo = (pid: number) => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    }
    await expect.poll(() => pidsA.filter(vivo)).toEqual([])
    await esperarEstado(a, contasB[0]!, ['ativa', 'economica', 'escondida', 'carregando'])
    await esperarEstado(a, contasB[1]!, ['ativa', 'economica', 'escondida'])
    expect(Date.now() - t0).toBeGreaterThanOrEqual(2500) // uma a cada 3 s
  } finally {
    await a.fechar()
  }
})

test('RN-041 RN-042 divisões 2×2, 1+3 e personalizada posicionam as views; redimensionar reposiciona', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const ids = await criarContas(a, 4)
    await a.app.evaluate(() =>
      (globalThis as H).hdeckTeste.motor.alterarConfig('economia.modoEconomico', false),
    )
    const conferir = async () => {
      // A view de cada conta fica exatamente sobre o espaço da moldura na interface.
      for (const id of ids) {
        await expect
          .poll(async () => {
            const caixa = await a.janela.locator(`[data-conta="${id}"] .corpo`).boundingBox()
            const v = await a.app.evaluate(
              (_e, id) => (globalThis as H).hdeckTeste.fabrica.pagina(id).nativo(),
              id,
            )
            return caixa
              ? Math.abs(caixa.x - v.x) + Math.abs(caixa.y - v.y) + Math.abs(caixa.width - v.largura)
              : 999
          })
          .toBeLessThanOrEqual(4)
      }
    }
    for (const divisao of ['2x2', '1+3'] as const) {
      await a.app.evaluate((_e, d) => {
        const m = (globalThis as H).hdeckTeste.motor
        m.definirLayout(m.listarGrupos()[0].id, 'grade', { divisao: d })
      }, divisao)
      await conferir()
    }
    await a.app.evaluate(() => {
      const m = (globalThis as H).hdeckTeste.motor
      m.definirLayout(m.listarGrupos()[0].id, 'grade', {
        divisao: 'personalizada',
        personalizada: [
          { x: 0, y: 0, l: 0.6, a: 0.5 },
          { x: 0.6, y: 0, l: 0.4, a: 0.5 },
          { x: 0, y: 0.5, l: 0.3, a: 0.5 },
          { x: 0.3, y: 0.5, l: 0.7, a: 0.5 },
        ],
      })
    })
    await conferir()
    await a.app.evaluate(() => (globalThis as H).hdeckTeste.janelas.principal.setSize(1000, 700))
    await conferir()
  } finally {
    await a.fechar()
  }
})

test('RN-019 conta solta em janela própria e de volta sem recarregar', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c] = await criarContas(a, 1)
    await expect.poll(() => naConta<number>(a, c!, 'window.__contagem?.intervalo ?? 0')).toBeGreaterThan(8)
    const antes = await naConta<number>(a, c!, 'window.__contagem.intervalo')
    await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.motor.soltar(id), c!)
    await expect
      .poll(() => a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.janelas.soltas.has(id), c!))
      .toBe(true)
    await expect
      .poll(() =>
        a.app.evaluate(async (_e, id) => {
          const t = (globalThis as H).hdeckTeste
          const hwnd = t.janelas.soltas.get(id).getNativeWindowHandle().readBigUInt64LE(0).toString()
          return (await t.fabrica.pagina(id).nativo()).janela === hwnd
        }, c!),
      )
      .toBe(true)
    await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.janelas.soltas.get(id).close(), c!)
    await expect
      .poll(() => a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.janelas.soltas.has(id), c!))
      .toBe(false)
    const depois = await naConta<number>(a, c!, 'window.__contagem.intervalo')
    expect(depois).toBeGreaterThan(antes) // o contador não zerou: mesma página
    expect(
      await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.motor.snapshot().estados[id].solta, c!),
    ).toBe(false)
  } finally {
    await a.fechar()
  }
})

test('RN-070 a interface cai e volta sem recarregar as contas', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c] = await criarContas(a, 1)
    const antes = await naConta<number>(a, c!, 'window.__contagem.intervalo')
    await a.app.evaluate(() =>
      (globalThis as H).hdeckTeste.janelas.principal.webContents.forcefullyCrashRenderer(),
    )
    await expect
      .poll(
        () =>
          a.app.evaluate(async () => {
            const wc = (globalThis as H).hdeckTeste.janelas.principal.webContents
            if (wc.isCrashed()) return -1
            return wc.executeJavaScript('document.querySelectorAll(".moldura").length').catch(() => -1)
          }),
        { timeout: 20_000 },
      )
      .toBe(1)
    expect(await naConta<number>(a, c!, 'window.__contagem.intervalo')).toBeGreaterThan(antes)
    void h
  } finally {
    await a.fechar()
  }
})

test('RN-041 barra de rolagem da página da conta fica por cima: não muda a largura do jogo', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c] = await criarContas(a, 1)
    await esperarEstado(a, c!, ['ativa'])
    const largura = () => naConta<number>(a, c!, 'document.documentElement.clientWidth')
    const antes = await largura()
    // Conteúdo maior que a tela: aparece a barra de rolagem.
    await naConta(
      a,
      c!,
      'document.body.insertAdjacentHTML(\'beforeend\', \'<div id="alto" style="height:5000px"></div>\')',
    )
    await new Promise((r) => setTimeout(r, 300))
    const com = await largura()
    expect(await naConta<number>(a, c!, 'document.documentElement.scrollHeight')).toBeGreaterThan(4000)
    expect(com).toBe(antes)
  } finally {
    await a.fechar()
  }
})

test('RN-041 grade automática com a barra dos grupos aberta: a interface não fica remedindo (nada de tremor)', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const ids = await criarContas(a, 3)
    for (const id of ids) await esperarEstado(a, id, ['ativa', 'economica', 'escondida'])
    await a.app.evaluate(() => {
      const m = (globalThis as H).hdeckTeste.motor
      ;(globalThis as H).chamadas = []
      const orig = m.definirEspacos.bind(m)
      m.definirEspacos = (j: string, e: unknown) => {
        ;(globalThis as H).chamadas.push(JSON.stringify(e))
        return orig(j, e)
      }
    })
    await new Promise((r) => setTimeout(r, 15000))
    const c = await a.app.evaluate(() => (globalThis as H).chamadas)
    expect(c.length).toBeLessThan(3)
  } finally {
    await a.fechar()
  }
})

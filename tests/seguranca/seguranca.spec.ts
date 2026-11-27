/**
 * Testes de segurança (Seção 15.1): travas das páginas, permissões, navegação, IPC, rede e fuses.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses'
import { expect, test } from '@playwright/test'
import { abrirApp, criarContas, garantirJogoFalso, naConta } from '../e2e/ajuda.ts'

type H = any

test('toda página tem sandbox e isolamento, sem nodeIntegration nem preload (exceto a interface); webview negado', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c] = await criarContas(a, 1)
    await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.motor.adicionarLive(id, 'twitch', 'x'), c!)
    await naConta(a, c!, "window.open('/oauth/login')")
    await new Promise((r) => setTimeout(r, 1500))
    const paginas = await a.app.evaluate(async ({ webContents }) => {
      const t = (globalThis as H).hdeckTeste
      const interfaces = new Set(t.janelas.interfaces().map((w: { id: number }) => w.id))
      const todas = webContents.getAllWebContents().filter((wc) => !wc.getURL().startsWith('devtools://'))
      return Promise.all(
        todas.map(async (wc) => {
          const p = (wc as H).getLastWebPreferences?.() ?? {}
          // Só a interface recebe a ponte do preload.
          const ponte = await wc.executeJavaScript('typeof window.hdeck').catch(() => 'erro')
          return {
            url: wc.getURL(),
            interface: interfaces.has(wc.id),
            sandbox: p.sandbox,
            isolamento: p.contextIsolation,
            node: p.nodeIntegration,
            preload: ponte === 'object',
            webview: p.webviewTag,
            travaWebview: wc.listenerCount('will-attach-webview') > 0,
            travaNavegacao: wc.listenerCount('will-navigate') > 0,
          }
        }),
      )
    })
    expect(paginas.length).toBeGreaterThanOrEqual(3)
    for (const p of paginas) {
      if (p.url.startsWith('devtools://')) continue
      expect(p.sandbox, p.url).toBe(true)
      expect(p.isolamento, p.url).toBe(true)
      expect(p.node, p.url).toBeFalsy()
      expect(p.webview, p.url).toBeFalsy()
      expect(p.preload, p.url).toBe(p.interface)
      expect(p.travaWebview, p.url).toBe(true)
      expect(p.travaNavegacao, p.url).toBe(true)
    }
  } finally {
    await a.fechar()
  }
})

test('RN-152 permissões negadas: câmera, microfone, localização, notificações sem permissão da conta', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c] = await criarContas(a, 1)
    const r = await naConta<Record<string, string>>(
      a,
      c!,
      `(async () => {
        const out = {}
        try { await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); out.midia = 'liberado' } catch (e) { out.midia = 'negado' }
        out.geo = await new Promise((res) => navigator.geolocation.getCurrentPosition(() => res('liberado'), () => res('negado'), { timeout: 3000 }))
        out.notificacao = await Notification.requestPermission()
        out.midi = await navigator.requestMIDIAccess().then(() => 'liberado', () => 'negado')
        return out
      })()`,
    )
    expect(r).toEqual({ midia: 'negado', geo: 'negado', notificacao: 'denied', midi: 'negado' })
  } finally {
    await a.fechar()
  }
})

test('RN-153 navegação para file:, javascript: e esquemas externos bloqueada', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c] = await criarContas(a, 1)
    for (const destino of ['file:///C:/Windows/win.ini', 'steam://run/1', 'http://example.com/']) {
      await naConta(a, c!, `location.href = ${JSON.stringify(destino)}`)
      await new Promise((r) => setTimeout(r, 800))
      expect(
        await a.app.evaluate(
          (_e, id) => (globalThis as H).hdeckTeste.fabrica.view(id).webContents.getURL(),
          c!,
        ),
      ).toContain('/jogo')
    }
  } finally {
    await a.fechar()
  }
})

test('RN-005 o HDeck não bloqueia anúncios nem conteúdo dos sites', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c] = await criarContas(a, 1)
    const r = await naConta(
      a,
      c!,
      `new Promise((res) => { const s = document.createElement('script'); s.src = '/anuncio/ads.js'; s.onload = () => res(window.__anuncio === true); s.onerror = () => res(false); document.head.appendChild(s) })`,
    )
    expect(r).toBe(true)
  } finally {
    await a.fechar()
  }
})

test('IPC de remetente estranho é recusado', async () => {
  const a = await abrirApp()
  try {
    const r = await a.app.evaluate(
      async ({ BrowserWindow }, preload) => {
        const w = new BrowserWindow({
          show: false,
          webPreferences: { preload, sandbox: true, contextIsolation: true },
        })
        await w.loadURL('app://hdeck/index.html?janela=intrusa')
        const resposta = await w.webContents.executeJavaScript('window.hdeck.estado.obter()')
        w.destroy()
        return resposta
      },
      join(process.cwd(), 'out/preload/shell.cjs'),
    )
    expect(r).toEqual({ ok: false, erro: 'remetente' })
    // A interface de verdade consegue.
    const ok = await a.janela.evaluate(() => (window as H).hdeck.estado.obter())
    expect(ok.ok).toBe(true)
    // Entrada inválida é recusada pelo esquema.
    const ruim = await a.janela.evaluate(() => (window as H).hdeck.contas.ativar({ id: 'x', extra: 1 }))
    expect(ruim).toEqual({ ok: false, erro: 'entrada' })
  } finally {
    await a.fechar()
  }
})

test('RN-003 RN-004 sem contas, o app não fala com nenhum servidor', async () => {
  const a = await abrirApp()
  try {
    const destinos = await a.app.evaluate(async ({ session }) => {
      const vistos: string[] = []
      const s = session.defaultSession
      s.webRequest.onBeforeRequest((d, cb) => {
        vistos.push(d.url)
        cb({})
      })
      await new Promise((r) => setTimeout(r, 15_000))
      return vistos
    })
    const externos = destinos.filter(
      (u) => !/^(app|devtools|chrome|data|blob):/.test(u) && !u.startsWith('http://localhost'),
    )
    expect(externos).toEqual([])
  } finally {
    await a.fechar()
  }
})

test('RN-172 só uma cópia do app abre; a segunda traz a janela', async () => {
  const a = await abrirApp()
  try {
    const exe = await a.app.evaluate(() => process.execPath)
    const r = spawnSync(exe, [join(process.cwd(), 'out/main/index.js')], {
      env: { ...process.env, HDECK_TESTE: '1', HDECK_DADOS: a.pasta },
      timeout: 20_000,
    })
    expect(r.status).toBe(0)
    expect(await a.app.evaluate(() => (globalThis as H).hdeckTeste.janelas.principal.isVisible())).toBe(true)
  } finally {
    await a.fechar()
  }
})

test('fuses do executável empacotado com os valores da Seção 11', async () => {
  const exe = join(process.cwd(), 'dist/win-unpacked/HDeck.exe')
  test.skip(!existsSync(exe), 'rode `pnpm dist` antes para gerar o executável')
  const f = await getCurrentFuseWire(exe)
  expect(f[FuseV1Options.RunAsNode]).toBe(48) // '0' = desligado
  expect(f[FuseV1Options.EnableNodeOptionsEnvironmentVariable]).toBe(48)
  expect(f[FuseV1Options.EnableNodeCliInspectArguments]).toBe(48)
  expect(f[FuseV1Options.EnableCookieEncryption]).toBe(49) // '1' = ligado
  expect(f[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]).toBe(49)
  expect(f[FuseV1Options.OnlyLoadAppFromAsar]).toBe(49)
  expect(f[FuseV1Options.GrantFileProtocolExtraPrivileges]).toBe(48)
})

test('RN-172 o executável empacotado abre a interface com o app de dentro do asar', async () => {
  const exe = join(process.cwd(), 'dist/win-unpacked/HDeck.exe')
  test.skip(!existsSync(exe), 'rode pnpm dist antes para gerar o executável')
  const { spawn } = await import('node:child_process')
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const pasta = mkdtempSync(join(tmpdir(), 'hdeck-exe-'))
  // Com as fuses, o Playwright não consegue se ligar ao executável (sem --inspect): confere pelo log.
  const p = spawn(exe, [], { env: { ...process.env, HDECK_DADOS: pasta } })
  try {
    const log = () => {
      try {
        return readFileSync(join(pasta, 'logs', 'main.log'), 'utf8')
      } catch {
        return ''
      }
    }
    await expect.poll(log, { timeout: 30_000 }).toContain('interface carregada')
    // RunAsNode desligado: o executável não vira um Node com ELECTRON_RUN_AS_NODE.
    const r = spawnSync(exe, ['-e', 'console.log(1+1)'], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      timeout: 5000,
    })
    expect(String(r.stdout ?? '').trim()).not.toBe('2')
  } finally {
    p.kill()
    await new Promise((r) => setTimeout(r, 1500))
    rmSync(pasta, { recursive: true, force: true, maxRetries: 5 })
  }
})

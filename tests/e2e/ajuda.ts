/**
 * Ajuda dos testes E2E: abre o HDeck empacotado pelo electron-vite (out/) numa pasta de dados
 * nova, com o jogo falso e a live falsa, e dá acesso ao main pelo `hdeckTeste` (modo de teste).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, expect, type Page } from '@playwright/test'
import { iniciarServidorFalso, type ServidorFalso } from '../fixtures/servidor.ts'

export type App = {
  app: ElectronApplication
  janela: Page
  servidor: ServidorFalso
  pasta: string
  fechar: (apagar?: boolean) => Promise<void>
}

export async function abrirApp(
  opcoes: { pasta?: string; servidor?: ServidorFalso; env?: Record<string, string> } = {},
): Promise<App> {
  const servidor = opcoes.servidor ?? (await iniciarServidorFalso())
  const pasta = opcoes.pasta ?? mkdtempSync(join(tmpdir(), 'hdeck-e2e-'))
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
    env: {
      ...process.env,
      HDECK_TESTE: '1',
      HDECK_DADOS: pasta,
      HDECK_TESTE_LIVE_URL: `${servidor.url}/live/{canal}`,
      HDECK_TESTE_TELEGRAM_URL: `${servidor.url}/telegram`,
      ...opcoes.env,
    },
  })
  const janela = await app.firstWindow()
  await janela.waitForLoadState('domcontentloaded')
  await expect.poll(() => app.evaluate(() => Boolean((globalThis as { hdeckTeste?: unknown }).hdeckTeste))).toBe(true)
  return {
    app,
    janela,
    servidor,
    pasta,
    async fechar(apagar = true) {
      await app.evaluate(({ app }) => {
        ;(globalThis as { hdeckTeste?: { motor: { encerrar(): void } } }).hdeckTeste?.motor.encerrar()
        app.exit(0)
      }).catch(() => {})
      await app.close().catch(() => {})
      if (!opcoes.servidor) await servidor.fechar()
      if (apagar) rmSync(pasta, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
    },
  }
}

type Teste = {
  motor: {
    adicionarConta(d: unknown): { ok: boolean; valor: { id: string } }
    listarGrupos(): { id: string; ligado: boolean }[]
    listarContas(): { id: string; nome: string; grupoId: string }[]
    ligarGrupo(id: string, l: boolean, c?: boolean): unknown
    snapshot(): { estados: Record<string, { estado: string }> }
  }
}

/** Cria contas do jogo falso no primeiro grupo e liga o grupo. Devolve os ids. */
export async function criarContas(a: App, n: number, caminho = '/jogo'): Promise<string[]> {
  const ids = await a.app.evaluate(
    (_e, { n, url }) => {
      const h = (globalThis as unknown as { hdeckTeste: Teste }).hdeckTeste
      const g = h.motor.listarGrupos()[0]!.id
      const ids: string[] = []
      for (let i = 0; i < n; i++) {
        const r = h.motor.adicionarConta({ grupoId: g, jogoId: 'falso', url, nome: `Conta ${i + 1}` })
        if (r.ok) ids.push(r.valor.id)
      }
      h.motor.ligarGrupo(g, true, true)
      return ids
    },
    { n, url: `${a.servidor.url}${caminho}` },
  )
  for (const id of ids) await esperarEstado(a, id, ['ativa', 'economica', 'escondida', 'com_aviso'])
  return ids
}

export async function garantirJogoFalso(a: App): Promise<void> {
  await a.app.evaluate((_e, url) => {
    const h = (globalThis as unknown as { hdeckTeste: { motor: { salvarJogo(j: unknown): void } } }).hdeckTeste
    h.motor.salvarJogo({
      id: 'falso',
      nome: 'Jogo Falso',
      dominios: ['localhost'],
      urlInicial: `${url}/jogo`,
      icone: '🎲',
      farmaEscondido: false,
      dadosContinuos: false,
      semDadosMinPadrao: 0,
      limiteContas: null,
      bonusLive: true,
      plataformasLive: ['twitch'],
      wsPrincipal: '/ws',
      seletoresLogin: { usuario: '#usuario-campo', senha: '#senha-campo' },
      seletorPedeLogin: null,
      canvas: false,
      origem: 'usuario',
    })
  }, a.servidor.url)
}

export async function esperarEstado(a: App, id: string, estados: string[], timeout = 30_000): Promise<void> {
  await expect
    .poll(
      () =>
        a.app.evaluate(
          (_e, id) => (globalThis as unknown as { hdeckTeste: Teste }).hdeckTeste.motor.snapshot().estados[id]?.estado,
          id,
        ),
      { timeout },
    )
    .toMatch(new RegExp(`^(${estados.join('|')})$`))
}

/** Executa código na página de uma conta (no mundo da página, só para ler contadores do jogo falso). */
export async function naConta<T>(a: App, id: string, codigo: string): Promise<T> {
  return a.app.evaluate(
    async (_e, { id, codigo }) => {
      const h = (globalThis as unknown as { hdeckTeste: { fabrica: { view(id: string): { webContents: { executeJavaScript(c: string): Promise<unknown> } } | undefined } } }).hdeckTeste
      return h.fabrica.view(id)?.webContents.executeJavaScript(codigo)
    },
    { id, codigo },
  ) as Promise<T>
}

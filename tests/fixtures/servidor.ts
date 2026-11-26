/**
 * Jogo falso e live falsa (Seção 15): servidor HTTP + WebSocket local e controlável.
 * Usado pelos testes E2E, pelas provas técnicas e pela bancada. Roda em Node puro.
 */
import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type WebSocket, WebSocketServer } from 'ws'

const aqui = dirname(fileURLToPath(import.meta.url))
const paginaJogo = readFileSync(join(aqui, 'jogo-falso', 'jogo.html'), 'utf8')
const paginaLive = readFileSync(join(aqui, 'live-falsa', 'live.html'), 'utf8')

export type EstadoServidor = {
  /** Envia um quadro a cada N ms no WebSocket principal (0 = parado). */
  intervaloDadosMs: number
  aceitarWs: boolean
  texto: string
  submits: number
  logins: Record<string, string>
  lives: Record<string, { aoVivo: boolean; raidPara: string | null; assistidoSeg: number }>
  pings: number
  discord: unknown[]
  telegram: unknown[]
  discord429: number
  status500: boolean
}

export type ServidorFalso = {
  url: string
  porta: number
  estado: EstadoServidor
  derrubarWs: (principal?: boolean) => void
  enviarParaPaginas: (msg: unknown) => void
  fechar: () => Promise<void>
}

export async function iniciarServidorFalso(porta = 0): Promise<ServidorFalso> {
  const estado: EstadoServidor = {
    intervaloDadosMs: 250,
    aceitarWs: true,
    texto: '',
    submits: 0,
    logins: {},
    lives: {},
    pings: 0,
    discord: [],
    telegram: [],
    discord429: 0,
    status500: false,
  }
  const principais = new Set<WebSocket>()
  const secundarios = new Set<WebSocket>()

  const live = (canal: string) => {
    estado.lives[canal] ??= { aoVivo: true, raidPara: null, assistidoSeg: 0 }
    return estado.lives[canal]
  }

  const corpo = (req: IncomingMessage) =>
    new Promise<string>((res) => {
      let s = ''
      req.on('data', (c) => {
        s += c
      })
      req.on('end', () => res(s))
    })

  const responder = (res: ServerResponse, status: number, tipo: string, texto: string, extra = {}) => {
    res.writeHead(status, { 'content-type': tipo, 'cache-control': 'no-store', ...extra })
    res.end(texto)
  }

  const servidor = createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://localhost')
    const cookies = Object.fromEntries(
      (req.headers.cookie ?? '')
        .split(';')
        .map((c) => c.trim().split('='))
        .filter((p) => p.length === 2),
    )
    if (u.pathname === '/' || u.pathname === '/jogo') {
      if (estado.status500) return responder(res, 503, 'text/plain', 'fora do ar')
      const usuario = cookies.usuario ? decodeURIComponent(cookies.usuario) : ''
      return responder(res, 200, 'text/html; charset=utf-8', paginaJogo.replace('{{USUARIO}}', usuario))
    }
    if (u.pathname === '/login' && req.method === 'POST') {
      estado.submits++
      const dados = new URLSearchParams(await corpo(req))
      const usuario = dados.get('usuario') ?? ''
      return responder(res, 302, 'text/plain', '', {
        'set-cookie': `usuario=${encodeURIComponent(usuario)}; Path=/; Max-Age=31536000; SameSite=Lax`,
        location: '/jogo',
      })
    }
    if (u.pathname === '/definir-login') {
      // Login "programático" para os testes de isolamento.
      const usuario = u.searchParams.get('u') ?? ''
      return responder(res, 302, 'text/plain', '', {
        'set-cookie': `usuario=${encodeURIComponent(usuario)}; Path=/; Max-Age=31536000; SameSite=Lax`,
        location: '/jogo',
      })
    }
    if (u.pathname === '/download.exe') {
      return responder(res, 200, 'application/octet-stream', 'MZ falso', {
        'content-disposition': 'attachment; filename="instalador.exe"',
      })
    }
    if (u.pathname === '/arquivo.txt') {
      return responder(res, 200, 'text/plain', 'texto', {
        'content-disposition': 'attachment; filename="a.txt"',
      })
    }
    if (u.pathname === '/oauth/login') {
      return responder(
        res,
        200,
        'text/html',
        '<!doctype html><title>oauth</title><p id="p">ok</p><script>document.cookie="oauth=1; path=/";setTimeout(()=>window.close(),600)</script>',
      )
    }
    if (u.pathname === '/comum') {
      return responder(res, 200, 'text/html', '<!doctype html><title>comum</title><p>popup comum</p>')
    }
    if (u.pathname.startsWith('/live/')) {
      const canal = u.pathname.slice('/live/'.length)
      if (canal === 'estado') {
        const c = u.searchParams.get('canal') ?? ''
        return responder(res, 200, 'application/json', JSON.stringify(live(c)))
      }
      if (canal === 'assistido' && req.method === 'POST') {
        const { canal: c, seg } = JSON.parse(await corpo(req)) as { canal: string; seg: number }
        live(c).assistidoSeg += seg
        return responder(res, 204, 'text/plain', '')
      }
      live(canal)
      return responder(res, 200, 'text/html; charset=utf-8', paginaLive.replaceAll('{{CANAL}}', canal))
    }
    if (u.pathname === '/ping') {
      estado.pings++
      return responder(res, 200, 'text/plain', 'ok')
    }
    if (u.pathname.startsWith('/discord/')) {
      if (estado.discord429 > 0) {
        estado.discord429--
        return responder(res, 429, 'application/json', JSON.stringify({ retry_after: 0.2 }))
      }
      estado.discord.push(JSON.parse(await corpo(req)))
      return responder(res, 204, 'text/plain', '')
    }
    if (u.pathname.startsWith('/telegram/')) {
      estado.telegram.push(JSON.parse(await corpo(req)))
      return responder(res, 200, 'application/json', '{"ok":true}')
    }
    responder(res, 404, 'text/plain', 'não encontrado')
  })

  const wss = new WebSocketServer({ noServer: true })
  servidor.on('upgrade', (req, socket, head) => {
    const u = new URL(req.url ?? '/', 'http://localhost')
    if (!estado.aceitarWs) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const principal = u.pathname === '/ws'
      ;(principal ? principais : secundarios).add(ws)
      ws.on('close', () => {
        principais.delete(ws)
        secundarios.delete(ws)
      })
      ws.on('error', () => {})
    })
  })

  let ultimoEnvio = 0
  const relogio = setInterval(() => {
    const agora = Date.now()
    if (estado.intervaloDadosMs > 0 && agora - ultimoEnvio >= estado.intervaloDadosMs) {
      ultimoEnvio = agora
      for (const ws of principais) ws.send(JSON.stringify({ tick: agora }))
    }
  }, 25)
  const relogioSecundario = setInterval(() => {
    for (const ws of secundarios) ws.send('{"chat":1}')
  }, 2000)

  await new Promise<void>((res) => servidor.listen(porta, '127.0.0.1', () => res()))
  const p = (servidor.address() as AddressInfo).port

  return {
    url: `http://localhost:${p}`,
    porta: p,
    estado,
    derrubarWs(principal = true) {
      for (const ws of principal ? principais : secundarios) ws.terminate()
    },
    enviarParaPaginas(msg) {
      for (const ws of principais) ws.send(JSON.stringify(msg))
    },
    async fechar() {
      clearInterval(relogio)
      clearInterval(relogioSecundario)
      for (const ws of [...principais, ...secundarios]) ws.terminate()
      wss.close()
      await new Promise<void>((res) => servidor.close(() => res()))
    },
  }
}

// `pnpm jogo-falso`: sobe o servidor para testes manuais.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const s = await iniciarServidorFalso(Number(process.env.PORTA ?? 7357))
  console.log(`Jogo falso em ${s.url}/jogo · live falsa em ${s.url}/live/canal`)
}

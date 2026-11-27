// Prova técnica (ADR 0014): o motor .NET embute contas WebView2 dentro de uma janela do Electron.
// Uso: node_modules/electron/dist/electron.exe tools/prova-webview2/embutido.mjs <caminho do hdeck-motor.exe> <saida>
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { app, BrowserWindow } from 'electron'

const [exe, saida] = process.argv.slice(-2)
mkdirSync(saida, { recursive: true })
const resultado = {}
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

const pagina = `<!doctype html><html><body style="margin:0;background:linear-gradient(90deg,#f00,#0f0,#00f);font:40px sans-serif;color:#fff">
<div id="n">0</div><script>
let n = 0; setInterval(() => { n++; document.getElementById('n').textContent = n; document.body.dataset.n = n }, 100);
setInterval(() => fetch('/ping?' + Math.random()).catch(() => {}), 1000);
</script></body></html>`
const srv = createServer((req, res) => {
  res.writeHead(200, { 'content-type': req.url.startsWith('/ping') ? 'text/plain' : 'text/html' })
  res.end(req.url.startsWith('/ping') ? 'ok' : pagina)
}).listen(0)
app.whenReady().then(principal)
async function principal() {
  const porta = await new Promise((r) =>
    srv.listening ? r(srv.address().port) : srv.on('listening', () => r(srv.address().port)),
  )
  const url = `http://localhost:${porta}/`

  console.log('porta', porta)
  await app.whenReady()
  console.log('pronto')
  const w = new BrowserWindow({
    width: 1100,
    height: 700,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b2535', symbolColor: '#e5f0f6', height: 40 },
    backgroundColor: '#0b2535',
  })
  await w.loadURL(
    'data:text/html,<body style="background:%230b2535;color:white;font:20px sans-serif">Interface do HDeck</body>',
  )
  const hwnd = w.getNativeWindowHandle().readBigUInt64LE(0).toString()

  const motor = spawn(exe, [], { stdio: ['pipe', 'pipe', 'inherit'] })
  let seq = 0
  const pend = new Map()
  const eventos = []
  createInterface({ input: motor.stdout }).on('line', (l) => {
    const m = JSON.parse(l)
    if (m.id && pend.has(m.id)) {
      const { ok, erro } = pend.get(m.id)
      pend.delete(m.id)
      m.ok ? ok(m.r) : erro(new Error(m.erro))
    } else if (m.ev) {
      eventos.push({ t: Date.now(), ...m })
      if (m.ev === 'log') console.log('[motor]', m.nivel, m.msg)
    }
  })
  const pedir = (cmd, dados = {}) => pedir0(cmd, dados)
  const pedir0 = (cmd, dados) =>
    new Promise((ok, erro) => {
      const id = ++seq
      pend.set(id, { ok, erro })
      motor.stdin.write(`${JSON.stringify({ id, cmd, ...dados })}\n`)
    })

  const args =
    '--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows ' +
    '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling'
  const t0 = Date.now()
  resultado.iniciar = await pedir('iniciar', { pasta: join(saida, 'dados'), argumentos: args })
  resultado.iniciarMs = Date.now() - t0
  await pedir('criar', { conta: 'a', url, janela: hwnd })
  await pedir('criar', { conta: 'b', url, janela: hwnd })
  await pedir('exibir', { conta: 'a', modo: 'viva', janela: hwnd, x: 220, y: 60, largura: 640, altura: 420 })
  await pedir('exibir', { conta: 'b', modo: 'fora' })
  await pedir('vigiar', { conta: 'a', valor: true })
  await espera(3000)

  // 1) cookies isolados por perfil
  await pedir('avaliar', { conta: 'a', codigo: "document.cookie = 'quem=A; max-age=3600'; document.cookie" })
  resultado.cookieB = await pedir('avaliar', { conta: 'b', codigo: 'document.cookie' })
  resultado.cookieA = await pedir('avaliar', { conta: 'a', codigo: 'document.cookie' })

  // 2) timers: viva, fora da tela, e com a janela minimizada
  const ler = (c) => pedir('avaliar', { conta: c, codigo: 'Number(document.body.dataset.n)' })
  const medir = async (rotulo) => {
    const a0 = await ler('a')
    const b0 = await ler('b')
    await espera(10000)
    resultado[rotulo] = { a: (await ler('a')) - a0, b: (await ler('b')) - b0, esperado: 100 }
  }
  await medir('timersNormal')
  // foto da janela inteira (a conta embutida tem de aparecer no lugar certo)
  writeFileSync(join(saida, 'hwnd.txt'), hwnd)
  await espera(500)
  w.minimize()
  await medir('timersMinimizada')
  w.restore()
  w.hide()
  await medir('timersEscondida')
  w.show()

  // 3) foto da conta fora da tela e da viva
  const fb = await pedir('capturar', { conta: 'b', largura: 480, altura: 300, qualidade: 80 })
  const fa = await pedir('capturar', { conta: 'a', largura: 0, altura: 0 })
  if (fb) writeFileSync(join(saida, 'foto-b.jpg'), Buffer.from(fb, 'base64'))
  if (fa) writeFileSync(join(saida, 'foto-a.png'), Buffer.from(fa, 'base64'))
  resultado.fotoB = fb ? Buffer.from(fb, 'base64').length : null
  resultado.fotoA = fa ? Buffer.from(fa, 'base64').length : null

  // 4) vigia de rede (CDP) e processos
  resultado.dadosA = eventos.filter((e) => e.ev === 'dado' && e.conta === 'a').length
  resultado.pids = eventos.filter((e) => e.ev === 'pid').map((e) => `${e.conta}:${e.pid}`)
  resultado.processos = await pedir('processos')
  resultado.eventos = [...new Set(eventos.map((e) => e.ev))]

  // 5) renovar processo mantém o cookie
  await pedir('renovar', { conta: 'a' })
  await espera(3000)
  resultado.cookieAposRenovar = await pedir('avaliar', { conta: 'a', codigo: 'document.cookie' })
  resultado.pidsDepois = eventos.filter((e) => e.ev === 'pid').map((e) => `${e.conta}:${e.pid}`)

  writeFileSync(join(saida, 'resultado.json'), JSON.stringify(resultado, null, 2))
  console.log(JSON.stringify(resultado, null, 2))
  if (process.env.PROVA_SEGURAR) await espera(Number(process.env.PROVA_SEGURAR))
  motor.stdin.end()
  await new Promise((r) => motor.on('exit', r))
  app.exit(0)
}

// Diagnóstico do login com Google numa janela de login do motor (como a da Twitch):
// abre uma página local que chama window.open para o Google e mostra o que o Google vê em cada janela.
// Uso: node_modules/electron/dist/electron.exe tools/prova-webview2/login.mjs <hdeck-motor.exe> <pasta>
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { app } from 'electron'

const [exe, pasta] = process.argv.slice(-2)
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const alvo = () =>
  (process.env.ALVO ?? '').replace('PORTA', String(srv.address().port)) ||
  'https://accounts.google.com/o/oauth2/v2/auth?client_id=x&redirect_uri=https://www.twitch.tv&response_type=code&scope=email'
const srv = createServer((q, res) => {
  if (q.url.startsWith('/eco')) {
    console.log(
      'CABECALHOS',
      q.url,
      JSON.stringify(
        Object.fromEntries(Object.entries(q.headers).filter(([k]) => /^(sec-ch-ua|user-agent)/.test(k))),
      ),
    )
    res.writeHead(200, {
      'content-type': 'text/html',
      'accept-ch': 'Sec-CH-UA-Full-Version-List, Sec-CH-UA-Platform-Version',
    })
    res.end('<title>eco</title><script>setTimeout(()=>location.href="/eco2",300)</script>')
    return
  }
  res.writeHead(200, { 'content-type': 'text/html' })
  if (process.env.IFRAME) {
    // Iframe de outro site (como o botão do Google dentro da Twitch/Kick).
    res.end(
      `<!doctype html><title>abre</title><iframe src="http://127.0.0.1:${srv.address().port}/eco-iframe"></iframe>`,
    )
    return
  }
  res.end(
    `<!doctype html><title>abre</title><script>setTimeout(() => window.open(${JSON.stringify(alvo())}, 'g', 'width=500,height=600'), 800)</script>`,
  )
}).listen(0)

app.whenReady().then(async () => {
  await new Promise((r) => (srv.listening ? r() : srv.on('listening', r)))
  const porta = srv.address().port
  const motor = spawn(exe, [], { stdio: ['pipe', 'pipe', 'inherit'] })
  let seq = 0
  const pend = new Map()
  createInterface({ input: motor.stdout }).on('line', (l) => {
    const m = JSON.parse(l)
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m)
      pend.delete(m.id)
    } else if (m.ev === 'log') console.log('[motor]', m.msg)
  })
  const pedir = (cmd, d = {}) =>
    new Promise((ok) => {
      const id = ++seq
      pend.set(id, ok)
      motor.stdin.write(`${JSON.stringify({ id, cmd, ...d })}\n`)
    })
  console.log(await pedir('iniciar', { pasta: join(pasta, 'wv'), argumentos: process.env.ARGS ?? '' }))
  await pedir('abrirLogin', { chave: 'x', perfil: 'live-x', url: `http://localhost:${porta}/`, dominios: [] })
  await espera(Number(process.env.SEG ?? 12) * 1000)
  console.log(JSON.stringify(await pedir('popupsInfo'), null, 2))
  motor.stdin.end()
  await new Promise((r) => motor.on('exit', r))
  app.exit(0)
})

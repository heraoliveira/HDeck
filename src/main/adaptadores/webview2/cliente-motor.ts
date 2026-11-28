import { type ChildProcess, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { Log } from '../../nucleo/portas.ts'

/** Mensagem que o motor das páginas manda sozinho (evento de uma conta, pergunta, log). */
export type EventoMotor = { ev: string; conta?: string; pergunta?: number; tipo?: string } & Record<
  string,
  unknown
>

export type OpcoesMotor = {
  exe: string
  /** Pasta do WebView2 (perfis das contas). */
  pasta: string
  argumentos: string
  teste: boolean
  log: Log
  /** Pop-up ou download: o motor espera a resposta. */
  aoPerguntar: (e: EventoMotor) => Promise<unknown>
  /** O motor saiu sem ninguém pedir (as páginas morreram com ele). */
  aoCair: (codigo: number | null) => void
}

type Pendente = { ok: (v: unknown) => void; erro: (e: Error) => void; timer: ReturnType<typeof setTimeout> }

/**
 * Conversa com o motor das páginas (ADR 0014): um processo .NET que hospeda as contas em WebView2.
 * Pedidos e respostas são JSON, um por linha, pelo stdin/stdout do processo.
 */
export class ClienteMotor {
  private proc: ChildProcess | null = null
  private seq = 0
  private readonly pendentes = new Map<number, Pendente>()
  private readonly ouvintes = new Map<string, (e: EventoMotor) => void>()
  private readonly gerais = new Map<string, (e: EventoMotor) => void>()
  private saindo = false
  versao = ''

  constructor(private readonly o: OpcoesMotor) {}

  async iniciar(): Promise<void> {
    this.saindo = false
    const p = spawn(this.o.exe, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    this.proc = p
    p.stdin?.on('error', () => {})
    p.stderr?.on('data', (d: Buffer) =>
      this.o.log.aviso('motor das páginas (stderr)', { texto: String(d).slice(0, 500) }),
    )
    createInterface({ input: p.stdout! }).on('line', (l) => this.receber(l))
    p.on('exit', (codigo) => {
      if (this.proc !== p) return
      this.proc = null
      for (const [, pend] of this.pendentes) {
        clearTimeout(pend.timer)
        pend.erro(new Error('o motor das páginas saiu'))
      }
      this.pendentes.clear()
      if (!this.saindo) {
        this.o.log.erro('o motor das páginas caiu', { codigo })
        this.o.aoCair(codigo)
      }
    })
    p.on('error', (e) => {
      this.o.log.erro('o motor das páginas não abriu', { erro: String(e) })
      for (const [, pend] of this.pendentes) {
        clearTimeout(pend.timer)
        pend.erro(e)
      }
      this.pendentes.clear()
    })
    const r = (await this.pedir(
      'iniciar',
      { pasta: this.o.pasta, argumentos: this.o.argumentos, teste: this.o.teste },
      30_000,
    )) as {
      versao: string
    }
    this.versao = r.versao
    this.o.log.info('motor das páginas aberto', { webview2: r.versao, pid: p.pid })
  }

  get pid(): number | null {
    return this.proc?.pid ?? null
  }

  private receber(linha: string): void {
    let m: { id?: number; ok?: boolean; r?: unknown; erro?: string } & EventoMotor
    try {
      m = JSON.parse(linha)
    } catch {
      return
    }
    if (typeof m.id === 'number') {
      const p = this.pendentes.get(m.id)
      if (!p) return
      this.pendentes.delete(m.id)
      clearTimeout(p.timer)
      if (m.ok) p.ok(m.r ?? null)
      else p.erro(new Error(m.erro ?? 'erro no motor'))
      return
    }
    if (m.ev === 'log') {
      const msg = String(m.msg ?? '')
      if (m.nivel === 'erro') this.o.log.erro('motor das páginas', { msg })
      else this.o.log.aviso('motor das páginas', { msg })
      return
    }
    if (m.ev === 'pergunta' && typeof m.pergunta === 'number') {
      const id = m.pergunta
      void this.o
        .aoPerguntar(m)
        .catch(() => null)
        .then((r) => this.escrever({ resposta: id, r: r ?? null }))
      return
    }
    const geral = this.gerais.get(m.ev)
    if (geral) {
      geral(m)
      return
    }
    if (m.conta) this.ouvintes.get(m.conta)?.(m)
  }

  private escrever(o: unknown): boolean {
    const s = this.proc?.stdin
    if (!s || s.destroyed) return false
    s.write(`${JSON.stringify(o)}\n`)
    return true
  }

  /** Pedido com resposta. Rejeita se o motor não responder a tempo. */
  pedir<T = unknown>(cmd: string, dados: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<T> {
    return new Promise<T>((ok, erro) => {
      const id = ++this.seq
      const timer = setTimeout(() => {
        this.pendentes.delete(id)
        erro(new Error(`o motor não respondeu a ${cmd}`))
      }, timeoutMs)
      this.pendentes.set(id, { ok: ok as (v: unknown) => void, erro, timer })
      if (!this.escrever({ id, cmd, ...dados })) {
        clearTimeout(timer)
        this.pendentes.delete(id)
        erro(new Error('o motor das páginas não está aberto'))
      }
    })
  }

  /** Pedido sem esperar resposta (erros só vão para o log). */
  enviar(cmd: string, dados: Record<string, unknown> = {}): void {
    this.pedir(cmd, dados, 60_000).catch((e: unknown) => {
      if (!this.saindo)
        this.o.log.aviso('pedido ao motor falhou', { cmd, erro: String((e as Error)?.message ?? e) })
    })
  }

  ouvir(conta: string, f: (e: EventoMotor) => void): void {
    this.ouvintes.set(conta, f)
  }

  /** Eventos que não são de uma página (ex.: cookies de uma janela de login). */
  ouvirGeral(ev: string, f: (e: EventoMotor) => void): void {
    this.gerais.set(ev, f)
  }

  soltar(conta: string): void {
    this.ouvintes.delete(conta)
  }

  /** Fecha as páginas (o navegador grava cookies e armazenamento) e espera o motor sair. */
  async encerrar(): Promise<void> {
    const p = this.proc
    if (!p) return
    this.saindo = true
    await new Promise<void>((ok) => {
      const t = setTimeout(() => {
        p.kill()
        ok()
      }, 10_000)
      p.once('exit', () => {
        clearTimeout(t)
        ok()
      })
      p.stdin?.end()
    })
  }
}

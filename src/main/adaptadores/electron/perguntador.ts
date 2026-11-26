import { type BrowserWindow, dialog } from 'electron'
import { t } from '@shared/i18n/index.ts'

export type Pergunta = { mensagem: string; botoes: string[]; janela: BrowserWindow | null; detalhe?: string }

/** Diálogos nativos (ficam acima das contas). No modo de teste, registra e responde sozinho. */
export interface Perguntador {
  perguntar(p: Pergunta): Promise<number>
  informar(mensagem: string): Promise<void>
}

export class PerguntadorNativo implements Perguntador {
  async perguntar(p: Pergunta): Promise<number> {
    const opcoes = {
      type: 'question' as const,
      message: p.mensagem,
      buttons: p.botoes,
      defaultId: 0,
      cancelId: p.botoes.length - 1,
      title: t('app.nome'),
      noLink: true,
      ...(p.detalhe ? { detail: p.detalhe } : {}),
    }
    const r = p.janela ? await dialog.showMessageBox(p.janela, opcoes) : await dialog.showMessageBox(opcoes)
    return r.response
  }

  async informar(mensagem: string): Promise<void> {
    await dialog.showMessageBox({ type: 'info', message: mensagem, title: t('app.nome'), buttons: ['OK'] })
  }
}

/** Para os testes E2E: guarda as perguntas e responde com a fila `respostas` (padrão: cancelar). */
export class PerguntadorDeTeste implements Perguntador {
  perguntas: Pergunta[] = []
  informacoes: string[] = []
  respostas: number[] = []

  async perguntar(p: Pergunta): Promise<number> {
    this.perguntas.push({ ...p, janela: null })
    return this.respostas.shift() ?? p.botoes.length - 1
  }

  async informar(mensagem: string): Promise<void> {
    this.informacoes.push(mensagem)
  }
}

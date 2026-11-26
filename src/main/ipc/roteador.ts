import {
  type Canal,
  canais,
  canalIpc,
  type Entrada,
  nomesDosCanais,
  type RespostaIpc,
} from '@shared/ipc/contrato.ts'
import { type IpcMainInvokeEvent, ipcMain, type WebContents } from 'electron'
import type { Log } from '../nucleo/portas.ts'

export type Contexto = { janela: string; wc: WebContents }
export type Manipuladores = {
  [C in Canal]: (entrada: Entrada<C>, ctx: Contexto) => unknown | Promise<unknown>
}

/**
 * Roteador IPC (Seção 4.4): confere o remetente (só a interface do HDeck), valida a entrada com
 * o esquema do contrato e chama o núcleo. Erros voltam como valor; nada de exceção na interface.
 */
export function registrarIpc(
  m: Manipuladores,
  o: {
    log: Log
    /** Id da janela de interface que mandou, ou null se não for uma das nossas. */
    janelaDe: (wc: WebContents) => string | null
    /** A URL do quadro que mandou é a da interface? */
    origemValida: (url: string) => boolean
  },
): void {
  for (const canal of nomesDosCanais) {
    ipcMain.removeHandler(canalIpc(canal))
    ipcMain.handle(canalIpc(canal), async (e: IpcMainInvokeEvent, dados: unknown): Promise<RespostaIpc> => {
      const janela = o.janelaDe(e.sender)
      const url = e.senderFrame?.url ?? ''
      if (!janela || !o.origemValida(url) || e.senderFrame !== e.sender.mainFrame) {
        o.log.aviso('IPC recusado: remetente estranho', { canal })
        return { ok: false, erro: 'remetente' }
      }
      const r = canais[canal].safeParse(dados ?? {})
      if (!r.success) return { ok: false, erro: 'entrada' }
      try {
        const valor = await (m[canal] as (x: unknown, c: Contexto) => unknown)(r.data, {
          janela,
          wc: e.sender,
        })
        return { ok: true, valor: valor ?? null }
      } catch (err) {
        o.log.erro('erro no IPC', { canal, erro: String(err) })
        return { ok: false, erro: 'interno' }
      }
    })
  }
}

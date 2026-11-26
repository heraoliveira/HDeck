import { contextBridge, ipcRenderer } from 'electron'
import { canalIpc, eventoIpc, eventos, NOMES_CANAIS } from '@shared/ipc/nomes.ts'

/**
 * Preload da interface (a única página com preload; Seção 0, regra 4).
 * Expõe só funções geradas a partir do contrato: `hdeck.contas.adicionar(...)` etc.,
 * mais `hdeck.ouvir(evento, cb)` para os eventos do main.
 */
const api: Record<string, Record<string, (dados?: unknown) => Promise<unknown>>> = {}
for (const canal of NOMES_CANAIS) {
  const [grupo, nome] = canal.split('.') as [string, string]
  api[grupo] ??= {}
  api[grupo][nome] = (dados?: unknown) => ipcRenderer.invoke(canalIpc(canal), dados ?? {})
}

const permitidos = new Set<string>(eventos)

contextBridge.exposeInMainWorld('hdeck', {
  ...api,
  ouvir(evento: string, cb: (dados: unknown) => void): () => void {
    if (!permitidos.has(evento)) return () => {}
    const canal = eventoIpc(evento as (typeof eventos)[number])
    const f = (_e: unknown, dados: unknown) => cb(dados)
    ipcRenderer.on(canal, f)
    return () => ipcRenderer.removeListener(canal, f)
  },
})

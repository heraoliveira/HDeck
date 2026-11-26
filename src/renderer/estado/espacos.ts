import type { EspacoTela } from '@shared/ipc/contrato.ts'
import { chamar } from './api.ts'

/**
 * Registro dos espaços onde cada conta aparece (Seção 4.2): a interface mede (ResizeObserver)
 * e manda os retângulos ao main, que posiciona as views por cima.
 */
type Registro = { contaId: string; el: HTMLElement; tipo: EspacoTela['tipo']; visivel: () => boolean }

const registros = new Set<Registro>()
let agendado = false
let ultimoEnvio = ''
const observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => agendar()) : null

export function registrarEspaco(r: Registro): () => void {
  registros.add(r)
  observador?.observe(r.el)
  agendar()
  return () => {
    registros.delete(r)
    observador?.unobserve(r.el)
    agendar()
  }
}

export function agendar(): void {
  if (agendado) return
  agendado = true
  requestAnimationFrame(() => {
    agendado = false
    enviar()
  })
}

function medir(): EspacoTela[] {
  const out: EspacoTela[] = []
  const vw = window.innerWidth
  const vh = window.innerHeight
  for (const r of registros) {
    const b = r.el.getBoundingClientRect()
    const naTela =
      r.visivel() && b.width > 1 && b.height > 1 && b.right > 0 && b.bottom > 0 && b.left < vw && b.top < vh
    out.push({
      contaId: r.contaId,
      tipo: r.tipo,
      retangulo: naTela
        ? {
            x: Math.round(b.left),
            y: Math.round(b.top),
            largura: Math.round(b.width),
            altura: Math.round(b.height),
          }
        : null,
    })
  }
  // Uma conta pode aparecer como conta e como miniatura: vale o espaço de conta.
  out.sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'conta' ? -1 : 1))
  return out
}

function enviar(): void {
  const espacos = medir()
  const chave = JSON.stringify(espacos)
  if (chave === ultimoEnvio) return
  ultimoEnvio = chave
  void chamar('contas.espacos', { espacos }).catch(() => {})
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', agendar)
  window.addEventListener('scroll', agendar, true)
}

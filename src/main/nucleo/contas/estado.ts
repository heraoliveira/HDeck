import type { EstadoConta } from '@shared/tipos/dominio.ts'

/**
 * Máquina de estados da conta (Seção 1.2, RN-017). Pura.
 * O estado interno separa a fase da página da forma como ela aparece e dos avisos ativos;
 * o estado mostrado no cartão é derivado disso.
 */

export type Fase = 'desligada' | 'carregando' | 'rodando' | 'caida' | 'recarregando' | 'travada' | 'erro'
export type ModoExibicao = 'viva' | 'foto' | 'fora'

export type EstadoInterno = Readonly<{
  fase: Fase
  exibicao: ModoExibicao
  /** Avisos que deixam a conta "com aviso" (sem dados, texto vigiado, login pedido, limite). */
  avisos: ReadonlySet<string>
  motivoErro: string | null
}>

export type EventoEstado =
  | { tipo: 'ligar' }
  | { tipo: 'carregou' }
  | { tipo: 'caiu' }
  | { tipo: 'recarregar' }
  | { tipo: 'travou' }
  | { tipo: 'respondeu' }
  | { tipo: 'erro'; motivo: string }
  | { tipo: 'desligar' }
  | { tipo: 'exibir'; modo: ModoExibicao }
  | { tipo: 'aviso'; chave: string }
  | { tipo: 'avisoResolvido'; chave: string }

export const estadoInicial: EstadoInterno = {
  fase: 'desligada',
  exibicao: 'fora',
  avisos: new Set(),
  motivoErro: null,
}

const fasesLigadas: ReadonlySet<Fase> = new Set([
  'carregando',
  'rodando',
  'caida',
  'recarregando',
  'travada',
  'erro',
])

/** Transições de fase permitidas. Evento fora da tabela não muda nada (é ignorado). */
const tabela: Record<Fase, Partial<Record<EventoEstado['tipo'], Fase>>> = {
  desligada: { ligar: 'carregando' },
  carregando: {
    carregou: 'rodando',
    erro: 'erro',
    travou: 'travada',
    recarregar: 'recarregando',
    desligar: 'desligada',
  },
  rodando: {
    caiu: 'caida',
    recarregar: 'recarregando',
    travou: 'travada',
    erro: 'erro',
    desligar: 'desligada',
    carregou: 'rodando',
  },
  caida: {
    recarregar: 'recarregando',
    carregou: 'rodando',
    erro: 'erro',
    desligar: 'desligada',
    travou: 'travada',
  },
  recarregando: {
    carregou: 'rodando',
    erro: 'erro',
    travou: 'travada',
    desligar: 'desligada',
    caiu: 'caida',
  },
  travada: { respondeu: 'rodando', recarregar: 'recarregando', erro: 'erro', desligar: 'desligada' },
  erro: { recarregar: 'recarregando', carregou: 'rodando', desligar: 'desligada', ligar: 'carregando' },
}

export function transicionar(e: EstadoInterno, ev: EventoEstado): EstadoInterno {
  switch (ev.tipo) {
    case 'exibir':
      return e.exibicao === ev.modo ? e : { ...e, exibicao: ev.modo }
    case 'aviso': {
      if (e.fase === 'desligada' || e.avisos.has(ev.chave)) return e
      return { ...e, avisos: new Set([...e.avisos, ev.chave]) }
    }
    case 'avisoResolvido': {
      if (!e.avisos.has(ev.chave)) return e
      const avisos = new Set(e.avisos)
      avisos.delete(ev.chave)
      return { ...e, avisos }
    }
    default: {
      const prox = tabela[e.fase][ev.tipo]
      if (!prox) return e
      if (prox === 'desligada') return estadoInicial
      return {
        ...e,
        fase: prox,
        motivoErro: ev.tipo === 'erro' ? ev.motivo : prox === 'erro' ? e.motivoErro : null,
        // Recarregar limpa os avisos que dependem do conteúdo da página.
        avisos: ev.tipo === 'recarregar' ? new Set() : e.avisos,
      }
    }
  }
}

export function estaLigada(e: EstadoInterno): boolean {
  return fasesLigadas.has(e.fase)
}

/** Pode começar uma recarga agora? (nunca duas ao mesmo tempo) */
export function podeRecarregar(e: EstadoInterno): boolean {
  return e.fase !== 'desligada' && e.fase !== 'recarregando'
}

/** RN-017: o estado que aparece no cartão. */
export function estadoVisivel(e: EstadoInterno): EstadoConta {
  switch (e.fase) {
    case 'desligada':
    case 'carregando':
    case 'recarregando':
    case 'travada':
    case 'erro':
      return e.fase
    case 'caida':
      return 'caida'
    case 'rodando':
      if (e.avisos.size > 0) return 'com_aviso'
      return e.exibicao === 'viva' ? 'ativa' : e.exibicao === 'foto' ? 'economica' : 'escondida'
  }
}

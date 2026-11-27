import { aplicarRetencaoMetricas } from '../../src/main/nucleo/painel/painel.ts'
import type { Armazem, ArmazemConfig, LinhaMetrica, LinhaPing } from '../../src/main/nucleo/portas.ts'
import { type Config, configPadrao } from '../../src/shared/config/esquema.ts'
import { catalogoDeJogos } from '../../src/shared/dados/catalogo.ts'
import type {
  Aviso,
  Conta,
  EventoConta,
  Grupo,
  Jogo,
  Live,
  TextoVigiado,
} from '../../src/shared/tipos/dominio.ts'

/** Armazém em memória com o mesmo contrato do SQLite. */
export class ArmazemMemoria implements Armazem {
  jogos = new Map<string, Jogo>()
  grupos = new Map<string, Grupo>()
  contas = new Map<string, Conta>()
  lives = new Map<string, Live>()
  textos = new Map<string, TextoVigiado>()
  avisos: Aviso[] = []
  eventos: EventoConta[] = []
  metricas: LinhaMetrica[] = []
  pings: LinhaPing[] = []

  constructor(jogos: Jogo[] = catalogoDeJogos()) {
    for (const j of jogos) this.jogos.set(j.id, j)
  }

  listarJogos = () => [...this.jogos.values()]
  salvarJogo = (j: Jogo) => void this.jogos.set(j.id, j)
  apagarJogo = (id: string) => void this.jogos.delete(id)
  listarGrupos = () => [...this.grupos.values()]
  salvarGrupo = (g: Grupo) => void this.grupos.set(g.id, g)
  apagarGrupo = (id: string) => void this.grupos.delete(id)
  listarContas = () => [...this.contas.values()]
  salvarConta = (c: Conta) => void this.contas.set(c.id, c)
  apagarConta = (id: string) => void this.contas.delete(id)
  listarLives = () => [...this.lives.values()]
  salvarLive = (l: Live) => void this.lives.set(l.id, l)
  apagarLive = (id: string) => void this.lives.delete(id)
  listarTextos = () => [...this.textos.values()]
  salvarTexto = (t: TextoVigiado) => void this.textos.set(t.id, t)
  apagarTexto = (id: string) => void this.textos.delete(id)
  registrarAviso = (a: Aviso) => void this.avisos.push(a)
  listarAvisos = (limite: number) => [...this.avisos].reverse().slice(0, limite)
  marcarAvisosLidos = () => {
    this.avisos = this.avisos.map((a) => ({ ...a, lido: true }))
  }
  registrarEvento = (e: EventoConta) => void this.eventos.push(e)
  listarEventos = (desde: number, contaId?: string) =>
    this.eventos.filter((e) => e.em >= desde && (!contaId || e.contaId === contaId))
  registrarMetricas = (l: LinhaMetrica[]) => void this.metricas.push(...l)
  listarMetricas = (desde: number) => this.metricas.filter((m) => m.minuto >= desde)
  registrarPing = (p: LinhaPing) => void this.pings.push(p)
  listarPing = (desde: number) => this.pings.filter((p) => p.em >= desde)
  aplicarRetencao = (agora: number) => {
    this.metricas = aplicarRetencaoMetricas(this.metricas, agora)
  }
  transacao = <T>(fn: () => T) => fn()
}

export class ConfigMemoria implements ArmazemConfig {
  gravacoes = 0
  constructor(public atual: Config = configPadrao()) {}
  ler = () => this.atual
  gravar = (c: Config) => {
    this.gravacoes++
    this.atual = c
  }
}

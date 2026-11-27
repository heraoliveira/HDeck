import type { Config } from '@shared/config/esquema.ts'
import { PADROES } from '@shared/dados/padroes-config.ts'
import { t } from '@shared/i18n/index.ts'
import type { Aviso, TipoAviso } from '@shared/tipos/dominio.ts'
import type { Armazem, CanaisLocais, Cancelar, Relogio } from '../portas.ts'
import type { FilaEnvio } from './envio.ts'

export type NovoAviso = {
  tipo: TipoAviso
  contaId: string | null
  mensagem: string
  /** Avisos com a mesma chave em sequência viram um só (RN-112). */
  chave: string
  /** Texto usado quando vários iguais são agrupados (ex.: "3 contas de X caíram"). */
  agrupado?: (n: number) => string
  /** Título da notificação (nome da conta). */
  titulo?: string
}

/** RN-113: está dentro do horário de silêncio? Aceita faixa que passa da meia-noite. */
export function emSilencio(config: Config, agora: number): boolean {
  const s = config.avisos.silencio
  if (!s.ligado) return false
  const d = new Date(agora)
  const m = d.getHours() * 60 + d.getMinutes()
  const [hi, mi] = s.inicio.split(':').map(Number) as [number, number]
  const [hf, mf] = s.fim.split(':').map(Number) as [number, number]
  const ini = hi * 60 + mi
  const fim = hf * 60 + mf
  if (ini === fim) return true
  return ini < fim ? m >= ini && m < fim : m >= ini || m < fim
}

type Pacote = { itens: Aviso[]; base: NovoAviso; timer: Cancelar }

/**
 * Central de avisos (Seção 9). Todo aviso vai para o histórico (RN-112: nenhum se perde);
 * os canais recebem conforme a configuração de cada tipo (RN-111), fora do silêncio (RN-113),
 * com iguais em sequência agrupados (RN-112).
 */
export class CentralAvisos {
  private pacotes = new Map<string, Pacote>()
  private pausadoAte = 0
  private seq = 0
  private ouvintes: ((a: Aviso) => void)[] = []

  constructor(
    private readonly relogio: Relogio,
    private readonly config: () => Config,
    private readonly armazem: Pick<Armazem, 'registrarAviso' | 'listarAvisos'>,
    private readonly locais: CanaisLocais,
    private readonly remotos: { discord: FilaEnvio; telegram: FilaEnvio },
    private readonly naoLidos: () => number,
    private readonly gerarId: () => string = () => `a${Date.now().toString(36)}${(this.seq++).toString(36)}`,
  ) {}

  aoAvisar(fn: (a: Aviso) => void): void {
    this.ouvintes.push(fn)
  }

  /** "Pausar avisos 1 h" do menu da bandeja. */
  pausar(ms: number): void {
    this.pausadoAte = this.relogio.agora() + ms
  }

  pausado(): boolean {
    return this.relogio.agora() < this.pausadoAte
  }

  emitir(novo: NovoAviso): Aviso {
    const aviso: Aviso = {
      id: this.gerarId(),
      contaId: novo.contaId,
      tipo: novo.tipo,
      mensagem: novo.mensagem,
      criadoEm: this.relogio.agora(),
      lido: false,
    }
    this.armazem.registrarAviso(aviso)
    for (const fn of this.ouvintes) fn(aviso)
    const existente = this.pacotes.get(novo.chave)
    if (existente) {
      existente.itens.push(aviso)
      return aviso
    }
    const timer = this.relogio.depois(PADROES.janelaAgrupamentoSeg * 1000, () => this.entregar(novo.chave))
    this.pacotes.set(novo.chave, { itens: [aviso], base: novo, timer })
    return aviso
  }

  /** Entrega tudo o que está esperando agrupamento (ex.: ao sair). */
  esvaziar(): void {
    for (const chave of [...this.pacotes.keys()]) {
      this.pacotes.get(chave)?.timer()
      this.entregar(chave)
    }
  }

  private entregar(chave: string): void {
    const p = this.pacotes.get(chave)
    if (!p) return
    this.pacotes.delete(chave)
    const cfg = this.config()
    const n = p.itens.length
    const primeiro = p.itens[0]!
    const texto =
      n === 1
        ? primeiro.mensagem
        : (p.base.agrupado?.(n) ?? t('avisos.agrupado', { n, mensagem: primeiro.mensagem }))
    const silencio = emSilencio(cfg, this.relogio.agora()) || this.pausado()
    const porTipo = cfg.avisos.tipos[p.base.tipo]
    if (cfg.avisos.selo && porTipo.selo) this.locais.selo(this.naoLidos())
    if (silencio) return
    const final: Aviso = { ...primeiro, mensagem: texto }
    if (cfg.avisos.windows && porTipo.windows) this.locais.notificar(final, p.base.titulo ?? t('app.nome'))
    if (cfg.avisos.som && porTipo.som) this.locais.tocarSom()
    if (cfg.avisos.piscar) this.locais.piscar()
    // RN-114: Discord e Telegram não dependem do cofre (segredos cifrados só com o Windows).
    if (cfg.avisos.discord && porTipo.discord) this.remotos.discord.enviar(texto)
    if (cfg.avisos.telegram && porTipo.telegram) this.remotos.telegram.enviar(texto)
  }
}

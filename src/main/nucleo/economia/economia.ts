import type { Config } from '@shared/config/esquema.ts'
import type { Conta, Grupo, Jogo, PoliticaForaTela } from '@shared/tipos/dominio.ts'
import type { ModoExibicao } from '../contas/estado.ts'

/**
 * RN-051: política fora da tela. A exceção da conta vence; depois a do jogo naquele grupo;
 * por fim o padrão do catálogo ("Manter farmando" salvo jogos que calculam no servidor e
 * o usuário escolheu economizar). O padrão geral é sempre Manter farmando.
 */
export function politicaEfetiva(
  conta: Conta,
  grupo: Grupo | undefined,
  _jogo: Jogo | undefined,
): PoliticaForaTela {
  if (conta.politicaForaTela !== 'padrao_do_jogo') return conta.politicaForaTela
  return grupo?.layout.politicas[conta.jogoId] ?? 'economizar'
}

/**
 * RN-050/RN-051: com "Economizar", a conta que não está ao vivo (fora da tela ou em foto) para de
 * desenhar; os timers e a rede seguem. Em foto, ela acorda só para cada foto (RN-052).
 */
export function deveEstrangular(politica: PoliticaForaTela, exibicao: ModoExibicao): boolean {
  return politica === 'economizar' && exibicao !== 'viva'
}

/**
 * RN-052: com o modo econômico ligado, toda conta visível que não é a ativa vira foto.
 * Contas que não estão em nenhum espaço ficam "fora".
 */
export function decidirExibicao(
  visiveis: readonly string[],
  ativaId: string | null,
  modoEconomico: boolean,
  /** Contas que o usuário pôs ao vivo de propósito (clicou) e ainda não voltaram a ser foto. */
  aoVivoManual: ReadonlySet<string> = new Set(),
): Map<string, ModoExibicao> {
  const out = new Map<string, ModoExibicao>()
  for (const id of visiveis) {
    out.set(id, !modoEconomico || id === ativaId || aoVivoManual.has(id) ? 'viva' : 'foto')
  }
  return out
}

/** RN-054: só captura foto de quem está num espaço na tela. */
export function precisaDeFoto(exibicao: ModoExibicao, espacoNaTela: boolean): boolean {
  return exibicao === 'foto' && espacoNaTela
}

/** Intervalo da foto com jitter determinístico por conta, para não capturar tudo no mesmo ms. */
export function intervaloDaFotoMs(config: Config, contaId: string): number {
  const base = config.economia.fotoACadaSeg * 1000
  let h = 0
  for (const ch of contaId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const jitter = (h % 200) - 100 // ±100 ms
  return Math.max(250, base + jitter)
}

/** RN-053: depois de X s sem mexer, a conta ao vivo (não ativa) volta a ser foto. */
export function deveVoltarAFoto(config: Config, ultimoUsoMs: number, agora: number): boolean {
  const lim = config.economia.voltarAFotoSeg
  return config.economia.modoEconomico && lim > 0 && agora - ultimoUsoMs >= lim * 1000
}

/** RN-100 e RN-101: decide se a página da conta fica muda. */
export function contaMuda(
  config: Config,
  conta: Conta,
  ativaId: string | null,
  silenciarTudo: boolean,
): boolean {
  if (silenciarTudo || !conta.som) return true
  switch (config.som.modo) {
    case 'todas':
      return false
    case 'nenhuma':
      return true
    case 'ativa':
      return conta.id !== ativaId
  }
}

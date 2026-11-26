import type { Config } from '@shared/config/esquema.ts'

/** RN-170: iniciar com o Windows, abrindo na bandeja. */
export function opcoesDeInicio(config: Config): { openAtLogin: boolean; args: string[] } {
  return { openAtLogin: config.geral.iniciarComWindows, args: ['--bandeja'] }
}

/** RN-170: abre escondido só quando veio do início do Windows e a opção está ligada. */
export function iniciarEscondido(config: Config, argv: readonly string[]): boolean {
  return argv.includes('--bandeja') && config.geral.iniciarComWindows && config.geral.abrirNaBandeja
}

/** RN-171: fechar no X manda para a bandeja; sair de verdade é pelo menu da bandeja. */
export function aoFecharJanela(config: Config, saindo: boolean): 'fechar' | 'bandeja' | 'sair' {
  if (saindo) return 'fechar'
  return config.geral.fecharVaiParaBandeja ? 'bandeja' : 'sair'
}

/** RN-171: confirma a saída se houver contas ligadas. */
export function precisaConfirmarSaida(config: Config, contasLigadas: number): boolean {
  return config.geral.confirmarAoSair && contasLigadas > 0
}

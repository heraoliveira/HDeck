/** Constantes de comportamento que não são configuráveis na interface (REGRAS.md). */
export const PADROES = {
  /** RN-061: esperas depois da primeira (que é a espera configurada, 45 s). */
  backoffSeg: [120, 300, 900] as const,
  maxFalhasSeguidas: 4,
  /** RN-057 */
  recargaProgramadaIntervaloSeg: 20,
  ativaProtegidaSeg: 60,
  /** RN-067 */
  conferirInternetSeg: 10,
  /** RN-070 */
  maxReaberturas: 3,
  janelaReaberturasMin: 10,
  /** RN-115 */
  tentativasEnvioSeg: [5, 30, 120] as const,
  intervaloMinimoEnvioSeg: 3,
  /** RN-130 */
  pingErrosSeguidos: 3,
  /** RN-143 */
  mostrarSenhaSeg: 10,
  /** RN-163 */
  retencaoDias: 30,
  agruparMetricasAposH: 48,
  /** RN-062: janela para eleger a conexão principal. */
  janelaWsPrincipalSeg: 60,
  /** Painel (Seção 7.1) */
  metricasPainelSeg: 5,
  metricasFundoSeg: 60,
  fotoPainelSeg: 10,
  /** RN-112: avisos iguais dentro desta janela viram um só. */
  janelaAgrupamentoSeg: 10,
  /** Limites do que volta das páginas (Seção 11). */
  maxTextosEncontrados: 50,
  maxTamanhoTexto: 200,
  /** Página offscreen das lives (Seção 8.2). */
  liveLargura: 480,
  liveAltura: 270,
  fotoQualidadeJpeg: 70,
} as const

export const CORES_CONTA = [
  '#22d3ee',
  '#facc15',
  '#34d399',
  '#f87171',
  '#a78bfa',
  '#f472b6',
  '#38bdf8',
  '#fb923c',
] as const

/** RN-150: sempre bloqueadas. */
export const EXTENSOES_BLOQUEADAS = [
  '.exe',
  '.msi',
  '.bat',
  '.cmd',
  '.ps1',
  '.scr',
  '.vbs',
  '.js',
  '.jar',
  '.dll',
  '.lnk',
  '.appx',
  '.msix',
  '.com',
  '.pif',
  '.hta',
  '.wsf',
  '.msp',
  '.cpl',
] as const

/** RN-151: pop-ups destes domínios são de login e abrem na sessão da conta. */
export const DOMINIOS_LOGIN = [
  'accounts.google.com',
  'discord.com',
  'id.twitch.tv',
  'www.twitch.tv',
  'kick.com',
  'id.kick.com',
  'appleid.apple.com',
  'www.facebook.com',
  'login.microsoftonline.com',
  'login.live.com',
  'x.com',
  'twitter.com',
  'phantom.app',
  'metamask.io',
  'walletconnect.com',
] as const

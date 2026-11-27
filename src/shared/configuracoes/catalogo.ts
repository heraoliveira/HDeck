import { OPCOES } from '../config/esquema.ts'
import { type ChaveTexto, t } from '../i18n/index.ts'
import { normalizar } from '../util/texto.ts'

/**
 * Catálogo das linhas da tela de Configurações (Seção 12.3).
 * Dados puros: a interface só desenha o que está aqui, e a busca (RN-175) usa o mesmo catálogo.
 */

export const SECOES = ['geral', 'contas', 'avisos', 'cofre', 'ping', 'versao', 'avancado'] as const
export type Secao = (typeof SECOES)[number]

export type Opcao = { valor: string | number; rotulo: string }

export type Controle =
  | { tipo: 'interruptor' }
  | { tipo: 'select'; opcoes: Opcao[] }
  | { tipo: 'numero'; min: number; max: number; passo?: number; unidade?: string }
  | { tipo: 'hora' }
  | { tipo: 'texto'; segredo?: boolean }
  | { tipo: 'especial'; qual: Especial }

export type Especial =
  | 'atalhos'
  | 'jogos'
  | 'tiposAviso'
  | 'textos'
  | 'historico'
  | 'cofre'
  | 'senhaMestra'
  | 'versao'
  | 'backup'
  | 'pastaDados'
  | 'devtools'
  | 'limparCacheTodas'
  | 'logs'
  | 'redefinir'
  | 'foraDaTela'
  | 'discordUrl'
  | 'telegramToken'
  | 'somArquivo'

export type LinhaConfig = {
  id: string
  secao: Secao
  grupo: ChaveTexto
  /** Caminho na Config; ausente para linhas especiais. */
  caminho?: string
  titulo: ChaveTexto
  descricao: ChaveTexto
  /** Variável da descrição (ex.: "Espera {n} s") tirada de outro caminho da config. */
  descricaoVar?: string
  palavras: string[]
  controle: Controle
  /** Fica esmaecida quando este caminho está desligado. */
  dependeDe?: string
  valeAoReiniciar?: boolean
}

const seg = (n: number) => t('comum.segundos', { n })
const min = (n: number) => t('comum.minutos', { n })
const hrs = (n: number) => t('comum.horas', { n })
const op = (valor: string | number, rotulo: string): Opcao => ({ valor, rotulo })

export const LINHAS: readonly LinhaConfig[] = [
  // Geral
  {
    id: 'iniciarComWindows',
    secao: 'geral',
    grupo: 'config.grupo.inicio',
    caminho: 'geral.iniciarComWindows',
    titulo: 'cfg.iniciarComWindows.t',
    descricao: 'cfg.iniciarComWindows.d',
    palavras: ['inicializar', 'boot', 'automático', 'login'],
    controle: { tipo: 'interruptor' },
  },
  {
    id: 'abrirNaBandeja',
    secao: 'geral',
    grupo: 'config.grupo.inicio',
    caminho: 'geral.abrirNaBandeja',
    titulo: 'cfg.abrirNaBandeja.t',
    descricao: 'cfg.abrirNaBandeja.d',
    palavras: ['minimizado', 'escondido'],
    controle: { tipo: 'interruptor' },
    dependeDe: 'geral.iniciarComWindows',
  },
  {
    id: 'restaurarAoAbrir',
    secao: 'geral',
    grupo: 'config.grupo.inicio',
    caminho: 'geral.restaurarAoAbrir',
    titulo: 'cfg.restaurarAoAbrir.t',
    descricao: 'cfg.restaurarAoAbrir.d',
    palavras: ['restaurar', 'grupos', 'abrir'],
    controle: {
      tipo: 'select',
      opcoes: OPCOES.restaurar.map((v) => op(v, t(`cfg.restaurarAoAbrir.${v}` as ChaveTexto))),
    },
  },
  {
    id: 'abrirAosPoucosSeg',
    secao: 'geral',
    grupo: 'config.grupo.inicio',
    caminho: 'geral.abrirAosPoucosSeg',
    titulo: 'cfg.abrirAosPoucosSeg.t',
    descricao: 'cfg.abrirAosPoucosSeg.d',
    palavras: ['escalonar', 'pico', 'devagar'],
    controle: {
      tipo: 'select',
      opcoes: [0, 1, 2, 3, 5, 10].map((n) =>
        op(n, n === 0 ? t('cfg.abrirAosPoucosSeg.0') : t('cfg.abrirAosPoucosSeg.n', { n })),
      ),
    },
  },
  {
    id: 'impedirDormir',
    secao: 'geral',
    grupo: 'config.grupo.inicio',
    caminho: 'geral.impedirDormir',
    titulo: 'cfg.impedirDormir.t',
    descricao: 'cfg.impedirDormir.d',
    palavras: ['suspensão', 'energia', 'hibernar', 'dormir'],
    controle: { tipo: 'interruptor' },
  },
  {
    id: 'fecharVaiParaBandeja',
    secao: 'geral',
    grupo: 'config.grupo.janela',
    caminho: 'geral.fecharVaiParaBandeja',
    titulo: 'cfg.fecharVaiParaBandeja.t',
    descricao: 'cfg.fecharVaiParaBandeja.d',
    palavras: ['fechar', 'x', 'bandeja', 'tray'],
    controle: { tipo: 'interruptor' },
  },
  {
    id: 'confirmarAoSair',
    secao: 'geral',
    grupo: 'config.grupo.janela',
    caminho: 'geral.confirmarAoSair',
    titulo: 'cfg.confirmarAoSair.t',
    descricao: 'cfg.confirmarAoSair.d',
    palavras: ['sair', 'fechar'],
    controle: { tipo: 'interruptor' },
  },
  {
    id: 'tema',
    secao: 'geral',
    grupo: 'config.grupo.aparencia',
    caminho: 'geral.tema',
    titulo: 'cfg.tema.t',
    descricao: 'cfg.tema.d',
    palavras: ['escuro', 'claro', 'cores', 'dark'],
    controle: { tipo: 'select', opcoes: OPCOES.tema.map((v) => op(v, t(`cfg.tema.${v}` as ChaveTexto))) },
  },
  {
    id: 'idioma',
    secao: 'geral',
    grupo: 'config.grupo.aparencia',
    titulo: 'cfg.idioma.t',
    descricao: 'cfg.idioma.d',
    palavras: ['língua', 'português'],
    controle: { tipo: 'select', opcoes: [op('pt-BR', t('cfg.idioma.pt'))] },
  },
  {
    id: 'atalhos',
    secao: 'geral',
    grupo: 'config.grupo.atalhos',
    titulo: 'cfg.atalhos.t',
    descricao: 'cfg.atalhos.d',
    palavras: ['teclado', 'tecla', 'ctrl', 'atalho'],
    controle: { tipo: 'especial', qual: 'atalhos' },
  },
  // Contas e jogos · Se a conta cair
  {
    id: 'recarregarQuandoCair',
    secao: 'contas',
    grupo: 'config.grupo.queda',
    caminho: 'queda.recarregarQuandoCair',
    titulo: 'cfg.recarregarQuandoCair.t',
    descricao: 'cfg.recarregarQuandoCair.d',
    descricaoVar: 'queda.esperaQuedaSeg',
    palavras: ['queda', 'conexão', 'desconectar', 'websocket', 'reconectar'],
    controle: { tipo: 'interruptor' },
  },
  {
    id: 'esperaQuedaSeg',
    secao: 'contas',
    grupo: 'config.grupo.queda',
    caminho: 'queda.esperaQuedaSeg',
    titulo: 'cfg.esperaQuedaSeg.t',
    descricao: 'cfg.esperaQuedaSeg.d',
    palavras: ['espera', 'segundos'],
    controle: { tipo: 'numero', min: 15, max: 300, passo: 5, unidade: 's' },
    dependeDe: 'queda.recarregarQuandoCair',
  },
  {
    id: 'recarregarAoAcordar',
    secao: 'contas',
    grupo: 'config.grupo.queda',
    caminho: 'queda.recarregarAoAcordar',
    titulo: 'cfg.recarregarAoAcordar.t',
    descricao: 'cfg.recarregarAoAcordar.d',
    palavras: ['suspensão', 'dormir', 'acordar', 'hibernar'],
    controle: { tipo: 'interruptor' },
  },
  {
    id: 'avisarSemDadosMin',
    secao: 'contas',
    grupo: 'config.grupo.queda',
    caminho: 'queda.avisarSemDadosMin',
    titulo: 'cfg.avisarSemDadosMin.t',
    descricao: 'cfg.avisarSemDadosMin.d',
    palavras: ['dados', 'parado', 'silêncio'],
    controle: {
      tipo: 'select',
      opcoes: OPCOES.semDadosMin.map((n) => op(n, n === 0 ? t('comum.nunca') : min(n))),
    },
  },
  {
    id: 'recarregarSeTravar',
    secao: 'contas',
    grupo: 'config.grupo.queda',
    caminho: 'queda.recarregarSeTravar',
    titulo: 'cfg.recarregarSeTravar.t',
    descricao: 'cfg.recarregarSeTravar.d',
    descricaoVar: 'queda.travadaSeg',
    palavras: ['travar', 'congelar', 'não responde'],
    controle: { tipo: 'interruptor' },
  },
  {
    id: 'recarregarSeFechar',
    secao: 'contas',
    grupo: 'config.grupo.queda',
    caminho: 'queda.recarregarSeFechar',
    titulo: 'cfg.recarregarSeFechar.t',
    descricao: 'cfg.recarregarSeFechar.d',
    palavras: ['crash', 'fechou', 'memória', 'erro'],
    controle: { tipo: 'interruptor' },
  },
  // Economia
  {
    id: 'modoEconomico',
    secao: 'contas',
    grupo: 'config.grupo.economia',
    caminho: 'economia.modoEconomico',
    titulo: 'cfg.modoEconomico.t',
    descricao: 'cfg.modoEconomico.d',
    palavras: ['foto', 'economia', 'cpu', 'processador'],
    controle: { tipo: 'interruptor' },
  },
  {
    id: 'fotoACadaSeg',
    secao: 'contas',
    grupo: 'config.grupo.economia',
    caminho: 'economia.fotoACadaSeg',
    titulo: 'cfg.fotoACadaSeg.t',
    descricao: 'cfg.fotoACadaSeg.d',
    palavras: ['foto', 'intervalo', 'captura'],
    controle: { tipo: 'select', opcoes: OPCOES.fotoSeg.map((n) => op(n, seg(n))) },
    dependeDe: 'economia.modoEconomico',
  },
  {
    id: 'voltarAFotoSeg',
    secao: 'contas',
    grupo: 'config.grupo.economia',
    caminho: 'economia.voltarAFotoSeg',
    titulo: 'cfg.voltarAFotoSeg.t',
    descricao: 'cfg.voltarAFotoSeg.d',
    palavras: ['foto', 'inativo', 'parado'],
    controle: {
      tipo: 'select',
      opcoes: OPCOES.voltarFotoSeg.map((n) =>
        op(n, n === 0 ? t('comum.desligado') : n < 60 ? seg(n) : min(n / 60)),
      ),
    },
    dependeDe: 'economia.modoEconomico',
  },
  {
    id: 'foraDaTela',
    secao: 'contas',
    grupo: 'config.grupo.economia',
    titulo: 'cfg.foraDaTela.t',
    descricao: 'cfg.foraDaTela.d',
    palavras: ['escondida', 'segundo plano', 'manter farmando', 'economizar'],
    controle: { tipo: 'especial', qual: 'foraDaTela' },
  },
  // Otimização
  {
    id: 'recarregarACadaH',
    secao: 'contas',
    grupo: 'config.grupo.otimizacao',
    caminho: 'otimizacao.recarregarACadaH',
    titulo: 'cfg.recarregarACadaH.t',
    descricao: 'cfg.recarregarACadaH.d',
    palavras: ['otimização', 'programada', 'intervalo', 'horas'],
    controle: {
      tipo: 'select',
      opcoes: OPCOES.recarregarH.map((n) => op(n, n === 0 ? t('comum.desligado') : hrs(n))),
    },
  },
  {
    id: 'otimizarACadaMin',
    secao: 'contas',
    grupo: 'config.grupo.otimizacao',
    caminho: 'otimizacao.otimizarACadaMin',
    titulo: 'cfg.otimizarACadaMin.t',
    descricao: 'cfg.otimizarACadaMin.d',
    palavras: ['otimizar', 'memória', 'ram', 'processo'],
    controle: {
      tipo: 'select',
      opcoes: OPCOES.otimizarMin.map((n) =>
        op(n, n === 0 ? t('comum.desligado') : n < 60 ? min(n) : hrs(n / 60)),
      ),
    },
  },
  {
    id: 'limiteMemoriaMB',
    secao: 'contas',
    grupo: 'config.grupo.otimizacao',
    caminho: 'otimizacao.limiteMemoriaMB',
    titulo: 'cfg.limiteMemoriaMB.t',
    descricao: 'cfg.limiteMemoriaMB.d',
    palavras: ['memória', 'ram', 'vazamento', 'gb'],
    controle: {
      tipo: 'select',
      opcoes: OPCOES.memoriaMB.map((n) =>
        op(n, n === 0 ? t('comum.desligado') : t('comum.gb', { n: String(n / 1024).replace('.', ',') })),
      ),
    },
  },
  {
    id: 'limparCacheDias',
    secao: 'contas',
    grupo: 'config.grupo.otimizacao',
    caminho: 'otimizacao.limparCacheDias',
    titulo: 'cfg.limparCacheDias.t',
    descricao: 'cfg.limparCacheDias.d',
    palavras: ['cache', 'limpar', 'disco'],
    controle: {
      tipo: 'select',
      opcoes: OPCOES.cacheDias.map((n) =>
        op(n, n === 0 ? t('comum.desligado') : n === 1 ? t('comum.dia') : t('comum.dias', { n })),
      ),
    },
  },
  // Lives
  {
    id: 'livesLigadas',
    secao: 'contas',
    grupo: 'config.grupo.lives',
    caminho: 'lives.ligadas',
    titulo: 'cfg.livesLigadas.t',
    descricao: 'cfg.livesLigadas.d',
    palavras: ['live', 'twitch', 'kick', 'stream'],
    controle: { tipo: 'interruptor' },
  },
  {
    id: 'livesEconomico',
    secao: 'contas',
    grupo: 'config.grupo.lives',
    caminho: 'lives.economico',
    titulo: 'cfg.livesEconomico.t',
    descricao: 'cfg.livesEconomico.d',
    palavras: ['live', 'economia', 'quadros'],
    controle: { tipo: 'interruptor' },
    dependeDe: 'lives.ligadas',
  },
  {
    id: 'livesQualidade',
    secao: 'contas',
    grupo: 'config.grupo.lives',
    caminho: 'lives.qualidade',
    titulo: 'cfg.livesQualidade.t',
    descricao: 'cfg.livesQualidade.d',
    palavras: ['live', 'qualidade', 'resolução', '160p'],
    controle: {
      tipo: 'select',
      opcoes: OPCOES.qualidade.map((v) =>
        op(v, v === '160p' ? t('cfg.livesQualidade.160p') : v === 'auto' ? t('cfg.livesQualidade.auto') : v),
      ),
    },
    dependeDe: 'lives.ligadas',
  },
  {
    id: 'livesPorConta',
    secao: 'contas',
    grupo: 'config.grupo.lives',
    caminho: 'lives.porConta',
    titulo: 'cfg.livesPorConta.t',
    descricao: 'cfg.livesPorConta.d',
    palavras: ['live', 'limite', 'memória'],
    controle: {
      tipo: 'select',
      opcoes: OPCOES.livesPorConta.map((n) => op(n, n === 0 ? t('comum.semLimite') : String(n))),
    },
    dependeDe: 'lives.ligadas',
  },
  {
    id: 'livesVoltarAoCanal',
    secao: 'contas',
    grupo: 'config.grupo.lives',
    caminho: 'lives.voltarAoCanal',
    titulo: 'cfg.livesVoltarAoCanal.t',
    descricao: 'cfg.livesVoltarAoCanal.d',
    palavras: ['live', 'raid', 'host', 'canal'],
    controle: { tipo: 'interruptor' },
    dependeDe: 'lives.ligadas',
  },
  {
    id: 'livesDesligarEncerrada',
    secao: 'contas',
    grupo: 'config.grupo.lives',
    caminho: 'lives.desligarEncerrada',
    titulo: 'cfg.livesDesligarEncerrada.t',
    descricao: 'cfg.livesDesligarEncerrada.d',
    palavras: ['live', 'encerrada', 'offline'],
    controle: { tipo: 'interruptor' },
    dependeDe: 'lives.ligadas',
  },
  {
    id: 'livesReligar',
    secao: 'contas',
    grupo: 'config.grupo.lives',
    caminho: 'lives.religar',
    titulo: 'cfg.livesReligar.t',
    descricao: 'cfg.livesReligar.d',
    palavras: ['live', 'voltar', 'religar'],
    controle: { tipo: 'interruptor' },
    dependeDe: 'lives.ligadas',
  },
  {
    id: 'livesReligarACada',
    secao: 'contas',
    grupo: 'config.grupo.lives',
    caminho: 'lives.religarACadaMin',
    titulo: 'cfg.livesReligarACada.t',
    descricao: 'cfg.livesReligarACada.d',
    palavras: ['live', 'conferir', 'intervalo'],
    controle: {
      tipo: 'select',
      opcoes: OPCOES.religarMin.map((n) => op(n, n < 60 ? min(n) : hrs(n / 60))),
    },
    dependeDe: 'lives.religar',
  },
  {
    id: 'livesMostrarEmTodas',
    secao: 'contas',
    grupo: 'config.grupo.lives',
    caminho: 'lives.mostrarEmTodas',
    titulo: 'cfg.livesMostrarEmTodas.t',
    descricao: 'cfg.livesMostrarEmTodas.d',
    palavras: ['live', 'botão', 'todas'],
    controle: { tipo: 'interruptor' },
    dependeDe: 'lives.ligadas',
  },
  // Som
  {
    id: 'somModo',
    secao: 'contas',
    grupo: 'config.grupo.som',
    caminho: 'som.modo',
    titulo: 'cfg.somModo.t',
    descricao: 'cfg.somModo.d',
    palavras: ['som', 'áudio', 'mudo', 'volume'],
    controle: { tipo: 'select', opcoes: OPCOES.som.map((v) => op(v, t(`cfg.somModo.${v}` as ChaveTexto))) },
  },
  {
    id: 'jogos',
    secao: 'contas',
    grupo: 'config.grupo.jogos',
    titulo: 'cfg.jogos.t',
    descricao: 'cfg.jogos.d',
    palavras: ['catálogo', 'jogo', 'domínio', 'limite'],
    controle: { tipo: 'especial', qual: 'jogos' },
  },
  // Avisos
  {
    id: 'avisoWindows',
    secao: 'avisos',
    grupo: 'config.grupo.canais',
    caminho: 'avisos.windows',
    titulo: 'cfg.avisoWindows.t',
    descricao: 'cfg.avisoWindows.d',
    palavras: ['notificação', 'windows', 'toast'],
    controle: { tipo: 'interruptor' },
  },
  {
    id: 'avisoSom',
    secao: 'avisos',
    grupo: 'config.grupo.canais',
    caminho: 'avisos.som',
    titulo: 'cfg.avisoSom.t',
    descricao: 'cfg.avisoSom.d',
    palavras: ['som', 'alerta', 'tocar'],
    controle: { tipo: 'interruptor' },
  },
  {
    id: 'somEscolhido',
    secao: 'avisos',
    grupo: 'config.grupo.canais',
    caminho: 'avisos.somEscolhido',
    titulo: 'cfg.somEscolhido.t',
    descricao: 'cfg.somEscolhido.d',
    palavras: ['som', 'sino', 'bipe'],
    controle: {
      tipo: 'select',
      opcoes: OPCOES.somAviso.map((v) => op(v, t(`cfg.somEscolhido.${v}` as ChaveTexto))),
    },
    dependeDe: 'avisos.som',
  },
  {
    id: 'somArquivo',
    secao: 'avisos',
    grupo: 'config.grupo.canais',
    caminho: 'avisos.somArquivo',
    titulo: 'cfg.somEscolhido.arquivo',
    descricao: 'cfg.somEscolhido.d',
    palavras: ['som', 'arquivo', 'mp3', 'wav'],
    controle: { tipo: 'especial', qual: 'somArquivo' },
    dependeDe: 'avisos.som',
  },
  {
    id: 'volume',
    secao: 'avisos',
    grupo: 'config.grupo.canais',
    caminho: 'avisos.volume',
    titulo: 'cfg.volume.t',
    descricao: 'cfg.volume.d',
    palavras: ['volume', 'som'],
    controle: { tipo: 'numero', min: 0, max: 1, passo: 0.1 },
    dependeDe: 'avisos.som',
  },
  {
    id: 'avisoSelo',
    secao: 'avisos',
    grupo: 'config.grupo.canais',
    caminho: 'avisos.selo',
    titulo: 'cfg.avisoSelo.t',
    descricao: 'cfg.avisoSelo.d',
    palavras: ['selo', 'barra de tarefas', 'contador'],
    controle: { tipo: 'interruptor' },
  },
  {
    id: 'avisoPiscar',
    secao: 'avisos',
    grupo: 'config.grupo.canais',
    caminho: 'avisos.piscar',
    titulo: 'cfg.avisoPiscar.t',
    descricao: 'cfg.avisoPiscar.d',
    palavras: ['piscar', 'barra de tarefas'],
    controle: { tipo: 'interruptor' },
  },
  {
    id: 'avisoDiscord',
    secao: 'avisos',
    grupo: 'config.grupo.canais',
    caminho: 'avisos.discord',
    titulo: 'cfg.avisoDiscord.t',
    descricao: 'cfg.avisoDiscord.d',
    palavras: ['discord', 'webhook'],
    controle: { tipo: 'interruptor' },
  },
  {
    id: 'discordUrl',
    secao: 'avisos',
    grupo: 'config.grupo.canais',
    titulo: 'cfg.discordUrl.t',
    descricao: 'cfg.discordUrl.d',
    palavras: ['discord', 'webhook', 'link'],
    controle: { tipo: 'especial', qual: 'discordUrl' },
    dependeDe: 'avisos.discord',
  },
  {
    id: 'avisoTelegram',
    secao: 'avisos',
    grupo: 'config.grupo.canais',
    caminho: 'avisos.telegram',
    titulo: 'cfg.avisoTelegram.t',
    descricao: 'cfg.avisoTelegram.d',
    palavras: ['telegram', 'bot'],
    controle: { tipo: 'interruptor' },
  },
  {
    id: 'telegramToken',
    secao: 'avisos',
    grupo: 'config.grupo.canais',
    titulo: 'cfg.telegramToken.t',
    descricao: 'cfg.telegramToken.d',
    palavras: ['telegram', 'token', 'bot'],
    controle: { tipo: 'especial', qual: 'telegramToken' },
    dependeDe: 'avisos.telegram',
  },
  {
    id: 'telegramChat',
    secao: 'avisos',
    grupo: 'config.grupo.canais',
    caminho: 'avisos.telegramChatId',
    titulo: 'cfg.telegramChat.t',
    descricao: 'cfg.telegramChat.d',
    palavras: ['telegram', 'chat'],
    controle: { tipo: 'texto' },
    dependeDe: 'avisos.telegram',
  },
  {
    id: 'tiposAviso',
    secao: 'avisos',
    grupo: 'config.grupo.oQueAvisa',
    titulo: 'cfg.tiposAviso.t',
    descricao: 'cfg.tiposAviso.d',
    palavras: ['queda', 'travou', 'memória', 'live', 'login', 'limite'],
    controle: { tipo: 'especial', qual: 'tiposAviso' },
  },
  {
    id: 'semInternetMin',
    secao: 'avisos',
    grupo: 'config.grupo.oQueAvisa',
    caminho: 'avisos.semInternetMin',
    titulo: 'cfg.semInternetMin.t',
    descricao: 'cfg.semInternetMin.d',
    palavras: ['internet', 'offline', 'conexão'],
    controle: { tipo: 'numero', min: 1, max: 120, unidade: 'min' },
  },
  {
    id: 'textos',
    secao: 'avisos',
    grupo: 'config.grupo.textos',
    titulo: 'cfg.textos.t',
    descricao: 'cfg.textos.d',
    palavras: ['texto', 'palavra', 'verificação', 'captcha', 'vigiar'],
    controle: { tipo: 'especial', qual: 'textos' },
  },
  {
    id: 'varreduraSeg',
    secao: 'avisos',
    grupo: 'config.grupo.textos',
    caminho: 'avisos.varreduraSeg',
    titulo: 'cfg.varreduraSeg.t',
    descricao: 'cfg.varreduraSeg.d',
    palavras: ['texto', 'intervalo', 'varredura'],
    controle: { tipo: 'numero', min: 2, max: 60, unidade: 's' },
  },
  {
    id: 'silencioLigado',
    secao: 'avisos',
    grupo: 'config.grupo.silencio',
    caminho: 'avisos.silencio.ligado',
    titulo: 'cfg.silencioLigado.t',
    descricao: 'cfg.silencioLigado.d',
    palavras: ['silêncio', 'noite', 'não perturbe'],
    controle: { tipo: 'interruptor' },
  },
  {
    id: 'silencioInicio',
    secao: 'avisos',
    grupo: 'config.grupo.silencio',
    caminho: 'avisos.silencio.inicio',
    titulo: 'cfg.silencioInicio.t',
    descricao: 'cfg.silencioInicio.d',
    palavras: ['silêncio', 'hora'],
    controle: { tipo: 'hora' },
    dependeDe: 'avisos.silencio.ligado',
  },
  {
    id: 'silencioFim',
    secao: 'avisos',
    grupo: 'config.grupo.silencio',
    caminho: 'avisos.silencio.fim',
    titulo: 'cfg.silencioFim.t',
    descricao: 'cfg.silencioFim.d',
    palavras: ['silêncio', 'hora'],
    controle: { tipo: 'hora' },
    dependeDe: 'avisos.silencio.ligado',
  },
  {
    id: 'historico',
    secao: 'avisos',
    grupo: 'config.grupo.historico',
    titulo: 'cfg.historico.t',
    descricao: 'cfg.historico.d',
    palavras: ['histórico', 'avisos', 'lista'],
    controle: { tipo: 'especial', qual: 'historico' },
  },
  // Cofre
  {
    id: 'cofre',
    secao: 'cofre',
    grupo: 'config.grupo.cofre',
    titulo: 'cfg.cofre.t',
    descricao: 'cfg.cofre.d',
    palavras: ['senha', 'login', 'e-mail', 'cofre'],
    controle: { tipo: 'especial', qual: 'cofre' },
  },
  {
    id: 'senhaMestra',
    secao: 'cofre',
    grupo: 'config.grupo.cofre',
    caminho: 'cofre.senhaMestra',
    titulo: 'cfg.senhaMestra.t',
    descricao: 'cfg.senhaMestra.d',
    palavras: ['senha mestra', 'proteger'],
    controle: { tipo: 'especial', qual: 'senhaMestra' },
  },
  {
    id: 'trancarAposMin',
    secao: 'cofre',
    grupo: 'config.grupo.cofre',
    caminho: 'cofre.trancarAposMin',
    titulo: 'cfg.trancarAposMin.t',
    descricao: 'cfg.trancarAposMin.d',
    palavras: ['trancar', 'bloquear', 'tempo'],
    controle: { tipo: 'numero', min: 1, max: 240, unidade: 'min' },
    dependeDe: 'cofre.senhaMestra',
  },
  // Ping
  {
    id: 'pingIntervalo',
    secao: 'ping',
    grupo: 'config.grupo.ping',
    caminho: 'ping.intervaloMin',
    titulo: 'cfg.pingIntervalo.t',
    descricao: 'cfg.pingIntervalo.d',
    palavras: ['ping', 'latência', 'servidor'],
    controle: { tipo: 'numero', min: 1, max: 30, unidade: 'min' },
  },
  {
    id: 'pingLimite',
    secao: 'ping',
    grupo: 'config.grupo.ping',
    caminho: 'ping.limiteMs',
    titulo: 'cfg.pingLimite.t',
    descricao: 'cfg.pingLimite.d',
    palavras: ['ping', 'lento', 'ms'],
    controle: { tipo: 'numero', min: 100, max: 10000, passo: 100, unidade: 'ms' },
  },
  // Conta e versão
  {
    id: 'versao',
    secao: 'versao',
    grupo: 'config.grupo.versao',
    titulo: 'cfg.versao.t',
    descricao: 'cfg.versao.d',
    palavras: ['versão', 'atualizar', 'novidades'],
    controle: { tipo: 'especial', qual: 'versao' },
  },
  {
    id: 'canal',
    secao: 'versao',
    grupo: 'config.grupo.versao',
    caminho: 'atualizacao.canal',
    titulo: 'cfg.canal.t',
    descricao: 'cfg.canal.d',
    palavras: ['beta', 'teste', 'atualização'],
    controle: {
      tipo: 'select',
      opcoes: OPCOES.canalAtualizacao.map((v) => op(v, t(`cfg.canal.${v}` as ChaveTexto))),
    },
  },
  {
    id: 'backup',
    secao: 'versao',
    grupo: 'config.grupo.backup',
    titulo: 'cfg.backup.t',
    descricao: 'cfg.backup.d',
    palavras: ['backup', 'exportar', 'importar', 'cópia'],
    controle: { tipo: 'especial', qual: 'backup' },
  },
  {
    id: 'pastaDados',
    secao: 'versao',
    grupo: 'config.grupo.dados',
    titulo: 'cfg.pastaDados.t',
    descricao: 'cfg.pastaDados.d',
    palavras: ['pasta', 'dados', 'appdata'],
    controle: { tipo: 'especial', qual: 'pastaDados' },
  },
  // Avançado
  {
    id: 'aceleracao',
    secao: 'avancado',
    grupo: 'config.grupo.avancado',
    caminho: 'avancado.aceleracaoHardware',
    titulo: 'cfg.aceleracao.t',
    descricao: 'cfg.aceleracao.d',
    palavras: ['gpu', 'placa de vídeo', 'hardware'],
    controle: { tipo: 'interruptor' },
    valeAoReiniciar: true,
  },
  {
    id: 'devtools',
    secao: 'avancado',
    grupo: 'config.grupo.avancado',
    titulo: 'cfg.devtools.t',
    descricao: 'cfg.devtools.d',
    palavras: ['devtools', 'console', 'depurar'],
    controle: { tipo: 'especial', qual: 'devtools' },
  },
  {
    id: 'limparCacheTodas',
    secao: 'avancado',
    grupo: 'config.grupo.avancado',
    titulo: 'cfg.limparCacheTodas.t',
    descricao: 'cfg.limparCacheTodas.d',
    palavras: ['cache', 'limpar'],
    controle: { tipo: 'especial', qual: 'limparCacheTodas' },
  },
  {
    id: 'logs',
    secao: 'avancado',
    grupo: 'config.grupo.avancado',
    titulo: 'cfg.logs.t',
    descricao: 'cfg.logs.d',
    palavras: ['log', 'registro', 'erro'],
    controle: { tipo: 'especial', qual: 'logs' },
  },
  {
    id: 'redefinir',
    secao: 'avancado',
    grupo: 'config.grupo.avancado',
    titulo: 'cfg.redefinir.t',
    descricao: 'cfg.redefinir.d',
    palavras: ['redefinir', 'padrão', 'resetar'],
    controle: { tipo: 'especial', qual: 'redefinir' },
  },
]

/** RN-175: busca por título, descrição e palavras-chave, sem acento e sem maiúsculas. */
export function buscarConfiguracoes(
  consulta: string,
  linhas: readonly LinhaConfig[] = LINHAS,
): LinhaConfig[] {
  const termos = normalizar(consulta).split(' ').filter(Boolean)
  if (termos.length === 0) return [...linhas]
  return linhas.filter((l) => {
    const alvo = normalizar([t(l.titulo), t(l.descricao), ...l.palavras, t(l.grupo)].join(' '))
    return termos.every((termo) => alvo.includes(termo))
  })
}

import { Motor } from '../../src/main/nucleo/motor.ts'
import { type Config, configPadrao } from '../../src/shared/config/esquema.ts'
import type { Jogo } from '../../src/shared/tipos/dominio.ts'
import { ArmazemMemoria, ConfigMemoria } from './armazem.ts'
import {
  CofreFalso,
  FabricaLivesFalsa,
  FabricaPaginasFalsa,
  HttpFalso,
  LocaisFalsos,
  logMudo,
  RedeFalsa,
  SistemaFalso,
} from './paginas.ts'
import { RelogioFalso } from './relogio.ts'

export const jogoFalso: Jogo = {
  id: 'falso',
  nome: 'Jogo Falso',
  dominios: ['jogo.test'],
  urlInicial: 'https://jogo.test/',
  icone: '🎲',
  farmaEscondido: false,
  dadosContinuos: false,
  semDadosMinPadrao: 0,
  limiteContas: null,
  bonusLive: true,
  plataformasLive: ['twitch', 'kick'],
  wsPrincipal: null,
  seletoresLogin: { usuario: '#u', senha: '#s' },
  seletorPedeLogin: '#form-login',
  canvas: false,
  origem: 'usuario',
}

/** Monta um Motor com todas as portas falsas. */
export function montarMotor(opcoes: { config?: Partial<Config>; jogos?: Jogo[] } = {}) {
  const relogio = new RelogioFalso()
  const armazem = new ArmazemMemoria(opcoes.jogos ?? [jogoFalso])
  const configArquivo = new ConfigMemoria({ ...configPadrao(), ...opcoes.config })
  const paginas = new FabricaPaginasFalsa()
  const lives = new FabricaLivesFalsa()
  const http = new HttpFalso()
  const rede = new RedeFalsa()
  const locais = new LocaisFalsos()
  const sistema = new SistemaFalso()
  const cofre = new CofreFalso()
  const eventos: { evento: string; dados: unknown }[] = []
  const soltas: string[] = []
  const devolvidas: string[] = []
  let seq = 0
  const segredos = { discord: null as string | null, telegram: null as string | null }
  const motor = new Motor({
    relogio,
    armazem,
    configArquivo,
    paginas,
    lives,
    http,
    rede,
    locais,
    sistema,
    log: logMudo,
    cofre,
    segredos: {
      discord: () => segredos.discord,
      telegram: () => segredos.telegram,
      existe: (c) => segredos[c] !== null,
    },
    gerarId: () => `id${++seq}`,
    versao: { app: 'teste', electron: '0', dados: 'memoria' },
    emitir: (evento, dados) => eventos.push({ evento, dados }),
    janelas: { soltar: (id) => soltas.push(id), devolver: (id) => devolvidas.push(id) },
  })
  motor.iniciar()
  const grupoId = motor.listarGrupos()[0]!.id
  const novaConta = (dados: Partial<{ grupoId: string; jogoId: string; url: string; nome: string }> = {}) => {
    const r = motor.adicionarConta({
      grupoId: dados.grupoId ?? grupoId,
      jogoId: dados.jogoId ?? 'falso',
      url: dados.url ?? 'https://jogo.test/jogar',
      nome: dados.nome,
    })
    if (!r.ok) throw new Error(r.erro)
    return r.valor
  }
  return {
    motor,
    relogio,
    armazem,
    configArquivo,
    paginas,
    lives,
    http,
    rede,
    locais,
    sistema,
    cofre,
    eventos,
    soltas,
    devolvidas,
    segredos,
    grupoId,
    novaConta,
  }
}

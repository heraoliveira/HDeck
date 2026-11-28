<script lang="ts">
import { BOTOES_PAINEL, SECOES_PAINEL } from '@shared/config/esquema.ts'
import { t } from '@shared/i18n/index.ts'
import type { DetalheConta } from '@shared/ipc/contrato.ts'
import { type EventoConta, OPCOES_OTIMIZAR, type OtimizarAuto } from '@shared/tipos/dominio.ts'
import { formatarDuracao } from '@shared/util/texto.ts'
import GraficoLinha from '../componentes/GraficoLinha.svelte'
import Icone from '../componentes/Icone.svelte'
import { chamar } from '../estado/api.ts'
import { abrirDialogo, grupoAtual, loja, mensagem } from '../estado/loja.svelte.ts'

/**
 * Painel direito (RN-008): configurações e consumo da conta selecionada. Recolhe para uma faixa fina e
 * é personalizável: cada bloco e cada botão pode sair, voltar e trocar de lugar ("Personalizar").
 */
type Secao = (typeof SECOES_PAINEL)[number]
type Botao = (typeof BOTOES_PAINEL)[number]

const s = $derived(loja.snap!)
const grupo = $derived(grupoAtual())
const contasDoGrupo = $derived(s.contas.filter((c) => c.grupoId === grupo?.id))
const c = $derived(contasDoGrupo.find((x) => x.id === s.ativaId) ?? contasDoGrupo[0])
const est = $derived(c ? s.estados[c.id] : undefined)
const ligada = $derived((est?.estado ?? 'desligada') !== 'desligada')
const atual = $derived(c ? loja.metricas?.porConta[c.id] : undefined)
const livesDaConta = $derived(s.lives.filter((l) => l.contaId === c?.id))
const cfg = $derived(s.config.painelDireito)
const ot = $derived(c?.otimizarAuto)

let detalhe: DetalheConta | null = $state(null)
let agora = $state(Date.now())
let editando = $state(false)
let arrastando: Secao | null = $state(null)
let editandoUrl = $state(false)
let url = $state('')
let notas = $state('')

async function carregar(id: string) {
  detalhe = await chamar<'contas.detalhe', DetalheConta>('contas.detalhe', { id }).catch(() => null)
}
$effect(() => {
  const id = c?.id
  if (!id || loja.direitaRecolhida) return
  void carregar(id)
  const t1 = setInterval(() => void carregar(id), 15_000)
  const t2 = setInterval(() => (agora = Date.now()), 1000)
  return () => {
    clearInterval(t1)
    clearInterval(t2)
  }
})
$effect(() => {
  notas = c?.notas ?? ''
})

function alternar() {
  loja.direitaRecolhida = !loja.direitaRecolhida
  try {
    localStorage.setItem('hdeck.direitaRecolhida', loja.direitaRecolhida ? '1' : '0')
  } catch {
    // sem armazenamento: só não lembra
  }
}

// ---------- personalização ----------
const salvar = (campo: 'secoes' | 'botoes' | 'rodape', lista: readonly string[]) =>
  chamar('config.alterar', { caminho: `painelDireito.${campo}`, valor: [...lista] })
const tirarSecao = (x: Secao) =>
  salvar(
    'secoes',
    cfg.secoes.filter((y) => y !== x),
  )
const porSecao = (x: Secao) => salvar('secoes', [...cfg.secoes, x])
const tirarBotao = (campo: 'botoes' | 'rodape', x: Botao) =>
  salvar(
    campo,
    cfg[campo].filter((y) => y !== x),
  )
const porBotao = (x: Botao) => salvar('botoes', [...cfg.botoes, x])
const padrao = () => {
  void salvar('secoes', ['acoes', 'lives', 'consumo', 'otimizar', 'historico'])
  void salvar('botoes', ['inicio', 'recarregar', 'som', 'destacar'])
  void salvar('rodape', ['foco', 'ligar', 'mais'])
}
const secoesFora = $derived(SECOES_PAINEL.filter((x) => !cfg.secoes.includes(x)))
const botoesFora = $derived(BOTOES_PAINEL.filter((x) => !cfg.botoes.includes(x) && !cfg.rodape.includes(x)))
function soltarEm(alvo: Secao) {
  if (!arrastando || arrastando === alvo) return
  const lista = cfg.secoes.filter((x) => x !== arrastando)
  lista.splice(lista.indexOf(alvo), 0, arrastando)
  arrastando = null
  void salvar('secoes', lista)
}

// ---------- ações ----------
type Acao = { icone: string; rotulo: string; fazer: () => void; ativo?: boolean; precisaLigada?: boolean }
const acoes = $derived.by((): Record<Botao, Acao> => {
  const id = c?.id ?? ''
  const nome = c?.nome ?? ''
  return {
    inicio: {
      icone: 'casa',
      rotulo: t('pc.inicio'),
      fazer: () => chamar('contas.inicio', { id }),
      precisaLigada: true,
    },
    recarregar: {
      icone: 'recarregar',
      rotulo: t('pc.recarregar'),
      fazer: () => chamar('contas.lote', { ids: [id], acao: 'recarregar' }),
      precisaLigada: true,
    },
    som: {
      icone: c?.som ? 'som' : 'mudo',
      rotulo: t('pd.som'),
      fazer: () => chamar('contas.editar', { id, som: !c?.som }),
      ativo: c?.som ?? false,
    },
    destacar: {
      icone: 'janelaPropria',
      rotulo: t('pd.destacar'),
      fazer: () => chamar('contas.soltar', { id }),
      precisaLigada: true,
    },
    otimizar: {
      icone: 'brilho',
      rotulo: t('pc.otimizar'),
      fazer: () => chamar('contas.lote', { ids: [id], acao: 'otimizar' }),
      precisaLigada: true,
    },
    renomear: {
      icone: 'lapis',
      rotulo: t('pd.renomear'),
      fazer: () => abrirDialogo({ qual: 'editarConta', id }),
    },
    endereco: {
      icone: 'link',
      rotulo: t('pd.endereco'),
      fazer: () => abrirDialogo({ qual: 'editarConta', id }),
    },
    login: { icone: 'chave', rotulo: t('pd.login'), fazer: () => abrirDialogo({ qual: 'cofre', id }) },
    preencher: {
      icone: 'lapis',
      rotulo: t('pd.preencher'),
      fazer: () => chamar('cofre.preencher', { ids: [id] }),
      precisaLigada: true,
    },
    lives: { icone: 'live', rotulo: t('pd.lives'), fazer: () => chamar('lives.janela', { contaId: id }) },
    mover: { icone: 'pasta', rotulo: t('pd.mover'), fazer: () => mais() },
    duplicar: { icone: 'mais', rotulo: t('pd.duplicar'), fazer: () => chamar('contas.duplicar', { id }) },
    devtools: {
      icone: 'engrenagem',
      rotulo: t('pd.devtools'),
      fazer: () => chamar('contas.devtools', { id }),
      precisaLigada: true,
    },
    limpar: {
      icone: 'lixo',
      rotulo: t('pd.limpar'),
      fazer: () =>
        abrirDialogo({
          qual: 'confirmar',
          titulo: t('pc.limparDados'),
          texto: t('pc.limparDadosConfirma', { nome }),
          botao: t('cfg.limpar'),
          perigo: true,
          aoConfirmar: () => void chamar('contas.limparDados', { id }),
        }),
    },
    excluir: {
      icone: 'lixo',
      rotulo: t('pd.excluir'),
      fazer: () => abrirDialogo({ qual: 'apagarConta', id }),
    },
    foco: {
      icone: 'foco',
      rotulo: t('pd.foco'),
      fazer: () =>
        grupo && chamar('grupos.layout', { id: grupo.id, visao: 'foco' }).then(() => (loja.focoContaId = id)),
    },
    ligar: {
      icone: 'ligar',
      rotulo: ligada ? t('pc.desligar') : t('pc.ligar'),
      fazer: () =>
        ligada
          ? chamar('contas.lote', { ids: [id], acao: 'desligar' })
          : chamar('contas.lote', { ids: [id], acao: 'ligar', confirmado: true }),
    },
    mais: { icone: 'pontos', rotulo: t('pd.mais'), fazer: () => mais() },
  }
})
let ultimoMais: HTMLElement | undefined = $state()
function mais() {
  if (!c) return
  const r = ultimoMais?.getBoundingClientRect()
  abrirDialogo({
    qual: 'painelConta',
    id: c.id,
    x: Math.max(8, (r?.left ?? innerWidth) - 300),
    y: Math.max(48, (r?.top ?? 600) - 520),
  })
}

async function salvarUrl() {
  if (!c) return
  try {
    const u = new URL(url.trim())
    if (!/^https?:$/.test(u.protocol)) throw new Error()
    await chamar('contas.editar', { id: c.id, url: u.toString() })
    editandoUrl = false
  } catch {
    mensagem('erro', t('adicionar.urlInvalida'))
  }
}
const otimizar = (patch: Partial<OtimizarAuto>) =>
  c && ot && chamar('contas.editar', { id: c.id, otimizarAuto: { ...ot, ...patch } })
function zoom(delta: number) {
  if (!c) return
  const z = Math.round(Math.min(3, Math.max(0.25, c.zoom + delta)) * 100) / 100
  void chamar('contas.editar', { id: c.id, zoom: z })
}

// ---------- consumo e histórico ----------
const pontos = (campo: 'ramMb' | 'cpuPct') => {
  const serie = (detalhe?.serieHora ?? []).map((p) => ({ x: p.em, y: p[campo] }))
  if (atual) serie.push({ x: agora, y: atual[campo] })
  return serie
}
const MOTIVOS: Record<string, string> = {
  queda: 'pd.r.queda',
  travou: 'pd.r.travou',
  fechou: 'pd.r.fechou',
  site_fora: 'pd.r.siteFora',
  internet: 'pd.r.internet',
  programada: 'pd.r.programada',
  memoria: 'pd.r.memoria',
  manual: 'pd.r.manual',
  suspensao: 'pd.r.suspensao',
  otimizar: 'pd.r.otimizar',
}
function textoEvento(e: EventoConta): string {
  if (e.tipo === 'recarga') {
    const chave = MOTIVOS[e.motivo]
    return chave ? t(chave as 'pd.r.manual') : t('pd.r.outro', { motivo: e.motivo })
  }
  return `${t(`pd.e.${e.tipo}` as 'pd.e.queda')}: ${e.motivo}`
}
const hora = (em: number) => new Date(em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const iniciais = (n: string) =>
  n
    .replace(/[^\p{L}\p{N}]/gu, '')
    .slice(0, 2)
    .toUpperCase() || '?'
const politicaDoGrupo = $derived(c ? (grupo?.layout.politicas[c.jogoId] ?? 'economizar') : 'economizar')
</script>

<aside class="direita" class:recolhida={loja.direitaRecolhida} class:editando aria-label={t('pd.titulo')}>
  {#if loja.direitaRecolhida}
    <!-- Recolhido: os botões que a dona escolheu, só o ícone (o nome aparece ao passar o mouse). -->
    <div class="mini">
      {#if c}
        <button class="avatar mini-avatar" style:--cor={c.cor} title={c.nome} aria-label={c.nome} onclick={alternar}>{iniciais(c.nome)}<span class="ponto" data-estado={est?.estado ?? 'desligada'}></span></button>
        {#each [...cfg.botoes, ...cfg.rodape] as b (b)}
          {@const a = acoes[b]}
          <button class="mini-acao" class:ligado={a.ativo} disabled={a.precisaLigada && !ligada} title={a.rotulo} aria-label={a.rotulo} onclick={() => (b === 'mais' ? alternar() : a.fazer())}>
            <Icone nome={a.icone as 'casa'} tamanho={16} />
          </button>
        {/each}
        {#if cfg.secoes.includes('lives')}
          <button class="mini-acao lives" title={t('pd.lives')} aria-label={t('pd.lives')} onclick={() => chamar('lives.janela', { contaId: c.id })}><Icone nome="live" tamanho={16} /><span class="contagem">{livesDaConta.filter((l) => l.ligada).length}</span></button>
        {/if}
      {/if}
      <span class="cresce"></span>
      <button class="mini-acao" aria-label={t('pd.expandir')} title={t('pd.expandir')} onclick={alternar}><Icone nome="seta" tamanho={14} /></button>
    </div>
  {:else}
  <div class="topo">
    <button class="icone-botao" aria-label={loja.direitaRecolhida ? t('pd.expandir') : t('pd.recolher')} onclick={alternar}>
      <Icone nome={loja.direitaRecolhida ? 'seta' : 'descer'} tamanho={14} />
    </button>
    {#if !loja.direitaRecolhida && c}
      <span class="avatar" style:--cor={c.cor}>{iniciais(c.nome)}</span>
      <div class="cresce titulo">
        <div class="nome">{c.nome}</div>
        <div class="sub">
          {t(`estado.${est?.estado ?? 'desligada'}` as 'estado.ativa')}{#if est?.onlineDesde}
            · {t('pd.ligadaHa', { tempo: formatarDuracao(agora - est.onlineDesde) })}{/if}
        </div>
      </div>
      {#if editando}
        <button class="botao primario pronto" onclick={() => (editando = false)}>{t('pd.pronto')}</button>
      {:else}
        <button class="icone-botao" aria-label={t('pd.personalizar')} title={t('pd.personalizar')} onclick={() => (editando = true)}><Icone nome="engrenagem" tamanho={14} /></button>
      {/if}
    {/if}
  </div>

  {#if !loja.direitaRecolhida}
    {#if !c}
      <p class="muted vazio">{t('pd.semConta')}</p>
    {:else}
      <div class="rolagem">
        {#each cfg.secoes as secao (secao)}
          <section
            class="secao"
            class:arrastando={arrastando === secao}
            draggable={editando}
            ondragstart={() => (arrastando = secao)}
            ondragover={(e) => editando && e.preventDefault()}
            ondrop={() => soltarEm(secao)}
            aria-label={t(`pd.s.${secao}` as 'pd.s.acoes')}
          >
            {#if editando}
              <button class="tirar" aria-label={t('pd.tirar', { item: t(`pd.s.${secao}` as 'pd.s.acoes') })} onclick={() => tirarSecao(secao)}>−</button>
            {/if}
            {#if secao === 'acoes'}
              <div class="acoes">
                {#each cfg.botoes as b (b)}
                  {@const a = acoes[b]}
                  <span class="botao-wrap">
                    <button class="acao" class:ligado={a.ativo} disabled={!editando && a.precisaLigada && !ligada} onclick={() => !editando && a.fazer()}><Icone nome={a.icone as 'casa'} />{a.rotulo}</button>
                    {#if editando}<button class="tirar pequeno-x" aria-label={t('pd.tirar', { item: a.rotulo })} onclick={() => tirarBotao('botoes', b)}>−</button>{/if}
                  </span>
                {/each}
              </div>
            {:else if secao === 'lives'}
              <h3>{t('pd.lives')}</h3>
              {#if livesDaConta.length === 0}
                <p class="muted pequeno">{t('pd.semLives')}</p>
              {:else}
                {#each livesDaConta.filter((l) => l.ligada) as l (l.id)}
                  <div class="linha"><span class="selo {l.plataforma}">{l.plataforma === 'twitch' ? 'T' : 'K'}</span><span class="cresce">{l.canal}</span><span class="pequeno muted">{t(`lives.estado.${s.livesEstado[l.id] ?? 'desligada'}` as 'lives.estado.tocando')}</span></div>
                {:else}
                  <p class="muted pequeno">{t('pd.livesDesligadas', { n: livesDaConta.length })}</p>
                {/each}
              {/if}
              <button class="botao fino" onclick={() => chamar('lives.janela', { contaId: c.id })}><Icone nome="live" tamanho={14} />{t('pd.abrirLives')}</button>
            {:else if secao === 'consumo'}
              <h3>{t('pd.consumo')}</h3>
              <div class="medida"><span>{t('pd.memoria')}</span><b>{atual ? `${Math.round(atual.ramMb)} MB` : '—'}</b></div>
              <GraficoLinha rotulo={t('pd.memoria')} altura={44} legenda={false} series={[{ nome: t('pd.memoria'), cor: 'var(--destaque)', pontos: pontos('ramMb'), unidade: 'MB' }]} />
              <div class="medida"><span>{t('pd.cpu')}</span><b>{atual ? `${atual.cpuPct.toFixed(1)}%` : '—'}</b></div>
              <GraficoLinha rotulo={t('pd.cpu')} altura={44} legenda={false} series={[{ nome: t('pd.cpu'), cor: 'var(--ok)', pontos: pontos('cpuPct'), unidade: '%' }]} />
            {:else if secao === 'otimizar'}
              <h3>{t('pc.otimizar')}</h3>
              <button class="cartao-otimizar" disabled={editando || !ligada} onclick={() => chamar('contas.lote', { ids: [c.id], acao: 'otimizar' })}>
                <Icone nome="brilho" />
                <span class="cresce"><b>{t('pc.otimizar')}</b><small>{t('pd.otimizarTexto')}</small></span>
              </button>
              {#if ot}
                <div class="pf-segmento tres" role="radiogroup" aria-label={t('pd.sozinhoTitulo')}>
                  {#each [['desligado', t('pd.oDesligado')], ['tempo', t('pd.oTempo')], ['memoria', t('pd.oMemoria')]] as [v, r] (v)}
                    <button role="radio" aria-checked={ot.modo === v} class:ativo={ot.modo === v} onclick={() => otimizar({ modo: v as OtimizarAuto['modo'] })}>{r}</button>
                  {/each}
                </div>
                {#if ot.modo === 'tempo'}
                  <label class="linha pequeno">{t('pd.aCada')}
                    <select class="campo pequeno" value={ot.aCadaMin} onchange={(e) => otimizar({ aCadaMin: Number(e.currentTarget.value) })}>
                      {#each OPCOES_OTIMIZAR.min as n (n)}<option value={n}>{n < 60 ? `${n} min` : `${n / 60} h`}</option>{/each}
                    </select>
                  </label>
                  {#if detalhe?.proximaOtimizacao}<p class="pequeno ok">{t('pd.proxima', { tempo: formatarDuracao(Math.max(0, detalhe.proximaOtimizacao - agora)) })}</p>{/if}
                {:else if ot.modo === 'memoria'}
                  <label class="linha pequeno">{t('pd.quandoPassar')}
                    <select class="campo pequeno" value={ot.limiteMb} onchange={(e) => otimizar({ limiteMb: Number(e.currentTarget.value) })}>
                      {#each OPCOES_OTIMIZAR.mb as n (n)}<option value={n}>{n >= 1000 ? `${n / 1000} GB` : `${n} MB`}</option>{/each}
                    </select>
                  </label>
                {/if}
              {/if}
            {:else if secao === 'historico'}
              <h3>{t('pd.historico')}</h3>
              {#if (detalhe?.historico.length ?? 0) === 0}
                <p class="muted pequeno">{t('pd.semHistorico')}</p>
              {:else}
                <ul class="historico">
                  {#each detalhe!.historico as e, i (i)}
                    <li><span class="quando">{hora(e.em)}</span><span>{textoEvento(e)}</span></li>
                  {/each}
                </ul>
              {/if}
            {:else if secao === 'endereco'}
              <h3>{t('pd.s.endereco')}</h3>
              {#if editandoUrl}
                <div class="linha"><input class="campo cresce" bind:value={url} onkeydown={(e) => e.key === 'Enter' && salvarUrl()} aria-label={t('pc.endereco')} /><button class="botao primario" onclick={salvarUrl}>{t('comum.salvar')}</button></div>
              {:else}
                <div class="linha"><span class="cresce url pequeno">{c.url}</span><button class="botao fino" onclick={() => ((url = c.url), (editandoUrl = true))}>{t('pd.alterar')}</button></div>
              {/if}
            {:else if secao === 'zoom'}
              <h3>{t('pc.zoom')}</h3>
              <div class="linha"><button class="icone-botao" aria-label="−" onclick={() => zoom(-0.1)}>−</button><span class="cresce centro">{Math.round(c.zoom * 100)}%</span><button class="icone-botao" aria-label="+" onclick={() => zoom(0.1)}>+</button><button class="botao fino" onclick={() => chamar('contas.editar', { id: c.id, zoom: 1 })}>100%</button></div>
            {:else if secao === 'foraDaTela'}
              <h3>{t('pc.foraDaTela')}</h3>
              <div class="pf-segmento tres" role="radiogroup" aria-label={t('pc.foraDaTela')}>
                {#each [['padrao_do_jogo', t('pd.seguirGrupo', { p: t(politicaDoGrupo === 'manter' ? 'pg.farmando' : 'pg.economizar') })], ['manter', t('pg.farmando')], ['economizar', t('pg.economizar')]] as [v, r] (v)}
                  <button role="radio" aria-checked={c.politicaForaTela === v} class:ativo={c.politicaForaTela === v} onclick={() => chamar('contas.editar', { id: c.id, politicaForaTela: v as 'manter' })}>{r}</button>
                {/each}
              </div>
            {:else if secao === 'notas'}
              <h3>{t('pd.s.notas')}</h3>
              <textarea class="campo" rows="3" bind:value={notas} onblur={() => chamar('contas.editar', { id: c.id, notas: notas.slice(0, 2000) })} aria-label={t('pd.s.notas')}></textarea>
            {/if}
          </section>
        {/each}

        {#if editando}
          <section class="adicionar">
            <h3>{t('pd.adicionar')}</h3>
            <p class="pequeno muted">{t('pd.adicionarTexto')}</p>
            {#if botoesFora.length > 0}
              <div class="rotulo-secao">{t('pd.botoes')}</div>
              <div class="acoes">
                {#each botoesFora as b (b)}
                  <button class="acao fora" onclick={() => porBotao(b)}><Icone nome={acoes[b].icone as 'casa'} />{acoes[b].rotulo}<span class="por">+</span></button>
                {/each}
              </div>
            {/if}
            {#if secoesFora.length > 0}
              <div class="rotulo-secao">{t('pd.secoes')}</div>
              {#each secoesFora as x (x)}
                <button class="item-secao" onclick={() => porSecao(x)}><span class="cresce"><b>{t(`pd.s.${x}` as 'pd.s.acoes')}</b><small>{t(`pd.d.${x}` as 'pd.d.acoes')}</small></span><span class="por">+</span></button>
              {/each}
            {/if}
            <button class="link pequeno" onclick={padrao}><Icone nome="recarregar" tamanho={12} />{t('pd.voltarPadrao')}</button>
          </section>
        {/if}
      </div>

      <div class="rodape">
        {#each cfg.rodape as b (b)}
          {@const a = acoes[b]}
          <span class="botao-wrap">
            {#if b === 'mais'}
              <button class="acao" bind:this={ultimoMais} onclick={() => !editando && a.fazer()}><Icone nome={a.icone as 'casa'} />{a.rotulo}</button>
            {:else}
              <button class="acao" class:destaque={b === 'foco'} onclick={() => !editando && a.fazer()}><Icone nome={a.icone as 'casa'} />{a.rotulo}</button>
            {/if}
            {#if editando && b !== 'mais'}<button class="tirar pequeno-x" aria-label={t('pd.tirar', { item: a.rotulo })} onclick={() => tirarBotao('rodape', b)}>−</button>{/if}
          </span>
        {/each}
      </div>
    {/if}
  {/if}
  {/if}
</aside>

<style>
  .direita {
    width: 280px;
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--fundo-lateral);
    color: var(--lateral-texto);
    border-left: 1px solid var(--borda);
    min-height: 0;
  }
  .direita.recolhida {
    width: 52px;
  }
  .mini {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 0;
  }
  .mini-avatar {
    position: relative;
    width: 34px;
    height: 34px;
    border: 0;
    cursor: pointer;
    margin-bottom: 6px;
  }
  .ponto {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--texto-3);
    border: 2px solid var(--fundo-lateral);
  }
  .ponto[data-estado='ativa'],
  .ponto[data-estado='economica'],
  .ponto[data-estado='escondida'] {
    background: var(--ok);
  }
  .mini-acao {
    position: relative;
    width: 34px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 1px solid transparent;
    border-radius: var(--raio-m);
    background: none;
    color: var(--lateral-texto);
    cursor: pointer;
  }
  .mini-acao:hover:not(:disabled) {
    border-color: var(--borda);
    background: var(--fundo-cartao);
  }
  .mini-acao:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .mini-acao.ligado {
    color: var(--ok);
  }
  .mini-acao.lives {
    border-color: var(--borda);
    border-radius: 999px;
    width: 44px;
    gap: 2px;
    grid-auto-flow: column;
  }
  .contagem {
    font-size: 11px;
    font-weight: 700;
  }
  .topo {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 10px 8px;
    border-bottom: 1px solid var(--borda);
  }
  .recolhida .topo {
    justify-content: center;
    padding: 10px 4px;
    border-bottom: 0;
  }
  .titulo {
    min-width: 0;
  }
  .nome {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    font-size: var(--t12);
    opacity: 0.75;
  }
  .pronto {
    padding: 4px 10px;
  }
  .avatar {
    width: 28px;
    height: 28px;
    flex: none;
    border-radius: 8px;
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    background: color-mix(in srgb, var(--cor) 30%, transparent);
    color: var(--texto);
  }
  .rolagem {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .secao {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .editando .secao {
    padding: 8px;
    border: 1px dashed var(--borda);
    border-radius: var(--raio-m);
    cursor: grab;
  }
  .secao.arrastando {
    opacity: 0.5;
  }
  .tirar {
    position: absolute;
    top: -8px;
    right: -6px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 0;
    background: var(--perigo);
    color: #fff;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
    z-index: 1;
  }
  .botao-wrap {
    position: relative;
    display: flex;
  }
  .botao-wrap > .acao {
    flex: 1;
  }
  .pequeno-x {
    top: -6px;
    right: -4px;
    width: 18px;
    height: 18px;
  }
  .acoes,
  .rodape {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .rodape {
    grid-template-columns: repeat(3, 1fr);
    padding: 10px;
    border-top: 1px solid var(--borda);
  }
  .acao {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 2px;
    border-radius: var(--raio-m);
    border: 1px solid var(--borda);
    background: var(--fundo-cartao);
    color: inherit;
    font-size: 11px;
    cursor: pointer;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .acao:hover:not(:disabled) {
    border-color: var(--destaque);
  }
  .acao:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .acao.ligado {
    color: var(--ok);
  }
  .acao.destaque {
    background: var(--destaque-suave);
    border-color: var(--destaque);
  }
  .acao.fora {
    opacity: 0.85;
  }
  .por {
    position: absolute;
    top: -6px;
    right: -4px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--ok);
    color: #000;
    font-weight: 800;
    display: grid;
    place-items: center;
    line-height: 1;
  }
  h3 {
    margin: 0;
    font-size: var(--t13);
  }
  .linha,
  .medida {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--t12);
  }
  .medida {
    justify-content: space-between;
  }
  .centro {
    text-align: center;
  }
  .url {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ok {
    color: var(--ok);
    margin: 0;
  }
  .selo {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    display: inline-grid;
    place-items: center;
    font-size: 10px;
    font-weight: 800;
    color: #fff;
  }
  .selo.twitch {
    background: #9146ff;
  }
  .selo.kick {
    background: #53fc18;
    color: #000;
  }
  .cartao-otimizar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    text-align: left;
    border-radius: var(--raio-m);
    border: 1px solid var(--borda);
    background: var(--fundo-cartao);
    color: inherit;
    cursor: pointer;
  }
  .cartao-otimizar small,
  .item-secao small {
    display: block;
    opacity: 0.75;
  }
  .cartao-otimizar:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .tres {
    grid-template-columns: 1fr 1fr 1fr !important;
  }
  .link {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 0;
    padding: 0;
    color: var(--destaque);
    text-align: left;
    cursor: pointer;
  }
  .historico {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: var(--t12);
  }
  .historico li {
    display: grid;
    grid-template-columns: 42px 1fr;
    gap: 6px;
  }
  .quando {
    opacity: 0.7;
  }
  .vazio {
    padding: 12px;
  }
  .fino {
    align-self: flex-start;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .adicionar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    border-radius: var(--raio-m);
    background: var(--fundo-cartao);
  }
  .item-secao {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    text-align: left;
    border-radius: var(--raio-m);
    border: 1px solid var(--borda);
    background: var(--fundo-painel);
    color: inherit;
    cursor: pointer;
  }
  .item-secao .por {
    position: static;
  }
</style>

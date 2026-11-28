<script lang="ts">
import { t, tDinamico } from '@shared/i18n/index.ts'
import type { Live, PlataformaLive } from '@shared/tipos/dominio.ts'
import Icone from '../componentes/Icone.svelte'
import { chamar } from '../estado/api.ts'
import { loja, mensagem } from '../estado/loja.svelte.ts'

/**
 * Janela de lives (RN-080 a RN-091): as lives de cada conta, com filtro por conta. Um link da Twitch
 * ou da Kick clicado no jogo abre aqui, já na conta certa.
 */
const s = $derived(loja.snap!)
const inicial = new URLSearchParams(location.search).get('conta')
let contaId = $state(inicial ?? '')
let plataforma: PlataformaLive = $state('twitch')
// Aberta por uma live clicada no jogo: já vem nela (?live=<id>).
let selecionada: string | null = $state(new URLSearchParams(location.search).get('live'))
let texto = $state('')
let comSom = $state(false)

const contas = $derived([...s.contas].sort((a, b) => a.nome.localeCompare(b.nome)))
$effect(() => {
  if (!contaId && contas[0]) contaId = contas[0].id
})
const conta = $derived(s.contas.find((c) => c.id === contaId))
const jogo = $derived(s.jogos.find((j) => j.id === conta?.jogoId))
const daConta = $derived(s.lives.filter((l) => l.contaId === contaId).sort((a, b) => a.ordem - b.ordem))
const daPlataforma = $derived(daConta.filter((l) => l.plataforma === plataforma))
const contagem = (p: PlataformaLive) => daConta.filter((l) => l.plataforma === p).length
const live = $derived(daConta.find((l) => l.id === selecionada) ?? null)
const nomeP = (p: PlataformaLive) => t(p === 'twitch' ? 'lives.twitch' : 'lives.kick')
const estado = (l: Live) => s.livesEstado[l.id] ?? 'desligada'
const aoVivo = (l: Live) => l.ligada && estado(l) === 'tocando'

async function ligar(l: Live, ligada: boolean) {
  const r = await chamar<'lives.ligar', { ok: boolean; erro?: string }>('lives.ligar', { id: l.id, ligada })
  if (!r.ok && r.erro === 'limite') mensagem('aviso', t('lives.limite', { n: s.config.lives.porConta }))
}
async function abrir() {
  if (!texto.trim() || !contaId) return
  const r = await chamar<'lives.abrirLink', { ok: boolean; id?: string; erro?: string }>('lives.abrirLink', {
    contaId,
    texto: texto.trim(),
    plataforma,
  })
  if (r.ok) {
    texto = ''
    selecionada = r.id ?? null
  } else
    mensagem(
      'erro',
      r.erro === 'limite' ? t('lives.limite', { n: s.config.lives.porConta }) : t('lj.linkInvalido'),
    )
}
// Já conectada na Twitch/Kick (login na sessão das lives desta conta): o botão de conectar some.
let conexoes = $state({ twitch: false, kick: false })
$effect(() => {
  const id = contaId
  if (!id) return
  const ler = () =>
    void chamar<'lives.conexoes', { twitch: boolean; kick: boolean }>('lives.conexoes', { contaId: id })
      .then((r) => (conexoes = r))
      .catch(() => {})
  ler()
  const t = setInterval(ler, 3000)
  return () => clearInterval(t)
})

// Aberta numa live: a aba (Twitch/Kick) segue a plataforma dela.
let abaAjustada = false
$effect(() => {
  if (abaAjustada || !live) return
  abaAjustada = true
  plataforma = live.plataforma
})

// A live selecionada aparece no palco: o main põe a página da live exatamente sobre ele.
let palco: HTMLDivElement | undefined = $state()
$effect(() => {
  // Desligada não toca em lugar nenhum (nem aqui): o botão de desligar desliga de verdade.
  const id = live?.ligada ? live.id : null
  const som = comSom
  const el = palco
  if (!id || !el) {
    void chamar('lives.exibir', { id: null, retangulo: null, som: false }).catch(() => {})
    return
  }
  const enviar = () => {
    const b = el.getBoundingClientRect()
    void chamar('lives.exibir', {
      id,
      som,
      retangulo: {
        x: Math.round(b.left),
        y: Math.round(b.top),
        largura: Math.round(b.width),
        altura: Math.round(b.height),
      },
    }).catch(() => {})
  }
  enviar()
  const ro = new ResizeObserver(enviar)
  ro.observe(el)
  return () => ro.disconnect()
})

const urlDe = (l: Live) => (l.plataforma === 'twitch' ? `twitch.tv/${l.canal}` : `kick.com/${l.canal}`)
</script>

<div class="janela">
  <header class="titulo">
    <span class="logo" aria-hidden="true">H</span>
    <strong>{t('lj.titulo')}</strong>
    {#if live}
      <span class="url">{urlDe(live)}</span>
      <span class="estado" class:vivo={aoVivo(live)}>● {tDinamico(`lives.estado.${estado(live)}`)}</span>
    {/if}
    <span class="cresce"></span>
    {#if conta}
      {#each ['twitch', 'kick'] as const as p (p)}
        {#if conexoes[p]}
          <span class="conectada" title={t('lj.conectada', { p: nomeP(p) })}><span class="selo {p}">{p === 'twitch' ? 'T' : 'K'}</span>{nomeP(p)} ✓</span>
        {:else}
          <button class="botao conectar {p}" onclick={() => chamar('lives.entrarPlataforma', { contaId, plataforma: p })}>{t('lj.conectar', { p: nomeP(p) })}</button>
        {/if}
      {/each}
    {/if}
  </header>

  <div class="corpo">
    <aside class="lado">
      <label class="seletor">
        <span class="pequeno muted">{jogo?.nome ?? ''}</span>
        <select class="campo" bind:value={contaId} aria-label={t('lj.conta')} onchange={() => (selecionada = null)}>
          {#each contas as c (c.id)}<option value={c.id}>{c.nome}</option>{/each}
        </select>
      </label>
      <div class="topo-lista"><strong>{t('lj.lives')}</strong> <span class="muted">{daConta.length}</span></div>
      <div class="abas" role="tablist">
        {#each ['twitch', 'kick'] as const as p (p)}
          <button role="tab" aria-selected={plataforma === p} class:ativa={plataforma === p} onclick={() => (plataforma = p)}>
            <span class="selo {p}">{p === 'twitch' ? 'T' : 'K'}</span>{nomeP(p)} <span class="muted">{contagem(p)}</span>
          </button>
        {/each}
      </div>
      {#if daPlataforma.length > 0}
        <div class="todas">
          <button class="link" onclick={() => chamar('lives.ligarTodas', { contaId, plataforma, ligada: true })}><Icone nome="ligar" tamanho={14} />{t('lj.ligarTudo')}</button>
          <button class="link" onclick={() => chamar('lives.ligarTodas', { contaId, plataforma, ligada: false })}><Icone nome="ligar" tamanho={14} />{t('lj.desligarTudo')}</button>
        </div>
      {/if}
      <ul class="lista">
        {#each daPlataforma as l (l.id)}
          <li class:sel={selecionada === l.id}>
            <button class="item" onclick={() => (selecionada = l.id)}>
              <span class="selo {l.plataforma}">{l.plataforma === 'twitch' ? 'T' : 'K'}</span>
              <span class="cresce texto">
                <span class="canal">{l.canal}</span>
                <span class="pequeno" class:vivo={aoVivo(l)}>● {l.ligada ? tDinamico(`lives.estado.${estado(l)}`) : t('lives.estado.desligada')}{#if l.ligada && loja.metricas?.porLive?.[l.id]} · {Math.round(loja.metricas.porLive[l.id]!.ramMb)} MB{/if}</span>
              </span>
            </button>
            <button class="icone-botao liga" class:ligada={l.ligada} aria-label={l.ligada ? t('lj.desligar') : t('lj.ligar')} title={l.ligada ? t('lj.desligar') : t('lj.ligar')} onclick={() => ligar(l, !l.ligada)}><Icone nome="ligar" tamanho={14} /></button>
            <button class="icone-botao" aria-label={t('lives.remover')} title={t('lives.remover')} onclick={() => chamar('lives.remover', { id: l.id })}><Icone nome="fechar" tamanho={14} /></button>
          </li>
        {:else}
          <li class="vazio muted pequeno">{t('lj.nenhuma', { p: nomeP(plataforma) })}</li>
        {/each}
      </ul>
      <form class="abrir-outra" onsubmit={(e) => (e.preventDefault(), abrir())}>
        <input class="campo" bind:value={texto} placeholder={t('lj.linkOuCanal')} aria-label={t('lj.linkOuCanal')} />
        <button class="botao primario" type="submit"><Icone nome="mais" tamanho={14} />{t('lj.abrir')}</button>
      </form>
    </aside>

    <main class="principal">
      {#if live}
        <div class="exibicao">
          <div class="barra-live">
            <b>{live.canal}</b>
            <span class="muted pequeno">{nomeP(live.plataforma)}</span>
            <span class="cresce"></span>
            <button class="botao fino" class:ligado={comSom} aria-pressed={comSom} onclick={() => (comSom = !comSom)}><Icone nome={comSom ? 'som' : 'mudo'} tamanho={14} />{t('lj.som')}</button>
            {#if live.ligada}
              <button class="botao fino" onclick={() => ligar(live, false)}><Icone nome="ligar" tamanho={14} />{t('lj.desligar')}</button>
            {:else}
              <button class="botao fino primario" onclick={() => ligar(live, true)}><Icone nome="ligar" tamanho={14} />{t('lj.ligarEsta')}</button>
            {/if}
          </div>
          <!-- A live (com o chat) aparece aqui, na sessão das lives da conta. -->
          {#if live.ligada}
            <div class="palco" bind:this={palco}><span class="muted pequeno">{t('lj.carregando')}</span></div>
          {:else}
            <div class="palco"><div class="desligada"><p>{t('lj.desligadaTexto')}</p><button class="botao primario" onclick={() => ligar(live, true)}><Icone nome="ligar" />{t('lj.ligarEsta')}</button></div></div>
          {/if}
        </div>
      {:else}
        <div class="vazio-grande">
          <Icone nome="live" tamanho={36} />
          {#if !conexoes.twitch || !conexoes.kick}
            <h2>{t('lj.conecteTitulo')}</h2>
            <p class="muted">{t('lj.conecteTexto')}</p>
            <div class="conectar-cartoes">
              {#each ['twitch', 'kick'] as const as p (p)}
                {#if !conexoes[p]}
                  <button class="cartao-plataforma {p}" onclick={() => chamar('lives.entrarPlataforma', { contaId, plataforma: p })}><span class="selo grande {p}">{p === 'twitch' ? 'T' : 'K'}</span><span><b>{t('lj.conectar', { p: nomeP(p) })}</b><small>{t('lj.entrarNaConta', { p: nomeP(p) })}</small></span></button>
                {/if}
              {/each}
            </div>
          {:else}
            <h2>{t('lj.prontoTitulo')}</h2>
            <p class="muted">{t('lj.prontoTexto')}</p>
          {/if}
          <p class="pequeno muted">{t('lj.cliqueNoJogo')}</p>
          <p class="pequeno muted">{t('lj.fecharNaoPara')}</p>
        </div>
      {/if}
    </main>
  </div>
</div>

<style>
  .janela {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .titulo {
    height: var(--altura-titulo);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 150px 0 12px;
    background: var(--fundo-titulo);
    border-bottom: 1px solid var(--borda);
    -webkit-app-region: drag;
  }
  .titulo button {
    -webkit-app-region: no-drag;
  }
  .logo {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: linear-gradient(135deg, #00e5ff, #07b6d5 58%, #075985);
    box-shadow: inset 0 0 0 1px rgb(255 215 0 / 0.55);
    display: grid;
    place-items: center;
    color: #fff;
    font-weight: 800;
    font-size: 13px;
  }
  .url {
    padding: 2px 8px;
    border-radius: var(--raio-s);
    background: var(--fundo-cartao);
    font-size: var(--t12);
  }
  .estado,
  .vivo {
    font-size: var(--t12);
  }
  .vivo {
    color: var(--ok);
  }
  .conectar {
    font-size: var(--t12);
  }
  .conectada {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--borda);
    font-size: var(--t12);
    color: var(--ok);
  }
  .conectada {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--borda);
    font-size: var(--t12);
    color: var(--ok);
  }
  .conectar.twitch {
    border-color: #9146ff;
  }
  .conectar.kick {
    border-color: #53fc18;
  }
  .corpo {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .lado {
    width: 260px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    background: var(--fundo-lateral);
    color: var(--lateral-texto);
    border-right: 1px solid var(--borda);
  }
  .seletor {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .abas {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 3px;
    border: 1px solid var(--borda);
    border-radius: var(--raio-m);
  }
  .abas button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px;
    border: 0;
    border-radius: var(--raio-s);
    background: none;
    color: inherit;
    cursor: pointer;
  }
  .abas button.ativa {
    background: var(--fundo-cartao);
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
    flex: none;
  }
  .selo.grande {
    width: 40px;
    height: 40px;
    font-size: 20px;
    border-radius: 10px;
  }
  .selo.twitch {
    background: #9146ff;
  }
  .selo.kick {
    background: #53fc18;
    color: #000;
  }
  .todas {
    display: flex;
    justify-content: space-around;
  }
  .link {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 0;
    color: var(--destaque);
    cursor: pointer;
    font-size: var(--t12);
  }
  .lista {
    flex: 1;
    min-height: 0;
    overflow: auto;
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .lista li {
    display: flex;
    align-items: center;
    gap: 4px;
    border-radius: var(--raio-s);
  }
  .lista li.sel {
    background: var(--fundo-cartao);
  }
  .item {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px;
    background: none;
    border: 0;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .texto {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .canal {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .liga {
    color: var(--perigo);
  }
  .liga.ligada {
    color: var(--ok);
  }
  .vazio {
    padding: 8px;
  }
  .abrir-outra {
    display: flex;
    gap: 6px;
  }
  .abrir-outra .campo {
    flex: 1;
    min-width: 0;
  }
  .principal {
    flex: 1;
    min-width: 0;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .principal:has(.exibicao) {
    padding: 0;
    place-items: stretch;
  }
  .exibicao {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }
  .barra-live {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--borda);
    background: var(--fundo-painel);
  }
  .barra-live .ligado {
    color: var(--ok);
  }
  .desligada {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .palco {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
    background: #08111f;
  }
  .vazio-grande h2 {
    margin: 0;
  }
  .linha {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .vazio-grande {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
    max-width: 560px;
    color: var(--destaque);
  }
  .vazio-grande p,
  .vazio-grande h2 {
    color: var(--texto);
  }
  .conectar-cartoes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    width: 100%;
  }
  .cartao-plataforma {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
    border-radius: var(--raio-l);
    background: var(--fundo-cartao);
    color: var(--texto);
    text-align: left;
    cursor: pointer;
  }
  .cartao-plataforma small {
    display: block;
    opacity: 0.75;
  }
  .cartao-plataforma.twitch {
    border: 2px solid #9146ff;
  }
  .cartao-plataforma.kick {
    border: 2px solid #53fc18;
  }
</style>

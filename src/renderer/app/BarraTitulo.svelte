<script lang="ts">
import { t, tDinamico } from '@shared/i18n/index.ts'
import Icone from '../componentes/Icone.svelte'
import { chamar } from '../estado/api.ts'
import { abrirDialogo, contasDoGrupo, grupoAtual, loja } from '../estado/loja.svelte.ts'

let { painel = $bindable(false) }: { painel?: boolean } = $props()
const g = $derived(grupoAtual())
const s = $derived(loja.snap)
const eco = $derived(s?.config.economia.modoEconomico ?? true)
const ram = $derived(loja.metricas ? `${(loja.metricas.total.ramMb / 1024).toFixed(1)} GB` : '—')
const cpu = $derived(loja.metricas ? loja.metricas.total.cpuPct.toFixed(0) : '—')

function recarregarGrupo() {
  if (!g || !s) return
  const ids = contasDoGrupo(g.id)
    .map((c) => c.id)
    .filter((id) => s.estados[id]?.estado !== 'desligada')
  if (ids.length > 0) void chamar('contas.lote', { ids, acao: 'recarregar' })
}
</script>

<header class="titulo">
  <div class="logo" aria-hidden="true"><span>H</span></div>
  <strong class="nome-app">{t('app.nome')}</strong>
  {#if g}
    <span class="sep">/</span>
    <span class="grupo" style:--cor={g.cor}>{g.nome}</span>
    <button class="botao seletor" onclick={() => abrirDialogo({ qual: 'divisao' })} aria-label={t('titulo.divisao')}>
      <Icone nome="divisao" />{tDinamico(`visao.${g.visao}`)}{g.visao === 'grade' ? ` · ${tDinamico(`divisao.${g.layout.divisao}`)}` : ''}
    </button>
  {/if}
  <div class="cresce arrasta"></div>
  <button class="consumo pequeno" title={t('titulo.consumoDetalhe')} onclick={(e) => {
    const r = e.currentTarget.getBoundingClientRect()
    abrirDialogo({ qual: 'consumo', x: r.left - 120, y: r.bottom + 6 })
  }}>{t('titulo.consumo', { ram, cpu })}</button>
  <button class="icone-botao" class:ligado={eco} aria-pressed={eco} aria-label={t('titulo.economia')} title={t('titulo.economia')} onclick={() => chamar('config.alterar', { caminho: 'economia.modoEconomico', valor: !eco })}>
    <Icone nome="folha" />
  </button>
  <button class="icone-botao" aria-label={t('titulo.recarregarGrupo')} title={t('titulo.recarregarGrupo')} onclick={recarregarGrupo}>
    <Icone nome="recarregar" />
  </button>
  <button class="icone-botao" class:ligado={s?.silenciarTudo} aria-pressed={s?.silenciarTudo ?? false} aria-label={t('titulo.som')} title={t('titulo.som')} onclick={() => chamar('app.silenciarTudo', { ligado: !s?.silenciarTudo })}>
    <Icone nome={s?.silenciarTudo ? 'mudo' : 'som'} />
  </button>
  <button class="icone-botao" class:ligado={painel} aria-pressed={painel} aria-label={t('titulo.painel')} title={t('titulo.painel')} onclick={() => (painel = !painel)}>
    <Icone nome="painel" />
  </button>
  <button class="icone-botao avisos" aria-label={t('titulo.avisos')} title={t('titulo.avisos')} onclick={() => {
    abrirDialogo({ qual: 'avisos' })
    // Abrir o painel de avisos marca todos como lidos.
    void chamar('avisos.marcarLidos')
  }}>
    <Icone nome="sino" />
    {#if (s?.naoLidos ?? 0) > 0}<span class="contador">{s!.naoLidos > 99 ? '99+' : s!.naoLidos}</span>{/if}
  </button>
  <button class="icone-botao" aria-label={t('titulo.configuracoes')} title={t('titulo.configuracoes')} onclick={() => abrirDialogo({ qual: 'configuracoes' })}>
    <Icone nome="engrenagem" />
  </button>
</header>

<style>
  .titulo {
    display: flex;
    align-items: center;
    gap: 6px;
    height: var(--altura-titulo);
    padding: 0 150px 0 10px; /* espaço dos botões do Windows (titleBarOverlay) */
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
  .nome-app {
    color: var(--marca);
    font-size: var(--t14);
  }
  .sep {
    color: var(--texto-3);
  }
  .grupo {
    font-weight: 600;
    border-left: 3px solid var(--cor);
    padding-left: 6px;
  }
  .seletor {
    height: 26px;
    margin-left: 6px;
    font-size: var(--t12);
  }
  .consumo {
    color: var(--texto-2);
    margin-right: 6px;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--raio-s);
    padding: 2px 6px;
    cursor: pointer;
    -webkit-app-region: no-drag;
  }
  .consumo:hover {
    border-color: var(--borda);
    color: var(--texto);
  }
  .avisos {
    position: relative;
  }
  .contador {
    position: absolute;
    top: 1px;
    right: 0;
    min-width: 15px;
    height: 15px;
    padding: 0 3px;
    border-radius: 8px;
    background: var(--perigo);
    color: #fff;
    font-size: 10px;
    line-height: 15px;
  }
</style>

<script lang="ts">
import { t } from '@shared/i18n/index.ts'
import type { Conta } from '@shared/tipos/dominio.ts'
import { formatarDuracao } from '@shared/util/texto.ts'
import SeloEstado from '../../componentes/SeloEstado.svelte'
import { registrarEspaco } from '../../estado/espacos.ts'
import { loja } from '../../estado/loja.svelte.ts'

let {
  conta,
  resumo,
  selecionada,
  agora,
  aoClicar,
}: {
  conta: Conta
  resumo:
    | { quedasHoje: number; recargasHoje: number; onlineDesde: number | null; ultimoDado: number | null }
    | undefined
  selecionada: boolean
  agora: number
  aoClicar: (e: MouseEvent) => void
} = $props()

let mini: HTMLDivElement | undefined = $state()
let visivel = $state(false)
const est = $derived(loja.snap?.estados[conta.id])
const m = $derived(loja.metricas?.porConta[conta.id])
const lives = $derived((loja.snap?.lives ?? []).filter((l) => l.contaId === conta.id))
const grupo = $derived(loja.snap?.grupos.find((g) => g.id === conta.grupoId))

// Só os cartões visíveis na rolagem recebem foto nova (Seção 7.1).
$effect(() => {
  if (!mini) return
  const io = new IntersectionObserver((e) => {
    visivel = e.some((x) => x.isIntersecting)
  })
  io.observe(mini)
  return () => io.disconnect()
})
$effect(() => {
  if (!mini || !visivel || est?.estado === 'desligada') return
  return registrarEspaco({ contaId: conta.id, el: mini, tipo: 'miniatura', visivel: () => visivel })
})
</script>

<button class="cartao" class:selecionada onclick={aoClicar} style:--cor-conta={conta.cor} aria-pressed={selecionada}>
  <div class="mini" bind:this={mini}>
    {#if loja.fotos[conta.id]}<img src={loja.fotos[conta.id]} alt="" />{/if}
  </div>
  <div class="info">
    <div class="linha">
      <span class="cor"></span>
      <strong class="cresce nome">{conta.icone} {conta.nome}</strong>
      <SeloEstado estado={est?.estado ?? 'desligada'} />
    </div>
    <div class="pequeno muted">{grupo?.nome}</div>
    <dl>
      <dt>{t('painel.tempoOnline')}</dt>
      <dd>{resumo?.onlineDesde ? formatarDuracao(agora - resumo.onlineDesde) : t('painel.semDados')}</dd>
      <dt>{t('painel.quedasHoje')}</dt>
      <dd>{resumo?.quedasHoje ?? 0}</dd>
      <dt>{t('painel.recargas')}</dt>
      <dd>{resumo?.recargasHoje ?? 0}</dd>
      <dt>{t('painel.ultimoDado')}</dt>
      <dd>{resumo?.ultimoDado ? t('painel.ha', { tempo: formatarDuracao(agora - resumo.ultimoDado) }) : t('painel.semDados')}</dd>
      <dt>{t('painel.ram')}</dt>
      <dd>{m ? `${Math.round(m.ramMb)} MB` : t('painel.semDados')}</dd>
      <dt>{t('painel.cpu')}</dt>
      <dd>{m ? `${m.cpuPct.toFixed(1)}%` : t('painel.semDados')}</dd>
      <dt>{t('painel.lives')}</dt>
      <dd>{lives.length > 0 ? lives.map((l) => l.canal).join(', ') : t('painel.semDados')}</dd>
    </dl>
  </div>
</button>

<style>
  .cartao {
    display: flex;
    flex-direction: column;
    text-align: left;
    padding: 0;
    border: 1px solid var(--borda);
    border-radius: var(--raio-m);
    background: var(--fundo-cartao);
    overflow: hidden;
  }
  .cartao:hover {
    background: var(--fundo-cartao-hover);
  }
  .cartao.selecionada {
    border-color: var(--destaque);
    box-shadow: 0 0 0 1px var(--destaque);
  }
  .mini {
    aspect-ratio: 16 / 9;
    background: var(--fundo-conta);
  }
  .mini img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .info {
    padding: 8px 10px 10px;
  }
  .cor {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--cor-conta);
  }
  .nome {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    margin: 8px 0 0;
    font-size: var(--t12);
  }
  dt {
    color: var(--texto-3);
  }
  dd {
    margin: 0;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>

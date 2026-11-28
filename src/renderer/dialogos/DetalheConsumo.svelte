<script lang="ts">
import { t } from '@shared/i18n/index.ts'
import Icone from '../componentes/Icone.svelte'
import PainelFlutuante from '../componentes/PainelFlutuante.svelte'
import { fecharDialogo, loja } from '../estado/loja.svelte.ts'

/** Clique em RAM/CPU na barra de título: quanto cada parte do HDeck está usando agora (RN-045). */
let { x, y, aoAbrirPainel }: { x: number; y: number; aoAbrirPainel: () => void } = $props()
const m = $derived(loja.metricas)
const total = $derived(m?.total.ramMb ?? 0)
const partes = $derived(m?.partes ?? [])
const maior = $derived(Math.max(1, ...partes.map((p) => p.ramMb)))
const mb = (v: number) => (v >= 1024 ? `${(v / 1024).toFixed(1)} GB` : `${Math.round(v)} MB`)
</script>

<PainelFlutuante {x} {y} aoFechar={fecharDialogo} rotulo={t('consumo.titulo', { ram: mb(total) })}>
  <div class="cabeca">
    <Icone nome="painel" />
    <div>
      <b>{t('consumo.titulo', { ram: mb(total) })}</b>
      <div class="pequeno muted">{t('consumo.sub', { cpu: (m?.total.cpuPct ?? 0).toFixed(1) })}</div>
    </div>
  </div>
  <ul>
    {#each partes as p (p.chave)}
      <li>
        <div class="linha"><span class="cresce">{p.nome}</span><b>{mb(p.ramMb)}</b></div>
        <div class="barra"><i style:width="{(p.ramMb / maior) * 100}%" class:grupo={p.chave.startsWith('grupo:')}></i></div>
        <div class="pequeno muted">{p.detalhe} · {p.cpuPct.toFixed(1)}% CPU</div>
      </li>
    {/each}
  </ul>
  <p class="pequeno muted nota">{t('consumo.nota')}</p>
  <button class="pf-item" onclick={() => (fecharDialogo(), aoAbrirPainel())}><Icone nome="painel" /><span>{t('consumo.abrirPainel')}</span></button>
</PainelFlutuante>

<style>
  .cabeca {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 4px 4px 10px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 280px;
  }
  .linha {
    display: flex;
    gap: 8px;
  }
  .barra {
    height: 5px;
    border-radius: 3px;
    background: var(--fundo-app);
    margin: 4px 0 2px;
  }
  .barra i {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--texto-3);
  }
  .barra i.grupo {
    background: var(--destaque);
  }
  .nota {
    margin: 10px 0 6px;
    max-width: 300px;
  }
</style>

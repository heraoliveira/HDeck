<script lang="ts">
  import { calcularEspacos, contasNosEspacos } from '@shared/layout/layout.ts'
  import { t } from '@shared/i18n/index.ts'
  import type { Grupo } from '@shared/tipos/dominio.ts'
  import MolduraConta from '../../componentes/MolduraConta.svelte'
  import { chamar } from '../../estado/api.ts'
  import { contasDoGrupo, loja } from '../../estado/loja.svelte.ts'

  let { grupo, escolhendo = $bindable(null) }: { grupo: Grupo; escolhendo?: number | null } = $props()
  let largura = $state(0)
  let altura = $state(0)
  const GAP = 6

  const contas = $derived(contasDoGrupo(grupo.id))
  const rets = $derived(
    calcularEspacos(
      grupo.layout.divisao,
      { largura, altura },
      { contas: contas.length, personalizada: grupo.layout.personalizada, proporcao169: grupo.layout.proporcao169 },
    ),
  )
  const ocupacao = $derived(contasNosEspacos(rets.length, grupo.layout.espacos, contas.map((c) => c.id)))

  /** RN-041: clicar num espaço e depois na conta. */
  async function escolher(i: number, contaId: string | null) {
    const espacos = Array.from({ length: rets.length }, (_, k) => grupo.layout.espacos[k] ?? null)
    espacos[i] = contaId
    await chamar('grupos.layout', { id: grupo.id, layout: { espacos } })
    escolhendo = null
  }
</script>

<div class="grade" bind:clientWidth={largura} bind:clientHeight={altura}>
  {#each rets as r, i (i)}
    {@const id = ocupacao[i]}
    {@const conta = contas.find((c) => c.id === id)}
    <div
      class="espaco"
      style:left="{r.x + GAP / 2}px"
      style:top="{r.y + GAP / 2}px"
      style:width="{r.largura - GAP}px"
      style:height="{r.altura - GAP}px"
    >
      {#if escolhendo === i}
        <div class="escolha" role="listbox" aria-label={t('divisao.escolherConta')}>
          <button class="botao" onclick={() => escolher(i, null)}>{t('comum.automatico')}</button>
          {#each contas as c (c.id)}
            <button class="botao" onclick={() => escolher(i, c.id)}>{c.icone} {c.nome}</button>
          {/each}
        </div>
      {:else if conta}
        <MolduraConta {conta} />
      {:else}
        <button class="livre" onclick={() => (escolhendo = i)}>{t('divisao.escolherConta')}</button>
      {/if}
    </div>
  {/each}
  {#if contas.length === 0 && loja.snap}
    <div class="sem-contas">
      <p class="muted">{t('grupo.semContas')}</p>
    </div>
  {/if}
</div>

<style>
  .grade {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .espaco {
    position: absolute;
  }
  .livre {
    width: 100%;
    height: 100%;
    border: 1px dashed var(--borda);
    border-radius: var(--raio-s);
    background: transparent;
    color: var(--texto-3);
  }
  .escolha {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 6px;
    padding: 10px;
    height: 100%;
    overflow: auto;
    border: 1px solid var(--destaque);
    border-radius: var(--raio-s);
    background: var(--fundo-painel);
  }
  .sem-contas {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
  }
</style>

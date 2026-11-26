<script lang="ts">
  import { principalComMiniaturas } from '@shared/layout/layout.ts'
  import type { Grupo } from '@shared/tipos/dominio.ts'
  import MolduraConta from '../../componentes/MolduraConta.svelte'
  import { chamar } from '../../estado/api.ts'
  import { contasDoGrupo, loja } from '../../estado/loja.svelte.ts'

  let { grupo }: { grupo: Grupo } = $props()
  let largura = $state(0)
  let altura = $state(0)

  const contas = $derived(contasDoGrupo(grupo.id))
  const principalId = $derived(
    contas.find((c) => c.id === grupo.layout.espacos[0])?.id ??
      contas.find((c) => c.id === loja.snap?.ativaId)?.id ??
      contas[0]?.id,
  )
  const outras = $derived(contas.filter((c) => c.id !== principalId))
  const r = $derived(principalComMiniaturas({ largura, altura }, outras.length, grupo.layout.faixaMiniaturas))
  const principal = $derived(contas.find((c) => c.id === principalId))

  /** Clicar numa miniatura troca a principal (Seção 7.1). */
  async function trocar(id: string) {
    await chamar('grupos.layout', { id: grupo.id, layout: { espacos: [id] } })
    await chamar('contas.ativar', { id })
  }
</script>

<div class="principal" bind:clientWidth={largura} bind:clientHeight={altura}>
  {#if principal}
    <div class="espaco" style:left="0px" style:top="0px" style:width="{r.principal.largura - 6}px" style:height="{r.principal.altura}px">
      <MolduraConta conta={principal} />
    </div>
  {/if}
  {#each outras as c, i (c.id)}
    {@const m = r.miniaturas[i]!}
    <div class="espaco" style:left="{m.x}px" style:top="{m.y + 3}px" style:width="{m.largura}px" style:height="{m.altura - 6}px">
      <MolduraConta conta={c} tipo="miniatura" aoClicar={() => trocar(c.id)} />
    </div>
  {/each}
</div>

<style>
  .principal {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .espaco {
    position: absolute;
  }
</style>

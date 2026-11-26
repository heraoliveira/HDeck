<script lang="ts">
import { t } from '@shared/i18n/index.ts'
import type { Grupo } from '@shared/tipos/dominio.ts'
import MolduraConta from '../../componentes/MolduraConta.svelte'
import SeloEstado from '../../componentes/SeloEstado.svelte'
import { chamar } from '../../estado/api.ts'
import { contasDoGrupo, loja } from '../../estado/loja.svelte.ts'

let { grupo }: { grupo: Grupo } = $props()
const contas = $derived(contasDoGrupo(grupo.id))
const atual = $derived(
  contas.find((c) => c.id === loja.focoContaId) ??
    contas.find((c) => c.id === loja.snap?.ativaId) ??
    contas[0],
)

function abrir(id: string) {
  loja.focoContaId = id
  void chamar('contas.ativar', { id })
}

/** Setas do teclado entre as abas (acessibilidade). */
function tecla(e: KeyboardEvent, i: number) {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
  const prox = contas[(i + (e.key === 'ArrowRight' ? 1 : -1) + contas.length) % contas.length]
  if (prox) {
    abrir(prox.id)
    ;(document.querySelector(`[data-aba="${prox.id}"]`) as HTMLElement | null)?.focus()
  }
}
</script>

<div class="foco">
  <div class="abas" role="tablist" aria-label={t('visao.foco')}>
    {#each contas as c, i (c.id)}
      <button
        role="tab"
        class="aba"
        data-aba={c.id}
        aria-selected={c.id === atual?.id}
        tabindex={c.id === atual?.id ? 0 : -1}
        style:--cor-conta={c.cor}
        onclick={() => abrir(c.id)}
        onkeydown={(e) => tecla(e, i)}
      >
        <span class="cor"></span>
        <span>{c.icone} {c.nome}</span>
        {#if i < 9}<kbd>Ctrl+{i + 1}</kbd>{/if}
        <SeloEstado estado={loja.snap?.estados[c.id]?.estado ?? 'desligada'} />
      </button>
    {/each}
  </div>
  <div class="area">
    {#if atual}
      {#key atual.id}<MolduraConta conta={atual} faixa={false} />{/key}
    {:else}
      <p class="muted vazio">{t('grupo.semContas')}</p>
    {/if}
  </div>
</div>

<style>
  .foco {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .abas {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    padding-bottom: 6px;
    flex: none;
  }
  .aba {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 10px 0 0;
    border: 1px solid var(--borda);
    border-radius: var(--raio-s);
    background: var(--fundo-painel);
    color: var(--texto-2);
    white-space: nowrap;
    overflow: hidden;
  }
  .aba[aria-selected='true'] {
    color: var(--texto);
    border-color: var(--destaque);
  }
  .cor {
    width: 4px;
    align-self: stretch;
    background: var(--cor-conta);
  }
  kbd {
    font: inherit;
    font-size: 10px;
    color: var(--texto-3);
  }
  .area {
    flex: 1;
    min-height: 0;
  }
  .vazio {
    text-align: center;
    margin-top: 20vh;
  }
</style>

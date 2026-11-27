<script lang="ts">
import { t } from '@shared/i18n/index.ts'
import type { Snippet } from 'svelte'
import Icone from './Icone.svelte'

let {
  titulo,
  aoFechar,
  largura = 520,
  children,
  rodape,
}: { titulo: string; aoFechar: () => void; largura?: number; children: Snippet; rodape?: Snippet } = $props()
let caixa: HTMLDivElement | undefined = $state()

$effect(() => {
  const primeiro = caixa?.querySelector<HTMLElement>('input, select, textarea, button:not(.fechar)')
  primeiro?.focus()
})

function tecla(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    aoFechar()
  }
}
</script>

<svelte:window onkeydown={tecla} />

<div class="fundo" role="presentation" onclick={(e) => e.target === e.currentTarget && aoFechar()}>
  <div
    class="caixa"
    role="dialog"
    aria-modal="true"
    aria-label={titulo}
    tabindex="-1"
    bind:this={caixa}
    style:width="{largura}px"

  >
    <header>
      <h2>{titulo}</h2>
      <button class="icone-botao fechar" aria-label={t('comum.fechar')} onclick={aoFechar}>
        <Icone nome="fechar" />
      </button>
    </header>
    <div class="corpo">{@render children()}</div>
    {#if rodape}<footer>{@render rodape()}</footer>{/if}
  </div>
</div>

<style>
  .fundo {
    position: fixed;
    inset: 0;
    background: rgb(5 6 10 / 0.6);
    display: grid;
    place-items: center;
    z-index: 50;
  }
  .caixa {
    max-width: calc(100vw - 40px);
    max-height: calc(100vh - 60px);
    display: flex;
    flex-direction: column;
    background: var(--fundo-painel);
    border: 1px solid var(--borda);
    border-radius: var(--raio-l);
    box-shadow: 0 20px 60px rgb(0 0 0 / 0.45);
  }
  header {
    display: flex;
    align-items: center;
    padding: 14px 16px 6px 20px;
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: var(--t16);
    font-weight: 600;
  }
  .corpo {
    padding: 8px 20px 16px;
    overflow: auto;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px 16px;
    border-top: 1px solid var(--borda);
  }
</style>

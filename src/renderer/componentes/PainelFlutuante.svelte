<script lang="ts">
import type { Snippet } from 'svelte'

/**
 * Painel flutuante no estilo do app (RN-007): abre junto do ponto clicado, fecha com Esc ou
 * clicando fora. Enquanto aberto, as contas viram foto (RN-044), então nada fica por cima dele.
 */
let {
  x,
  y,
  aoFechar,
  rotulo,
  children,
}: { x: number; y: number; aoFechar: () => void; rotulo: string; children: Snippet } = $props()
let caixa: HTMLDivElement | undefined = $state()
let pos = $state({ left: 0, top: 0 })

$effect(() => {
  if (!caixa) return
  const b = caixa.getBoundingClientRect()
  pos = {
    left: Math.max(8, Math.min(x, window.innerWidth - b.width - 8)),
    top: Math.max(8, Math.min(y, window.innerHeight - b.height - 8)),
  }
  caixa.focus()
})

function tecla(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    aoFechar()
  }
}
</script>

<svelte:window onkeydown={tecla} />

<div
  class="fundo"
  role="presentation"
  onclick={(e) => e.target === e.currentTarget && aoFechar()}
  oncontextmenu={(e) => {
    e.preventDefault()
    aoFechar()
  }}
>
  <div
    class="painel"
    role="menu"
    aria-label={rotulo}
    tabindex="-1"
    bind:this={caixa}
    style:left="{pos.left}px"
    style:top="{pos.top}px"

  >
    {@render children()}
  </div>
</div>

<style>
  .fundo {
    position: fixed;
    inset: 0;
    z-index: 55;
  }
  .painel {
    position: fixed;
    width: 300px;
    max-height: calc(100vh - 16px);
    overflow: auto;
    padding: 10px;
    border-radius: var(--raio-l);
    border: 1px solid var(--borda);
    background: var(--fundo-painel);
    box-shadow:
      0 18px 50px rgb(0 0 0 / 0.5),
      0 0 0 1px var(--destaque-suave);
    outline: none;
  }
  .painel :global(.pf-cabeca) {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 4px 10px;
  }
  .painel :global(.pf-avatar) {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 12px;
    color: #fff;
    background: var(--cor, var(--destaque));
    flex: none;
  }
  .painel :global(.pf-titulo) {
    font-weight: 700;
    font-size: var(--t14);
  }
  .painel :global(.pf-sub) {
    font-size: var(--t12);
    color: var(--texto-2);
  }
  .painel :global(.pf-acoes) {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    margin-bottom: 6px;
  }
  .painel :global(.pf-acao) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 2px;
    border: 0;
    border-radius: var(--raio-s);
    background: var(--fundo-cartao);
    color: var(--texto);
    font-size: 11px;
  }
  .painel :global(.pf-acao:hover) {
    background: var(--fundo-cartao-hover);
    color: var(--destaque);
  }
  .painel :global(.pf-acao:disabled) {
    opacity: 0.4;
  }
  .painel :global(.pf-item) {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 6px;
    border: 0;
    border-radius: var(--raio-s);
    background: none;
    color: var(--texto);
    text-align: left;
    font-size: var(--t13);
  }
  .painel :global(.pf-item:hover) {
    background: var(--fundo-cartao-hover);
  }
  .painel :global(.pf-item small) {
    display: block;
    color: var(--texto-2);
    font-size: 11px;
  }
  .painel :global(.pf-item.perigo) {
    color: var(--perigo);
  }
  .painel :global(.pf-sep) {
    height: 1px;
    margin: 6px 0;
    background: var(--borda);
  }
  .painel :global(.pf-segmento) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    padding: 2px;
    border-radius: var(--raio-s);
    background: var(--fundo-app);
    margin: 4px 0 6px;
  }
  .painel :global(.pf-segmento button) {
    padding: 6px;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--texto-2);
  }
  .painel :global(.pf-segmento button.ativo) {
    background: var(--destaque);
    color: var(--destaque-texto);
    font-weight: 600;
  }
  .painel :global(.pf-cores) {
    display: flex;
    gap: 8px;
    padding: 6px;
  }
  .painel :global(.pf-cor) {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid transparent;
    background: var(--c);
    padding: 0;
  }
  .painel :global(.pf-cor.ativo) {
    border-color: var(--texto);
    box-shadow: 0 0 0 2px var(--dourado);
  }
  .painel :global(.pf-linha) {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
  }
  .painel :global(.pf-dica) {
    font-size: 11px;
    color: var(--texto-2);
    padding: 0 6px 4px;
    line-height: 1.4;
  }
  .painel :global(kbd) {
    margin-left: auto;
    font: inherit;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--fundo-app);
    color: var(--texto-3);
  }
</style>

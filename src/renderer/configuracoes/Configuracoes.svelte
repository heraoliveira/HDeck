<script lang="ts">
  import { buscarConfiguracoes, LINHAS, SECOES, type Secao } from '@shared/configuracoes/catalogo.ts'
  import { t, tDinamico } from '@shared/i18n/index.ts'
  import Icone from '../componentes/Icone.svelte'
  import Modal from '../componentes/Modal.svelte'
  import Especial from './Especial.svelte'
  import LinhaConfig from './LinhaConfig.svelte'

  let { aoFechar, secaoInicial = 'geral', buscaInicial = '' }: { aoFechar: () => void; secaoInicial?: string; buscaInicial?: string } = $props()
  let secao: Secao = $state(SECOES.includes(secaoInicial as Secao) ? (secaoInicial as Secao) : 'geral')
  let busca = $state(buscaInicial)

  /** RN-175: com busca, mostra as linhas de todas as seções que combinam. */
  const linhas = $derived(busca.trim() ? buscarConfiguracoes(busca) : LINHAS.filter((l) => l.secao === secao))
  const grupos = $derived.by(() => {
    const out: { grupo: string; itens: typeof linhas }[] = []
    for (const l of linhas) {
      const g = out.find((x) => x.grupo === l.grupo)
      if (g) g.itens.push(l)
      else out.push({ grupo: l.grupo, itens: [l] })
    }
    return out
  })
</script>

<Modal titulo={t('config.titulo')} {aoFechar} largura={980}>
  <div class="config">
    <nav aria-label={t('config.titulo')}>
      <label class="busca">
        <Icone nome="buscar" />
        <input class="campo" type="search" placeholder={t('config.buscar')} aria-label={t('config.buscar')} bind:value={busca} />
      </label>
      {#each SECOES as s (s)}
        <button class="secao" class:atual={!busca && secao === s} onclick={() => ((secao = s), (busca = ''))}>
          {tDinamico(`config.secao.${s}`)}
        </button>
      {/each}
    </nav>
    <div class="conteudo" role="region" aria-live="polite">
      {#each grupos as g (g.grupo)}
        <div class="rotulo-secao">{tDinamico(g.grupo)}</div>
        {#each g.itens as linha (linha.id)}
          {#if linha.controle.tipo === 'especial'}
            {@const qual = linha.controle.qual}
            <LinhaConfig {linha} destacar={!!busca}>
              {#snippet especial()}<Especial {qual} />{/snippet}
            </LinhaConfig>
          {:else}
            <LinhaConfig {linha} destacar={!!busca} />
          {/if}
        {/each}
      {:else}
        <p class="muted">{t('config.semResultado')}</p>
      {/each}
    </div>
  </div>
</Modal>

<style>
  .config {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 20px;
    height: min(640px, calc(100vh - 160px));
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .busca {
    position: relative;
    display: flex;
    align-items: center;
    margin-bottom: 10px;
    color: var(--texto-3);
  }
  .busca :global(svg) {
    position: absolute;
    left: 9px;
  }
  .busca input {
    padding-left: 32px;
  }
  .secao {
    text-align: left;
    padding: 8px 10px;
    border: 0;
    border-radius: var(--raio-s);
    background: none;
    color: var(--texto-2);
    font-size: var(--t14);
  }
  .secao:hover {
    background: var(--fundo-cartao-hover);
  }
  .secao.atual {
    background: var(--fundo-cartao);
    color: var(--texto);
    font-weight: 600;
  }
  .conteudo {
    overflow: auto;
    padding-right: 6px;
  }
  .conteudo > :global(.rotulo-secao:first-child) {
    margin-top: 0;
  }
</style>

<script lang="ts">
  import { LINHAS } from '@shared/configuracoes/catalogo.ts'
  import { type ChaveTexto, t } from '@shared/i18n/index.ts'
  import type { AcaoLote } from '@shared/ipc/contrato.ts'
  import { normalizar } from '@shared/util/texto.ts'
  import { chamar } from '../estado/api.ts'
  import { abrirDialogo, contasDoGrupo, grupoAtual, loja } from '../estado/loja.svelte.ts'

  /** Paleta de comandos (Ctrl+K): ir para conta, ações em lote, abrir configuração. */
  let { aoFechar }: { aoFechar: () => void } = $props()
  let busca = $state('')
  let indice = $state(0)
  let campo: HTMLInputElement | undefined = $state()
  $effect(() => campo?.focus())

  type Item = { rotulo: string; fazer: () => void }
  const acoes: { acao: AcaoLote; rotulo: ChaveTexto }[] = [
    { acao: 'recarregar', rotulo: 'lote.recarregar' },
    { acao: 'ligar', rotulo: 'lote.ligar' },
    { acao: 'desligar', rotulo: 'lote.desligar' },
    { acao: 'silenciar', rotulo: 'lote.silenciar' },
    { acao: 'ativarSom', rotulo: 'lote.ativarSom' },
    { acao: 'preencher', rotulo: 'lote.preencher' },
    { acao: 'limparCache', rotulo: 'lote.limparCache' },
    { acao: 'livesLigar', rotulo: 'lote.livesLigar' },
    { acao: 'livesDesligar', rotulo: 'lote.livesDesligar' },
    { acao: 'fotos', rotulo: 'lote.fotos' },
  ]
  const itens = $derived.by((): Item[] => {
    const s = loja.snap
    if (!s) return []
    const g = grupoAtual()
    const doGrupo = contasDoGrupo(g?.id).map((c) => c.id)
    const lista: Item[] = [
      ...s.contas.map((c) => ({
        rotulo: t('paleta.irPara', { nome: `${c.icone} ${c.nome}` }),
        fazer: () => {
          void chamar('grupos.selecionar', { id: c.grupoId })
          void chamar('contas.ativar', { id: c.id })
          loja.focoContaId = c.id
        },
      })),
      ...s.grupos.map((gr) => ({ rotulo: `${t('grupo.trocar')}: ${gr.nome}`, fazer: () => void chamar('grupos.trocar', { id: gr.id, confirmado: true }) })),
      ...acoes.map((a) => ({
        rotulo: `${t(a.rotulo)} (${g?.nome ?? ''})`,
        fazer: () => doGrupo.length > 0 && void chamar('contas.lote', { ids: doGrupo, acao: a.acao, confirmado: true }),
      })),
      ...LINHAS.map((l) => ({
        rotulo: t('paleta.abrirConfig', { nome: t(l.titulo) }),
        fazer: () => abrirDialogo({ qual: 'configuracoes', secao: l.secao, busca: t(l.titulo) }),
      })),
    ]
    const termos = normalizar(busca).split(' ').filter(Boolean)
    return lista.filter((i) => termos.every((x) => normalizar(i.rotulo).includes(x))).slice(0, 12)
  })

  function executar(i: Item) {
    aoFechar()
    i.fazer()
  }
  function tecla(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') indice = Math.min(indice + 1, itens.length - 1)
    else if (e.key === 'ArrowUp') indice = Math.max(indice - 1, 0)
    else if (e.key === 'Enter' && itens[indice]) executar(itens[indice])
    else if (e.key === 'Escape') aoFechar()
    else return
    e.preventDefault()
  }
</script>

<div class="fundo" role="presentation" onclick={(e) => e.target === e.currentTarget && aoFechar()}>
  <div class="paleta" role="dialog" aria-label={t('paleta.dica')} aria-modal="true">
    <input
      class="campo"
      bind:this={campo}
      bind:value={busca}
      oninput={() => (indice = 0)}
      onkeydown={tecla}
      placeholder={t('paleta.dica')}
      role="combobox"
      aria-expanded="true"
      aria-controls="paleta-lista"
    />
    <ul id="paleta-lista" role="listbox">
      {#each itens as i, k (i.rotulo)}
        <li role="option" aria-selected={k === indice}>
          <button class:atual={k === indice} onclick={() => executar(i)} onmouseenter={() => (indice = k)}>{i.rotulo}</button>
        </li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .fundo {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: rgb(5 6 10 / 0.5);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 12vh;
  }
  .paleta {
    width: 560px;
    max-width: calc(100vw - 40px);
    background: var(--fundo-painel);
    border: 1px solid var(--borda);
    border-radius: var(--raio-l);
    padding: 10px;
    box-shadow: 0 20px 60px rgb(0 0 0 / 0.45);
  }
  .paleta .campo {
    height: 38px;
    font-size: var(--t14);
  }
  ul {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    max-height: 50vh;
    overflow: auto;
  }
  li button {
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    border: 0;
    border-radius: var(--raio-s);
    background: none;
  }
  li button.atual {
    background: var(--fundo-cartao-hover);
  }
</style>

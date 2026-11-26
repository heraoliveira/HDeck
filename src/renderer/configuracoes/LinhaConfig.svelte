<script lang="ts">
  import { lerCaminho } from '@shared/config/esquema.ts'
  import type { LinhaConfig } from '@shared/configuracoes/catalogo.ts'
  import { t } from '@shared/i18n/index.ts'
  import type { Snippet } from 'svelte'
  import Interruptor from '../componentes/Interruptor.svelte'
  import { chamar } from '../estado/api.ts'
  import { loja, mensagem } from '../estado/loja.svelte.ts'

  let { linha, destacar = false, especial }: { linha: LinhaConfig; destacar?: boolean; especial?: Snippet } = $props()

  const cfg = $derived(loja.snap?.config)
  const valor = $derived(cfg && linha.caminho ? lerCaminho(cfg, linha.caminho) : undefined)
  /** Linha dependente fica esmaecida com a principal desligada (Seção 12.3). */
  const esmaecida = $derived(cfg && linha.dependeDe ? lerCaminho(cfg, linha.dependeDe) === false : false)
  const descricao = $derived(
    linha.descricaoVar && cfg ? t(linha.descricao, { n: String(lerCaminho(cfg, linha.descricaoVar)) }) : t(linha.descricao),
  )

  async function mudar(v: unknown) {
    if (!linha.caminho) return
    const r = await chamar<'config.alterar', { ok: boolean }>('config.alterar', { caminho: linha.caminho, valor: v })
    if (!r.ok) mensagem('erro', t('erro.desconhecido'))
  }
  const id = $derived(`cfg-${linha.id}`)
</script>

<div class="linha-config" class:esmaecida class:destacar data-linha={linha.id}>
  <div class="textos">
    <label class="titulo" for={id}>
      {t(linha.titulo)}
      {#if linha.valeAoReiniciar}<span class="reiniciar">{t('config.valeAoReiniciar')}</span>{/if}
    </label>
    <div class="descricao">{descricao}</div>
  </div>
  <div class="controle">
    {#if linha.controle.tipo === 'interruptor'}
      <span {id}>
        <Interruptor ligado={valor === true} rotulo={t(linha.titulo)} desabilitado={esmaecida} aoMudar={mudar} />
      </span>
    {:else if linha.controle.tipo === 'select'}
      <select
        {id}
        class="campo"
        disabled={esmaecida}
        value={String(valor ?? linha.controle.opcoes[0]?.valor)}
        onchange={(e) => {
          const op = linha.controle.tipo === 'select' ? linha.controle.opcoes.find((o) => String(o.valor) === e.currentTarget.value) : undefined
          if (op) void mudar(op.valor)
        }}
      >
        {#each linha.controle.opcoes as op (op.valor)}<option value={String(op.valor)}>{op.rotulo}</option>{/each}
      </select>
    {:else if linha.controle.tipo === 'numero'}
      <input
        {id}
        class="campo numero"
        type="number"
        disabled={esmaecida}
        min={linha.controle.min}
        max={linha.controle.max}
        step={linha.controle.passo ?? 1}
        value={Number(valor)}
        onchange={(e) => void mudar(Number(e.currentTarget.value))}
      />
      {#if linha.controle.unidade}<span class="muted pequeno">{linha.controle.unidade}</span>{/if}
    {:else if linha.controle.tipo === 'hora'}
      <input {id} class="campo numero" type="time" disabled={esmaecida} value={String(valor)} onchange={(e) => void mudar(e.currentTarget.value)} />
    {:else if linha.controle.tipo === 'texto'}
      <input {id} class="campo" disabled={esmaecida} value={String(valor ?? '')} onchange={(e) => void mudar(e.currentTarget.value)} />
    {/if}
  </div>
  {#if especial}<div class="especial">{@render especial()}</div>{/if}
</div>

<style>
  .linha-config {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px 16px;
    align-items: center;
    padding: 12px 14px;
    border-radius: var(--raio-m);
    background: var(--fundo-cartao);
    border: 1px solid transparent;
    margin-bottom: 6px;
  }
  .linha-config.destacar {
    border-color: var(--destaque);
  }
  .esmaecida .textos,
  .esmaecida .controle {
    opacity: 0.45;
  }
  .titulo {
    display: block;
    font-size: var(--t14);
    font-weight: 600;
    color: var(--texto);
  }
  .descricao {
    font-size: var(--t13);
    color: var(--texto-2);
    margin-top: 2px;
  }
  .reiniciar {
    font-size: 11px;
    font-weight: 400;
    color: var(--aviso);
    margin-left: 6px;
  }
  .controle {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .controle select {
    min-width: 170px;
  }
  .numero {
    width: 100px;
  }
  .especial {
    grid-column: 1 / -1;
  }
</style>

<script lang="ts">
import { t } from '@shared/i18n/index.ts'
import type { Conta } from '@shared/tipos/dominio.ts'
import { chamar } from '../estado/api.ts'
import { registrarEspaco } from '../estado/espacos.ts'
import { loja } from '../estado/loja.svelte.ts'
import Icone from './Icone.svelte'
import SeloEstado from './SeloEstado.svelte'

let {
  conta,
  tipo = 'conta',
  faixa = true,
  aoClicar,
}: { conta: Conta; tipo?: 'conta' | 'miniatura'; faixa?: boolean; aoClicar?: () => void } = $props()

let corpo: HTMLDivElement | undefined = $state()
const est = $derived(loja.snap?.estados[conta.id])
const estado = $derived(est?.estado ?? 'desligada')
const ativa = $derived(loja.snap?.ativaId === conta.id)
const foto = $derived(loja.fotos[conta.id])
const temLive = $derived((loja.snap?.lives ?? []).some((l) => l.contaId === conta.id && l.ligada))
const ligada = $derived(estado !== 'desligada')
const aoVivo = $derived(estado === 'ativa' && tipo === 'conta' && loja.dialogos.length === 0)

$effect(() => {
  if (!corpo) return
  return registrarEspaco({ contaId: conta.id, el: corpo, tipo, visivel: () => true })
})

function clicar() {
  if (aoClicar) aoClicar()
  else void chamar('contas.ativar', { id: conta.id })
}

function menu(e: MouseEvent) {
  const b = (e.currentTarget as HTMLElement).getBoundingClientRect()
  void chamar('contas.menu', { id: conta.id, x: Math.round(b.left), y: Math.round(b.bottom) })
}

async function ligar() {
  const r = await chamar<'contas.lote', { ok: boolean; excessos?: unknown[] }>('contas.lote', {
    ids: [conta.id],
    acao: 'ligar',
  })
  if (!r.ok && r.excessos) void chamar('contas.lote', { ids: [conta.id], acao: 'ligar', confirmado: true })
}
</script>

<div class="moldura" class:ativa class:miniatura={tipo === 'miniatura'} style:--cor-conta={conta.cor} data-conta={conta.id}>
  {#if faixa}
    <div class="faixa">
      <span class="cor"></span>
      <span class="icone-conta">{conta.icone}</span>
      <span class="nome cresce" title={conta.nome}>{conta.nome}</span>
      <SeloEstado {estado} />
      {#if est?.vigiaPausado}<span class="pequeno muted">{t('estado.vigiaPausado')}</span>{/if}
      {#if temLive}<Icone nome="live" tamanho={13} titulo={t('conta.lives')} />{/if}
      {#if !conta.som}<Icone nome="mudo" tamanho={13} titulo={t('conta.silenciar')} />{/if}
      <button class="mini" aria-label={t('lote.titulo')} onclick={menu}><Icone nome="pontos" tamanho={14} /></button>
    </div>
  {/if}
  <div class="corpo" bind:this={corpo}>
    {#if !ligada}
      <div class="vazio">
        <button class="botao" onclick={ligar}><Icone nome="ligar" />{t('conta.ligar')}</button>
      </div>
    {:else if !aoVivo}
      <button class="foto" onclick={clicar} aria-label={t('conta.clique')}>
        {#if foto}<img src={foto} alt="" draggable="false" />{/if}
        <span class="dica">{t('conta.clique')}</span>
      </button>
    {/if}
    {#if est?.googleRecusou}
      <div class="google">{t('conta.googleRecusa')}</div>
    {/if}
  </div>
</div>

<style>
  .moldura {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    height: 100%;
    border: 1px solid var(--borda);
    border-radius: var(--raio-s);
    background: var(--fundo-painel);
    overflow: hidden;
  }
  .moldura.ativa {
    border-color: var(--destaque);
    box-shadow: 0 0 0 1px var(--destaque);
  }
  .faixa {
    display: flex;
    align-items: center;
    gap: 6px;
    height: var(--altura-faixa);
    padding: 0 4px 0 0;
    font-size: var(--t12);
    border-bottom: 1px solid var(--borda);
    flex: none;
  }
  .cor {
    width: 4px;
    align-self: stretch;
    background: var(--cor-conta);
  }
  .nome {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  .mini {
    border: 0;
    background: none;
    color: var(--texto-2);
    display: grid;
    place-items: center;
    width: 22px;
    height: 20px;
    border-radius: 4px;
  }
  .mini:hover {
    background: var(--fundo-cartao-hover);
  }
  .corpo {
    position: relative;
    flex: 1;
    min-height: 0;
    background: #0b0d12;
  }
  .vazio {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
  }
  .foto {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: #0b0d12;
  }
  .foto img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  .dica {
    position: absolute;
    inset: auto 0 0;
    padding: 6px;
    text-align: center;
    font-size: var(--t12);
    background: linear-gradient(transparent, rgb(0 0 0 / 0.7));
    color: #fff;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .foto:hover .dica,
  .foto:focus-visible .dica {
    opacity: 1;
  }
  .miniatura .dica {
    display: none;
  }
  .google {
    position: absolute;
    inset: auto 8px 8px;
    padding: 8px 10px;
    border-radius: var(--raio-s);
    background: var(--fundo-cartao);
    border: 1px solid var(--aviso);
    font-size: var(--t12);
  }
</style>

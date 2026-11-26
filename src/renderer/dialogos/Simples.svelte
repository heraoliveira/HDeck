<script lang="ts">
import { t } from '@shared/i18n/index.ts'
import { untrack } from 'svelte'
import Modal from '../componentes/Modal.svelte'
import { chamar } from '../estado/api.ts'
import { type DialogoAberto, loja } from '../estado/loja.svelte.ts'

/** Diálogos curtos: apagar conta/grupo, renomear/criar grupo, limite de contas. */
let { d, aoFechar }: { d: DialogoAberto; aoFechar: () => void } = $props()
const s = $derived(loja.snap!)
const conta = $derived('id' in d ? s.contas.find((c) => c.id === d.id) : undefined)
const grupo = $derived('id' in d ? s.grupos.find((g) => g.id === d.id) : undefined)
let apagarLogin = $state(true)
const d0 = untrack(() => d)
let nome = $state('id' in d0 ? (loja.snap?.grupos.find((g) => g.id === d0.id)?.nome ?? '') : '')
let cor = $state('id' in d0 ? (loja.snap?.grupos.find((g) => g.id === d0.id)?.cor ?? '#7c6cf0') : '#7c6cf0')

async function confirmar() {
  if (d.qual === 'apagarConta' && conta) await chamar('contas.apagar', { id: conta.id, apagarLogin })
  if (d.qual === 'apagarGrupo' && grupo) await chamar('grupos.apagar', { id: grupo.id })
  if (d.qual === 'editarGrupo' && grupo && nome.trim())
    await chamar('grupos.editar', { id: grupo.id, nome: nome.trim(), cor })
  if (d.qual === 'novoGrupo' && nome.trim()) await chamar('grupos.criar', { nome: nome.trim(), cor })
  if (d.qual === 'limite') d.aoConfirmar()
  aoFechar()
}
const titulo = $derived(
  d.qual === 'apagarConta'
    ? t('conta.apagar')
    : d.qual === 'apagarGrupo'
      ? t('grupo.apagar')
      : d.qual === 'limite'
        ? t('limite.titulo')
        : d.qual === 'novoGrupo'
          ? t('lateral.novoGrupo')
          : t('grupo.renomear'),
)
</script>

<Modal {titulo} {aoFechar} largura={460}>
  <form class="form" onsubmit={(e) => (e.preventDefault(), confirmar())}>
    {#if d.qual === 'apagarConta' && conta}
      <p>{t('conta.apagarConfirma', { nome: conta.nome })}</p>
      <label class="linha"><input type="checkbox" bind:checked={apagarLogin} />{t('conta.apagarLogin')}</label>
    {:else if d.qual === 'apagarGrupo' && grupo}
      <p>{t('grupo.apagarConfirma', { nome: grupo.nome, n: s.contas.filter((c) => c.grupoId === grupo.id).length })}</p>
    {:else if d.qual === 'limite'}
      <p>{d.texto}</p>
    {:else}
      <label>{t('cfg.jogos.nome')}<input class="campo" bind:value={nome} maxlength="60" /></label>
      <label>{t('grupo.cor')}<input class="campo" type="color" bind:value={cor} /></label>
    {/if}
    <div class="linha fim">
      <button type="button" class="botao" onclick={aoFechar}>{t('comum.cancelar')}</button>
      <button type="submit" class="botao" class:perigo={d.qual.startsWith('apagar')} class:primario={!d.qual.startsWith('apagar')}>
        {d.qual.startsWith('apagar') ? t('comum.apagar') : d.qual === 'limite' ? t('limite.continuar') : t('comum.salvar')}
      </button>
    </div>
  </form>
</Modal>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--t12);
    color: var(--texto-2);
  }
  label.linha {
    flex-direction: row;
    color: var(--texto);
  }
  .fim {
    justify-content: flex-end;
  }
  p {
    margin: 0;
    line-height: 1.45;
  }
</style>

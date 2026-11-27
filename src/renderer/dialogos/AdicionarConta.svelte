<script lang="ts">
import { CORES_CONTA } from '@shared/dados/padroes-config.ts'
import { t } from '@shared/i18n/index.ts'
import type { Conta } from '@shared/tipos/dominio.ts'
import { untrack } from 'svelte'
import Modal from '../componentes/Modal.svelte'
import { chamar } from '../estado/api.ts'
import { loja, mensagem } from '../estado/loja.svelte.ts'

/**
 * Adicionar ou editar conta (RN-037): sem escolher jogo. A conta nova começa no endereço
 * padrão do grupo; o usuário pode trocar. O jogo sai do endereço (RN-013).
 */
let {
  aoFechar,
  grupoId,
  editar,
}: { aoFechar: () => void; grupoId?: string | undefined; editar?: Conta | undefined } = $props()
const s = $derived(loja.snap!)
const ini = untrack(() => ({ editar, grupoId }))
const grupoInicial =
  ini.editar?.grupoId ?? ini.grupoId ?? loja.snap?.grupoAtualId ?? loja.snap?.grupos[0]?.id ?? ''
const padraoDo = (id: string) => loja.snap?.grupos.find((g) => g.id === id)?.layout.urlPadrao ?? ''

let grupo = $state(grupoInicial)
let url = $state(ini.editar?.url ?? padraoDo(grupoInicial))
let urlMexida = $state(Boolean(ini.editar))
let nome = $state(ini.editar?.nome ?? '')
let cor = $state(ini.editar?.cor ?? CORES_CONTA[(loja.snap?.contas.length ?? 0) % CORES_CONTA.length])
let notas = $state(ini.editar?.notas ?? '')
let som = $state(ini.editar?.som ?? true)
let notificacoes = $state(ini.editar?.notificacoesDaPagina ?? false)

function trocarGrupo(id: string) {
  grupo = id
  if (!urlMexida) url = padraoDo(id)
}

async function salvar() {
  let u: URL
  try {
    u = new URL(url.trim())
    if (!/^https?:$/.test(u.protocol)) throw new Error()
  } catch {
    mensagem('erro', t('adicionar.urlInvalida'))
    return
  }
  if (ini.editar) {
    await chamar('contas.editar', {
      id: ini.editar.id,
      nome: nome.trim() || ini.editar.nome,
      url: u.toString(),
      cor,
      notas,
      som,
      notificacoesDaPagina: notificacoes,
    })
    if (grupo !== ini.editar.grupoId)
      await chamar('contas.mover', { id: ini.editar.id, grupoId: grupo, posicao: 1000 })
    aoFechar()
    return
  }
  const r = await chamar<'contas.adicionar', { ok: boolean }>('contas.adicionar', {
    grupoId: grupo,
    url: u.toString(),
    cor,
    notas,
    som,
    notificacoesDaPagina: notificacoes,
    ...(nome.trim() ? { nome: nome.trim() } : {}),
  })
  if (r.ok) aoFechar()
  else mensagem('erro', t('adicionar.urlInvalida'))
}
</script>

<Modal titulo={ini.editar ? t('conta.editar') : t('adicionar.titulo')} {aoFechar}>
  <form class="form" onsubmit={(e) => (e.preventDefault(), salvar())}>
    <label>
      {t('adicionar.grupo')}
      <select class="campo" value={grupo} onchange={(e) => trocarGrupo(e.currentTarget.value)}>
        {#each s.grupos as g (g.id)}<option value={g.id}>{g.nome}</option>{/each}
      </select>
    </label>
    <label>
      {t('adicionar.url')}
      <input class="campo" bind:value={url} oninput={() => (urlMexida = true)} placeholder="https://" />
      <span class="pequeno muted">{t('adicionar.enderecoDica')}</span>
    </label>
    <label>{t('adicionar.nome')}<input class="campo" bind:value={nome} maxlength="60" /></label>
    <label>
      {t('adicionar.cor')}
      <span class="cores">
        {#each CORES_CONTA as c (c)}
          <button type="button" class="cor" class:ativo={cor === c} style:--c={c} aria-label={c} onclick={() => (cor = c)}></button>
        {/each}
      </span>
    </label>
    <label>{t('adicionar.notas')}<textarea class="campo" bind:value={notas} maxlength="2000"></textarea></label>
    <label class="linha"><input type="checkbox" bind:checked={som} />{t('adicionar.som')}</label>
    <label class="linha"><input type="checkbox" bind:checked={notificacoes} />{t('adicionar.notificacoes')}</label>
    <div class="linha fim">
      <button type="button" class="botao" onclick={aoFechar}>{t('comum.cancelar')}</button>
      <button type="submit" class="botao primario">{ini.editar ? t('comum.salvar') : t('comum.adicionar')}</button>
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
    margin-top: 6px;
  }
  .cores {
    display: flex;
    gap: 8px;
  }
  .cor {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid transparent;
    background: var(--c);
    padding: 0;
  }
  .cor.ativo {
    border-color: var(--texto);
    box-shadow: 0 0 0 2px var(--dourado);
  }
</style>

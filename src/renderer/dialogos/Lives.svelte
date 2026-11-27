<script lang="ts">
import { t, tDinamico } from '@shared/i18n/index.ts'
import type { PlataformaLive } from '@shared/tipos/dominio.ts'
import Interruptor from '../componentes/Interruptor.svelte'
import Modal from '../componentes/Modal.svelte'
import { chamar } from '../estado/api.ts'
import { loja, mensagem } from '../estado/loja.svelte.ts'

let { contaId, aoFechar }: { contaId: string; aoFechar: () => void } = $props()
const s = $derived(loja.snap!)
const conta = $derived(s.contas.find((c) => c.id === contaId))
const lives = $derived(s.lives.filter((l) => l.contaId === contaId).sort((a, b) => a.ordem - b.ordem))
let plataforma: PlataformaLive = $state('twitch')
let canal = $state('')
let comSom = $state(false)

async function adicionar() {
  if (!canal.trim()) return
  const r = await chamar<'lives.adicionar', { ok: boolean; erro?: string }>('lives.adicionar', {
    contaId,
    plataforma,
    canal: canal.trim(),
  })
  if (r.ok) canal = ''
  else mensagem('erro', t('adicionar.urlInvalida'))
}
async function ligar(id: string, ligada: boolean) {
  const r = await chamar<'lives.ligar', { ok: boolean; erro?: string }>('lives.ligar', { id, ligada })
  if (!r.ok && r.erro === 'limite') mensagem('aviso', t('lives.limite', { n: s.config.lives.porConta }))
}
</script>

<Modal titulo={t('lives.titulo', { conta: conta?.nome ?? '' })} {aoFechar} largura={600}>
  <div class="lista">
    {#each lives as l (l.id)}
      <div class="linha item">
        <Interruptor ligado={l.ligada} rotulo={l.canal} aoMudar={(v) => ligar(l.id, v)} />
        <span class="cresce"><strong>{l.canal}</strong> <span class="muted pequeno">{t(l.plataforma === 'twitch' ? 'lives.twitch' : 'lives.kick')}</span></span>
        <span class="pequeno muted">{tDinamico(`lives.estado.${s.livesEstado[l.id] ?? 'desligada'}`)}</span>
        <button class="botao" onclick={() => chamar('lives.mostrar', { id: l.id, som: comSom })}>{t('lives.mostrar')}</button>
        <button class="botao" onclick={() => chamar('lives.entrar', { id: l.id })}>{t('lives.entrar', { plataforma: t(l.plataforma === 'twitch' ? 'lives.twitch' : 'lives.kick') })}</button>
        <button class="botao perigo" onclick={() => chamar('lives.remover', { id: l.id })}>{t('lives.remover')}</button>
      </div>
    {/each}
    <label class="linha pequeno"><input type="checkbox" bind:checked={comSom} />{t('lives.somAoMostrar')}</label>
    <form class="linha" onsubmit={(e) => (e.preventDefault(), adicionar())}>
      <select class="campo" style:width="auto" bind:value={plataforma} aria-label={t('lives.plataforma')}>
        <option value="twitch">{t('lives.twitch')}</option>
        <option value="kick">{t('lives.kick')}</option>
      </select>
      <input class="campo cresce" bind:value={canal} placeholder={t('lives.canal')} aria-label={t('lives.canal')} />
      <button class="botao primario" type="submit">{t('lives.adicionar')}</button>
    </form>
  </div>
</Modal>

<style>
  .lista {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .item {
    padding: 8px;
    border-radius: var(--raio-s);
    background: var(--fundo-cartao);
    flex-wrap: wrap;
  }
</style>

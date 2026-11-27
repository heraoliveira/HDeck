<script lang="ts">
import { t, tDinamico } from '@shared/i18n/index.ts'
import Icone from '../componentes/Icone.svelte'
import Interruptor from '../componentes/Interruptor.svelte'
import PainelFlutuante from '../componentes/PainelFlutuante.svelte'
import { chamar, tentar } from '../estado/api.ts'
import { abrirDialogo, fecharDialogo, loja, mensagem } from '../estado/loja.svelte.ts'

/** Painel da conta (clique com o botão direito na conta, na lateral ou na moldura). */
let { id, x, y }: { id: string; x: number; y: number } = $props()
const s = $derived(loja.snap!)
const c = $derived(s.contas.find((x) => x.id === id))
const est = $derived(s.estados[id])
const ligada = $derived((est?.estado ?? 'desligada') !== 'desligada')
const ram = $derived(loja.metricas?.porConta[id]?.ramMb)
const jogo = $derived(s.jogos.find((j) => j.id === c?.jogoId))
const mostrarLives = $derived(s.config.lives.mostrarEmTodas || (jogo?.bonusLive ?? false))
const iniciais = (n: string) =>
  n
    .replace(/[^\p{L}\p{N}]/gu, '')
    .slice(0, 2)
    .toUpperCase() || '?'
let editando: 'nome' | 'url' | null = $state(null)
let valor = $state('')

async function salvar() {
  if (!c || !editando) return
  if (editando === 'nome' && valor.trim())
    await chamar('contas.editar', { id, nome: valor.trim().slice(0, 60) })
  if (editando === 'url') {
    try {
      const u = new URL(valor.trim())
      if (!/^https?:$/.test(u.protocol)) throw new Error()
      await chamar('contas.editar', { id, url: u.toString() })
    } catch {
      mensagem('erro', t('adicionar.urlInvalida'))
      return
    }
  }
  editando = null
}
function zoom(delta: number) {
  if (!c) return
  const z = Math.round(Math.min(3, Math.max(0.25, c.zoom + delta)) * 100) / 100
  void chamar('contas.editar', { id, zoom: z })
}
function e(f: () => void) {
  fecharDialogo()
  f()
}
function mover(grupoId: string) {
  const g = s.grupos.find((x) => x.id === grupoId)
  if (!c || !g || grupoId === c.grupoId) return
  fecharDialogo()
  abrirDialogo({
    qual: 'confirmar',
    titulo: t('mover.titulo'),
    texto: t('mover.texto', { conta: c.nome, grupo: g.nome }),
    botao: t('mover.botao'),
    aoConfirmar: () => void chamar('contas.mover', { id, grupoId, posicao: 1000 }),
  })
}
</script>

{#if c}
  <PainelFlutuante {x} {y} aoFechar={fecharDialogo} rotulo={c.nome}>
    <div class="pf-cabeca">
      <span class="pf-avatar" style:--cor={c.cor}>{iniciais(c.nome)}</span>
      <div class="cresce">
        {#if editando === 'nome'}
          <input class="campo" bind:value={valor} onkeydown={(ev) => ev.key === 'Enter' && salvar()} aria-label={t('pc.renomear')} />
        {:else}
          <div class="pf-titulo" role="button" tabindex="0" ondblclick={() => ((valor = c.nome), (editando = 'nome'))}>{c.nome}</div>
        {/if}
        <div class="pf-sub">{tDinamico(`estado.${est?.estado ?? 'desligada'}`)}</div>
      </div>
      {#if ram}<span class="pf-sub">{Math.round(ram)} MB</span>{/if}
    </div>
    <div class="pf-acoes">
      {#if ligada}
        <button class="pf-acao" onclick={() => e(() => void chamar('contas.lote', { ids: [id], acao: 'desligar' }))}><Icone nome="ligar" />{t('pc.desligar')}</button>
      {:else}
        <button class="pf-acao" onclick={() => e(() => void chamar('contas.lote', { ids: [id], acao: 'ligar', confirmado: true }))}><Icone nome="ligar" />{t('pc.ligar')}</button>
      {/if}
      <button class="pf-acao" disabled={!ligada} onclick={() => e(() => void chamar('contas.lote', { ids: [id], acao: 'recarregar' }))}><Icone nome="recarregar" />{t('pc.recarregar')}</button>
      <button class="pf-acao" disabled={!ligada} onclick={() => e(() => void chamar('contas.inicio', { id }))}><Icone nome="casa" />{t('pc.inicio')}</button>
      <button class="pf-acao" disabled={!ligada} onclick={() => e(() => void chamar('contas.lote', { ids: [id], acao: 'otimizar' }))}><Icone nome="brilho" />{t('pc.otimizar')}</button>
    </div>
    <button class="pf-item" disabled={!ligada} onclick={() => e(() => void chamar('contas.soltar', { id }))}><Icone nome="janelaPropria" /><span>{t('pc.destacar')}</span></button>
    {#if mostrarLives}
      <button class="pf-item" onclick={() => e(() => abrirDialogo({ qual: 'lives', id }))}><Icone nome="live" /><span>{t('pc.lives')}</span></button>
    {/if}
    <div class="pf-sep"></div>
    <button class="pf-item" onclick={() => e(() => abrirDialogo({ qual: 'cofre', id }))}><Icone nome="chave" /><span>{t('pc.login')}</span></button>
    <button class="pf-item" disabled={!ligada} onclick={() => e(() => void tentar('cofre.preencher', { ids: [id] }))}><Icone nome="lapis" /><span>{t('pc.preencher')}</span><kbd>Ctrl+L</kbd></button>
    <div class="pf-sep"></div>
    <div class="pf-linha">
      <Icone nome="mudo" /><span class="cresce">{t('pc.silenciar')}</span>
      <Interruptor ligado={!c.som} rotulo={t('pc.silenciar')} aoMudar={(v) => chamar('contas.editar', { id, som: !v })} />
    </div>
    <div class="pf-linha">
      <Icone nome="olho" /><span class="cresce">{t('pc.zoom')}</span>
      <button class="icone-botao" aria-label="−" onclick={() => zoom(-0.1)}>−</button>
      <span class="pequeno">{Math.round(c.zoom * 100)}%</span>
      <button class="icone-botao" aria-label="+" onclick={() => zoom(0.1)}>+</button>
    </div>
    <div class="pf-linha"><Icone nome="folha" />{t('pc.foraDaTela')}</div>
    <div class="pf-segmento tres" role="radiogroup" aria-label={t('pc.foraDaTela')}>
      {#each [['padrao_do_jogo', t('conta.politicaPadrao')], ['manter', t('pg.farmando')], ['economizar', t('pg.economizar')]] as [v, r] (v)}
        <button role="radio" aria-checked={c.politicaForaTela === v} class:ativo={c.politicaForaTela === v} onclick={() => chamar('contas.editar', { id, politicaForaTela: v as 'manter' })}>{r}</button>
      {/each}
    </div>
    <div class="pf-sep"></div>
    <button class="pf-item" onclick={() => ((valor = c.nome), (editando = 'nome'))}><Icone nome="lapis" /><span>{t('pc.renomear')}</span><kbd>{t('pc.duploClique')}</kbd></button>
    {#if editando === 'url'}
      <div class="pf-linha">
        <input class="campo" bind:value={valor} onkeydown={(ev) => ev.key === 'Enter' && salvar()} aria-label={t('pc.endereco')} />
        <button class="botao primario" onclick={salvar}>{t('comum.salvar')}</button>
      </div>
    {:else}
      <button class="pf-item" onclick={() => ((valor = c.url), (editando = 'url'))}><Icone nome="link" /><span>{t('pc.endereco')}<small>{c.url}</small></span></button>
    {/if}
    <div class="pf-linha">
      <Icone nome="pasta" /><span class="cresce">{t('pc.mover')}</span>
      <select class="campo pequeno" style:width="140px" value={c.grupoId} onchange={(ev) => mover(ev.currentTarget.value)} aria-label={t('pc.mover')}>
        {#each s.grupos as g (g.id)}<option value={g.id}>{g.nome}</option>{/each}
      </select>
    </div>
    <button class="pf-item" onclick={() => e(() => void chamar('contas.duplicar', { id }))}><Icone nome="mais" /><span>{t('pc.duplicar')}</span></button>
    <button class="pf-item" disabled={!ligada} onclick={() => e(() => void chamar('contas.devtools', { id }))}><Icone nome="engrenagem" /><span>{t('pc.devtools')}</span></button>
    <div class="pf-sep"></div>
    <button
      class="pf-item perigo"
      onclick={() =>
        e(() =>
          abrirDialogo({
            qual: 'confirmar',
            titulo: t('pc.limparDados'),
            texto: t('pc.limparDadosConfirma', { nome: c.nome }),
            botao: t('cfg.limpar'),
            perigo: true,
            aoConfirmar: () => void chamar('contas.limparDados', { id }),
          }),
        )}><Icone nome="lixo" /><span>{t('pc.limparDados')}</span></button
    >
    <button class="pf-item perigo" onclick={() => e(() => abrirDialogo({ qual: 'apagarConta', id }))}><Icone nome="lixo" /><span>{t('pc.excluir')}</span></button>
  </PainelFlutuante>
{/if}

<style>
  .tres {
    grid-template-columns: 1fr 1fr 1fr !important;
  }
</style>

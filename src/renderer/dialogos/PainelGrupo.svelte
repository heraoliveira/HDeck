<script lang="ts">
import { CORES_CONTA } from '@shared/dados/padroes-config.ts'
import { t } from '@shared/i18n/index.ts'
import Icone from '../componentes/Icone.svelte'
import PainelFlutuante from '../componentes/PainelFlutuante.svelte'
import { chamar, tentar } from '../estado/api.ts'
import { abrirDialogo, contasDoGrupo, fecharDialogo, loja, mensagem } from '../estado/loja.svelte.ts'

/** Painel de configurações do grupo (clique em ⋯ ou com o botão direito no grupo). */
let { id, x, y }: { id: string; x: number; y: number } = $props()
const s = $derived(loja.snap!)
const g = $derived(s.grupos.find((x) => x.id === id))
const contas = $derived(contasDoGrupo(id))
const ids = $derived(contas.map((c) => c.id))
const ligadas = $derived(contas.filter((c) => s.estados[c.id]?.estado !== 'desligada').length)
const jogos = $derived([...new Set(contas.map((c) => c.jogoId))])
const economizar = $derived(jogos.length > 0 && jogos.every((j) => g?.layout.politicas[j] === 'economizar'))
const ordenados = $derived([...s.grupos].sort((a, b) => a.ordem - b.ordem))
const posicao = $derived(ordenados.findIndex((x) => x.id === id))
let editandoNome = $state(false)
let nome = $state('')
let editandoUrl = $state(false)
let url = $state('')

async function lote(acao: 'ligar' | 'desligar' | 'recarregar' | 'otimizar') {
  if (ids.length === 0) return
  const n = ligadas
  fecharDialogo()
  await tentar('contas.lote', { ids, acao, confirmado: true })
  if (acao === 'otimizar') mensagem('ok', t('otimizar.feito', { n }))
}
async function politica(p: 'manter' | 'economizar') {
  for (const j of jogos) await chamar('grupos.politica', { grupoId: id, jogoId: j, politica: p })
}
async function mover(delta: number) {
  const lista = ordenados.map((x) => x.id)
  const i = lista.indexOf(id)
  const j = i + delta
  if (j < 0 || j >= lista.length) return
  ;[lista[i], lista[j]] = [lista[j]!, lista[i]!]
  await chamar('grupos.reordenar', { ids: lista })
}
async function salvarNome() {
  if (nome.trim()) await chamar('grupos.editar', { id, nome: nome.trim() })
  editandoNome = false
}
async function salvarUrl() {
  try {
    const u = new URL(url.trim())
    if (!/^https?:$/.test(u.protocol)) throw new Error()
    await chamar('grupos.layout', { id, layout: { urlPadrao: u.toString() } })
    editandoUrl = false
  } catch {
    mensagem('erro', t('adicionar.urlInvalida'))
  }
}
function trocarPara(f: () => void) {
  fecharDialogo()
  f()
}
</script>

{#if g}
  <PainelFlutuante {x} {y} aoFechar={fecharDialogo} rotulo={g.nome}>
    <div class="pf-cabeca">
      <span class="pf-avatar" style:--cor={g.cor}><Icone nome="pasta" /></span>
      <div class="cresce">
        {#if editandoNome}
          <input class="campo" bind:value={nome} onkeydown={(e) => e.key === 'Enter' && salvarNome()} onblur={salvarNome} aria-label={t('pg.renomear')} />
        {:else}
          <div class="pf-titulo" role="button" tabindex="0" ondblclick={() => ((nome = g.nome), (editandoNome = true))}>{g.nome}</div>
        {/if}
        <div class="pf-sub">{t('pg.ligadas', { ligadas, total: contas.length })}</div>
      </div>
    </div>
    <div class="pf-acoes">
      <button class="pf-acao" disabled={ligadas === contas.length} onclick={() => lote('ligar')}><Icone nome="ligar" />{t('pg.ligarTodas')}</button>
      <button class="pf-acao" disabled={ligadas === 0} onclick={() => lote('desligar')}><Icone nome="ligar" />{t('pg.desligarTodas')}</button>
      <button class="pf-acao" disabled={ligadas === 0} onclick={() => lote('recarregar')}><Icone nome="recarregar" />{t('pg.recarregar')}</button>
      <button class="pf-acao" disabled={ligadas === 0} onclick={() => lote('otimizar')}><Icone nome="brilho" />{t('pg.otimizar')}</button>
    </div>
    <button class="pf-item" onclick={() => trocarPara(() => void chamar('grupos.trocar', { id, confirmado: true }))}>
      <Icone nome="grade" /><span>{t('pg.soEste')}<small>{t('pg.soEsteD')}</small></span>
    </button>
    <button class="pf-item" onclick={() => trocarPara(() => abrirDialogo({ qual: 'adicionarConta', grupoId: id }))}>
      <Icone nome="mais" /><span>{t('pg.adicionar')}</span>
    </button>
    {#if editandoUrl}
      <div class="pf-linha">
        <input class="campo" bind:value={url} placeholder="https://" onkeydown={(e) => e.key === 'Enter' && salvarUrl()} aria-label={t('pg.endereco')} />
        <button class="botao primario" onclick={salvarUrl}>{t('comum.salvar')}</button>
      </div>
    {:else}
      <button class="pf-item" onclick={() => ((url = g.layout.urlPadrao), (editandoUrl = true))}>
        <Icone nome="link" /><span>{t('pg.endereco')}<small>{g.layout.urlPadrao || t('pg.enderecoVazio')}</small></span>
      </button>
    {/if}
    <div class="pf-sep"></div>
    <div class="pf-linha"><Icone nome="folha" />{t('pg.foraDaTela')}</div>
    <div class="pf-segmento" role="radiogroup" aria-label={t('pg.foraDaTela')}>
      <button role="radio" aria-checked={!economizar} class:ativo={!economizar} onclick={() => politica('manter')}>{t('pg.farmando')}</button>
      <button role="radio" aria-checked={economizar} class:ativo={economizar} onclick={() => politica('economizar')}>{t('pg.economizar')}</button>
    </div>
    <div class="pf-dica">{t('pg.foraDaTelaD')}</div>
    <div class="pf-sep"></div>
    <div class="pf-linha">{t('pg.cor')}</div>
    <div class="pf-cores">
      {#each CORES_CONTA as c (c)}
        <button class="pf-cor" class:ativo={g.cor === c} style:--c={c} aria-label={c} onclick={() => chamar('grupos.editar', { id, cor: c })}></button>
      {/each}
    </div>
    <button class="pf-item" onclick={() => ((nome = g.nome), (editandoNome = true))}><Icone nome="lapis" /><span>{t('pg.renomear')}</span><kbd>{t('pc.duploClique')}</kbd></button>
    <button class="pf-item" onclick={() => trocarPara(() => void chamar('grupos.janela', { id }))}><Icone nome="janelaPropria" /><span>{t('pg.janela')}</span></button>
    <div class="pf-acoes duas">
      <button class="pf-acao" disabled={posicao <= 0} onclick={() => mover(-1)}><Icone nome="subir" />{t('pg.subir')}</button>
      <button class="pf-acao" disabled={posicao >= ordenados.length - 1} onclick={() => mover(1)}><Icone nome="descer" />{t('pg.descer')}</button>
    </div>
    <div class="pf-sep"></div>
    <button class="pf-item perigo" onclick={() => trocarPara(() => abrirDialogo({ qual: 'apagarGrupo', id }))}>
      <Icone nome="lixo" /><span>{t('pg.excluir')}<small>{t('pg.excluirD')}</small></span>
    </button>
  </PainelFlutuante>
{/if}

<style>
  .duas {
    grid-template-columns: 1fr 1fr !important;
  }
</style>

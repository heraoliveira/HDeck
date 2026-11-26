<script lang="ts">
  import { t } from '@shared/i18n/index.ts'
  import Icone from '../componentes/Icone.svelte'
  import Interruptor from '../componentes/Interruptor.svelte'
  import { chamar } from '../estado/api.ts'
  import { abrirDialogo, grupoAtual, loja } from '../estado/loja.svelte.ts'

  const s = $derived(loja.snap)
  const grupos = $derived([...(s?.grupos ?? [])].sort((a, b) => a.ordem - b.ordem))
  let arrastandoGrupo: string | null = $state(null)

  const contagem = (id: string) => {
    const contas = s?.contas.filter((c) => c.grupoId === id) ?? []
    return { total: contas.length, ligadas: contas.filter((c) => s?.estados[c.id]?.estado !== 'desligada').length }
  }
  const avisosDoGrupo = (id: string) =>
    (s?.contas ?? []).filter((c) => c.grupoId === id && ['caida', 'erro', 'travada', 'com_aviso'].includes(s?.estados[c.id]?.estado ?? '')).length

  async function ligar(id: string, ligado: boolean) {
    const r = await chamar<'grupos.ligar', { ok: boolean; excessos?: { jogoNome: string; limite: number; total: number }[] }>('grupos.ligar', { id, ligado })
    if (!r.ok && r.excessos?.[0]) {
      const e = r.excessos[0]
      loja.dialogos.push({
        qual: 'limite',
        texto: t('limite.texto', { jogo: e.jogoNome, limite: e.limite, total: e.total }),
        aoConfirmar: () => void chamar('grupos.ligar', { id, ligado, confirmado: true }),
      })
    }
  }
  function menu(e: MouseEvent, id: string) {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect()
    void chamar('grupos.menu', { id, x: Math.round(b.right), y: Math.round(b.top) })
  }

  /** RN-036: arrastar grupos para reordenar e contas (do Painel/abas) para outro grupo. */
  function soltar(e: DragEvent, alvo: string) {
    e.preventDefault()
    const conta = e.dataTransfer?.getData('application/x-hdeck-conta')
    if (conta) {
      void chamar('contas.mover', { id: conta, grupoId: alvo, posicao: 1000 })
      return
    }
    if (!arrastandoGrupo || arrastandoGrupo === alvo) return
    const ids = grupos.map((g) => g.id).filter((x) => x !== arrastandoGrupo)
    ids.splice(ids.indexOf(alvo), 0, arrastandoGrupo)
    void chamar('grupos.reordenar', { ids })
    arrastandoGrupo = null
  }
</script>

<aside class="lateral" class:recolhida={loja.lateralRecolhida} aria-label={t('lateral.grupos')}>
  <div class="topo">
    {#if !loja.lateralRecolhida}<span class="rotulo-secao">{t('lateral.grupos')}</span>{/if}
    <button class="icone-botao" aria-label={t('lateral.recolher')} onclick={() => (loja.lateralRecolhida = !loja.lateralRecolhida)}><Icone nome="menu" /></button>
  </div>
  <ul>
    {#each grupos as g (g.id)}
      {@const n = contagem(g.id)}
      {@const av = avisosDoGrupo(g.id)}
      <li
        class:atual={grupoAtual()?.id === g.id}
        style:--cor={g.cor}
        draggable="true"
        ondragstart={() => (arrastandoGrupo = g.id)}
        ondragover={(e) => e.preventDefault()}
        ondrop={(e) => soltar(e, g.id)}
      >
        <button class="grupo" onclick={() => chamar('grupos.selecionar', { id: g.id })} title={g.nome}>
          <span class="cor"></span>
          {#if !loja.lateralRecolhida}
            <span class="nome cresce">{g.nome}</span>
            <span class="contagem pequeno">{t('lateral.contagem', { ligadas: n.ligadas, total: n.total })}</span>
          {/if}
          {#if av > 0}<span class="selo">{av}</span>{/if}
        </button>
        {#if !loja.lateralRecolhida}
          <Interruptor ligado={g.ligado} rotulo={g.ligado ? t('lateral.desligar') : t('lateral.ligar')} aoMudar={(v) => ligar(g.id, v)} />
          <button class="icone-botao" aria-label="{g.nome} ⋯" onclick={(e) => menu(e, g.id)}><Icone nome="pontos" /></button>
        {/if}
      </li>
    {/each}
  </ul>
  {#if !loja.lateralRecolhida}
    <div class="acoes">
      <button class="botao" onclick={() => abrirDialogo({ qual: 'adicionarConta', grupoId: grupoAtual()?.id })}><Icone nome="mais" />{t('grupo.adicionarConta')}</button>
      <button class="botao" onclick={() => abrirDialogo({ qual: 'novoGrupo' })}><Icone nome="mais" />{t('lateral.novoGrupo')}</button>
    </div>
  {/if}
</aside>

<style>
  .lateral {
    width: var(--largura-lateral);
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--fundo-painel);
    border-right: 1px solid var(--borda);
    padding: 6px;
  }
  .lateral.recolhida {
    width: 52px;
  }
  .topo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px;
  }
  .topo .rotulo-secao {
    margin: 0;
  }
  ul {
    list-style: none;
    margin: 4px 0;
    padding: 0;
    flex: 1;
    overflow: auto;
  }
  li {
    display: flex;
    align-items: center;
    gap: 4px;
    border-radius: var(--raio-s);
    padding-right: 2px;
  }
  li.atual {
    background: var(--fundo-cartao);
  }
  .grupo {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 6px;
    border: 0;
    background: none;
    text-align: left;
  }
  .cor {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: var(--cor);
    flex: none;
  }
  .nome {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .contagem {
    color: var(--texto-3);
  }
  .selo {
    min-width: 16px;
    height: 16px;
    border-radius: 8px;
    background: var(--aviso);
    color: #111;
    font-size: 10px;
    line-height: 16px;
    text-align: center;
  }
  .acoes {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
</style>

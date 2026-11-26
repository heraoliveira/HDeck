<script lang="ts">
  import { t, tDinamico } from '@shared/i18n/index.ts'
  import { calcularEspacos } from '@shared/layout/layout.ts'
  import { type Divisao, divisaoSchema, type Grupo, type RetanguloNorm, type Visao } from '@shared/tipos/dominio.ts'
  import { chamar } from '../estado/api.ts'
  import Modal from './Modal.svelte'

  /** Seletor de visão e divisão com prévia em miniatura (Seção 7.2) e editor da Personalizada. */
  let { grupo, aoFechar }: { grupo: Grupo; aoFechar: () => void } = $props()
  const visoes: Visao[] = ['grade', 'principal', 'foco', 'painel']
  const divisoes = divisaoSchema.options
  let editando = $state(grupo.layout.divisao === 'personalizada')
  let colunas = $state(cortesIniciais('x'))
  let linhas = $state(cortesIniciais('y'))

  function cortesIniciais(eixo: 'x' | 'y'): number[] {
    const p = grupo.layout.personalizada
    if (p.length === 0) return [0.5]
    const v = [...new Set(p.map((r) => (eixo === 'x' ? r.x : r.y)).filter((n) => n > 0.001))].sort()
    return v.length > 0 ? v : [0.5]
  }

  async function escolher(visao: Visao, divisao?: Divisao) {
    await chamar('grupos.layout', { id: grupo.id, visao, ...(divisao ? { layout: { divisao } } : {}) })
    if (divisao === 'personalizada') editando = true
    else aoFechar()
  }

  /** A grade personalizada vira retângulos sem sobreposição (RN-042). */
  function retangulos(): RetanguloNorm[] {
    const xs = [0, ...colunas, 1]
    const ys = [0, ...linhas, 1]
    const out: RetanguloNorm[] = []
    for (let j = 0; j < ys.length - 1; j++)
      for (let i = 0; i < xs.length - 1; i++)
        out.push({ x: xs[i]!, y: ys[j]!, l: Math.max(0.02, xs[i + 1]! - xs[i]!), a: Math.max(0.02, ys[j + 1]! - ys[j]!) })
    return out.slice(0, 16)
  }
  async function salvarPersonalizada() {
    await chamar('grupos.layout', { id: grupo.id, visao: 'grade', layout: { divisao: 'personalizada', personalizada: retangulos() } })
    aoFechar()
  }

  let area: HTMLDivElement | undefined = $state()
  function arrastar(e: PointerEvent, eixo: 'x' | 'y', i: number) {
    const el = area
    if (!el) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const mover = (ev: PointerEvent) => {
      const b = el.getBoundingClientRect()
      const lista = eixo === 'x' ? colunas : linhas
      const min = (lista[i - 1] ?? 0) + 0.08
      const max = (lista[i + 1] ?? 1) - 0.08
      const v = eixo === 'x' ? (ev.clientX - b.left) / b.width : (ev.clientY - b.top) / b.height
      lista[i] = Math.min(max, Math.max(min, v))
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }
  function tecla(e: KeyboardEvent, eixo: 'x' | 'y', i: number) {
    const lista = eixo === 'x' ? colunas : linhas
    const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 0.02 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -0.02 : 0
    if (!passo) return
    e.preventDefault()
    lista[i] = Math.min((lista[i + 1] ?? 1) - 0.08, Math.max((lista[i - 1] ?? 0) + 0.08, lista[i]! + passo))
  }
  const previa = (d: Divisao) => calcularEspacos(d, { largura: 64, altura: 40 }, { contas: 4, personalizada: grupo.layout.personalizada })
</script>

<Modal titulo={t('titulo.divisao')} {aoFechar} largura={720}>
  <div class="rotulo-secao">{t('titulo.visao')}</div>
  <div class="opcoes">
    {#each visoes as v (v)}
      <button class="opcao" class:atual={grupo.visao === v} onclick={() => escolher(v)}>{tDinamico(`visao.${v}`)}</button>
    {/each}
  </div>
  <div class="rotulo-secao">{t('titulo.divisao')}</div>
  <div class="opcoes" role="radiogroup" aria-label={t('titulo.divisao')}>
    {#each divisoes as d (d)}
      <button class="opcao previa" role="radio" aria-checked={grupo.visao === 'grade' && grupo.layout.divisao === d} onclick={() => escolher('grade', d)}>
        <svg width="64" height="40" viewBox="0 0 64 40" aria-hidden="true">
          {#each previa(d) as r, i (i)}<rect x={r.x + 1} y={r.y + 1} width={Math.max(1, r.largura - 2)} height={Math.max(1, r.altura - 2)} rx="2" />{/each}
        </svg>
        <span>{tDinamico(`divisao.${d}`)}</span>
      </button>
    {/each}
  </div>
  <div class="linha extras">
    <label class="linha"><input type="checkbox" checked={grupo.layout.proporcao169} onchange={(e) => chamar('grupos.layout', { id: grupo.id, layout: { proporcao169: e.currentTarget.checked } })} />{t('divisao.proporcao')}</label>
    <select class="campo" style:width="auto" value={grupo.layout.faixaMiniaturas} onchange={(e) => chamar('grupos.layout', { id: grupo.id, layout: { faixaMiniaturas: e.currentTarget.value as 'direita' | 'embaixo' } })}>
      <option value="direita">{t('divisao.faixaDireita')}</option>
      <option value="embaixo">{t('divisao.faixaEmbaixo')}</option>
    </select>
  </div>
  {#if editando}
    <div class="rotulo-secao">{t('divisao.editar')}</div>
    <div class="editor" bind:this={area}>
      {#each retangulos() as r, i (i)}
        <div class="celula" style:left="{r.x * 100}%" style:top="{r.y * 100}%" style:width="{r.l * 100}%" style:height="{r.a * 100}%">{i + 1}</div>
      {/each}
      {#each colunas as c, i (i)}
        <div class="divisoria v" style:left="{c * 100}%" role="slider" tabindex="0" aria-valuenow={Math.round(c * 100)} aria-label={t('divisao.editar')} onpointerdown={(e) => arrastar(e, 'x', i)} onkeydown={(e) => tecla(e, 'x', i)}></div>
      {/each}
      {#each linhas as l, i (i)}
        <div class="divisoria h" style:top="{l * 100}%" role="slider" tabindex="0" aria-valuenow={Math.round(l * 100)} aria-label={t('divisao.editar')} onpointerdown={(e) => arrastar(e, 'y', i)} onkeydown={(e) => tecla(e, 'y', i)}></div>
      {/each}
    </div>
    <div class="linha">
      <button class="botao" disabled={colunas.length >= 3} onclick={() => (colunas = [...colunas, ((colunas.at(-1) ?? 0) + 1) / 2].sort())}>+ |</button>
      <button class="botao" disabled={colunas.length <= 0} onclick={() => (colunas = colunas.slice(0, -1))}>− |</button>
      <button class="botao" disabled={linhas.length >= 3} onclick={() => (linhas = [...linhas, ((linhas.at(-1) ?? 0) + 1) / 2].sort())}>+ —</button>
      <button class="botao" disabled={linhas.length <= 0} onclick={() => (linhas = linhas.slice(0, -1))}>− —</button>
      <span class="cresce"></span>
      <button class="botao primario" onclick={salvarPersonalizada}>{t('comum.salvar')}</button>
    </div>
  {/if}
</Modal>

<style>
  .opcoes {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .opcao {
    padding: 8px 12px;
    border: 1px solid var(--borda);
    border-radius: var(--raio-m);
    background: var(--fundo-cartao);
  }
  .opcao.atual,
  .opcao[aria-checked='true'] {
    border-color: var(--destaque);
  }
  .previa {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 104px;
    font-size: var(--t12);
  }
  .previa rect {
    fill: var(--fundo-cartao-hover);
    stroke: var(--texto-3);
  }
  .extras {
    margin-top: 12px;
    gap: 16px;
  }
  .editor {
    position: relative;
    aspect-ratio: 16 / 9;
    max-height: 260px;
    margin-bottom: 10px;
    border: 1px solid var(--borda);
    border-radius: var(--raio-s);
    background: var(--fundo-app);
  }
  .celula {
    position: absolute;
    display: grid;
    place-items: center;
    border: 1px solid var(--borda);
    color: var(--texto-3);
  }
  .divisoria {
    position: absolute;
    background: var(--destaque);
    z-index: 2;
  }
  .divisoria.v {
    top: 0;
    bottom: 0;
    width: 6px;
    margin-left: -3px;
    cursor: col-resize;
  }
  .divisoria.h {
    left: 0;
    right: 0;
    height: 6px;
    margin-top: -3px;
    cursor: row-resize;
  }
</style>

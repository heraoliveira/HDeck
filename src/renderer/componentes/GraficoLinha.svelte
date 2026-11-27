<script lang="ts">
/** Gráfico de linhas simples em SVG (Painel: RAM e CPU; Ping). */
type Serie = { nome: string; cor: string; pontos: { x: number; y: number | null }[]; unidade: string }
let {
  series,
  altura = 120,
  rotulo,
  legenda = true,
}: { series: Serie[]; altura?: number; rotulo: string; legenda?: boolean } = $props()
const L = 600
const todos = $derived(series.flatMap((s) => s.pontos))
const xMin = $derived(Math.min(...todos.map((p) => p.x)))
const xMax = $derived(Math.max(...todos.map((p) => p.x)))
function caminho(s: Serie): string {
  const ys = s.pontos.map((p) => p.y).filter((y): y is number => y !== null)
  const max = Math.max(1, ...ys)
  const larg = Math.max(1, xMax - xMin)
  let d = ''
  let novo = true
  for (const p of s.pontos) {
    if (p.y === null) {
      novo = true
      continue
    }
    const x = ((p.x - xMin) / larg) * L
    const y = altura - 6 - (p.y / max) * (altura - 16)
    d += `${novo ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    novo = false
  }
  return d
}
const maximo = (s: Serie) => Math.round(Math.max(0, ...s.pontos.map((p) => p.y ?? 0)))
</script>

<figure class="grafico" aria-label={rotulo}>
  {#if todos.length < 2}
    <div class="vazio muted pequeno" style:height="{altura}px">—</div>
  {:else}
    <svg viewBox="0 0 {L} {altura}" preserveAspectRatio="none" role="img" aria-label={rotulo} style:height="{altura}px">
      {#each series as s (s.nome)}
        <path d={caminho(s)} fill="none" stroke={s.cor} stroke-width="1.6" vector-effect="non-scaling-stroke" />
      {/each}
    </svg>
  {/if}
  {#if legenda}<figcaption class="pequeno">
    {#each series as s (s.nome)}
      <span><i style:background={s.cor}></i>{s.nome} · máx {maximo(s)} {s.unidade}</span>
    {/each}
  </figcaption>{/if}
</figure>

<style>
  .grafico {
    margin: 0;
  }
  svg {
    width: 100%;
    height: 120px;
    display: block;
    background: var(--fundo-app);
    border-radius: var(--raio-s);
  }
  .vazio {
    height: 120px;
    display: grid;
    place-items: center;
    background: var(--fundo-app);
    border-radius: var(--raio-s);
  }
  figcaption {
    display: flex;
    gap: 14px;
    margin-top: 6px;
    color: var(--texto-2);
  }
  i {
    display: inline-block;
    width: 10px;
    height: 3px;
    margin-right: 5px;
    vertical-align: middle;
  }
</style>

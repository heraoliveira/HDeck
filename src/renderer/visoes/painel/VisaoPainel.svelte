<script lang="ts">
import { type ChaveTexto, t } from '@shared/i18n/index.ts'
import type { AcaoLote, PainelDados } from '@shared/ipc/contrato.ts'
import GraficoLinha from '../../componentes/GraficoLinha.svelte'
import { chamar, tentar } from '../../estado/api.ts'
import { loja, mensagem } from '../../estado/loja.svelte.ts'
import CartaoConta from './CartaoConta.svelte'

let dados = $state<PainelDados | null>(null)
let agora = $state(Date.now())
let ordem: 'nome' | 'estado' | 'ram' | 'quedas' = $state('nome')
let filtro: 'todas' | 'ligadas' | 'problemas' = $state('todas')
let ultimoClique: string | null = null

$effect(() => {
  void chamar('painel.aberto', { aberto: true })
  const carregar = async () => {
    dados = await tentar<'painel.dados', PainelDados>('painel.dados')
    agora = Date.now()
  }
  void carregar()
  const h = setInterval(carregar, 10_000)
  const r = setInterval(() => (agora = Date.now()), 1000)
  return () => {
    clearInterval(h)
    clearInterval(r)
    void chamar('painel.aberto', { aberto: false }).catch(() => {})
  }
})

const problemas = new Set(['caida', 'travada', 'erro', 'com_aviso'])
const contas = $derived.by(() => {
  const s = loja.snap
  if (!s) return []
  let lista = [...s.contas]
  if (filtro === 'ligadas') lista = lista.filter((c) => s.estados[c.id]?.estado !== 'desligada')
  if (filtro === 'problemas') lista = lista.filter((c) => problemas.has(s.estados[c.id]?.estado ?? ''))
  const ram = (id: string) => loja.metricas?.porConta[id]?.ramMb ?? 0
  return lista.sort((a, b) => {
    if (ordem === 'ram') return ram(b.id) - ram(a.id)
    if (ordem === 'quedas')
      return (dados?.contas[b.id]?.quedasHoje ?? 0) - (dados?.contas[a.id]?.quedasHoje ?? 0)
    if (ordem === 'estado')
      return (s.estados[a.id]?.estado ?? '').localeCompare(s.estados[b.id]?.estado ?? '')
    return a.nome.localeCompare(b.nome, 'pt-BR')
  })
})
const ligadas = $derived(
  Object.values(loja.snap?.estados ?? {}).filter((e) => e.estado !== 'desligada').length,
)
const quedas = $derived(Object.values(dados?.contas ?? {}).reduce((s, c) => s + c.quedasHoje, 0))

/** Seleção múltipla com Ctrl e Shift (Seção 7.4). */
function clicar(e: MouseEvent, id: string) {
  if (e.shiftKey && ultimoClique) {
    const ids = contas.map((c) => c.id)
    const [a, b] = [ids.indexOf(ultimoClique), ids.indexOf(id)].sort((x, y) => x - y) as [number, number]
    loja.selecao = [...new Set([...loja.selecao, ...ids.slice(a, b + 1)])]
  } else if (e.ctrlKey || e.metaKey) {
    loja.selecao = loja.selecao.includes(id) ? loja.selecao.filter((x) => x !== id) : [...loja.selecao, id]
  } else {
    loja.selecao = loja.selecao.length === 1 && loja.selecao[0] === id ? [] : [id]
  }
  ultimoClique = id
}

const acoes: { acao: AcaoLote; rotulo: ChaveTexto }[] = [
  { acao: 'recarregar', rotulo: 'lote.recarregar' },
  { acao: 'recarregarSemCache', rotulo: 'lote.recarregarSemCache' },
  { acao: 'ligar', rotulo: 'lote.ligar' },
  { acao: 'desligar', rotulo: 'lote.desligar' },
  { acao: 'silenciar', rotulo: 'lote.silenciar' },
  { acao: 'ativarSom', rotulo: 'lote.ativarSom' },
  { acao: 'economiaLigar', rotulo: 'lote.economiaLigar' },
  { acao: 'economiaDesligar', rotulo: 'lote.economiaDesligar' },
  { acao: 'manter', rotulo: 'lote.manter' },
  { acao: 'economizar', rotulo: 'lote.economizar' },
  { acao: 'zoom', rotulo: 'lote.zoom' },
  { acao: 'preencher', rotulo: 'lote.preencher' },
  { acao: 'livesLigar', rotulo: 'lote.livesLigar' },
  { acao: 'livesDesligar', rotulo: 'lote.livesDesligar' },
  { acao: 'limparCache', rotulo: 'lote.limparCache' },
  { acao: 'fotos', rotulo: 'lote.fotos' },
]
let grupoDestino = $state('')

async function lote(acao: AcaoLote, extra: { grupoId?: string; confirmado?: boolean } = {}) {
  const ids = loja.selecao.length > 0 ? loja.selecao : contas.map((c) => c.id)
  if (ids.length === 0) return
  const r = await tentar<
    'contas.lote',
    { ok: boolean; excessos?: { jogoNome: string; limite: number; total: number }[] }
  >('contas.lote', { ids, acao, ...extra })
  if (r && !r.ok && r.excessos?.[0]) {
    const e = r.excessos[0]
    loja.dialogos.push({
      qual: 'limite',
      texto: t('limite.texto', { jogo: e.jogoNome, limite: e.limite, total: e.total }),
      aoConfirmar: () => void lote(acao, { ...extra, confirmado: true }),
    })
  } else if (r?.ok)
    mensagem('ok', `${t(acoes.find((a) => a.acao === acao)?.rotulo ?? 'lote.mover')}: ${ids.length}`)
}

const nomeJogo = (id: string) => loja.snap?.jogos.find((j) => j.id === id)?.nome ?? id
</script>

<div class="painel">
  <section class="resumo">
    <div class="numero"><strong>{ligadas}</strong><span>{t('painel.conectadas')}</span></div>
    <div class="numero"><strong>{quedas}</strong><span>{t('painel.quedasHoje')}</span></div>
    <div class="numero">
      <strong>{loja.metricas ? `${(loja.metricas.total.ramMb / 1024).toFixed(1)} GB` : '—'}</strong><span>{t('painel.ram')}</span>
    </div>
    <div class="numero">
      <strong>{loja.metricas ? `${loja.metricas.total.cpuPct.toFixed(0)}%` : '—'}</strong><span>{t('painel.cpu')}</span>
    </div>
  </section>

  <section class="graficos">
    <div>
      <div class="rotulo-secao">{t('painel.grafico24h')}</div>
      <GraficoLinha
        rotulo={t('painel.grafico24h')}
        series={[
          { nome: t('painel.ram'), cor: 'var(--destaque)', unidade: 'MB', pontos: (dados?.serie24h ?? []).map((p) => ({ x: p.em, y: p.ramMb })) },
          { nome: t('painel.cpu'), cor: 'var(--ok)', unidade: '%', pontos: (dados?.serie24h ?? []).map((p) => ({ x: p.em, y: p.cpuPct })) },
        ]}
      />
    </div>
    <div>
      <div class="rotulo-secao">{t('painel.historico30')}</div>
      <GraficoLinha
        rotulo={t('painel.historico30')}
        series={[
          { nome: t('painel.ram'), cor: 'var(--destaque)', unidade: 'MB', pontos: (dados?.serie30d ?? []).map((p) => ({ x: p.em, y: p.ramMb })) },
          { nome: t('painel.cpu'), cor: 'var(--ok)', unidade: '%', pontos: (dados?.serie30d ?? []).map((p) => ({ x: p.em, y: p.cpuPct })) },
        ]}
      />
    </div>
  </section>

  {#if dados && Object.values(dados.ping).some((p) => p.atual !== null || p.serie24h.length > 0)}
    <section>
      <div class="rotulo-secao">{t('painel.ping')}</div>
      <table class="ping">
        <tbody>
          {#each Object.entries(dados.ping).filter(([, p]) => p.serie24h.length > 0) as [jogoId, p] (jogoId)}
            <tr>
              <td>{nomeJogo(jogoId)}</td>
              <td>{p.atual !== null ? `${p.atual} ms` : '—'} <span class="muted">{t('painel.pingAtual')}</span></td>
              <td>{p.media1h !== null ? `${p.media1h} ms` : '—'} <span class="muted">{t('painel.pingMedia')}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  <section class="barra">
    <label class="linha pequeno">
      {t('painel.ordenar')}
      <select class="campo" style:width="auto" bind:value={ordem}>
        <option value="nome">{t('painel.nome')}</option>
        <option value="estado">{t('painel.estado')}</option>
        <option value="ram">{t('painel.ram')}</option>
        <option value="quedas">{t('painel.quedasHoje')}</option>
      </select>
    </label>
    <label class="linha pequeno">
      {t('painel.filtrar')}
      <select class="campo" style:width="auto" bind:value={filtro}>
        <option value="todas">{t('painel.todas')}</option>
        <option value="ligadas">{t('painel.ligadas')}</option>
        <option value="problemas">{t('painel.problemas')}</option>
      </select>
    </label>
    <span class="cresce"></span>
    {#if loja.selecao.length > 0}<span class="pequeno muted">{t('lote.selecionadas', { n: loja.selecao.length })}</span>{/if}
  </section>

  <section class="lote" aria-label={t('lote.titulo')}>
    {#each acoes as a (a.acao)}
      <button class="botao" onclick={() => lote(a.acao)}>{t(a.rotulo)}</button>
    {/each}
    <select class="campo" style:width="auto" bind:value={grupoDestino} aria-label={t('lote.mover')}>
      <option value="">{t('lote.mover')}…</option>
      {#each loja.snap?.grupos ?? [] as g (g.id)}<option value={g.id}>{g.nome}</option>{/each}
    </select>
    <button class="botao" disabled={!grupoDestino} onclick={() => lote('mover', { grupoId: grupoDestino })}>{t('lote.mover')}</button>
  </section>

  <section class="cartoes">
    {#each contas as c (c.id)}
      <CartaoConta conta={c} resumo={dados?.contas[c.id]} selecionada={loja.selecao.includes(c.id)} {agora} aoClicar={(e) => clicar(e, c.id)} />
    {/each}
  </section>
</div>

<style>
  .painel {
    height: 100%;
    overflow: auto;
    padding-right: 6px;
  }
  .resumo {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }
  .numero {
    display: flex;
    flex-direction: column;
    padding: 12px 14px;
    border-radius: var(--raio-m);
    background: var(--fundo-cartao);
    border: 1px solid var(--borda);
  }
  .numero strong {
    font-size: var(--t20);
  }
  .numero span {
    color: var(--texto-2);
    font-size: var(--t12);
  }
  .graficos {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .barra,
  .lote {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 14px 0 8px;
  }
  .lote .botao {
    height: 26px;
    font-size: var(--t12);
  }
  .cartoes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
    padding-bottom: 20px;
  }
  .ping {
    border-collapse: collapse;
  }
  .ping td {
    padding: 4px 16px 4px 0;
  }
</style>

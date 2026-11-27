<script lang="ts">
import { t } from '@shared/i18n/index.ts'
import type { DetalheConta } from '@shared/ipc/contrato.ts'
import type { EventoConta } from '@shared/tipos/dominio.ts'
import { formatarDuracao } from '@shared/util/texto.ts'
import GraficoLinha from '../componentes/GraficoLinha.svelte'
import Icone from '../componentes/Icone.svelte'
import { chamar } from '../estado/api.ts'
import { abrirDialogo, grupoAtual, loja } from '../estado/loja.svelte.ts'

/**
 * Painel direito (pedido da dona, 2026-11-27): as configurações e o consumo da conta selecionada.
 * Recolhe para uma faixa fina, como a barra dos grupos.
 */
const s = $derived(loja.snap!)
const grupo = $derived(grupoAtual())
const contasDoGrupo = $derived(s.contas.filter((c) => c.grupoId === grupo?.id))
const c = $derived(contasDoGrupo.find((x) => x.id === s.ativaId) ?? contasDoGrupo[0])
const est = $derived(c ? s.estados[c.id] : undefined)
const ligada = $derived((est?.estado ?? 'desligada') !== 'desligada')
const atual = $derived(c ? loja.metricas?.porConta[c.id] : undefined)
const jogo = $derived(s.jogos.find((j) => j.id === c?.jogoId))
const mostrarLives = $derived(s.config.lives.mostrarEmTodas || (jogo?.bonusLive ?? false))
const livesDaConta = $derived(s.lives.filter((l) => l.contaId === c?.id))
const otimizarMin = $derived(s.config.otimizacao.otimizarACadaMin)

let detalhe: DetalheConta | null = $state(null)
let agora = $state(Date.now())

async function carregar(id: string) {
  detalhe = await chamar<'contas.detalhe', DetalheConta>('contas.detalhe', { id }).catch(() => null)
}

$effect(() => {
  const id = c?.id
  if (!id || loja.direitaRecolhida) return
  void carregar(id)
  const t1 = setInterval(() => void carregar(id), 15_000)
  const t2 = setInterval(() => (agora = Date.now()), 1000)
  return () => {
    clearInterval(t1)
    clearInterval(t2)
  }
})

function alternar() {
  loja.direitaRecolhida = !loja.direitaRecolhida
  try {
    localStorage.setItem('hdeck.direitaRecolhida', loja.direitaRecolhida ? '1' : '0')
  } catch {
    // sem armazenamento: só não lembra
  }
}

const pontos = (campo: 'ramMb' | 'cpuPct') => {
  const serie = (detalhe?.serieHora ?? []).map((p) => ({ x: p.em, y: p[campo] }))
  if (atual) serie.push({ x: agora, y: atual[campo] })
  return serie
}

const MOTIVOS: Record<string, string> = {
  queda: 'pd.r.queda',
  travou: 'pd.r.travou',
  fechou: 'pd.r.fechou',
  site_fora: 'pd.r.siteFora',
  internet: 'pd.r.internet',
  programada: 'pd.r.programada',
  memoria: 'pd.r.memoria',
  manual: 'pd.r.manual',
  suspensao: 'pd.r.suspensao',
  otimizar: 'pd.r.otimizar',
}
function textoEvento(e: EventoConta): string {
  if (e.tipo === 'recarga') {
    const chave = MOTIVOS[e.motivo]
    return chave ? t(chave as 'pd.r.manual') : t('pd.r.outro', { motivo: e.motivo })
  }
  return `${t(`pd.e.${e.tipo}` as 'pd.e.queda')}: ${e.motivo}`
}
const hora = (em: number) => new Date(em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const iniciais = (n: string) =>
  n
    .replace(/[^\p{L}\p{N}]/gu, '')
    .slice(0, 2)
    .toUpperCase() || '?'

function mais(ev: MouseEvent) {
  if (!c) return
  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  abrirDialogo({ qual: 'painelConta', id: c.id, x: Math.max(8, r.left - 300), y: Math.max(48, r.top - 520) })
}
</script>

<aside class="direita" class:recolhida={loja.direitaRecolhida} aria-label={t('pd.titulo')}>
  <div class="topo">
    <button class="icone-botao" aria-label={loja.direitaRecolhida ? t('pd.expandir') : t('pd.recolher')} onclick={alternar}>
      <Icone nome={loja.direitaRecolhida ? 'seta' : 'descer'} tamanho={14} />
    </button>
    {#if !loja.direitaRecolhida && c}
      <span class="avatar" style:--cor={c.cor}>{iniciais(c.nome)}</span>
      <div class="cresce titulo">
        <div class="nome">{c.nome}</div>
        <div class="sub">
          {t(`estado.${est?.estado ?? 'desligada'}` as 'estado.ativa')}{#if est?.onlineDesde}
            · {t('pd.ligadaHa', { tempo: formatarDuracao(agora - est.onlineDesde) })}{/if}
        </div>
      </div>
    {/if}
  </div>

  {#if !loja.direitaRecolhida}
    {#if !c}
      <p class="muted vazio">{t('pd.semConta')}</p>
    {:else}
      <div class="rolagem">
        <div class="acoes">
          <button class="acao" disabled={!ligada} onclick={() => chamar('contas.inicio', { id: c.id })}><Icone nome="casa" />{t('pc.inicio')}</button>
          <button class="acao" disabled={!ligada} onclick={() => chamar('contas.lote', { ids: [c.id], acao: 'recarregar' })}><Icone nome="recarregar" />{t('pc.recarregar')}</button>
          <button class="acao" class:ligado={c.som} onclick={() => chamar('contas.editar', { id: c.id, som: !c.som })}><Icone nome={c.som ? 'som' : 'mudo'} />{t('pd.som')}</button>
          <button class="acao" disabled={!ligada} onclick={() => chamar('contas.soltar', { id: c.id })}><Icone nome="janelaPropria" />{t('pd.destacar')}</button>
        </div>

        {#if mostrarLives}
          <section>
            <h3>{t('pd.lives')}</h3>
            {#if livesDaConta.length === 0}
              <p class="muted pequeno">{t('pd.semLives')}</p>
            {:else}
              {#each livesDaConta as l (l.id)}
                <div class="linha"><Icone nome="live" /><span class="cresce">{l.canal}</span><span class="pequeno muted">{l.plataforma}</span></div>
              {/each}
            {/if}
            <button class="botao fino" onclick={() => abrirDialogo({ qual: 'lives', id: c.id })}>{t('pd.abrirLives')}</button>
          </section>
        {/if}

        <section>
          <h3>{t('pd.consumo')}</h3>
          <div class="medida"><span>{t('pd.memoria')}</span><b>{atual ? `${Math.round(atual.ramMb)} MB` : '—'}</b></div>
          <GraficoLinha rotulo={t('pd.memoria')} altura={44} legenda={false} series={[{ nome: t('pd.memoria'), cor: 'var(--destaque)', pontos: pontos('ramMb'), unidade: 'MB' }]} />
          <div class="medida"><span>{t('pd.cpu')}</span><b>{atual ? `${atual.cpuPct.toFixed(1)}%` : '—'}</b></div>
          <GraficoLinha rotulo={t('pd.cpu')} altura={44} legenda={false} series={[{ nome: t('pd.cpu'), cor: 'var(--ok)', pontos: pontos('cpuPct'), unidade: '%' }]} />
        </section>

        <section>
          <h3>{t('pc.otimizar')}</h3>
          <button class="cartao-otimizar" disabled={!ligada} onclick={() => chamar('contas.lote', { ids: [c.id], acao: 'otimizar' })}>
            <Icone nome="brilho" />
            <span class="cresce"><b>{t('pc.otimizar')}</b><small>{t('pd.otimizarTexto')}</small></span>
          </button>
          <button class="link pequeno" onclick={() => abrirDialogo({ qual: 'configuracoes', busca: t('cfg.otimizarACadaMin.t') })}>
            {#if otimizarMin > 0}
              {t('pd.sozinho', { min: otimizarMin })}{#if detalhe?.proximaOtimizacao}
                · {t('pd.proxima', { tempo: formatarDuracao(Math.max(0, detalhe.proximaOtimizacao - agora)) })}{/if}
            {:else}
              {t('pd.sozinhoDesligado')}
            {/if}
          </button>
        </section>

        <section>
          <h3>{t('pd.historico')}</h3>
          {#if (detalhe?.historico.length ?? 0) === 0}
            <p class="muted pequeno">{t('pd.semHistorico')}</p>
          {:else}
            <ul class="historico">
              {#each detalhe!.historico as e, i (i)}
                <li><span class="quando">{hora(e.em)}</span><span>{textoEvento(e)}</span></li>
              {/each}
            </ul>
          {/if}
        </section>
      </div>

      <div class="rodape">
        <button class="acao" onclick={() => grupo && chamar('grupos.layout', { id: grupo.id, visao: 'foco' }).then(() => (loja.focoContaId = c.id))}><Icone nome="foco" />{t('pd.foco')}</button>
        {#if ligada}
          <button class="acao" onclick={() => chamar('contas.lote', { ids: [c.id], acao: 'desligar' })}><Icone nome="ligar" />{t('pc.desligar')}</button>
        {:else}
          <button class="acao" onclick={() => chamar('contas.lote', { ids: [c.id], acao: 'ligar', confirmado: true })}><Icone nome="ligar" />{t('pc.ligar')}</button>
        {/if}
        <button class="acao" onclick={mais}><Icone nome="mais" />{t('pd.mais')}</button>
      </div>
    {/if}
  {/if}
</aside>

<style>
  .direita {
    width: 280px;
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--fundo-lateral);
    color: var(--lateral-texto);
    border-left: 1px solid var(--borda);
    min-height: 0;
  }
  .direita.recolhida {
    width: 40px;
  }
  .topo {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 10px 8px;
    border-bottom: 1px solid var(--borda);
  }
  .recolhida .topo {
    justify-content: center;
    padding: 10px 4px;
    border-bottom: 0;
  }
  .titulo {
    min-width: 0;
  }
  .nome {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    font-size: var(--t12);
    opacity: 0.75;
  }
  .avatar {
    width: 28px;
    height: 28px;
    flex: none;
    border-radius: 8px;
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    background: color-mix(in srgb, var(--cor) 30%, transparent);
    color: var(--texto);
  }
  .rolagem {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .acoes,
  .rodape {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .rodape {
    grid-template-columns: repeat(3, 1fr);
    padding: 10px;
    border-top: 1px solid var(--borda);
  }
  .acao {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 4px;
    border-radius: var(--raio-m);
    border: 1px solid var(--borda);
    background: var(--fundo-cartao);
    color: inherit;
    font-size: var(--t12);
    cursor: pointer;
  }
  .acao:hover:not(:disabled) {
    border-color: var(--destaque);
  }
  .acao:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .acao.ligado {
    color: var(--ok);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  h3 {
    margin: 0;
    font-size: var(--t13);
  }
  .linha,
  .medida {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--t12);
  }
  .medida {
    justify-content: space-between;
  }
  .cartao-otimizar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    text-align: left;
    border-radius: var(--raio-m);
    border: 1px solid var(--borda);
    background: var(--fundo-cartao);
    color: inherit;
    cursor: pointer;
  }
  .cartao-otimizar small {
    display: block;
    opacity: 0.75;
  }
  .cartao-otimizar:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    color: var(--destaque);
    text-align: left;
    cursor: pointer;
  }
  .historico {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: var(--t12);
  }
  .historico li {
    display: grid;
    grid-template-columns: 42px 1fr;
    gap: 6px;
  }
  .quando {
    opacity: 0.7;
  }
  .vazio {
    padding: 12px;
  }
  .fino {
    align-self: flex-start;
  }
</style>

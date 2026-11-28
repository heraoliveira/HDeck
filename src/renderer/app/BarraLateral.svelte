<script lang="ts">
import { t } from '@shared/i18n/index.ts'
import type { Conta } from '@shared/tipos/dominio.ts'
import Icone from '../componentes/Icone.svelte'
import Interruptor from '../componentes/Interruptor.svelte'
import { chamar } from '../estado/api.ts'
import { abrirDialogo, contasDoGrupo, grupoAtual, loja } from '../estado/loja.svelte.ts'

/**
 * Barra lateral (Seção 12.2): grupos expansíveis com as contas embaixo. Arrastar uma conta
 * dentro do grupo muda a ordem (RN-036); para outro grupo, pede confirmação (RN-038).
 * Clique com o botão direito ou ⋯ abre o painel do grupo ou da conta (RN-007).
 */
const s = $derived(loja.snap)
const grupos = $derived([...(s?.grupos ?? [])].sort((a, b) => a.ordem - b.ordem))
let fechados = $state<Record<string, boolean>>({})
let arrastando: { tipo: 'conta' | 'grupo'; id: string } | null = $state(null)
let alvo: { grupoId: string; posicao: number } | null = $state(null)

const estado = (id: string) => s?.estados[id]?.estado ?? 'desligada'
const ram = (id: string) => loja.metricas?.porConta[id]?.ramMb ?? 0
const formatarRam = (mb: number) =>
  mb >= 1024 ? `${(mb / 1024).toFixed(1).replace('.', ',')} GB` : `${Math.round(mb)} MB`
const iniciais = (n: string) =>
  n
    .replace(/[^\p{L}\p{N}]/gu, '')
    .slice(0, 2)
    .toUpperCase() || '?'
const problemas = new Set(['caida', 'erro', 'travada', 'com_aviso'])

function resumo(grupoId: string) {
  const contas = contasDoGrupo(grupoId)
  const ligadas = contas.filter((c) => estado(c.id) !== 'desligada')
  const total = ligadas.reduce((x, c) => x + ram(c.id), 0)
  return t('pg.resumo', { ligadas: ligadas.length, total: contas.length, ram: formatarRam(total) })
}

async function ligar(id: string, ligado: boolean) {
  const r = await chamar<
    'grupos.ligar',
    { ok: boolean; excessos?: { jogoNome: string; limite: number; total: number }[] }
  >('grupos.ligar', { id, ligado })
  if (!r.ok && r.excessos?.[0]) {
    const e = r.excessos[0]
    loja.dialogos.push({
      qual: 'limite',
      texto: t('limite.texto', { jogo: e.jogoNome, limite: e.limite, total: e.total }),
      aoConfirmar: () => void chamar('grupos.ligar', { id, ligado, confirmado: true }),
    })
  }
}

function painelGrupo(e: MouseEvent, id: string) {
  e.preventDefault()
  abrirDialogo({ qual: 'painelGrupo', id, x: e.clientX + 4, y: e.clientY })
}
function painelConta(e: MouseEvent, id: string) {
  e.preventDefault()
  abrirDialogo({ qual: 'painelConta', id, x: e.clientX + 4, y: e.clientY })
}
function abrirConta(c: Conta) {
  void chamar('grupos.selecionar', { id: c.grupoId })
  void chamar('contas.ativar', { id: c.id })
  loja.focoContaId = c.id
}

function comecarConta(e: DragEvent, c: Conta) {
  arrastando = { tipo: 'conta', id: c.id }
  e.dataTransfer?.setData('application/x-hdeck-conta', c.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function sobreConta(e: DragEvent, grupoId: string, indice: number) {
  if (arrastando?.tipo !== 'conta') return
  e.preventDefault()
  const b = (e.currentTarget as HTMLElement).getBoundingClientRect()
  alvo = { grupoId, posicao: e.clientY > b.top + b.height / 2 ? indice + 1 : indice }
}
function sobreGrupo(e: DragEvent, grupoId: string) {
  if (!arrastando) return
  e.preventDefault()
  if (arrastando.tipo === 'conta' && alvo?.grupoId !== grupoId) alvo = { grupoId, posicao: 9999 }
}
function terminar() {
  arrastando = null
  alvo = null
}

/** RN-036 / RN-038 */
function soltar(e: DragEvent, grupoId: string) {
  e.preventDefault()
  const a = arrastando
  const destino = alvo
  terminar()
  if (!a) return
  if (a.tipo === 'grupo') {
    if (a.id === grupoId) return
    const ids = grupos.map((g) => g.id).filter((x) => x !== a.id)
    ids.splice(ids.indexOf(grupoId), 0, a.id)
    void chamar('grupos.reordenar', { ids })
    return
  }
  const c = s?.contas.find((x) => x.id === a.id)
  if (!c) return
  const lista = contasDoGrupo(grupoId).filter((x) => x.id !== c.id)
  let posicao = Math.min(destino?.grupoId === grupoId ? destino.posicao : lista.length, lista.length + 1)
  if (c.grupoId === grupoId) {
    // Mesma lista: a posição de soltura conta sem a própria conta.
    const antes = contasDoGrupo(grupoId).findIndex((x) => x.id === c.id)
    if (antes < posicao) posicao--
    void chamar('contas.mover', { id: c.id, grupoId, posicao: Math.max(0, posicao) })
    return
  }
  const g = s?.grupos.find((x) => x.id === grupoId)
  abrirDialogo({
    qual: 'confirmar',
    titulo: t('mover.titulo'),
    texto: t('mover.texto', { conta: c.nome, grupo: g?.nome ?? '' }),
    botao: t('mover.botao'),
    aoConfirmar: () => void chamar('contas.mover', { id: c.id, grupoId, posicao: Math.max(0, posicao) }),
  })
}
</script>

<aside class="lateral" class:recolhida={loja.lateralRecolhida} aria-label={t('lateral.grupos')}>
  <div class="topo">
    {#if !loja.lateralRecolhida}<span class="rotulo-secao">{t('lateral.grupos')}</span>{/if}
    <button class="icone-botao" aria-label={t('lateral.recolher')} onclick={() => (loja.lateralRecolhida = !loja.lateralRecolhida)}><Icone nome="menu" /></button>
  </div>
  <div class="lista">
    {#each grupos as g (g.id)}
      {@const contas = contasDoGrupo(g.id)}
      {@const aberto = !fechados[g.id] && !loja.lateralRecolhida}
      <section
        class="grupo"
        class:atual={grupoAtual()?.id === g.id}
        class:soltando={arrastando && alvo?.grupoId === g.id}
        style:--cor={g.cor}
        ondragover={(e) => sobreGrupo(e, g.id)}
        ondrop={(e) => soltar(e, g.id)}
        aria-label={g.nome}
      >
        {#if loja.lateralRecolhida}
          <!-- Recolhida: só as contas do grupo, na cor dele (clique abre; botão direito, o painel). -->
          <div class="compacto" title={`${g.nome} · ${resumo(g.id)}`}>
            {#each contas as c (c.id)}
              <button
                class="mini-conta"
                class:ativa={s?.ativaId === c.id}
                class:desligada={estado(c.id) === 'desligada'}
                title={c.nome}
                aria-label={c.nome}
                onclick={() => abrirConta(c)}
                oncontextmenu={(e) => painelConta(e, c.id)}
              >
                <span class="avatar" style:--cor-conta={c.cor}>
                  {iniciais(c.nome)}
                  <span class="status" data-estado={estado(c.id)} class:problema={problemas.has(estado(c.id))}></span>
                </span>
              </button>
            {:else}
              <button class="mini-conta" aria-label={g.nome} title={g.nome} onclick={() => chamar('grupos.selecionar', { id: g.id })} oncontextmenu={(e) => painelGrupo(e, g.id)}><span class="avatar" style:--cor-conta={g.cor}>{iniciais(g.nome)}</span></button>
            {/each}
            <button class="mini-grupo" aria-label={`${g.nome} ⋯`} title={g.nome} onclick={(e) => painelGrupo(e, g.id)} oncontextmenu={(e) => painelGrupo(e, g.id)}><Icone nome="pontos" tamanho={12} /></button>
          </div>
        {:else}
        <div
          class="cabeca"
          role="button"
          tabindex="0"
          draggable="true"
          ondragstart={() => (arrastando = { tipo: 'grupo', id: g.id })}
          ondragend={terminar}
          oncontextmenu={(e) => painelGrupo(e, g.id)}
          onclick={() => chamar('grupos.selecionar', { id: g.id })}
          onkeydown={(e) => e.key === 'Enter' && chamar('grupos.selecionar', { id: g.id })}
        >
          <button
            class="seta"
            aria-label={aberto ? t('lateral.recolher') : g.nome}
            aria-expanded={aberto}
            onclick={(e) => {
              e.stopPropagation()
              fechados[g.id] = !fechados[g.id]
            }}><Icone nome={aberto ? 'descer' : 'seta'} tamanho={14} /></button
          >
          <span class="ponto"></span>
          {#if !loja.lateralRecolhida}
            <div class="textos cresce">
              <div class="nome">{g.nome}</div>
              <div class="resumo">{resumo(g.id)}</div>
            </div>
            <span role="presentation" onclick={(e) => e.stopPropagation()}>
              <Interruptor ligado={g.ligado} rotulo={g.ligado ? t('lateral.desligar') : t('lateral.ligar')} aoMudar={(v) => ligar(g.id, v)} />
            </span>
            <button
              class="mini"
              aria-label="{g.nome} ⋯"
              onclick={(e) => {
                e.stopPropagation()
                painelGrupo(e, g.id)
              }}><Icone nome="pontos" tamanho={14} /></button
            >
          {/if}
        </div>
        {/if}
        {#if aberto}
          <ul>
            {#each contas as c, i (c.id)}
              <li
                class:ativa={s?.ativaId === c.id}
                class:arrastada={arrastando?.id === c.id}
                class:linha-antes={alvo?.grupoId === g.id && alvo.posicao === i}
                class:linha-depois={alvo?.grupoId === g.id && alvo.posicao === i + 1 && i === contas.length - 1}
                draggable="true"
                ondragstart={(e) => comecarConta(e, c)}
                ondragend={terminar}
                ondragover={(e) => sobreConta(e, g.id, i)}
                oncontextmenu={(e) => painelConta(e, c.id)}
              >
                <button class="conta" onclick={() => abrirConta(c)} title={c.nome}>
                  <span class="avatar" style:--cor-conta={c.cor}>
                    {iniciais(c.nome)}
                    <span class="status" data-estado={estado(c.id)} class:problema={problemas.has(estado(c.id))}></span>
                  </span>
                  <span class="cresce nome-conta">{c.nome}</span>
                  {#if ram(c.id) > 0}<span class="ram">{formatarRam(ram(c.id))}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
          <button class="nova" onclick={() => abrirDialogo({ qual: 'adicionarConta', grupoId: g.id })}><Icone nome="mais" tamanho={14} />{t('lateral.novaConta')}</button>
        {/if}
      </section>
    {/each}
  </div>
  {#if !loja.lateralRecolhida}
    <div class="acoes">
      <button class="botao" onclick={() => abrirDialogo({ qual: 'novoGrupo' })}><Icone nome="mais" />{t('lateral.novoGrupo')}</button>
    </div>
  {:else}
    <button class="mini-novo" aria-label={t('lateral.novoGrupo')} title={t('lateral.novoGrupo')} onclick={() => abrirDialogo({ qual: 'novoGrupo' })}><Icone nome="mais" /></button>
  {/if}
</aside>

<style>
  .lateral {
    width: var(--largura-lateral);
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--fundo-lateral);
    color: var(--lateral-texto);
    border-right: 1px solid var(--borda);
    padding: 6px;
  }
  .lateral.recolhida {
    width: 64px;
  }
  .compacto {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 6px 0;
  }
  .mini-conta {
    padding: 1px;
    border: 2px solid transparent;
    border-radius: 9px;
    background: none;
    cursor: pointer;
  }
  .mini-conta:hover {
    border-color: color-mix(in srgb, var(--cor) 60%, transparent);
  }
  .mini-conta.ativa {
    border-color: var(--destaque);
  }
  .mini-conta.desligada .avatar {
    opacity: 0.45;
  }
  .compacto .avatar {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    font-size: 11px;
  }
  .mini-grupo,
  .mini-novo {
    width: 32px;
    height: 18px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--lateral-texto-2);
    cursor: pointer;
  }
  .mini-novo {
    height: 32px;
    margin: 6px auto;
    border: 1px dashed var(--borda);
  }
  .mini-grupo:hover,
  .mini-novo:hover {
    color: var(--destaque);
  }
  .recolhida .lista {
    padding: 0 6px;
    overflow-x: hidden;
  }
  .topo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px;
  }
  .topo .rotulo-secao {
    margin: 0;
    color: var(--lateral-texto-2);
  }
  .lateral :global(.icone-botao) {
    color: var(--lateral-texto-2);
  }
  .lista {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 0;
  }
  /* O espaço todo do grupo fica na cor escolhida (cabeça e contas). */
  .grupo {
    border-radius: var(--raio-m);
    border: 1px solid color-mix(in srgb, var(--cor) 45%, transparent);
    background: color-mix(in srgb, var(--cor) 22%, rgb(0 0 0 / 0.35));
  }
  .grupo .cabeca {
    border-radius: var(--raio-m) var(--raio-m) 0 0;
    background: color-mix(in srgb, var(--cor) 30%, transparent);
  }
  .grupo.atual {
    border-color: var(--cor);
    background: color-mix(in srgb, var(--cor) 32%, rgb(0 0 0 / 0.3));
    box-shadow:
      inset 3px 0 0 var(--dourado),
      0 0 0 1px var(--cor);
  }
  .grupo.soltando {
    border-style: dashed;
    border-color: var(--dourado);
  }
  .cabeca {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 6px;
    cursor: pointer;
  }
  .seta,
  .mini {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--lateral-texto-2);
    flex: none;
  }
  .seta:hover,
  .mini:hover {
    background: rgb(255 255 255 / 0.12);
    color: var(--lateral-texto);
  }
  .ponto {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--cor);
    flex: none;
  }
  .textos {
    min-width: 0;
  }
  .nome {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .resumo {
    font-size: 11px;
    color: var(--lateral-texto-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 4px 4px;
  }
  li {
    border-radius: var(--raio-s);
    border-top: 2px solid transparent;
    border-bottom: 2px solid transparent;
  }
  li.linha-antes {
    border-top-color: var(--dourado);
  }
  li.linha-depois {
    border-bottom-color: var(--dourado);
  }
  li.ativa {
    background: rgb(255 255 255 / 0.1);
  }
  li.arrastada {
    opacity: 0.4;
  }
  .conta {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 6px;
    border: 0;
    background: none;
    color: var(--lateral-texto);
    text-align: left;
    border-radius: var(--raio-s);
  }
  .conta:hover {
    background: rgb(255 255 255 / 0.08);
  }
  .avatar {
    position: relative;
    width: 26px;
    height: 26px;
    border-radius: 7px;
    display: grid;
    place-items: center;
    font-size: 10px;
    font-weight: 800;
    color: #fff;
    background: color-mix(in srgb, var(--cor-conta) 70%, #000);
    flex: none;
  }
  .status {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    border: 2px solid #071a2d;
    background: var(--texto-3);
  }
  .status[data-estado='ativa'],
  .status[data-estado='economica'],
  .status[data-estado='escondida'] {
    background: var(--ok);
  }
  .status[data-estado='carregando'],
  .status[data-estado='recarregando'] {
    background: var(--aviso);
  }
  .status.problema {
    background: var(--perigo);
  }
  .nome-conta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--t13);
  }
  .ram {
    font-size: 11px;
    color: var(--lateral-texto-2);
  }
  .nova {
    display: flex;
    align-items: center;
    gap: 8px;
    width: calc(100% - 8px);
    margin: 0 4px 6px;
    padding: 6px 8px;
    border: 1px dashed rgb(255 255 255 / 0.25);
    border-radius: var(--raio-s);
    background: none;
    color: var(--lateral-texto-2);
    font-size: var(--t12);
  }
  .nova:hover {
    color: var(--lateral-texto);
    border-color: var(--dourado);
  }
  .acoes {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
</style>

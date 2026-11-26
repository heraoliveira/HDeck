<script lang="ts">
import type { Especial } from '@shared/configuracoes/catalogo.ts'
import { ATALHOS_PADRAO, COMANDOS, textoDaTecla } from '@shared/dados/atalhos.ts'
import { type ChaveTexto, t, tDinamico } from '@shared/i18n/index.ts'
import { type Aviso, type Jogo, type TextoVigiado, tiposAviso } from '@shared/tipos/dominio.ts'
import { chamar, tentar } from '../estado/api.ts'
import { loja, mensagem } from '../estado/loja.svelte.ts'

let { qual }: { qual: Especial } = $props()
const s = $derived(loja.snap!)

// ---------- atalhos ----------
let gravando: string | null = $state(null)
function gravarTecla(e: KeyboardEvent, cmd: string) {
  if (gravando !== cmd) return
  e.preventDefault()
  e.stopPropagation()
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
  const tecla = textoDaTecla({
    key: e.key,
    control: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    meta: e.metaKey,
  })
  gravando = null
  void chamar('config.alterar', {
    caminho: 'geral.atalhos',
    valor: { ...s.config.geral.atalhos, [cmd]: tecla },
  })
}
const nomeComando = (c: string) => {
  if (/^conta\.\d$/.test(c)) return `${t('visao.foco')} ${c.slice(-1)}`
  if (/^grupo\.\d$/.test(c)) return `${t('lateral.grupos')} ${c.slice(-1)}`
  const mapa: Record<string, ChaveTexto> = {
    'conta.proxima': 'paleta.dica',
    'conta.anterior': 'paleta.dica',
    'conta.recarregar': 'conta.recarregar',
    'grupo.recarregar': 'titulo.recarregarGrupo',
    'conta.som': 'titulo.som',
    'economia.alternar': 'titulo.economia',
    paleta: 'paleta.dica',
    configuracoes: 'titulo.configuracoes',
    'conta.telaCheia': 'visao.foco',
    'conta.preencherLogin': 'conta.preencherLogin',
  }
  if (c === 'conta.proxima') return '→'
  if (c === 'conta.anterior') return '←'
  return t(mapa[c] ?? 'paleta.dica')
}

// ---------- jogos ----------
let editando: (Jogo & { dominiosTexto: string }) | null = $state(null)
const novoJogo = (): Jogo & { dominiosTexto: string } => ({
  id: `jogo-${Date.now().toString(36)}`,
  nome: '',
  dominios: [],
  dominiosTexto: '',
  urlInicial: 'https://',
  icone: '🎮',
  farmaEscondido: true,
  dadosContinuos: false,
  semDadosMinPadrao: 0,
  limiteContas: null,
  bonusLive: false,
  plataformasLive: [],
  wsPrincipal: null,
  seletoresLogin: null,
  seletorPedeLogin: null,
  canvas: false,
  origem: 'usuario',
})
async function salvarJogo() {
  if (!editando) return
  const { dominiosTexto, ...j } = editando
  const dominios = dominiosTexto
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
  const r = await tentar('jogos.salvar', { ...j, dominios })
  if (r === null) mensagem('erro', t('adicionar.urlInvalida'))
  else editando = null
}
async function apagarJogo(id: string) {
  const ok = await chamar<'jogos.apagar', boolean>('jogos.apagar', { id })
  if (!ok) mensagem('aviso', t('cfg.jogos.emUso'))
}

// ---------- tipos de aviso ----------
const canais = ['windows', 'som', 'selo', 'discord', 'telegram'] as const
function alternarTipo(tipo: (typeof tiposAviso)[number], canal: (typeof canais)[number]) {
  const atual = s.config.avisos.tipos[tipo][canal]
  void chamar('config.alterar', {
    caminho: 'avisos.tipos',
    valor: { ...s.config.avisos.tipos, [tipo]: { ...s.config.avisos.tipos[tipo], [canal]: !atual } },
  })
}

// ---------- textos vigiados ----------
let novoTexto = $state('')
let novoEscopo: TextoVigiado['escopo'] = $state('todas')
let novoAlvo = $state('')
async function adicionarTexto() {
  if (!novoTexto.trim()) return
  await chamar('textos.salvar', {
    texto: novoTexto.trim(),
    escopo: novoEscopo,
    alvoId: novoEscopo === 'todas' ? null : novoAlvo || null,
    ativo: true,
  })
  novoTexto = ''
}
/** RN-124: jogos desenhados só em canvas não têm texto para ler. */
const jogosCanvas = $derived(s.jogos.filter((j) => j.canvas && s.contas.some((c) => c.jogoId === j.id)))

// ---------- histórico ----------
let historico: Aviso[] = $state([])
$effect(() => {
  if (qual !== 'historico') return
  void s.naoLidos
  void tentar<'avisos.listar', Aviso[]>('avisos.listar', { limite: 200 }).then((a) => (historico = a ?? []))
})

// ---------- segredos ----------
let segredo = $state('')
async function salvarSegredo(canal: 'discord' | 'telegram') {
  const r = await chamar<'avisos.segredo', { ok: boolean }>('avisos.segredo', { canal, valor: segredo })
  if (r.ok) {
    segredo = ''
    mensagem('ok', t('comum.salvar'))
  } else mensagem('erro', t('adicionar.urlInvalida'))
}
async function testar(canal: 'discord' | 'telegram') {
  const r = await tentar<'avisos.testar', { ok: boolean; status: number }>('avisos.testar', { canal })
  if (r?.ok) mensagem('ok', t('avisos.testeOk'))
  else mensagem('erro', t('avisos.testeFalhou', { erro: String(r?.status ?? '?') }))
}

// ---------- cofre ----------
let senha = $state('')
let senha2 = $state('')
async function criarSenha() {
  if (senha.length < 4 || senha !== senha2) {
    mensagem('erro', t('cofre.naoConfere'))
    return
  }
  await chamar('cofre.criarSenha', { senha })
  senha = senha2 = ''
}
async function removerSenha() {
  const r = await chamar<'cofre.removerSenha', { ok: boolean }>('cofre.removerSenha', { senha })
  if (!r.ok) mensagem('erro', t('cofre.senhaErrada'))
  senha = ''
}
async function destrancar() {
  const r = await chamar<'cofre.destrancar', { ok: boolean }>('cofre.destrancar', { senha })
  if (!r.ok) mensagem('erro', t('cofre.senhaErrada'))
  senha = ''
}

// ---------- backup ----------
let incluirCofre = $state(false)
let incluirSessoes = $state(false)
let senhaBackup = $state('')
async function exportar() {
  const r = await tentar<'backup.exportar', { ok: boolean; arquivo?: string; erro?: string }>(
    'backup.exportar',
    {
      incluirCofre,
      incluirSessoes,
      ...(senhaBackup ? { senhaBackup } : {}),
    },
  )
  if (r?.ok) mensagem('ok', t('backup.feito', { arquivo: r.arquivo ?? '' }))
  else if (r?.erro) mensagem('erro', t('backup.erro', { erro: r.erro }))
}
async function importar() {
  const r = await tentar<'backup.importar', { ok: boolean; erro?: string }>(
    'backup.importar',
    senhaBackup ? { senhaBackup } : {},
  )
  if (r?.ok) mensagem('ok', t('backup.importado'))
  else if (r?.erro === 'senha') mensagem('erro', t('backup.senhaErrada'))
  else if (r?.erro) mensagem('erro', t('backup.erro', { erro: r.erro }))
}

// ---------- versão ----------
async function procurar() {
  mensagem('ok', t('atualizacao.procurando'))
  const r = await tentar<'app.verificarAtualizacao', { tipo: string }>('app.verificarAtualizacao')
  if (r?.tipo === 'nenhuma') mensagem('ok', t('atualizacao.nenhuma'))
  else if (r?.tipo === 'erro') mensagem('erro', t('atualizacao.erro'))
}

let contaDevtools = $state('')
let confirmarRedefinir = $state(false)
</script>

{#if qual === 'atalhos'}
  <div class="tabela">
    {#each COMANDOS as c (c)}
      <div class="linha">
        <span class="cresce pequeno">{nomeComando(c)}</span>
        <button
          class="botao tecla"
          class:gravando={gravando === c}
          onclick={() => (gravando = c)}
          onkeydown={(e) => gravarTecla(e, c)}
        >{gravando === c ? '…' : (s.config.geral.atalhos[c] ?? ATALHOS_PADRAO[c])}</button>
      </div>
    {/each}
    <button class="botao" onclick={() => chamar('config.alterar', { caminho: 'geral.atalhos', valor: {} })}>{t('cfg.atalhos.padrao')}</button>
  </div>
{:else if qual === 'jogos'}
  <div class="lista">
    {#each s.jogos as j (j.id)}
      <div class="linha item">
        <span>{j.icone}</span>
        <span class="cresce">{j.nome} <span class="muted pequeno">{j.dominios.join(', ')}</span></span>
        {#if j.origem === 'catalogo'}<span class="muted pequeno">{t('cfg.jogos.catalogo')}</span>{/if}
        <button class="botao" onclick={() => (editando = { ...j, dominiosTexto: j.dominios.join(', ') })}>{t('conta.editar')}</button>
        {#if j.origem === 'usuario'}<button class="botao perigo" onclick={() => apagarJogo(j.id)}>{t('comum.apagar')}</button>{/if}
      </div>
    {/each}
    {#if editando}
      <div class="form">
        <label>{t('cfg.jogos.nome')}<input class="campo" bind:value={editando.nome} /></label>
        <label>{t('cfg.jogos.dominios')}<input class="campo" bind:value={editando.dominiosTexto} /></label>
        <label>{t('cfg.jogos.url')}<input class="campo" bind:value={editando.urlInicial} /></label>
        <label class="linha"><input type="checkbox" bind:checked={editando.farmaEscondido} />{t('cfg.jogos.farmaEscondido')}</label>
        <label class="linha"><input type="checkbox" bind:checked={editando.dadosContinuos} />{t('cfg.jogos.dadosContinuos')}</label>
        <label class="linha"><input type="checkbox" bind:checked={editando.bonusLive} />{t('cfg.jogos.bonusLive')}</label>
        <label class="linha"><input type="checkbox" bind:checked={editando.canvas} />{t('cfg.jogos.canvas')}</label>
        <label>{t('cfg.jogos.limite')}
          <input class="campo" type="number" min="1" value={editando.limiteContas ?? ''} onchange={(e) => editando && (editando.limiteContas = e.currentTarget.value ? Number(e.currentTarget.value) : null)} />
        </label>
        <div class="linha">
          <button class="botao primario" onclick={salvarJogo}>{t('comum.salvar')}</button>
          <button class="botao" onclick={() => (editando = null)}>{t('comum.cancelar')}</button>
        </div>
      </div>
    {:else}
      <button class="botao" onclick={() => (editando = novoJogo())}>{t('cfg.jogos.novo')}</button>
    {/if}
  </div>
{:else if qual === 'tiposAviso'}
  <table class="matriz">
    <thead><tr><th></th>{#each canais as c (c)}<th>{tDinamico(`canal.${c}`)}</th>{/each}</tr></thead>
    <tbody>
      {#each tiposAviso as tipo (tipo)}
        <tr>
          <td>{tDinamico(`tipoAviso.${tipo}`)}</td>
          {#each canais as c (c)}
            <td><input type="checkbox" aria-label="{tDinamico(`tipoAviso.${tipo}`)} · {tDinamico(`canal.${c}`)}" checked={s.config.avisos.tipos[tipo][c]} onchange={() => alternarTipo(tipo, c)} /></td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
{:else if qual === 'textos'}
  <div class="lista">
    {#each jogosCanvas as j (j.id)}<p class="alerta pequeno">{t('cfg.textos.canvas', { jogo: j.nome })}</p>{/each}
    {#each s.textos as tx (tx.id)}
      <div class="linha item">
        <input type="checkbox" checked={tx.ativo} aria-label={tx.texto} onchange={() => chamar('textos.salvar', { ...tx, ativo: !tx.ativo })} />
        <span class="cresce">"{tx.texto}"</span>
        <span class="muted pequeno">{tDinamico(`cfg.textos.escopo.${tx.escopo}`)}{tx.alvoId ? `: ${s.grupos.find((g) => g.id === tx.alvoId)?.nome ?? s.contas.find((c) => c.id === tx.alvoId)?.nome ?? ''}` : ''}</span>
        <button class="botao perigo" onclick={() => chamar('textos.apagar', { id: tx.id })}>{t('comum.apagar')}</button>
      </div>
    {/each}
    <div class="linha">
      <input class="campo cresce" placeholder={t('cfg.textos.novo')} bind:value={novoTexto} onkeydown={(e) => e.key === 'Enter' && adicionarTexto()} />
      <select class="campo" style:width="auto" bind:value={novoEscopo}>
        <option value="todas">{t('cfg.textos.escopo.todas')}</option>
        <option value="grupo">{t('cfg.textos.escopo.grupo')}</option>
        <option value="conta">{t('cfg.textos.escopo.conta')}</option>
      </select>
      {#if novoEscopo !== 'todas'}
        <select class="campo" style:width="auto" bind:value={novoAlvo}>
          {#each novoEscopo === 'grupo' ? s.grupos : s.contas as a (a.id)}<option value={a.id}>{a.nome}</option>{/each}
        </select>
      {/if}
      <button class="botao primario" onclick={adicionarTexto}>{t('comum.adicionar')}</button>
    </div>
  </div>
{:else if qual === 'historico'}
  <div class="historico">
    {#each historico as a (a.id)}
      <div class="linha item pequeno" class:naolido={!a.lido}>
        <span class="muted">{new Date(a.criadoEm).toLocaleString('pt-BR')}</span>
        <span class="cresce">{a.mensagem}</span>
      </div>
    {:else}
      <p class="muted">{t('avisos.vazio')}</p>
    {/each}
    <button class="botao" onclick={() => chamar('avisos.marcarLidos')}>{t('avisos.marcarLidos')}</button>
  </div>
{:else if qual === 'discordUrl' || qual === 'telegramToken'}
  {@const canal = qual === 'discordUrl' ? 'discord' : 'telegram'}
  <div class="linha">
    <input class="campo cresce" type="password" autocomplete="off" placeholder={s.segredos[canal] ? '••••••••' : ''} bind:value={segredo} aria-label={t(qual === 'discordUrl' ? 'cfg.discordUrl.t' : 'cfg.telegramToken.t')} />
    <button class="botao" onclick={() => salvarSegredo(canal)}>{t('comum.salvar')}</button>
    <button class="botao" disabled={!s.segredos[canal]} onclick={() => testar(canal)}>{t('comum.testar')}</button>
  </div>
{:else if qual === 'somArquivo'}
  <div class="linha">
    <span class="cresce muted pequeno">{s.config.avisos.somArquivo || '—'}</span>
    <button class="botao" onclick={() => chamar('avisos.somArquivo')}>{t('cfg.abrirPasta')}</button>
    <button class="botao" onclick={() => chamar('avisos.testar', { canal: 'som' })}>{t('comum.testar')}</button>
  </div>
{:else if qual === 'cofre'}
  <p class="pequeno muted">
    {s.cofre.aberto ? '🔓' : `🔒 ${t('cofre.trancado')}`} · {s.cofre.comLogin.length}
    {s.cofre.comLogin.length === 1 ? 'login' : 'logins'}
  </p>
  {#if !s.cofre.aberto}
    <div class="linha">
      <input class="campo cresce" type="password" bind:value={senha} aria-label={t('cofre.senhaMestra')} onkeydown={(e) => e.key === 'Enter' && destrancar()} />
      <button class="botao primario" onclick={destrancar}>{t('cofre.destrancar')}</button>
    </div>
  {:else if s.cofre.senhaMestra}
    <button class="botao" onclick={() => chamar('cofre.trancar')}>{t('cofre.trancar')}</button>
  {/if}
{:else if qual === 'senhaMestra'}
  {#if !s.cofre.senhaMestra}
    <p class="alerta pequeno">{t('cofre.semRecuperacao')}</p>
    <div class="linha">
      <input class="campo" type="password" bind:value={senha} aria-label={t('cofre.senhaMestra')} />
      <input class="campo" type="password" bind:value={senha2} aria-label={t('cofre.repita')} placeholder={t('cofre.repita')} />
      <button class="botao primario" onclick={criarSenha}>{t('cofre.criarSenha')}</button>
    </div>
  {:else}
    <div class="linha">
      <input class="campo" type="password" bind:value={senha} aria-label={t('cofre.senhaMestra')} />
      <button class="botao" onclick={removerSenha}>{t('cofre.desligarSenha')}</button>
    </div>
  {/if}
{:else if qual === 'versao'}
  <div class="linha">
    <span class="cresce muted pequeno">{t('cfg.versao.d', { versao: s.versao.app, electron: s.versao.electron })} · {t('cfg.semContaOnline')}</span>
    <button class="botao" onclick={procurar}>{t('cfg.verificar')}</button>
    {#if loja.atualizacao?.tipo === 'pronta'}
      <button class="botao primario" onclick={() => chamar('app.reiniciarAtualizar')}>{t('atualizacao.reiniciar')}</button>
    {/if}
  </div>
{:else if qual === 'backup'}
  <div class="form">
    <label class="linha"><input type="checkbox" bind:checked={incluirCofre} />{t('backup.incluirCofre')}</label>
    <label class="linha"><input type="checkbox" bind:checked={incluirSessoes} />{t('backup.incluirSessoes')}</label>
    {#if incluirSessoes}<p class="alerta pequeno">{t('backup.avisoSessoes')}</p>{/if}
    <label>{t('backup.senha')}<input class="campo" type="password" bind:value={senhaBackup} /></label>
    <div class="linha">
      <button class="botao primario" disabled={incluirCofre && !senhaBackup} onclick={exportar}>{t('backup.exportar')}</button>
      <button class="botao" onclick={importar}>{t('backup.importar')}</button>
    </div>
  </div>
{:else if qual === 'pastaDados'}
  <div class="linha">
    <code class="cresce pequeno">{s.versao.dados}</code>
    <button class="botao" onclick={() => chamar('app.abrirPasta', { qual: 'dados' })}>{t('cfg.abrirPasta')}</button>
  </div>
{:else if qual === 'logs'}
  <button class="botao" onclick={() => chamar('app.abrirPasta', { qual: 'logs' })}>{t('cfg.abrirPasta')}</button>
{:else if qual === 'devtools'}
  <div class="linha">
    <select class="campo" bind:value={contaDevtools} aria-label={t('cfg.devtools.t')}>
      {#each s.contas.filter((c) => s.estados[c.id]?.estado !== 'desligada') as c (c.id)}<option value={c.id}>{c.nome}</option>{/each}
    </select>
    <button class="botao" disabled={!contaDevtools} onclick={() => chamar('contas.devtools', { id: contaDevtools })}>{t('comum.mostrar')}</button>
  </div>
{:else if qual === 'limparCacheTodas'}
  <button class="botao" onclick={() => chamar('app.limparCacheTodas')}>{t('cfg.limpar')}</button>
{:else if qual === 'redefinir'}
  {#if confirmarRedefinir}
    <div class="linha">
      <span class="cresce">{t('cfg.redefinirConfirma')}</span>
      <button class="botao perigo" onclick={() => chamar('config.redefinir').then(() => (confirmarRedefinir = false))}>{t('cfg.redefinirBotao')}</button>
      <button class="botao" onclick={() => (confirmarRedefinir = false)}>{t('comum.cancelar')}</button>
    </div>
  {:else}
    <button class="botao perigo" onclick={() => (confirmarRedefinir = true)}>{t('cfg.redefinirBotao')}</button>
  {/if}
{/if}

<style>
  .tabela,
  .lista,
  .form,
  .historico {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 6px;
  }
  .form label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--t12);
    color: var(--texto-2);
  }
  .form label.linha {
    flex-direction: row;
    color: var(--texto);
  }
  .item {
    padding: 6px 8px;
    border-radius: var(--raio-s);
    background: var(--fundo-app);
  }
  .tecla {
    min-width: 130px;
    justify-content: center;
    font-family: ui-monospace, Consolas, monospace;
    font-size: var(--t12);
  }
  .tecla.gravando {
    border-color: var(--destaque);
  }
  .matriz {
    width: 100%;
    border-collapse: collapse;
    margin-top: 6px;
    font-size: var(--t12);
  }
  .matriz th {
    font-weight: 600;
    color: var(--texto-2);
    padding: 4px;
  }
  .matriz td {
    padding: 4px;
    text-align: center;
  }
  .matriz td:first-child {
    text-align: left;
  }
  .alerta {
    margin: 0;
    padding: 6px 10px;
    border-radius: var(--raio-s);
    border: 1px solid var(--aviso);
    color: var(--texto);
  }
  .historico {
    max-height: 320px;
    overflow: auto;
  }
  .naolido {
    border-left: 3px solid var(--destaque);
  }
  code {
    user-select: text;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

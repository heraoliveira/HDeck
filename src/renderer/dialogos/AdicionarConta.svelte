<script lang="ts">
  import { CORES_CONTA } from '@shared/dados/padroes-config.ts'
  import { t } from '@shared/i18n/index.ts'
  import type { Conta } from '@shared/tipos/dominio.ts'
  import Modal from '../componentes/Modal.svelte'
  import { chamar } from '../estado/api.ts'
  import { loja, mensagem } from '../estado/loja.svelte.ts'

  let { aoFechar, grupoId, editar }: { aoFechar: () => void; grupoId?: string | undefined; editar?: Conta | undefined } = $props()
  const s = $derived(loja.snap!)

  let url = $state(editar?.url ?? '')
  let jogoId = $state(editar?.jogoId ?? '')
  let nome = $state(editar?.nome ?? '')
  let grupo = $state(editar?.grupoId ?? grupoId ?? loja.snap?.grupoAtualId ?? '')
  let cor = $state(editar?.cor ?? CORES_CONTA[(loja.snap?.contas.length ?? 0) % CORES_CONTA.length])
  let icone = $state(editar?.icone ?? '')
  let notas = $state(editar?.notas ?? '')
  let som = $state(editar?.som ?? true)
  let notificacoes = $state(editar?.notificacoesDaPagina ?? false)
  let sugerido: string | null = $state(null)
  let novoJogo = $state(false)

  /** RN-013: o endereço sugere o jogo. */
  async function aoMudarUrl() {
    if (!/^https?:\/\//.test(url)) return
    sugerido = await chamar<'contas.sugerirJogo', string | null>('contas.sugerirJogo', { url })
    if (sugerido && !editar) jogoId = sugerido
    if (!sugerido && !jogoId) novoJogo = true
  }

  function escolherJogo(id: string) {
    jogoId = id
    const j = s.jogos.find((x) => x.id === id)
    if (j && !url) url = j.urlInicial
  }

  async function salvar() {
    let urlOk: URL
    try {
      urlOk = new URL(url)
      if (!/^https?:$/.test(urlOk.protocol)) throw new Error()
    } catch {
      mensagem('erro', t('adicionar.urlInvalida'))
      return
    }
    let jid = jogoId
    if (novoJogo || !jid) {
      // Cria o jogo do usuário a partir do domínio.
      jid = `jogo-${urlOk.hostname.replace(/[^a-z0-9]/gi, '-')}`
      if (!s.jogos.some((j) => j.id === jid))
        await chamar('jogos.salvar', {
          id: jid,
          nome: urlOk.hostname.replace(/^www\./, ''),
          dominios: [urlOk.hostname.replace(/^www\./, '')],
          urlInicial: `${urlOk.origin}/`,
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
    }
    if (editar) {
      await chamar('contas.editar', {
        id: editar.id,
        nome: nome || editar.nome,
        url,
        jogoId: jid,
        cor,
        ...(icone ? { icone } : {}),
        notas,
        som,
        notificacoesDaPagina: notificacoes,
      })
      if (grupo !== editar.grupoId) await chamar('contas.mover', { id: editar.id, grupoId: grupo, posicao: 1000 })
      aoFechar()
      return
    }
    const r = await chamar<'contas.adicionar', { ok: boolean }>('contas.adicionar', {
      grupoId: grupo,
      jogoId: jid,
      url,
      cor,
      notas,
      som,
      notificacoesDaPagina: notificacoes,
      ...(nome ? { nome } : {}),
      ...(icone ? { icone } : {}),
    })
    if (r.ok) aoFechar()
    else mensagem('erro', t('adicionar.urlInvalida'))
  }
</script>

<Modal titulo={editar ? t('conta.editar') : t('adicionar.titulo')} {aoFechar}>
  <form class="form" onsubmit={(e) => (e.preventDefault(), salvar())}>
    <label>
      {t('adicionar.jogo')}
      <select class="campo" value={novoJogo ? '__novo' : jogoId} onchange={(e) => (e.currentTarget.value === '__novo' ? (novoJogo = true) : ((novoJogo = false), escolherJogo(e.currentTarget.value)))}>
        <option value="" disabled>—</option>
        {#each s.jogos as j (j.id)}<option value={j.id}>{j.icone} {j.nome}</option>{/each}
        <option value="__novo">{t('adicionar.novoJogo')}</option>
      </select>
    </label>
    <label>
      {t('adicionar.url')}
      <input class="campo" bind:value={url} onchange={aoMudarUrl} placeholder="https://" />
      <span class="pequeno muted">{sugerido ? t('adicionar.sugerido', { jogo: s.jogos.find((j) => j.id === sugerido)?.nome ?? '' }) : t('adicionar.urlDica')}</span>
    </label>
    <label>{t('adicionar.nome')}<input class="campo" bind:value={nome} maxlength="60" /></label>
    <label>
      {t('adicionar.grupo')}
      <select class="campo" bind:value={grupo}>{#each s.grupos as g (g.id)}<option value={g.id}>{g.nome}</option>{/each}</select>
    </label>
    <div class="linha">
      <label class="cresce">{t('adicionar.cor')}<input class="campo" type="color" bind:value={cor} /></label>
      <label class="cresce">{t('adicionar.icone')}<input class="campo" bind:value={icone} maxlength="4" placeholder="🎮" /></label>
    </div>
    <label>{t('adicionar.notas')}<textarea class="campo" bind:value={notas} maxlength="2000"></textarea></label>
    <label class="linha"><input type="checkbox" bind:checked={som} />{t('adicionar.som')}</label>
    <label class="linha"><input type="checkbox" bind:checked={notificacoes} />{t('adicionar.notificacoes')}</label>
    <div class="linha fim">
      <button type="button" class="botao" onclick={aoFechar}>{t('comum.cancelar')}</button>
      <button type="submit" class="botao primario">{editar ? t('comum.salvar') : t('comum.adicionar')}</button>
    </div>
  </form>
</Modal>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--t12);
    color: var(--texto-2);
  }
  label.linha {
    flex-direction: row;
    color: var(--texto);
  }
  .fim {
    justify-content: flex-end;
    margin-top: 6px;
  }
</style>

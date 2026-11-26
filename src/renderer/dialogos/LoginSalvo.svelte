<script lang="ts">
  import { t } from '@shared/i18n/index.ts'
  import Modal from '../componentes/Modal.svelte'
  import { chamar, tentar } from '../estado/api.ts'
  import { loja, mensagem } from '../estado/loja.svelte.ts'

  let { contaId, aoFechar }: { contaId: string; aoFechar: () => void } = $props()
  const conta = $derived(loja.snap?.contas.find((c) => c.id === contaId))
  type Info = { aberto: boolean; usuario: string | null; temLogin: boolean; seletores: { usuario: string; senha: string } | null }
  let info: Info | null = $state(null)
  let usuario = $state('')
  let senha = $state('')
  let senhaMestra = $state('')
  let ensinando = $state(false)
  const visivel = $derived(loja.senhaVisivel[contaId])

  async function carregar() {
    info = await tentar<'cofre.obter', Info>('cofre.obter', { contaId })
    if (info?.usuario) usuario = info.usuario
  }
  $effect(() => {
    void loja.snap?.cofre.aberto
    void carregar()
  })

  async function destrancar() {
    const r = await chamar<'cofre.destrancar', { ok: boolean }>('cofre.destrancar', { senha: senhaMestra })
    senhaMestra = ''
    if (!r.ok) mensagem('erro', t('cofre.senhaErrada'))
    await carregar()
  }
  async function salvar() {
    const r = await chamar<'cofre.salvar', { ok: boolean }>('cofre.salvar', { contaId, usuario, senha })
    if (r.ok) {
      senha = ''
      mensagem('ok', t('cofre.salvo'))
      await carregar()
    }
  }
  /** RN-143: mostrar exige o cofre aberto e some em 10 s. */
  async function mostrar() {
    const r = await chamar<'cofre.mostrarSenha', { senha: string | null }>('cofre.mostrarSenha', { contaId })
    if (r.senha) loja.senhaVisivel[contaId] = r.senha
  }
  async function preencher() {
    const r = await chamar<'cofre.preencher', { preenchidas: string[]; semCampos: string[] }>('cofre.preencher', { ids: [contaId] })
    mensagem(r.preenchidas.length > 0 ? 'ok' : 'aviso', r.preenchidas.length > 0 ? t('cofre.preenchido') : t('cofre.semCampos'))
  }
  async function ensinar() {
    ensinando = true
    loja.dialogos = []
    const r = await tentar<'cofre.ensinar', { ok: boolean }>('cofre.ensinar', { contaId })
    ensinando = false
    mensagem(r?.ok ? 'ok' : 'aviso', r?.ok ? t('cofre.salvo') : t('cofre.semCampos'))
  }
</script>

<Modal titulo={t('cofre.titulo', { conta: conta?.nome ?? '' })} {aoFechar} largura={480}>
  {#if info && !info.aberto}
    <form class="form" onsubmit={(e) => (e.preventDefault(), destrancar())}>
      <label>{t('cofre.senhaMestra')}<input class="campo" type="password" bind:value={senhaMestra} /></label>
      <button class="botao primario" type="submit">{t('cofre.destrancar')}</button>
    </form>
  {:else if info}
    <form class="form" onsubmit={(e) => (e.preventDefault(), salvar())}>
      <label>{t('cofre.usuario')}<input class="campo" autocomplete="off" bind:value={usuario} /></label>
      <label>
        {t('cofre.senha')}
        <input class="campo" type="password" autocomplete="new-password" bind:value={senha} placeholder={info.temLogin ? '••••••••' : ''} />
      </label>
      {#if visivel}<code class="senha">{visivel}</code>{/if}
      <div class="linha">
        <button class="botao primario" type="submit" disabled={!usuario || !senha}>{t('comum.salvar')}</button>
        {#if info.temLogin}
          <button class="botao" type="button" onclick={mostrar}>{t('cofre.mostrarSenha')}</button>
          <button class="botao" type="button" onclick={preencher}>{t('conta.preencherLogin')}</button>
          <button class="botao perigo" type="button" onclick={() => chamar('cofre.apagar', { contaId }).then(carregar)}>{t('cofre.remover')}</button>
        {/if}
      </div>
      <p class="pequeno muted">{t('cofre.ensinarDica')}</p>
      <div class="linha">
        <button class="botao" type="button" disabled={!info.temLogin || ensinando} onclick={ensinar}>{t('cofre.ensinar')}</button>
        {#if info.seletores}<span class="pequeno muted">{info.seletores.usuario} · {info.seletores.senha}</span>{/if}
      </div>
    </form>
  {/if}
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
  .senha {
    user-select: text;
    padding: 6px 10px;
    border-radius: var(--raio-s);
    background: var(--fundo-app);
  }
</style>

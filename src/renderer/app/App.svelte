<script lang="ts">
import { t } from '@shared/i18n/index.ts'
import Modal from '../componentes/Modal.svelte'
import SeletorDivisao from '../componentes/SeletorDivisao.svelte'
import Configuracoes from '../configuracoes/Configuracoes.svelte'
import Especial from '../configuracoes/Especial.svelte'
import AdicionarConta from '../dialogos/AdicionarConta.svelte'
import Confirmar from '../dialogos/Confirmar.svelte'
import DetalheConsumo from '../dialogos/DetalheConsumo.svelte'
import Lives from '../dialogos/Lives.svelte'
import LoginSalvo from '../dialogos/LoginSalvo.svelte'
import PainelConta from '../dialogos/PainelConta.svelte'
import PainelGrupo from '../dialogos/PainelGrupo.svelte'
import Paleta from '../dialogos/Paleta.svelte'
import Simples from '../dialogos/Simples.svelte'
import { chamar, ouvir } from '../estado/api.ts'
import { agendar } from '../estado/espacos.ts'
import { abrirDialogo, fecharDialogo, grupoAtual, iniciarLoja, loja } from '../estado/loja.svelte.ts'
import { tocar } from '../estado/som.ts'
import VisaoFoco from '../visoes/foco/VisaoFoco.svelte'
import VisaoGrade from '../visoes/grade/VisaoGrade.svelte'
import VisaoPainel from '../visoes/painel/VisaoPainel.svelte'
import VisaoPrincipal from '../visoes/principal/VisaoPrincipal.svelte'
import BarraLateral from './BarraLateral.svelte'
import BarraTitulo from './BarraTitulo.svelte'
import JanelaLives from './JanelaLives.svelte'
import PainelDireito from './PainelDireito.svelte'

let painel = $state(false)
let pronto = $state(false)
const grupo = $derived(grupoAtual())
const dialogo = $derived(loja.dialogos.at(-1))
const semContas = $derived((loja.snap?.contas.length ?? 0) === 0)

$effect(() => {
  void iniciarLoja().then(() => (pronto = true))
  return ouvir('comando', (c) => {
    const x = c as { cmd: string; contaId?: string; qual?: string; id?: string; arquivo?: string }
    switch (x.cmd) {
      case 'paleta':
        if (dialogo?.qual !== 'paleta') abrirDialogo({ qual: 'paleta' })
        break
      case 'configuracoes':
        abrirDialogo({ qual: 'configuracoes' })
        break
      case 'focar':
        if (x.contaId) loja.focoContaId = x.contaId
        break
      case 'tocarSom': {
        const a = loja.snap?.config.avisos
        if (a) tocar(a.somEscolhido, a.volume, x.arquivo)
        break
      }
      case 'dialogo':
        if (x.qual && x.id) abrirDialogo({ qual: x.qual as 'lives', id: x.id })
        break
    }
  })
})

// Clique na interface: se o teclado ficou na página de uma conta (janela nativa do Edge), ele volta para cá.
// Sem isso, depois de mexer num jogo, os campos dos painéis paravam de aceitar texto.
$effect(() => {
  let ultimo = 0
  const devolver = () => {
    ultimo = Date.now()
    void chamar('app.focarInterface').catch(() => {})
  }
  // O primeiro clique num botão também se perdia (era gasto para tirar o foco do jogo): ao passar o mouse
  // por um controle da interface sem o teclado estar aqui, ele volta antes do clique.
  const controles =
    'button, input, select, textarea, a, [role="button"], [role="radio"], [role="menuitem"], [contenteditable]'
  const aoPassar = (e: PointerEvent) => {
    if (document.hasFocus() || Date.now() - ultimo < 300) return
    if ((e.target as Element | null)?.closest?.(controles)) devolver()
  }
  window.addEventListener('pointerdown', devolver, true)
  window.addEventListener('pointerover', aoPassar, true)
  return () => {
    window.removeEventListener('pointerdown', devolver, true)
    window.removeEventListener('pointerover', aoPassar, true)
  }
})

// Tema (Seção 12.1).
$effect(() => {
  const tema = loja.snap?.config.geral.tema ?? 'escuro'
  const claro =
    tema === 'claro' || (tema === 'sistema' && matchMedia('(prefers-color-scheme: light)').matches)
  document.documentElement.dataset.tema = claro ? 'claro' : 'escuro'
})

// Mudou a visão, a lateral ou os diálogos: mede os espaços de novo.
$effect(() => {
  void [
    grupo?.visao,
    grupo?.layout,
    painel,
    loja.lateralRecolhida,
    loja.direitaRecolhida,
    loja.dialogos.length,
    loja.snap?.contas.length,
  ]
  agendar()
})

const visao = $derived(painel ? 'painel' : (grupo?.visao ?? 'grade'))
</script>

{#if loja.janela === 'lives'}
  {#if pronto}<JanelaLives />{/if}
  <div class="mensagens" role="status" aria-live="polite">
    {#each loja.mensagens as m (m.id)}<div class="mensagem {m.tipo}">{m.texto}</div>{/each}
  </div>
{:else}
<div class="app">
  <BarraTitulo bind:painel />
  <div class="corpo">
    {#if !loja.grupoFixo}<BarraLateral />{/if}
    <main class="centro">
      {#if pronto && grupo}
        {#if semContas && !painel}
          <div class="boas-vindas">
            <h1>{t('boasVindas.titulo')}</h1>
            <p class="muted">{t('boasVindas.texto')}</p>
            <button class="botao primario" onclick={() => abrirDialogo({ qual: 'adicionarConta', grupoId: grupo.id })}>{t('boasVindas.botao')}</button>
          </div>
        {:else if visao === 'painel'}
          <VisaoPainel />
        {:else if !grupo.ligado}
          <div class="boas-vindas">
            <p class="muted">{t('grupo.desligado')}</p>
            <button class="botao primario" onclick={() => chamar('grupos.ligar', { id: grupo.id, ligado: true, confirmado: true })}>{t('grupo.ligar')}</button>
          </div>
          <div class="escondido"><VisaoGrade {grupo} /></div>
        {:else if visao === 'principal'}
          <VisaoPrincipal {grupo} />
        {:else if visao === 'foco'}
          <VisaoFoco {grupo} />
        {:else}
          <VisaoGrade {grupo} />
        {/if}
      {/if}
    </main>
    {#if pronto && grupo && !semContas && visao !== 'painel'}<PainelDireito />{/if}
  </div>

  <!-- Cada diálogo vive num bloco com chave própria: fechar não deixa os filhos lerem um diálogo que já saiu. -->
  {#each loja.dialogos.slice(-1) as dialogo (dialogo)}
    {#if dialogo.qual === 'configuracoes'}
      <Configuracoes aoFechar={fecharDialogo} secaoInicial={dialogo.secao} buscaInicial={dialogo.busca} />
    {:else if dialogo.qual === 'adicionarConta'}
      <AdicionarConta aoFechar={fecharDialogo} grupoId={dialogo.grupoId} />
    {:else if dialogo.qual === 'editarConta'}
      <AdicionarConta aoFechar={fecharDialogo} editar={loja.snap?.contas.find((c) => c.id === dialogo.id)} />
    {:else if dialogo.qual === 'lives'}
      <Lives contaId={dialogo.id} aoFechar={fecharDialogo} />
    {:else if dialogo.qual === 'cofre'}
      <LoginSalvo contaId={dialogo.id} aoFechar={fecharDialogo} />
    {:else if dialogo.qual === 'paleta'}
      <Paleta aoFechar={fecharDialogo} />
    {:else if dialogo.qual === 'divisao' && grupo}
      <SeletorDivisao {grupo} aoFechar={fecharDialogo} />
    {:else if dialogo.qual === 'avisos'}
      <Modal titulo={t('avisos.titulo')} aoFechar={fecharDialogo} largura={620}><Especial qual="historico" /></Modal>
    {:else}
      {#if dialogo.qual === 'painelConta'}
        <PainelConta id={dialogo.id} x={dialogo.x} y={dialogo.y} />
      {:else if dialogo.qual === 'consumo'}
        <DetalheConsumo x={dialogo.x} y={dialogo.y} aoAbrirPainel={() => (painel = true)} />
      {:else if dialogo.qual === 'painelGrupo'}
        <PainelGrupo id={dialogo.id} x={dialogo.x} y={dialogo.y} />
      {:else if dialogo.qual === 'confirmar'}
        <Confirmar titulo={dialogo.titulo} texto={dialogo.texto} botao={dialogo.botao} perigo={dialogo.perigo} aoConfirmar={dialogo.aoConfirmar} aoFechar={fecharDialogo} />
      {:else}
        <Simples d={dialogo} aoFechar={fecharDialogo} />
      {/if}
    {/if}
  {/each}

  <div class="mensagens" role="status" aria-live="polite">
    {#each loja.mensagens as m (m.id)}<div class="mensagem {m.tipo}">{m.texto}</div>{/each}
  </div>
</div>
{/if}

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .corpo {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .centro {
    position: relative;
    flex: 1;
    min-width: 0;
    padding: 8px;
  }
  .boas-vindas {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    text-align: center;
  }
  .boas-vindas h1 {
    font-size: var(--t20);
    margin: 0;
  }
  .escondido {
    display: none;
  }
  .mensagens {
    position: fixed;
    right: 16px;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 70;
  }
  .mensagem {
    max-width: 380px;
    padding: 10px 14px;
    border-radius: var(--raio-m);
    background: var(--fundo-cartao);
    border: 1px solid var(--borda);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
  }
  .mensagem.ok {
    border-color: var(--ok);
  }
  .mensagem.erro {
    border-color: var(--perigo);
  }
  .mensagem.aviso {
    border-color: var(--aviso);
  }
</style>

<script lang="ts">
import { t } from '@shared/i18n/index.ts'
import Modal from '../componentes/Modal.svelte'

/** Confirmação no estilo do app (RN-007), usada por exemplo ao mover conta de grupo (RN-038). */
let {
  titulo,
  texto,
  botao,
  perigo = false,
  aoConfirmar,
  aoFechar,
}: {
  titulo: string
  texto: string
  botao: string
  perigo?: boolean | undefined
  aoConfirmar: () => void
  aoFechar: () => void
} = $props()
</script>

<Modal {titulo} {aoFechar} largura={440}>
  <p>{texto}</p>
  <div class="linha fim">
    <button class="botao" onclick={aoFechar}>{t('comum.cancelar')}</button>
    <button
      class="botao"
      class:primario={!perigo}
      class:perigo
      onclick={() => {
        aoFechar()
        aoConfirmar()
      }}>{botao}</button
    >
  </div>
</Modal>

<style>
  p {
    margin: 0 0 16px;
    line-height: 1.45;
  }
  .fim {
    justify-content: flex-end;
  }
</style>

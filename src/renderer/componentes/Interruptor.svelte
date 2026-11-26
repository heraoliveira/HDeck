<script lang="ts">
  let {
    ligado,
    rotulo,
    desabilitado = false,
    aoMudar,
  }: { ligado: boolean; rotulo: string; desabilitado?: boolean; aoMudar: (v: boolean) => void } = $props()
</script>

<button
  type="button"
  role="switch"
  class="interruptor"
  class:ligado
  aria-checked={ligado}
  aria-label={rotulo}
  disabled={desabilitado}
  onclick={() => aoMudar(!ligado)}
>
  <span class="bolinha"></span>
</button>

<style>
  .interruptor {
    position: relative;
    width: 40px;
    height: 22px;
    flex: none;
    border-radius: 11px;
    border: 1px solid var(--borda);
    background: var(--fundo-app);
    padding: 0;
    transition: background 0.15s;
  }
  .interruptor.ligado {
    background: var(--destaque);
    border-color: var(--destaque);
  }
  .bolinha {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--texto-2);
    transition: transform 0.15s;
  }
  .ligado .bolinha {
    transform: translateX(18px);
    background: #fff;
  }
  .interruptor:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>

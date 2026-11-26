<script lang="ts">
import { tDinamico } from '@shared/i18n/index.ts'
import type { EstadoConta } from '@shared/tipos/dominio.ts'

let { estado }: { estado: EstadoConta } = $props()
const cor: Record<EstadoConta, string> = {
  desligada: 'var(--texto-3)',
  carregando: 'var(--aviso)',
  ativa: 'var(--ok)',
  economica: 'var(--destaque)',
  escondida: 'var(--texto-2)',
  caida: 'var(--perigo)',
  recarregando: 'var(--aviso)',
  travada: 'var(--perigo)',
  com_aviso: 'var(--aviso)',
  erro: 'var(--perigo)',
}
</script>

<span class="selo" data-estado={estado} style:--cor={cor[estado]}>
  <span class="ponto"></span>{tDinamico(`estado.${estado}`)}
</span>

<style>
  .selo {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--texto-2);
    white-space: nowrap;
  }
  .ponto {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--cor);
  }
</style>

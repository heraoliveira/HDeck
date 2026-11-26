<script lang="ts">
/** Ícones de traço desenhados para o HDeck (24×24, stroke = currentColor). */
const caminhos: Record<string, string> = {
  folha: 'M5 21c8 0 14-6 14-16C9 5 4 10 4 17c0 1.5.4 3 1 4m0 0c2-5 5-8 9-10',
  recarregar: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  som: 'M4 9v6h4l5 4V5L8 9H4zm12 0a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12',
  mudo: 'M4 9v6h4l5 4V5L8 9H4zm12 1 5 5m0-5-5 5',
  painel: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  engrenagem:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  sino: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2zm4 4a2 2 0 0 0 4 0',
  mais: 'M12 5v14M5 12h14',
  pontos: 'M5 12h.01M12 12h.01M19 12h.01',
  ligar: 'M12 3v8m6.4-4.4a8 8 0 1 1-12.8 0',
  grade: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  principal: 'M4 4h11v16H4zM17 4h3v4h-3zM17 10h3v4h-3zM17 16h3v4h-3z',
  foco: 'M4 7h16v13H4zM4 4h5v3M11 4h5v3',
  janela: 'M4 5h16v14H4zM4 9h16',
  live: 'M4 6h16v10H4zM9 20h6M12 16v4M10 9l4 2-4 2z',
  chave: 'M14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0zm0 0h7v3m-3-3v3',
  fechar: 'M6 6l12 12M18 6 6 18',
  buscar: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 2-4.3-4.3',
  menu: 'M4 6h16M4 12h16M4 18h16',
  seta: 'M9 6l6 6-6 6',
  check: 'M5 12l5 5 9-10',
  lixo: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  cadeado: 'M6 11h12v9H6zM8 11V8a4 4 0 1 1 8 0v3',
  olho: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  raio: 'M13 3 5 14h6l-1 7 8-11h-6l1-7z',
  divisao: 'M4 4h16v16H4zM12 4v16M4 12h8',
}
let { nome, tamanho = 16, titulo = '' }: { nome: string; tamanho?: number; titulo?: string } = $props()
</script>

<svg
  width={tamanho}
  height={tamanho}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden={titulo ? undefined : 'true'}
  role={titulo ? 'img' : undefined}
>
  {#if titulo}<title>{titulo}</title>{/if}
  <path d={caminhos[nome] ?? ''} />
</svg>

# ADR 0012 · Identidade visual igual à do HFinance

**Data:** 2026-11-26 · **Estado:** aceita (pedido da dona) · substitui a paleta roxa da Seção 12.1

## Decisão
O layout/HUD do HDeck usa as mesmas cores do projeto HFinance da dona (`heraoliveira/HFinance`: `docs/ui-guidelines.md`, `theme-dark.css`, `theme-light.css`):

| Papel | Escuro | Claro |
|---|---|---|
| Fundo | gradiente `#08111F` → `#101B2D` | `#F4F7FB` → `#EAF8FC` |
| Barra lateral | gradiente `#063D52` → `#071A2D`, texto `#E0F2FE` | gradiente `#06B6D4` → `#0891B2`, texto branco |
| Barra de título | gradiente `#101B2D` → `#0B2535` | branco → `#ECFEFF` |
| Cartões / bordas | `#142338` / `#274057` | `#FFFFFF` / `#BFEAF3` |
| Destaque (ciano) | `#22D3EE` | `#0891B2` |
| Dourado (item ativo, marca) | `#FACC15` / `#FFE88A` | `#CA8A04` / `#A16207` |
| Erro / alerta / sucesso | `#F87171` / `#FBBF24` / `#34D399` | `#DC2626` / `#B45309` / `#15803D` |

No tema claro, erro, alerta e sucesso ficaram um tom mais escuro que os do guia do HFinance (`#EF4444`, `#F59E0B`, `#22C55E`) para passar no contraste AA como texto. Tudo fica em `src/renderer/estilos/tokens.css`.

O ícone do app (`build/icon.*`) continua o "H" roxo até a dona pedir a troca.

/** RN-176: atalhos padrão (editáveis em Configurações > Geral). */
export const COMANDOS = [
  'conta.1',
  'conta.2',
  'conta.3',
  'conta.4',
  'conta.5',
  'conta.6',
  'conta.7',
  'conta.8',
  'conta.9',
  'conta.proxima',
  'conta.anterior',
  'conta.recarregar',
  'grupo.recarregar',
  'conta.som',
  'economia.alternar',
  'paleta',
  'configuracoes',
  'conta.telaCheia',
  'conta.preencherLogin',
  'grupo.1',
  'grupo.2',
  'grupo.3',
  'grupo.4',
  'grupo.5',
  'grupo.6',
  'grupo.7',
  'grupo.8',
  'grupo.9',
] as const
export type Comando = (typeof COMANDOS)[number]

const fixos: Record<string, string> = {
  'conta.proxima': 'Ctrl+Tab',
  'conta.anterior': 'Ctrl+Shift+Tab',
  'conta.recarregar': 'F5',
  'grupo.recarregar': 'Ctrl+Shift+R',
  'conta.som': 'Ctrl+M',
  'economia.alternar': 'Ctrl+E',
  paleta: 'Ctrl+K',
  configuracoes: 'Ctrl+,',
  'conta.telaCheia': 'F11',
  'conta.preencherLogin': 'Ctrl+L',
}
for (let n = 1; n <= 9; n++) {
  fixos[`conta.${n}`] = `Ctrl+${n}`
  fixos[`grupo.${n}`] = `Ctrl+Alt+${n}`
}
export const ATALHOS_PADRAO = fixos as Readonly<Record<Comando, string>>

export type Tecla = { key: string; control: boolean; shift: boolean; alt: boolean; meta: boolean }

/** Normaliza uma tecla (de `before-input-event` ou do DOM) para o texto "Ctrl+Shift+R". */
export function textoDaTecla(t: Tecla): string {
  const partes: string[] = []
  if (t.control || t.meta) partes.push('Ctrl')
  if (t.alt) partes.push('Alt')
  if (t.shift) partes.push('Shift')
  let k = t.key
  if (k.length === 1) k = k.toUpperCase()
  if (k === ' ') k = 'Space'
  if (k && !['Control', 'Shift', 'Alt', 'Meta'].includes(k)) partes.push(k)
  return partes.join('+')
}

/** Converte "ctrl + shift + r" no formato canônico. */
export function normalizarAtalho(tecla: string): string {
  const partes = tecla.split('+').map((p) => p.trim())
  const tem = (m: string) => partes.some((p) => p.toLowerCase() === m)
  const base = partes.filter(
    (p) => !['ctrl', 'control', 'alt', 'shift', 'meta', 'cmd'].includes(p.toLowerCase()),
  )
  return textoDaTecla({
    key: base.join('+').replace(/^./, (c) => c.toUpperCase()),
    control: tem('ctrl') || tem('control') || tem('cmd') || tem('meta'),
    shift: tem('shift'),
    alt: tem('alt'),
    meta: false,
  })
}

/** Mapa tecla → comando, com as trocas do usuário por cima dos padrões. */
export function mapaDeAtalhos(trocas: Record<string, string>): Map<string, Comando> {
  const mapa = new Map<string, Comando>()
  for (const cmd of COMANDOS) {
    const tecla = trocas[cmd] ?? ATALHOS_PADRAO[cmd]
    if (tecla) mapa.set(normalizarAtalho(tecla), cmd)
  }
  return mapa
}

export function comandoDaTecla(mapa: Map<string, Comando>, t: Tecla): Comando | undefined {
  return mapa.get(textoDaTecla(t))
}

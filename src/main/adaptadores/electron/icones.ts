/**
 * Ícones desenhados em código (sem arquivo de imagem de terceiros): o logo "H" do HDeck e o
 * selo com o contador de avisos da barra de tarefas (RN-110). Saem como bitmap BGRA.
 */

type Cor = [number, number, number, number]
const BRANCO: Cor = [255, 255, 255, 255]
const VERMELHO: Cor = [0xe5, 0x53, 0x4b, 255]

function tela(t: number) {
  const px = Buffer.alloc(t * t * 4)
  const pintar = (x: number, y: number, c: Cor, alfa = 1) => {
    if (x < 0 || y < 0 || x >= t || y >= t) return
    const i = (y * t + x) * 4
    const a = (c[3] / 255) * alfa
    // BGRA
    px[i] = Math.round(c[2] * a + px[i]! * (1 - a))
    px[i + 1] = Math.round(c[1] * a + px[i + 1]! * (1 - a))
    px[i + 2] = Math.round(c[0] * a + px[i + 2]! * (1 - a))
    px[i + 3] = Math.min(255, Math.round(255 * a + px[i + 3]! * (1 - a)))
  }
  return { px, pintar }
}

/** Gradiente do logo da barra de título (#00e5ff → #07b6d5 → #075985, na diagonal). */
function ciano(f: number): Cor {
  const p: [number, Cor][] = [
    [0, [0x00, 0xe5, 0xff, 255]],
    [0.58, [0x07, 0xb6, 0xd5, 255]],
    [1, [0x07, 0x59, 0x85, 255]],
  ]
  const i = f <= 0.58 ? 0 : 1
  const [a, ca] = p[i]!
  const [b, cb] = p[i + 1]!
  const k = Math.min(1, Math.max(0, (f - a) / (b - a)))
  return [0, 1, 2].map((j) => Math.round(ca[j]! + (cb[j]! - ca[j]!) * k)).concat(255) as Cor
}
const DOURADO: Cor = [0xff, 0xd7, 0x00, 255]

/** Logo: o mesmo da barra de título (quadrado arredondado ciano com borda dourada e H branco). */
export function bitmapLogo(t: number): Buffer {
  const { px, pintar } = tela(t)
  const r = t * 0.22
  const borda = Math.max(1, t / 64)
  for (let y = 0; y < t; y++)
    for (let x = 0; x < t; x++) {
      const dx = Math.max(r - x - 0.5, 0, x + 0.5 - (t - r))
      const dy = Math.max(r - y - 0.5, 0, y + 0.5 - (t - r))
      const d = Math.hypot(dx, dy)
      if (d > r) continue
      const cobre = Math.min(1, r - d + 0.5)
      pintar(x, y, ciano((x + y) / (2 * t)), cobre)
      // Distância até a borda do quadrado arredondado: perto dela, a linha dourada (55%).
      const dentro = Math.min(x + 0.5, y + 0.5, t - x - 0.5, t - y - 0.5, r - d + (d > 0 ? 0 : r))
      if (dentro < borda) pintar(x, y, DOURADO, 0.55 * cobre)
    }
  const m = Math.round(t * 0.27)
  const haste = Math.max(2, Math.round(t * 0.13))
  const barra = Math.max(2, Math.round(t * 0.12))
  for (let y = m; y < t - m; y++) {
    for (let x = m; x < m + haste; x++) pintar(x, y, BRANCO)
    for (let x = t - m - haste; x < t - m; x++) pintar(x, y, BRANCO)
  }
  const meio = Math.round(t / 2 - barra / 2)
  for (let y = meio; y < meio + barra; y++) for (let x = m; x < t - m; x++) pintar(x, y, BRANCO)
  return px
}

const FONTE: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000'],
}

/** Selo 16×16 com o número de avisos não lidos (até 9, depois "9+"). */
export function bitmapSelo(n: number): Buffer {
  const t = 16
  const { px, pintar } = tela(t)
  for (let y = 0; y < t; y++)
    for (let x = 0; x < t; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8)
      if (d <= 8) pintar(x, y, VERMELHO, Math.min(1, 8 - d + 0.5))
    }
  const texto = n > 9 ? '9+' : String(Math.max(0, n))
  const larg = texto.length * 4 - 1
  let x0 = Math.floor((t - larg) / 2)
  for (const ch of texto) {
    const g = FONTE[ch]!
    for (let gy = 0; gy < 5; gy++)
      for (let gx = 0; gx < 3; gx++) if (g[gy]![gx] === '1') pintar(x0 + gx, 5 + gy, BRANCO)
    x0 += 4
  }
  return px
}

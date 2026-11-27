/** Os 3 sons de aviso, sintetizados (sem arquivo de terceiros), ou o arquivo escolhido (Seção 9.1). */
let ctx: AudioContext | null = null

function nota(
  freq: number,
  inicio: number,
  dur: number,
  volume: number,
  tipo: OscillatorType = 'sine',
): void {
  if (!ctx) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = tipo
  o.frequency.value = freq
  g.gain.setValueAtTime(0, ctx.currentTime + inicio)
  g.gain.linearRampToValueAtTime(volume, ctx.currentTime + inicio + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + dur)
  o.connect(g).connect(ctx.destination)
  o.start(ctx.currentTime + inicio)
  o.stop(ctx.currentTime + inicio + dur + 0.05)
}

export function tocar(qual: string, volume: number, arquivo?: string): void {
  if (arquivo) {
    const a = new Audio(arquivo)
    a.volume = volume
    void a.play().catch(() => {})
    return
  }
  ctx ??= new AudioContext()
  const v = Math.max(0, Math.min(1, volume)) * 0.4
  switch (qual) {
    case 'bip':
      nota(880, 0, 0.12, v, 'square')
      nota(880, 0.18, 0.12, v, 'square')
      break
    case 'gota':
      nota(1200, 0, 0.08, v)
      nota(600, 0.06, 0.25, v)
      break
    default:
      nota(1046, 0, 0.6, v)
      nota(1568, 0.12, 0.8, v * 0.6)
  }
}

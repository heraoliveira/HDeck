/**
 * Gera build/icon.png (512), build/icon.ico (16–256) e build/tray.png a partir do logo desenhado
 * em código (src/main/adaptadores/electron/icones.ts). Roda com `node tools/icone.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'
import { bitmapLogo } from '../src/main/adaptadores/electron/icones.ts'

function png(t: number): Buffer {
  const bgra = bitmapLogo(t)
  const linhas = Buffer.alloc((t * 4 + 1) * t)
  for (let y = 0; y < t; y++) {
    linhas[y * (t * 4 + 1)] = 0
    for (let x = 0; x < t; x++) {
      const i = (y * t + x) * 4
      const o = y * (t * 4 + 1) + 1 + x * 4
      linhas[o] = bgra[i + 2]!
      linhas[o + 1] = bgra[i + 1]!
      linhas[o + 2] = bgra[i]!
      linhas[o + 3] = bgra[i + 3]!
    }
  }
  const bloco = (tipo: string, dados: Buffer) => {
    const tam = Buffer.alloc(4)
    tam.writeUInt32BE(dados.length)
    const td = Buffer.concat([Buffer.from(tipo), dados])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc32(td))
    return Buffer.concat([tam, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(t, 0)
  ihdr.writeUInt32BE(t, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(linhas)),
    bloco('IEND', Buffer.alloc(0)),
  ])
}

function ico(tamanhos: number[]): Buffer {
  const imagens = tamanhos.map(png)
  const cab = Buffer.alloc(6)
  cab.writeUInt16LE(1, 2)
  cab.writeUInt16LE(tamanhos.length, 4)
  let desloc = 6 + 16 * tamanhos.length
  const dir = tamanhos.map((t, i) => {
    const e = Buffer.alloc(16)
    e[0] = t >= 256 ? 0 : t
    e[1] = t >= 256 ? 0 : t
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(imagens[i]!.length, 8)
    e.writeUInt32LE(desloc, 12)
    desloc += imagens[i]!.length
    return e
  })
  return Buffer.concat([cab, ...dir, ...imagens])
}

mkdirSync('build', { recursive: true })
writeFileSync('build/icon.png', png(512))
writeFileSync('build/icon.ico', ico([16, 24, 32, 48, 64, 128, 256]))
writeFileSync('build/tray.png', png(32))
console.log('ícones gerados em build/')

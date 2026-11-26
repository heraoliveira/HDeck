import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'

/**
 * Zip mínimo (deflate) para o arquivo de backup `.hdeck` (Seção 11). Sem dependência externa.
 * Suporta só o necessário: arquivos com nome UTF-8, sem zip64 (backup < 4 GB).
 */
export type EntradaZip = { nome: string; dados: Uint8Array }

export function criarZip(entradas: readonly EntradaZip[]): Buffer {
  const locais: Buffer[] = []
  const centrais: Buffer[] = []
  let deslocamento = 0
  for (const e of entradas) {
    const nome = Buffer.from(e.nome.replaceAll('\\', '/'), 'utf8')
    const comprimido = deflateRawSync(e.dados)
    const crc = crc32(e.dados)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // nome em UTF-8
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comprimido.length, 18)
    local.writeUInt32LE(e.dados.length, 22)
    local.writeUInt16LE(nome.length, 26)
    locais.push(local, nome, comprimido)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(comprimido.length, 20)
    central.writeUInt32LE(e.dados.length, 24)
    central.writeUInt16LE(nome.length, 28)
    central.writeUInt32LE(deslocamento, 42)
    centrais.push(central, nome)
    deslocamento += local.length + nome.length + comprimido.length
  }
  const tamCentral = centrais.reduce((s, b) => s + b.length, 0)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054b50, 0)
  fim.writeUInt16LE(entradas.length, 8)
  fim.writeUInt16LE(entradas.length, 10)
  fim.writeUInt32LE(tamCentral, 12)
  fim.writeUInt32LE(deslocamento, 16)
  return Buffer.concat([...locais, ...centrais, fim])
}

export function lerZip(arquivo: Uint8Array): EntradaZip[] {
  const b = Buffer.from(arquivo)
  let fim = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      fim = i
      break
    }
  }
  if (fim < 0) throw new Error('não é um arquivo zip')
  const total = b.readUInt16LE(fim + 10)
  let p = b.readUInt32LE(fim + 16)
  const out: EntradaZip[] = []
  for (let i = 0; i < total; i++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error('zip corrompido')
    const metodo = b.readUInt16LE(p + 10)
    const crc = b.readUInt32LE(p + 16)
    const tamComp = b.readUInt32LE(p + 20)
    const tamNome = b.readUInt16LE(p + 28)
    const tamExtra = b.readUInt16LE(p + 30)
    const tamComent = b.readUInt16LE(p + 32)
    const local = b.readUInt32LE(p + 42)
    const nome = b.subarray(p + 46, p + 46 + tamNome).toString('utf8')
    const inicio = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28)
    const bruto = b.subarray(inicio, inicio + tamComp)
    const dados = metodo === 8 ? inflateRawSync(bruto) : Buffer.from(bruto)
    if (crc32(dados) !== crc) throw new Error(`zip corrompido: ${nome}`)
    if (nome.includes('..') || nome.startsWith('/') || /^[a-zA-Z]:/.test(nome))
      throw new Error('caminho inválido no zip')
    out.push({ nome, dados })
    p += 46 + tamNome + tamExtra + tamComent
  }
  return out
}

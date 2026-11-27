import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * Criptografia do cofre (Seção 10, ADR 0006): AES-256-GCM e scrypt (N=2^17, r=8, p=1).
 * Formato de um blob: versão(1) | iv(12) | tag(16) | dados.
 */

const VERSAO = 1
export type CustoScrypt = { N: number; r: number; p: number; maxmem: number }
export const SCRYPT: CustoScrypt = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }

export function novaChave(): Buffer {
  return randomBytes(32)
}

export function novoSal(): Buffer {
  return randomBytes(16)
}

export function derivarChave(senha: string, sal: Uint8Array, custo: CustoScrypt = SCRYPT): Buffer {
  return scryptSync(senha.normalize('NFC'), sal, 32, custo)
}

export function cifrar(chave: Uint8Array, dados: Uint8Array): Buffer {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chave, iv)
  const corpo = Buffer.concat([c.update(dados), c.final()])
  return Buffer.concat([Buffer.from([VERSAO]), iv, c.getAuthTag(), corpo])
}

/** Lança se a chave estiver errada ou o blob adulterado (o GCM confere). */
export function decifrar(chave: Uint8Array, blob: Uint8Array): Buffer {
  const b = Buffer.from(blob)
  if (b.length < 29 || b[0] !== VERSAO) throw new Error('blob inválido')
  const d = createDecipheriv('aes-256-gcm', chave, b.subarray(1, 13))
  d.setAuthTag(b.subarray(13, 29))
  return Buffer.concat([d.update(b.subarray(29)), d.final()])
}

export function cifrarTexto(chave: Uint8Array, texto: string): Buffer {
  return cifrar(chave, Buffer.from(texto, 'utf8'))
}

export function decifrarTexto(chave: Uint8Array, blob: Uint8Array): string {
  return decifrar(chave, blob).toString('utf8')
}

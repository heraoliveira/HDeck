import { existsSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { urlSemParametros } from '@shared/util/texto.ts'
import electronLog from 'electron-log/main'
import type { Log } from '../../nucleo/portas.ts'

/** Nada de URL com parâmetro, token ou senha nos registros (Seção 3, Logs; RN-143). */
export function limparDados(dados?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!dados) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(dados)) {
    if (/senha|token|webhook|segredo|cookie/i.test(k)) {
      out[k] = '[oculto]'
      continue
    }
    out[k] = typeof v === 'string' && /^[a-z]+:\/\//i.test(v) ? urlSemParametros(v) : v
  }
  return out
}

/** electron-log com rotação: 5 arquivos de 5 MB em %APPDATA%/HDeck/logs. */
export function criarLog(pasta: string): Log {
  const f = electronLog.transports.file
  f.resolvePathFn = () => join(pasta, 'main.log')
  f.maxSize = 5 * 1024 * 1024
  f.archiveLogFn = (velho) => {
    const base = velho.toString()
    for (let i = 4; i >= 1; i--) {
      const de = `${base}.${i}`
      if (existsSync(de)) {
        if (i === 4) rmSync(de, { force: true })
        else renameSync(de, `${base}.${i + 1}`)
      }
    }
    renameSync(base, `${base}.1`)
  }
  electronLog.transports.console.level = process.env.HDECK_TESTE ? false : 'info'
  electronLog.initialize({ preload: false })
  return {
    info: (m, d) => electronLog.info(m, limparDados(d) ?? ''),
    aviso: (m, d) => electronLog.warn(m, limparDados(d) ?? ''),
    erro: (m, d) => electronLog.error(m, limparDados(d) ?? ''),
  }
}

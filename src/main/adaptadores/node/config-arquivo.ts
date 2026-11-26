import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs'
import type { ArmazemConfig, Log } from '../../nucleo/portas.ts'
import { type Config, configPadrao, migrarConfig } from '@shared/config/esquema.ts'

/**
 * `config.json` com escrita atômica (tmp + rename) e cópia `.bak` do último arquivo bom.
 * Arquivo corrompido volta ao backup; sem backup, volta aos padrões.
 */
export class ConfigArquivo implements ArmazemConfig {
  constructor(
    private readonly caminho: string,
    private readonly log?: Log,
  ) {}

  ler(): Config {
    for (const arq of [this.caminho, `${this.caminho}.bak`]) {
      if (!existsSync(arq)) continue
      try {
        return migrarConfig(JSON.parse(readFileSync(arq, 'utf8')))
      } catch (e) {
        this.log?.aviso('config ilegível, tentando o backup', { arquivo: arq, erro: String(e) })
      }
    }
    return configPadrao()
  }

  gravar(c: Config): void {
    const tmp = `${this.caminho}.tmp`
    const fd = openSync(tmp, 'w')
    try {
      writeSync(fd, JSON.stringify(c, null, 2))
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    if (existsSync(this.caminho)) {
      try {
        JSON.parse(readFileSync(this.caminho, 'utf8'))
        renameSync(this.caminho, `${this.caminho}.bak`)
      } catch {
        // o atual está corrompido: não vira backup
      }
    }
    renameSync(tmp, this.caminho)
  }
}

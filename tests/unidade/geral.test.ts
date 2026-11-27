import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import pacote from '../../package.json' with { type: 'json' }
import {
  aoFecharJanela,
  iniciarEscondido,
  opcoesDeInicio,
  precisaConfirmarSaida,
} from '../../src/main/nucleo/geral/geral.ts'
import { configPadrao } from '../../src/shared/config/esquema.ts'

const comGeral = (g: Partial<ReturnType<typeof configPadrao>['geral']>) => {
  const c = configPadrao()
  return { ...c, geral: { ...c.geral, ...g } }
}

function arquivos(d: string): string[] {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n)
    return statSync(p).isDirectory() ? arquivos(p) : [p]
  })
}

describe('geral', () => {
  it('RN-170 iniciar com o Windows abre na bandeja', () => {
    expect(opcoesDeInicio(configPadrao())).toEqual({ openAtLogin: false, args: ['--bandeja'] })
    expect(opcoesDeInicio(comGeral({ iniciarComWindows: true })).openAtLogin).toBe(true)
    expect(
      iniciarEscondido(comGeral({ iniciarComWindows: true, abrirNaBandeja: true }), ['x', '--bandeja']),
    ).toBe(true)
    expect(iniciarEscondido(comGeral({ iniciarComWindows: true, abrirNaBandeja: true }), ['x'])).toBe(false)
    expect(
      iniciarEscondido(comGeral({ iniciarComWindows: false, abrirNaBandeja: true }), ['--bandeja']),
    ).toBe(false)
  })

  it('RN-171 fechar no X manda para a bandeja; sair confirma com contas ligadas', () => {
    expect(aoFecharJanela(configPadrao(), false)).toBe('bandeja')
    expect(aoFecharJanela(comGeral({ fecharVaiParaBandeja: false }), false)).toBe('sair')
    expect(aoFecharJanela(configPadrao(), true)).toBe('fechar')
    expect(precisaConfirmarSaida(configPadrao(), 2)).toBe(true)
    expect(precisaConfirmarSaida(configPadrao(), 0)).toBe(false)
    expect(precisaConfirmarSaida(comGeral({ confirmarAoSair: false }), 5)).toBe(false)
  })

  it('RN-001 o HDeck não clica, não digita por teclado simulado e não envia formulários', () => {
    const codigo = arquivos('src')
      .filter((a) => /\.(ts|svelte)$/.test(a))
      .map((a) => readFileSync(a, 'utf8'))
      .join('\n')
    expect(codigo).not.toMatch(/sendInputEvent/)
    expect(codigo).not.toMatch(/\.requestSubmit\(|\.submit\(\)/)
    const scripts = readFileSync('src/main/adaptadores/electron/scripts-pagina.ts', 'utf8')
    expect(scripts).not.toMatch(/\.click\(|dispatchEvent\(new (Mouse|Pointer|Keyboard)Event/)
  })

  it('RN-003 sem anúncios, telemetria ou analytics: só as 4 dependências de produção', () => {
    expect(Object.keys(pacote.dependencies).sort()).toEqual([
      'electron-log',
      'electron-updater',
      'svelte',
      'zod',
    ])
    const codigo = arquivos('src')
      .map((a) => readFileSync(a, 'utf8'))
      .join('\n')
    expect(codigo).not.toMatch(
      /google-analytics|googletagmanager|sentry|mixpanel|segment\.io|amplitude|crashReporter\.start/i,
    )
  })

  it('RN-002 nenhum proxy nem troca de user agent por conta', () => {
    const codigo = arquivos('src')
      .map((a) => readFileSync(a, 'utf8'))
      .join('\n')
    expect(codigo).not.toMatch(/setProxy|proxy-server|--proxy/)
    expect(codigo.match(/setUserAgent\(/g)?.length).toBe(3) // limpar o UA da sessão + login do Google (RN-154)
  })
})

import { describe, expect, it } from 'vitest'
import {
  decidirPopup,
  downloadBloqueado,
  googleRecusou,
  navegacaoPermitida,
  permissaoPermitida,
  podeAbrirFora,
  userAgentLimpo,
} from '../../src/main/nucleo/seguranca/politicas.ts'

describe('políticas de segurança', () => {
  it('RN-150 executáveis e instaladores sempre bloqueados', () => {
    for (const n of [
      'setup.exe',
      'A.MSI',
      'x.bat',
      'y.ps1',
      'z.js',
      'w.lnk',
      'v.msix',
      'truque.exe.',
      'a.exe  ',
    ])
      expect(downloadBloqueado(n)).toBe(true)
    for (const n of ['foto.png', 'save.json', 'dados.zip']) expect(downloadBloqueado(n)).toBe(false)
  })

  it('RN-151 pop-ups de login abrem na sessão da conta; outros pedem confirmação', () => {
    expect(decidirPopup('https://accounts.google.com/o/oauth2')).toBe('login')
    expect(decidirPopup('https://discord.com/oauth2/authorize')).toBe('login')
    expect(decidirPopup('https://id.twitch.tv/oauth2/authorize')).toBe('login')
    expect(decidirPopup('https://kick.com/oauth')).toBe('login')
    expect(decidirPopup('https://phantom.app/ul/connect')).toBe('login')
    expect(decidirPopup('https://loja.com/oferta')).toBe('perguntar')
    expect(decidirPopup('javascript:alert(1)')).toBe('negar')
    expect(decidirPopup('about:blank')).toBe('negar')
    expect(decidirPopup('http://localhost:1/oauth/login')).toBe('perguntar')
    expect(decidirPopup('http://localhost:1/oauth/login', { ligado: true })).toBe('login')
  })

  it('RN-152 câmera, microfone, localização e dispositivos sempre negados', () => {
    for (const p of [
      'media',
      'geolocation',
      'midi',
      'midiSysex',
      'hid',
      'serial',
      'usb',
      'pointerLock',
      'openExternal',
    ])
      expect(permissaoPermitida(p, true)).toBe(false)
    expect(permissaoPermitida('fullscreen', false)).toBe(true)
    expect(permissaoPermitida('clipboard-sanitized-write', false)).toBe(true)
    expect(permissaoPermitida('notifications', false)).toBe(false)
    expect(permissaoPermitida('notifications', true)).toBe(true)
  })

  it('RN-153 só https (e http em localhost)', () => {
    expect(navegacaoPermitida('https://jogo.com/')).toBe(true)
    expect(navegacaoPermitida('http://localhost:3000/')).toBe(true)
    expect(navegacaoPermitida('http://127.0.0.1/')).toBe(true)
    expect(navegacaoPermitida('http://jogo.com/')).toBe(false)
    expect(navegacaoPermitida('file:///C:/Windows')).toBe(false)
    expect(navegacaoPermitida('javascript:alert(1)')).toBe(false)
    expect(navegacaoPermitida('steam://run/1')).toBe(false)
    expect(navegacaoPermitida('about:blank')).toBe(true)
    expect(navegacaoPermitida('lixo')).toBe(false)
    expect(podeAbrirFora('https://a.b/')).toBe(true)
    expect(podeAbrirFora('http://a.b/')).toBe(false)
    expect(podeAbrirFora('nada')).toBe(false)
  })

  it('RN-154 reconhece quando o Google recusa o login no app', () => {
    expect(googleRecusou('https://accounts.google.com/v3/signin/rejected?x', '')).toBe(true)
    expect(
      googleRecusou('https://accounts.google.com/signin', 'Este navegador ou app pode não ser seguro'),
    ).toBe(true)
    expect(googleRecusou('https://accounts.google.com/signin', "Couldn't sign you in")).toBe(true)
    expect(googleRecusou('https://accounts.google.com/signin', 'Fazer login')).toBe(false)
    expect(googleRecusou('https://jogo.com/rejected', 'pode não ser seguro')).toBe(false)
    expect(googleRecusou('lixo', '')).toBe(false)
  })

  it('RN-002 o user agent é o do Chrome, sem Electron e sem HDeck', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) hdeck/2026.11.26 Chrome/156.0.0.0 Electron/45.5.0 Safari/537.36'
    expect(userAgentLimpo(ua)).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
    )
  })
})

import { DOMINIOS_LOGIN, EXTENSOES_BLOQUEADAS } from '@shared/dados/padroes-config.ts'
import { dominioPertence } from '@shared/util/texto.ts'

/**
 * Políticas de segurança das páginas (Seção 11), puras. O endurecimento central
 * (adaptadores/electron/endurecimento.ts) só aplica o que estas funções decidem.
 */

export type ModoTeste = { ligado: boolean }

/** RN-150: executáveis e instaladores são sempre bloqueados. */
export function downloadBloqueado(nomeArquivo: string): boolean {
  const n = nomeArquivo
    .toLowerCase()
    .trim()
    .replace(/[.\s]+$/, '')
  return EXTENSOES_BLOQUEADAS.some((ext) => n.endsWith(ext))
}

function ehLocal(u: URL): boolean {
  return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]'
}

/** RN-153: só `https:` (e `http:` em localhost). */
export function navegacaoPermitida(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol === 'https:') return true
  if (u.protocol === 'http:' && ehLocal(u)) return true
  return u.protocol === 'about:' && u.href === 'about:blank'
}

export type DecisaoPopup = 'login' | 'perguntar' | 'negar'

/**
 * RN-151: pop-ups de login (Google, Discord, Twitch, Kick, carteiras) abrem na sessão da conta;
 * outros pedem confirmação mostrando o endereço. Esquemas estranhos são negados.
 * No modo de teste, `/oauth/` em localhost conta como login (jogo falso).
 */
export function decidirPopup(url: string, teste: ModoTeste = { ligado: false }): DecisaoPopup {
  if (!navegacaoPermitida(url) || url === 'about:blank') return 'negar'
  const u = new URL(url)
  if (DOMINIOS_LOGIN.some((d) => dominioPertence(u.hostname, d))) return 'login'
  if (teste.ligado && ehLocal(u) && u.pathname.startsWith('/oauth/')) return 'login'
  return 'perguntar'
}

/** Link externo só vai ao navegador padrão se for https (Seção 11). */
export function podeAbrirFora(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

const PERMITIDAS = new Set(['fullscreen', 'clipboard-sanitized-write'])

/**
 * RN-152: nega tudo por padrão; libera tela cheia e cópia; notificações só se a conta permitir.
 * Câmera, microfone, localização, MIDI, HID, serial e USB: sempre negados.
 */
export function permissaoPermitida(permissao: string, notificacoesDaConta: boolean): boolean {
  if (permissao === 'notifications') return notificacoesDaConta
  return PERMITIDAS.has(permissao)
}

/** RN-154: o Google recusou o login no navegador embutido? */
export function googleRecusou(url: string, titulo: string): boolean {
  try {
    const u = new URL(url)
    if (!dominioPertence(u.hostname, 'accounts.google.com')) return false
    return (
      u.pathname.includes('/signin/rejected') ||
      u.pathname.includes('/v3/signin/rejected') ||
      /n[aã]o (é|e|ser) seguro|may not be secure|couldn.t sign you in/i.test(titulo)
    )
  } catch {
    return false
  }
}

/** RN-002: o user agent é o do Chrome da mesma versão, sem os tokens do Electron e do app. */
export function userAgentLimpo(ua: string): string {
  return ua
    .replace(/\s?Electron\/\S+/g, '')
    .replace(/\s?HDeck\/\S+/gi, '')
    .replace(/\s?hdeck\/\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * RN-154 (alterada a pedido da dona em 2026-11-27): o Google recusa login em navegador embutido
 * olhando o user agent e as client hints. Só nas páginas de login do Google, o HDeck se apresenta
 * como Firefox (sem client hints); no resto, nada muda (RN-002).
 */
export const UA_LOGIN_GOOGLE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0'

const HOSTS_LOGIN_GOOGLE = ['accounts.google.com', 'accounts.youtube.com', 'myaccount.google.com']

export function ehLoginGoogle(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase()
    return HOSTS_LOGIN_GOOGLE.some((d) => dominioPertence(h, d))
  } catch {
    return false
  }
}

/** Cabeçalhos da requisição para o login do Google: UA do Firefox e sem client hints. */
export function cabecalhosLoginGoogle(cab: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(cab)) if (!/^sec-ch-ua/i.test(k)) out[k] = v
  for (const k of Object.keys(out)) if (k.toLowerCase() === 'user-agent') delete out[k]
  out['User-Agent'] = UA_LOGIN_GOOGLE
  return out
}

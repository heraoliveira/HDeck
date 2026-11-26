import { t } from '@shared/i18n/index.ts'
import { dominioDe, dominioPertence, urlSemParametros } from '@shared/util/texto.ts'
import { app, BrowserWindow, type Session, shell, type WebContents } from 'electron'
import type { Log } from '../../nucleo/portas.ts'
import {
  decidirPopup,
  downloadBloqueado,
  navegacaoPermitida,
  permissaoPermitida,
  podeAbrirFora,
  userAgentLimpo,
} from '../../nucleo/seguranca/politicas.ts'
import type { Perguntador } from './perguntador.ts'

/**
 * Endurecimento central (Seções 4.2 e 11): toda página e toda sessão criada passa por aqui,
 * inclusive pop-ups e as que o próprio Chromium criar. Nenhum módulo cria página por fora.
 */
export type OpcoesEndurecimento = {
  /** A página é a interface do HDeck? (única com preload e com IPC) */
  ehInterface: (wc: WebContents) => boolean
  /** Conta dona da sessão (para a permissão de notificações por conta, RN-152). */
  notificacoesDaSessao: (s: Session) => boolean
  modoTeste: boolean
  perguntador: Perguntador
  log: Log
  /** Avisa a interface de um download bloqueado. */
  aoBloquearDownload: (nome: string) => void
}

const travadas = new WeakSet<WebContents>()
const sessoesTravadas = new WeakSet<Session>()

export function endurecerSessao(s: Session, o: OpcoesEndurecimento): void {
  if (sessoesTravadas.has(s)) return
  sessoesTravadas.add(s)
  s.setUserAgent(userAgentLimpo(s.getUserAgent()))
  s.setSpellCheckerEnabled(false)
  // RN-152: nega tudo por padrão.
  s.setPermissionRequestHandler((wc, permissao, cb) => {
    if (o.ehInterface(wc)) return cb(permissao === 'clipboard-sanitized-write')
    cb(permissaoPermitida(permissao, o.notificacoesDaSessao(s)))
  })
  s.setPermissionCheckHandler((wc, permissao) => {
    if (wc && o.ehInterface(wc)) return permissao === 'clipboard-sanitized-write'
    return permissaoPermitida(permissao, o.notificacoesDaSessao(s))
  })
  s.setDevicePermissionHandler(() => false)
  s.setUSBProtectedClassesHandler?.(() => [])
  s.setDisplayMediaRequestHandler((_req, cb) => cb({}))
  // RN-150: downloads sempre pedem confirmação; executáveis sempre bloqueados.
  s.on('will-download', (_e, item, wc) => {
    const nome = item.getFilename()
    const origem = urlSemParametros(item.getURL())
    if (downloadBloqueado(nome)) {
      item.cancel()
      o.log.aviso('download bloqueado', { nome, origem })
      o.aoBloquearDownload(nome)
      void o.perguntador.informar(t('dialogo.downloadBloqueado', { nome }))
      return
    }
    item.pause()
    const tam = item.getTotalBytes()
    const tamanho = tam > 0 ? `${Math.max(1, Math.round(tam / 1024))} KB` : '?'
    void o.perguntador
      .perguntar({
        mensagem: t('dialogo.download', { nome, tamanho, origem }),
        botoes: [t('dialogo.baixar'), t('comum.cancelar')],
        janela: BrowserWindow.fromWebContents(wc) ?? null,
      })
      .then((r) => {
        if (r === 0 && item.getState() === 'progressing') item.resume()
        else item.cancel()
      })
  })
}

export function endurecerPagina(wc: WebContents, o: OpcoesEndurecimento): void {
  if (travadas.has(wc)) return
  travadas.add(wc)
  wc.on('will-attach-webview', (e) => e.preventDefault())
  const interface_ = () => o.ehInterface(wc)

  const filtrarNavegacao = (e: { preventDefault: () => void }, url: string) => {
    if (interface_()) {
      // A interface nunca sai da própria página.
      if (dominioDe(url) !== dominioDe(wc.getURL()) || !url.startsWith(new URL(wc.getURL()).origin))
        e.preventDefault()
      return
    }
    if (!navegacaoPermitida(url)) {
      o.log.aviso('navegação bloqueada', { url: urlSemParametros(url) })
      e.preventDefault()
    }
  }
  wc.on('will-navigate', (e) => filtrarNavegacao(e, e.url))
  wc.on('will-redirect', (e) => filtrarNavegacao(e, e.url))
  wc.on('will-frame-navigate', (e) => {
    if (!e.isMainFrame && !interface_() && !navegacaoPermitida(e.url) && !e.url.startsWith('about:'))
      e.preventDefault()
  })

  // RN-151: pop-ups.
  wc.setWindowOpenHandler(({ url }) => {
    if (interface_()) {
      if (podeAbrirFora(url)) void shell.openExternal(url)
      return { action: 'deny' }
    }
    const decisao = decidirPopup(url, { ligado: o.modoTeste })
    if (decisao === 'login') {
      const pai = BrowserWindow.fromWebContents(wc)
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          autoHideMenuBar: true,
          ...(pai ? { parent: pai } : {}),
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: false,
            spellcheck: false,
            // sem preload; a sessão é a mesma da conta (herdada do opener).
          },
        },
      }
    }
    if (decisao === 'perguntar') void perguntarPopup(wc, url, o)
    return { action: 'deny' }
  })

  wc.on('did-create-window', (filha) => {
    // O pop-up de login fecha sozinho quando volta para o site do jogo (ou quando a página se fecha).
    const origem = dominioDe(wc.getURL())
    filha.webContents.on('did-navigate', (_e, url) => {
      const host = dominioDe(url)
      if (
        origem &&
        host &&
        (dominioPertence(host, origem) || dominioPertence(origem, host)) &&
        !filha.isDestroyed()
      )
        setTimeout(() => !filha.isDestroyed() && filha.close(), 1000)
    })
  })
}

async function perguntarPopup(wc: WebContents, url: string, o: OpcoesEndurecimento): Promise<void> {
  const r = await o.perguntador.perguntar({
    mensagem: `${t('dialogo.popup')}\n${urlSemParametros(url)}`,
    botoes: [t('dialogo.popupAbrir'), t('dialogo.popupNavegador'), t('comum.cancelar')],
    janela: BrowserWindow.fromWebContents(wc) ?? null,
  })
  if (r === 0 && !wc.isDestroyed()) {
    const w = new BrowserWindow({
      width: 900,
      height: 700,
      autoHideMenuBar: true,
      webPreferences: {
        session: wc.session,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false,
      },
    })
    void w.loadURL(url)
  } else if (r === 1 && podeAbrirFora(url)) {
    void shell.openExternal(url)
  }
}

/** Liga o endurecimento a toda sessão e página que o app criar a partir de agora. */
export function instalarEndurecimento(o: OpcoesEndurecimento): void {
  app.on('session-created', (s) => endurecerSessao(s, o))
  app.on('web-contents-created', (_e, wc) => {
    endurecerSessao(wc.session, o)
    endurecerPagina(wc, o)
  })
}

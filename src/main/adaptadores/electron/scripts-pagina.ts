/**
 * Scripts que rodam num MUNDO ISOLADO da página (executeJavaScriptInIsolatedWorld).
 * Só leem o DOM (e, no "Preencher login", só preenchem campos). Nunca clicam nem enviam (RN-001, RN-142).
 * Nada é injetado no mundo da página do jogo.
 */

export const MUNDO_ISOLADO = 1999

const json = (v: unknown) => JSON.stringify(v)

/**
 * RN-120 a RN-122: percorre os nós de texto com TreeWalker (sem innerText, que força layout),
 * pula script/style/noscript/[hidden], normaliza e devolve só os textos cadastrados encontrados.
 */
export function scriptProcurarTextos(procurados: readonly string[]): string {
  return `(() => {
    const alvo = ${json(procurados)};
    const norm = (s) => s.normalize('NFD').replace(/\\p{M}/gu, '').toLowerCase().replace(/\\s+/g, ' ');
    const achados = new Set();
    const pular = (el) => !el || el.closest('script,style,noscript,template,[hidden]');
    const raiz = document.body || document.documentElement;
    if (!raiz) return [];
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    let n = 0, bloco = '';
    for (let no = w.nextNode(); no; no = w.nextNode()) {
      if (++n > 50000) break;
      if (pular(no.parentElement)) continue;
      bloco += ' ' + no.nodeValue;
      if (bloco.length > 4000) {
        const b = norm(bloco);
        for (const a of alvo) if (b.includes(a)) achados.add(a);
        bloco = bloco.slice(-200);
      }
      if (achados.size === alvo.length) break;
    }
    const b = norm(bloco);
    for (const a of alvo) if (b.includes(a)) achados.add(a);
    return [...achados].slice(0, 50);
  })()`
}

export function scriptExisteSeletor(seletor: string): string {
  return `(() => { try { return !!document.querySelector(${json(seletor)}) } catch { return false } })()`
}

/**
 * RN-142: preenche usuário e senha disparando input/change; NÃO envia o formulário.
 * Usa os seletores ensinados/do catálogo ou, sem eles, o primeiro campo de senha visível
 * e o campo de texto/e-mail antes dele.
 */
export function scriptPreencher(
  usuario: string,
  senha: string,
  seletores: { usuario: string; senha: string } | null,
): string {
  return `(() => {
    const visivel = (el) => !!el && el.offsetParent !== null && !el.disabled;
    let u = null, s = null;
    const sel = ${json(seletores)};
    try {
      if (sel) { u = document.querySelector(sel.usuario); s = document.querySelector(sel.senha); }
    } catch {}
    if (!s) s = [...document.querySelectorAll('input[type=password]')].find(visivel) || null;
    if (!u && s) {
      const campos = [...document.querySelectorAll('input')].filter((i) => visivel(i) && /^(text|email|tel|)$/.test(i.type));
      u = campos.filter((i) => i.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING).pop() || null;
    }
    if (!u || !s) return false;
    const definir = (el, v) => {
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      el.focus();
      if (setter) setter.call(el, v); else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    definir(u, ${json(usuario)});
    definir(s, ${json(senha)});
    s.blur();
    return true;
  })()`
}

/** "Ensinar os campos": o próximo clique em dois campos devolve seus seletores (só leitura). */
export function scriptEnsinar(): string {
  return `new Promise((resolve) => {
    const caminho = (el) => {
      if (el.id) return '#' + CSS.escape(el.id);
      if (el.name) return el.tagName.toLowerCase() + '[name="' + CSS.escape(el.name) + '"]';
      const partes = [];
      for (let e = el; e && e.nodeType === 1 && partes.length < 6; e = e.parentElement) {
        const irmaos = e.parentElement ? [...e.parentElement.children].filter((x) => x.tagName === e.tagName) : [];
        partes.unshift(e.tagName.toLowerCase() + (irmaos.length > 1 ? ':nth-of-type(' + (irmaos.indexOf(e) + 1) + ')' : ''));
      }
      return partes.join('>');
    };
    const pegos = [];
    const ouvir = (ev) => {
      const el = ev.target;
      if (!(el instanceof HTMLInputElement)) return;
      pegos.push(caminho(el));
      if (pegos.length === 2) { document.removeEventListener('focusin', ouvir, true); resolve({ usuario: pegos[0], senha: pegos[1] }); }
    };
    document.addEventListener('focusin', ouvir, true);
    setTimeout(() => { document.removeEventListener('focusin', ouvir, true); resolve(null); }, 120000);
  })`
}

/** Estado de uma live (Seção 8.4): só lê elementos do player. */
export function scriptEstadoLive(s: {
  video: string
  aoVivo: string
  offline: string
  pedeLogin: string
}): string {
  return `(() => {
    const q = (x) => { try { return document.querySelector(x) } catch { return null } };
    const v = q(${json(s.video)});
    return {
      aoVivo: !!q(${json(s.aoVivo)}),
      offline: !!q(${json(s.offline)}),
      pedeLogin: !!q(${json(s.pedeLogin)}) && !v,
      tocando: !!v && !v.paused && v.readyState >= 2,
    };
  })()`
}

/** Grava a preferência de qualidade do player (RN-085); devolve true se mudou. */
export function scriptQualidade(chave: string, valor: string): string {
  return `(() => { try {
    if (localStorage.getItem(${json(chave)}) === ${json(valor)}) return false;
    localStorage.setItem(${json(chave)}, ${json(valor)}); return true;
  } catch { return false } })()`
}

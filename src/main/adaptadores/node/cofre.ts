import { z } from 'zod'
import type { CofreLogins, DadosLogin, Seletores } from '../../nucleo/portas.ts'
import {
  type CustoScrypt,
  cifrar,
  cifrarTexto,
  decifrar,
  decifrarTexto,
  derivarChave,
  novaChave,
  novoSal,
  SCRYPT,
} from './cripto.ts'

/** O `safeStorage` do Electron (DPAPI), por porta para os testes usarem um falso. */
export interface ProtecaoSistema {
  disponivel(): boolean
  proteger(dados: Uint8Array): Uint8Array
  desproteger(dados: Uint8Array): Uint8Array
}

/** Onde o cofre guarda os bytes (tabelas `cofre` e `cofre_meta` do SQLite). */
export interface ArmazemCofre {
  lerCofre(): { contaId: string; usuario: Uint8Array; senha: Uint8Array; campos: string | null }[]
  gravarCofre(contaId: string, usuario: Uint8Array, senha: Uint8Array, campos: string | null): void
  apagarCofre(contaId: string): void
  lerMeta(chave: string): Uint8Array | null
  gravarMeta(chave: string, valor: Uint8Array | null): void
}

const seletoresSchema = z.object({ usuario: z.string().max(200), senha: z.string().max(200) }).nullable()

export type ErroCofre = 'senha' | 'trancado' | 'sem_protecao'

/**
 * Cofre de logins (Seção 10, RN-140, RN-141).
 * - Cada segredo: AES-256-GCM com a chave de dados.
 * - Chave de dados: protegida pelo Windows (DPAPI) e, com senha mestra, também por uma chave scrypt.
 * - Segredos dos avisos (webhook do Discord, token do Telegram): só DPAPI, para funcionarem com o cofre trancado.
 */
export class Cofre implements CofreLogins {
  private chave: Buffer | null = null

  constructor(
    private readonly armazem: ArmazemCofre,
    private readonly sistema: ProtecaoSistema,
    private readonly custo: CustoScrypt = SCRYPT,
  ) {}

  /** Cria a chave de dados na primeira vez; sem senha mestra, já fica aberto. */
  iniciar(): 'ok' | 'sem_chave' {
    if (!this.armazem.lerMeta('chave')) {
      const k = novaChave()
      this.armazem.gravarMeta('chave', this.sistema.proteger(k))
      this.armazem.gravarMeta('modo', Buffer.from('os'))
      this.chave = k
      return 'ok'
    }
    if (this.senhaMestraLigada()) return 'ok'
    try {
      this.chave = Buffer.from(this.sistema.desproteger(this.armazem.lerMeta('chave')!))
      return 'ok'
    } catch {
      // O Windows não abriu a chave (perfil ou proteção do sistema mudou). O app abre assim mesmo, com o
      // cofre fechado nesta sessão; nada é apagado (pode ter sido uma falha passageira).
      this.chave = null
      return 'sem_chave'
    }
  }

  senhaMestraLigada(): boolean {
    return Buffer.from(this.armazem.lerMeta('modo') ?? []).toString() === 'mestra'
  }

  aberto(): boolean {
    return this.chave !== null
  }

  /** RN-141 */
  criarSenhaMestra(senha: string): ErroCofre | null {
    if (!this.chave) return 'trancado'
    const sal = novoSal()
    const kek = derivarChave(senha, sal, this.custo)
    const envolvida = cifrar(kek, this.chave)
    this.armazem.gravarMeta('sal', sal)
    this.armazem.gravarMeta('chave', this.sistema.proteger(envolvida))
    this.armazem.gravarMeta('modo', Buffer.from('mestra'))
    return null
  }

  removerSenhaMestra(senha: string): ErroCofre | null {
    const erro = this.destrancar(senha)
    if (erro) return erro
    this.armazem.gravarMeta('chave', this.sistema.proteger(this.chave!))
    this.armazem.gravarMeta('modo', Buffer.from('os'))
    this.armazem.gravarMeta('sal', null)
    return null
  }

  destrancar(senha: string): ErroCofre | null {
    if (!this.senhaMestraLigada()) {
      this.iniciar()
      return null
    }
    const sal = this.armazem.lerMeta('sal')
    const protegida = this.armazem.lerMeta('chave')
    if (!sal || !protegida) return 'senha'
    try {
      const envolvida = this.sistema.desproteger(protegida)
      this.chave = decifrar(derivarChave(senha, sal, this.custo), envolvida)
      return null
    } catch {
      return 'senha'
    }
  }

  trancar(): void {
    if (this.senhaMestraLigada()) {
      this.chave?.fill(0)
      this.chave = null
    }
  }

  salvar(
    contaId: string,
    usuario: string,
    senha: string,
    seletores: Seletores | null = null,
  ): ErroCofre | null {
    if (!this.chave) return 'trancado'
    this.armazem.gravarCofre(
      contaId,
      cifrarTexto(this.chave, usuario),
      cifrarTexto(this.chave, senha),
      seletores ? JSON.stringify(seletores) : null,
    )
    return null
  }

  dados(contaId: string): (DadosLogin & { seletores: Seletores | null }) | null {
    if (!this.chave) return null
    const l = this.armazem.lerCofre().find((x) => x.contaId === contaId)
    if (!l) return null
    try {
      const s = seletoresSchema.safeParse(l.campos ? JSON.parse(l.campos) : null)
      return {
        usuario: decifrarTexto(this.chave, l.usuario),
        senha: decifrarTexto(this.chave, l.senha),
        seletores: s.success ? s.data : null,
      }
    } catch {
      return null
    }
  }

  /** Só o usuário (para a tela de login salvo), nunca a senha. */
  usuario(contaId: string): string | null {
    return this.dados(contaId)?.usuario ?? null
  }

  contasComLogin(): string[] {
    return this.armazem.lerCofre().map((l) => l.contaId)
  }

  apagar(contaId: string): void {
    this.armazem.apagarCofre(contaId)
  }

  // ---- segredos dos avisos (RN-114) ----
  definirSegredo(canal: 'discord' | 'telegram', valor: string): void {
    const chave = `segredo:${canal}`
    if (!valor) this.armazem.gravarMeta(chave, null)
    else this.armazem.gravarMeta(chave, this.sistema.proteger(Buffer.from(valor, 'utf8')))
  }

  segredo(canal: 'discord' | 'telegram'): string | null {
    const b = this.armazem.lerMeta(`segredo:${canal}`)
    if (!b) return null
    try {
      return Buffer.from(this.sistema.desproteger(b)).toString('utf8')
    } catch {
      return null
    }
  }

  // ---- backup (RN-160): o cofre só sai cifrado com uma senha de backup ----
  exportar(senhaBackup: string): { sal: string; dados: string } | ErroCofre {
    if (!this.chave) return 'trancado'
    const itens = this.armazem.lerCofre().map((l) => ({
      contaId: l.contaId,
      usuario: decifrarTexto(this.chave!, l.usuario),
      senha: decifrarTexto(this.chave!, l.senha),
      campos: l.campos,
    }))
    const sal = novoSal()
    const k = derivarChave(senhaBackup, sal, this.custo)
    return { sal: sal.toString('base64'), dados: cifrarTexto(k, JSON.stringify(itens)).toString('base64') }
  }

  importar(pacote: { sal: string; dados: string }, senhaBackup: string): ErroCofre | number {
    if (!this.chave) return 'trancado'
    let itens: { contaId: string; usuario: string; senha: string; campos: string | null }[]
    try {
      const k = derivarChave(senhaBackup, Buffer.from(pacote.sal, 'base64'), this.custo)
      itens = z
        .array(
          z.object({
            contaId: z.string(),
            usuario: z.string(),
            senha: z.string(),
            campos: z.string().nullable(),
          }),
        )
        .parse(JSON.parse(decifrarTexto(k, Buffer.from(pacote.dados, 'base64'))))
    } catch {
      return 'senha'
    }
    for (const i of itens)
      this.armazem.gravarCofre(
        i.contaId,
        cifrarTexto(this.chave, i.usuario),
        cifrarTexto(this.chave, i.senha),
        i.campos,
      )
    return itens.length
  }
}

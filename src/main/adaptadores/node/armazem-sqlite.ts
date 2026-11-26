import { DatabaseSync } from 'node:sqlite'
import { aplicarRetencaoMetricas, eventosParaApagar } from '../../nucleo/painel/painel.ts'
import type { Armazem, LinhaMetrica, LinhaPing } from '../../nucleo/portas.ts'
import {
  type Aviso,
  type Conta,
  contaSchema,
  type EventoConta,
  type Grupo,
  grupoSchema,
  type Jogo,
  jogoSchema,
  type Live,
  liveSchema,
  type TextoVigiado,
  textoVigiadoSchema,
} from '@shared/tipos/dominio.ts'

/**
 * Armazém em SQLite (`node:sqlite`, sem módulo nativo; ADR 0007), modelo da Seção 4.5.
 * Migrações por `PRAGMA user_version`, com ida e volta.
 */

type Migracao = { sobe: string; desce: string }

export const MIGRACOES: Migracao[] = [
  {
    sobe: `
      CREATE TABLE jogos (id TEXT PRIMARY KEY, dados TEXT NOT NULL, origem TEXT NOT NULL);
      CREATE TABLE grupos (id TEXT PRIMARY KEY, nome TEXT NOT NULL, cor TEXT NOT NULL, ordem INTEGER NOT NULL,
        ligado INTEGER NOT NULL, visao TEXT NOT NULL, layout_json TEXT NOT NULL);
      CREATE TABLE contas (id TEXT PRIMARY KEY, grupo_id TEXT NOT NULL, jogo_id TEXT NOT NULL, nome TEXT NOT NULL,
        cor TEXT NOT NULL, icone TEXT NOT NULL, ordem INTEGER NOT NULL, url TEXT NOT NULL, zoom REAL NOT NULL,
        som INTEGER NOT NULL, politica_fora_tela TEXT NOT NULL, notificacoes INTEGER NOT NULL, notas TEXT NOT NULL,
        criada_em INTEGER NOT NULL);
      CREATE TABLE lives (id TEXT PRIMARY KEY, conta_id TEXT NOT NULL, plataforma TEXT NOT NULL, canal TEXT NOT NULL,
        ligada INTEGER NOT NULL, ordem INTEGER NOT NULL);
      CREATE TABLE cofre (conta_id TEXT PRIMARY KEY, usuario_cifrado BLOB NOT NULL, senha_cifrada BLOB NOT NULL,
        campos_json TEXT);
      CREATE TABLE cofre_meta (chave TEXT PRIMARY KEY, valor BLOB NOT NULL);
      CREATE TABLE textos_vigiados (id TEXT PRIMARY KEY, texto TEXT NOT NULL, escopo TEXT NOT NULL, alvo_id TEXT,
        ativo INTEGER NOT NULL);
      CREATE TABLE avisos (id TEXT PRIMARY KEY, conta_id TEXT, tipo TEXT NOT NULL, mensagem TEXT NOT NULL,
        criado_em INTEGER NOT NULL, lido INTEGER NOT NULL);
      CREATE INDEX avisos_em ON avisos(criado_em);
      CREATE TABLE metricas (conta_id TEXT NOT NULL, minuto INTEGER NOT NULL, ram_mb REAL NOT NULL,
        cpu_pct REAL NOT NULL, estado TEXT NOT NULL, PRIMARY KEY (conta_id, minuto));
      CREATE TABLE eventos_conta (conta_id TEXT NOT NULL, tipo TEXT NOT NULL, motivo TEXT NOT NULL, em INTEGER NOT NULL);
      CREATE INDEX eventos_em ON eventos_conta(em);
      CREATE TABLE ping (jogo_id TEXT NOT NULL, em INTEGER NOT NULL, ms REAL, status INTEGER NOT NULL);
      CREATE INDEX ping_em ON ping(em);
    `,
    desce: `
      DROP TABLE ping; DROP TABLE eventos_conta; DROP TABLE metricas; DROP TABLE avisos; DROP TABLE textos_vigiados;
      DROP TABLE cofre_meta; DROP TABLE cofre; DROP TABLE lives; DROP TABLE contas; DROP TABLE grupos; DROP TABLE jogos;
    `,
  },
]

const n = (b: boolean) => (b ? 1 : 0)

export class ArmazemSqlite implements Armazem {
  readonly db: DatabaseSync

  constructor(caminho: string) {
    this.db = new DatabaseSync(caminho)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;')
    this.migrarPara(MIGRACOES.length)
  }

  versao(): number {
    return Number((this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
  }

  modoJournal(): string {
    return String((this.db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode)
  }

  migrarPara(alvo: number): void {
    let v = this.versao()
    while (v < alvo) {
      this.transacao(() => this.db.exec(MIGRACOES[v]!.sobe))
      v++
      this.db.exec(`PRAGMA user_version = ${v}`)
    }
    while (v > alvo) {
      this.transacao(() => this.db.exec(MIGRACOES[v - 1]!.desce))
      v--
      this.db.exec(`PRAGMA user_version = ${v}`)
    }
  }

  fechar(): void {
    this.db.close()
  }

  transacao<T>(fn: () => T): T {
    if (this.db.isTransaction) return fn()
    this.db.exec('BEGIN')
    try {
      const r = fn()
      this.db.exec('COMMIT')
      return r
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  // ---- jogos ----
  listarJogos(): Jogo[] {
    return (this.db.prepare('SELECT dados FROM jogos').all() as { dados: string }[])
      .map((r) => jogoSchema.safeParse(JSON.parse(r.dados)))
      .filter((r) => r.success)
      .map((r) => r.data)
  }
  salvarJogo(j: Jogo): void {
    this.db
      .prepare('INSERT INTO jogos (id, dados, origem) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET dados = excluded.dados, origem = excluded.origem')
      .run(j.id, JSON.stringify(j), j.origem)
  }
  apagarJogo(id: string): void {
    this.db.prepare('DELETE FROM jogos WHERE id = ?').run(id)
  }

  // ---- grupos ----
  listarGrupos(): Grupo[] {
    type L = { id: string; nome: string; cor: string; ordem: number; ligado: number; visao: string; layout_json: string }
    return (this.db.prepare('SELECT * FROM grupos ORDER BY ordem').all() as L[])
      .map((r) =>
        grupoSchema.safeParse({
          id: r.id,
          nome: r.nome,
          cor: r.cor,
          ordem: r.ordem,
          ligado: r.ligado === 1,
          visao: r.visao,
          layout: JSON.parse(r.layout_json),
        }),
      )
      .filter((r) => r.success)
      .map((r) => r.data)
  }
  salvarGrupo(g: Grupo): void {
    this.db
      .prepare(
        `INSERT INTO grupos (id, nome, cor, ordem, ligado, visao, layout_json) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, cor=excluded.cor, ordem=excluded.ordem,
         ligado=excluded.ligado, visao=excluded.visao, layout_json=excluded.layout_json`,
      )
      .run(g.id, g.nome, g.cor, g.ordem, n(g.ligado), g.visao, JSON.stringify(g.layout))
  }
  apagarGrupo(id: string): void {
    this.db.prepare('DELETE FROM grupos WHERE id = ?').run(id)
  }

  // ---- contas ----
  listarContas(): Conta[] {
    type L = Record<string, string | number>
    return (this.db.prepare('SELECT * FROM contas ORDER BY ordem').all() as L[])
      .map((r) =>
        contaSchema.safeParse({
          id: r.id,
          grupoId: r.grupo_id,
          jogoId: r.jogo_id,
          nome: r.nome,
          cor: r.cor,
          icone: r.icone,
          ordem: r.ordem,
          url: r.url,
          zoom: r.zoom,
          som: r.som === 1,
          politicaForaTela: r.politica_fora_tela,
          notificacoesDaPagina: r.notificacoes === 1,
          notas: r.notas,
          criadaEm: r.criada_em,
        }),
      )
      .filter((r) => r.success)
      .map((r) => r.data)
  }
  salvarConta(c: Conta): void {
    this.db
      .prepare(
        `INSERT INTO contas (id, grupo_id, jogo_id, nome, cor, icone, ordem, url, zoom, som, politica_fora_tela,
         notificacoes, notas, criada_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET grupo_id=excluded.grupo_id, jogo_id=excluded.jogo_id, nome=excluded.nome,
         cor=excluded.cor, icone=excluded.icone, ordem=excluded.ordem, url=excluded.url, zoom=excluded.zoom,
         som=excluded.som, politica_fora_tela=excluded.politica_fora_tela, notificacoes=excluded.notificacoes,
         notas=excluded.notas`,
      )
      .run(
        c.id,
        c.grupoId,
        c.jogoId,
        c.nome,
        c.cor,
        c.icone,
        c.ordem,
        c.url,
        c.zoom,
        n(c.som),
        c.politicaForaTela,
        n(c.notificacoesDaPagina),
        c.notas,
        c.criadaEm,
      )
  }
  apagarConta(id: string): void {
    this.transacao(() => {
      this.db.prepare('DELETE FROM contas WHERE id = ?').run(id)
      this.db.prepare('DELETE FROM lives WHERE conta_id = ?').run(id)
      this.db.prepare('DELETE FROM cofre WHERE conta_id = ?').run(id)
    })
  }

  // ---- lives ----
  listarLives(): Live[] {
    type L = { id: string; conta_id: string; plataforma: string; canal: string; ligada: number; ordem: number }
    return (this.db.prepare('SELECT * FROM lives ORDER BY ordem').all() as L[])
      .map((r) =>
        liveSchema.safeParse({
          id: r.id,
          contaId: r.conta_id,
          plataforma: r.plataforma,
          canal: r.canal,
          ligada: r.ligada === 1,
          ordem: r.ordem,
        }),
      )
      .filter((r) => r.success)
      .map((r) => r.data)
  }
  salvarLive(l: Live): void {
    this.db
      .prepare(
        `INSERT INTO lives (id, conta_id, plataforma, canal, ligada, ordem) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET plataforma=excluded.plataforma, canal=excluded.canal, ligada=excluded.ligada,
         ordem=excluded.ordem`,
      )
      .run(l.id, l.contaId, l.plataforma, l.canal, n(l.ligada), l.ordem)
  }
  apagarLive(id: string): void {
    this.db.prepare('DELETE FROM lives WHERE id = ?').run(id)
  }

  // ---- textos ----
  listarTextos(): TextoVigiado[] {
    type L = { id: string; texto: string; escopo: string; alvo_id: string | null; ativo: number }
    return (this.db.prepare('SELECT * FROM textos_vigiados').all() as L[])
      .map((r) =>
        textoVigiadoSchema.safeParse({ id: r.id, texto: r.texto, escopo: r.escopo, alvoId: r.alvo_id, ativo: r.ativo === 1 }),
      )
      .filter((r) => r.success)
      .map((r) => r.data)
  }
  salvarTexto(t: TextoVigiado): void {
    this.db
      .prepare(
        `INSERT INTO textos_vigiados (id, texto, escopo, alvo_id, ativo) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET texto=excluded.texto, escopo=excluded.escopo, alvo_id=excluded.alvo_id,
         ativo=excluded.ativo`,
      )
      .run(t.id, t.texto, t.escopo, t.alvoId, n(t.ativo))
  }
  apagarTexto(id: string): void {
    this.db.prepare('DELETE FROM textos_vigiados WHERE id = ?').run(id)
  }

  // ---- avisos ----
  registrarAviso(a: Aviso): void {
    this.db
      .prepare('INSERT INTO avisos (id, conta_id, tipo, mensagem, criado_em, lido) VALUES (?, ?, ?, ?, ?, ?)')
      .run(a.id, a.contaId, a.tipo, a.mensagem, a.criadoEm, n(a.lido))
  }
  listarAvisos(limite: number): Aviso[] {
    type L = { id: string; conta_id: string | null; tipo: Aviso['tipo']; mensagem: string; criado_em: number; lido: number }
    return (this.db.prepare('SELECT * FROM avisos ORDER BY criado_em DESC, rowid DESC LIMIT ?').all(limite) as L[]).map(
      (r) => ({ id: r.id, contaId: r.conta_id, tipo: r.tipo, mensagem: r.mensagem, criadoEm: r.criado_em, lido: r.lido === 1 }),
    )
  }
  contarNaoLidos(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM avisos WHERE lido = 0').get() as { n: number }).n)
  }
  marcarAvisosLidos(): void {
    this.db.exec('UPDATE avisos SET lido = 1 WHERE lido = 0')
  }

  // ---- eventos, métricas, ping ----
  registrarEvento(e: EventoConta): void {
    this.db.prepare('INSERT INTO eventos_conta (conta_id, tipo, motivo, em) VALUES (?, ?, ?, ?)').run(e.contaId, e.tipo, e.motivo, e.em)
  }
  listarEventos(desde: number, contaId?: string): EventoConta[] {
    type L = { conta_id: string; tipo: EventoConta['tipo']; motivo: string; em: number }
    const linhas = (
      contaId
        ? this.db.prepare('SELECT * FROM eventos_conta WHERE em >= ? AND conta_id = ? ORDER BY em').all(desde, contaId)
        : this.db.prepare('SELECT * FROM eventos_conta WHERE em >= ? ORDER BY em').all(desde)
    ) as L[]
    return linhas.map((r) => ({ contaId: r.conta_id, tipo: r.tipo, motivo: r.motivo, em: r.em }))
  }
  registrarMetricas(linhas: LinhaMetrica[]): void {
    const st = this.db.prepare(
      'INSERT OR REPLACE INTO metricas (conta_id, minuto, ram_mb, cpu_pct, estado) VALUES (?, ?, ?, ?, ?)',
    )
    this.transacao(() => {
      for (const l of linhas) st.run(l.contaId, l.minuto, l.ramMb, l.cpuPct, l.estado)
    })
  }
  listarMetricas(desde: number): LinhaMetrica[] {
    type L = { conta_id: string; minuto: number; ram_mb: number; cpu_pct: number; estado: string }
    return (this.db.prepare('SELECT * FROM metricas WHERE minuto >= ? ORDER BY minuto').all(desde) as L[]).map((r) => ({
      contaId: r.conta_id,
      minuto: r.minuto,
      ramMb: r.ram_mb,
      cpuPct: r.cpu_pct,
      estado: r.estado,
    }))
  }
  registrarPing(p: LinhaPing): void {
    this.db.prepare('INSERT INTO ping (jogo_id, em, ms, status) VALUES (?, ?, ?, ?)').run(p.jogoId, p.em, p.ms, p.status)
  }
  listarPing(desde: number): LinhaPing[] {
    type L = { jogo_id: string; em: number; ms: number | null; status: number }
    return (this.db.prepare('SELECT * FROM ping WHERE em >= ? ORDER BY em').all(desde) as L[]).map((r) => ({
      jogoId: r.jogo_id,
      em: r.em,
      ms: r.ms,
      status: r.status,
    }))
  }

  /** RN-163: 30 dias; métricas com mais de 48 h viram média por hora. */
  aplicarRetencao(agora: number): void {
    const lim = agora - 30 * 86_400_000
    this.transacao(() => {
      const velhas = this.listarMetricas(0).filter((m) => m.minuto < agora - 48 * 3_600_000)
      if (velhas.length > 0) {
        const novas = aplicarRetencaoMetricas(velhas, agora)
        this.db.prepare('DELETE FROM metricas WHERE minuto < ?').run(agora - 48 * 3_600_000)
        this.registrarMetricas(novas)
      }
      const apagar = eventosParaApagar(this.listarEventos(0), agora)
      if (apagar.length > 0) this.db.prepare('DELETE FROM eventos_conta WHERE em < ?').run(lim)
      this.db.prepare('DELETE FROM ping WHERE em < ?').run(lim)
      this.db.prepare('DELETE FROM avisos WHERE criado_em < ?').run(lim)
    })
  }

  // ---- cofre (bytes já cifrados) ----
  lerCofre(): { contaId: string; usuario: Uint8Array; senha: Uint8Array; campos: string | null }[] {
    type L = { conta_id: string; usuario_cifrado: Uint8Array; senha_cifrada: Uint8Array; campos_json: string | null }
    return (this.db.prepare('SELECT * FROM cofre').all() as L[]).map((r) => ({
      contaId: r.conta_id,
      usuario: r.usuario_cifrado,
      senha: r.senha_cifrada,
      campos: r.campos_json,
    }))
  }
  gravarCofre(contaId: string, usuario: Uint8Array, senha: Uint8Array, campos: string | null): void {
    this.db
      .prepare(
        `INSERT INTO cofre (conta_id, usuario_cifrado, senha_cifrada, campos_json) VALUES (?, ?, ?, ?)
         ON CONFLICT(conta_id) DO UPDATE SET usuario_cifrado=excluded.usuario_cifrado,
         senha_cifrada=excluded.senha_cifrada, campos_json=excluded.campos_json`,
      )
      .run(contaId, usuario, senha, campos)
  }
  apagarCofre(contaId: string): void {
    this.db.prepare('DELETE FROM cofre WHERE conta_id = ?').run(contaId)
  }
  lerMeta(chave: string): Uint8Array | null {
    const r = this.db.prepare('SELECT valor FROM cofre_meta WHERE chave = ?').get(chave) as { valor: Uint8Array } | undefined
    return r?.valor ?? null
  }
  gravarMeta(chave: string, valor: Uint8Array | null): void {
    if (valor === null) this.db.prepare('DELETE FROM cofre_meta WHERE chave = ?').run(chave)
    else
      this.db
        .prepare('INSERT INTO cofre_meta (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor')
        .run(chave, valor)
  }
}

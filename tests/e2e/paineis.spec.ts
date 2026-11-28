/**
 * RN-007: cada botão dos painéis do grupo e da conta (botão direito) é conferido no app real.
 */
import { expect, type Page, test } from '@playwright/test'
import { abrirApp, criarContas, esperarEstado, garantirJogoFalso } from './ajuda.ts'

type H = any
type A = Awaited<ReturnType<typeof abrirApp>>

const motor =
  (a: A) =>
  (fn: string, ...args: unknown[]) =>
    a.app.evaluate((_e, { fn, args }) => (globalThis as H).hdeckTeste.motor[fn](...args), { fn, args })
const snap = (a: A) => a.app.evaluate(() => (globalThis as H).hdeckTeste.motor.snapshot())
const eventos = (a: A, id: string) =>
  a.app.evaluate(
    (_e, id) =>
      (globalThis as H).hdeckTeste.armazem.listarEventos(0, id).map((e: H) => `${e.tipo}:${e.motivo}`),
    id,
  ) as Promise<string[]>

async function abrirPainelGrupo(j: Page, passo = 0) {
  console.log(`painel do grupo, passo ${passo}`)
  // Nenhum painel pode ter ficado aberto da ação anterior.
  await expect(j.getByRole('menu')).toHaveCount(0)
  await j.locator('section.grupo .cabeca').first().click({ button: 'right' })
  return j.getByRole('menu')
}
async function abrirPainelConta(j: Page, i = 0, passo = 0) {
  console.log(`painel da conta, passo ${passo}`)
  await expect(j.getByRole('menu')).toHaveCount(0)
  await j.locator('section.grupo li').nth(i).click({ button: 'right' })
  return j.getByRole('menu')
}

test('RN-007 RN-058 RN-037 painel do grupo: todos os botões funcionam', async () => {
  test.setTimeout(4 * 60_000)
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    await motor(a)('alterarConfig', 'geral.abrirAosPoucosSeg', 0)
    const [c1, c2] = await criarContas(a, 2)
    const j = a.janela
    const g = (await snap(a)).grupos[0]

    let p = await abrirPainelGrupo(j, 1)
    await p.getByRole('button', { name: 'Desligar todas', exact: true }).click()
    await esperarEstado(a, c1!, ['desligada'])
    await esperarEstado(a, c2!, ['desligada'])

    p = await abrirPainelGrupo(j, 2)
    await p.getByRole('button', { name: 'Ligar todas', exact: true }).click()
    await esperarEstado(a, c1!, ['ativa', 'economica', 'escondida'])
    await esperarEstado(a, c2!, ['ativa', 'economica', 'escondida'])

    p = await abrirPainelGrupo(j, 3)
    await p.getByRole('button', { name: 'Recarregar', exact: true }).click()
    await expect.poll(() => eventos(a, c1!)).toContain('recarga:manual')
    await esperarEstado(a, c1!, ['ativa', 'economica', 'escondida'])
    await esperarEstado(a, c2!, ['ativa', 'economica', 'escondida'])

    p = await abrirPainelGrupo(j, 4)
    await p.getByRole('button', { name: 'Otimizar', exact: true }).click()
    await expect.poll(() => eventos(a, c1!)).toContain('recarga:otimizar')
    await esperarEstado(a, c1!, ['ativa', 'economica', 'escondida'])

    p = await abrirPainelGrupo(j, 5)
    await p.getByRole('button', { name: /Adicionar conta neste grupo/ }).click()
    await expect(j.getByRole('dialog', { name: 'Adicionar conta' })).toBeVisible()
    await j.keyboard.press('Escape')

    p = await abrirPainelGrupo(j, 6)
    await p.getByRole('button', { name: /Endereço das contas novas/ }).click()
    await p.getByRole('textbox', { name: 'Endereço das contas novas' }).fill(`${a.servidor.url}/jogo?novo=1`)
    await p.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect.poll(async () => (await snap(a)).grupos[0].layout.urlPadrao).toContain('novo=1')

    await p.getByRole('radio', { name: 'Economizar' }).click()
    await expect
      .poll(async () => Object.values((await snap(a)).grupos[0].layout.politicas))
      .toEqual(['economizar'])
    await p.getByRole('radio', { name: 'Farmando' }).click()
    await expect
      .poll(async () => Object.values((await snap(a)).grupos[0].layout.politicas))
      .toEqual(['manter'])

    await p.getByRole('button', { name: '#f87171', exact: true }).click()
    await expect.poll(async () => (await snap(a)).grupos[0].cor).toBe('#f87171')

    await p.getByRole('button', { name: /Renomear/ }).click()
    const campo = p.getByRole('textbox', { name: 'Renomear' })
    await campo.fill('Meu grupo')
    await campo.press('Enter')
    await expect.poll(async () => (await snap(a)).grupos[0].nome).toBe('Meu grupo')

    await j.keyboard.press('Escape')
    await motor(a)('criarGrupo', 'Segundo')
    p = await abrirPainelGrupo(j, 7)
    await p.getByRole('button', { name: 'Descer grupo', exact: true }).click()
    await expect.poll(async () => (await snap(a)).grupos.find((x: H) => x.id === g.id).ordem).toBe(1)
    await j.keyboard.press('Escape')
    await j.getByRole('region', { name: 'Meu grupo' }).locator('.cabeca').click({ button: 'right' })
    await j.getByRole('menu').getByRole('button', { name: 'Subir grupo', exact: true }).click()
    await expect.poll(async () => (await snap(a)).grupos.find((x: H) => x.id === g.id).ordem).toBe(0)
    await j.keyboard.press('Escape')

    p = await abrirPainelGrupo(j, 8)
    await p.getByRole('button', { name: /Abrir em janela própria/ }).click()
    await expect.poll(() => a.app.evaluate(() => (globalThis as H).hdeckTeste.janelas.grupos.size)).toBe(1)
    await a.app.evaluate(() => [...(globalThis as H).hdeckTeste.janelas.grupos.values()][0].close())

    p = await abrirPainelGrupo(j, 9)
    await p.getByRole('button', { name: /Ligar só este grupo/ }).click()
    await expect.poll(async () => (await snap(a)).grupos.find((x: H) => x.id === g.id).ligado).toBe(true)

    p = await abrirPainelGrupo(j, 10)
    await p.getByRole('button', { name: /Excluir grupo/ }).click()
    await expect(j.getByRole('dialog', { name: 'Apagar grupo' })).toBeVisible()
    await j.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click()
  } finally {
    await a.fechar()
  }
})

test('RN-007 RN-038 RN-058 painel da conta: todos os botões funcionam', async () => {
  test.setTimeout(4 * 60_000)
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    await motor(a)('alterarConfig', 'geral.abrirAosPoucosSeg', 0)
    const [c1] = await criarContas(a, 2)
    const j = a.janela
    const conta = () => snap(a).then((s: H) => s.contas.find((x: H) => x.id === c1))

    let p = await abrirPainelConta(j, 0, 1)
    await p.getByRole('button', { name: 'Recarregar', exact: true }).click()
    await expect.poll(() => eventos(a, c1!)).toContain('recarga:manual')
    await esperarEstado(a, c1!, ['ativa', 'economica', 'escondida'])

    p = await abrirPainelConta(j, 0, 2)
    await p.getByRole('button', { name: 'Otimizar', exact: true }).click()
    await expect.poll(() => eventos(a, c1!)).toContain('recarga:otimizar')
    await esperarEstado(a, c1!, ['ativa', 'economica', 'escondida'])

    await a.app
      .evaluate(
        (_e, id) => (globalThis as H).hdeckTeste.motor.pagina(id).carregar(`${(globalThis as H).url}`),
        c1!,
      )
      .catch(() => {})
    p = await abrirPainelConta(j, 0, 3)
    await p.getByRole('button', { name: 'Início', exact: true }).click()
    await expect
      .poll(() => a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.fabrica.pagina(id).urlAtual(), c1!))
      .toContain('/jogo')

    p = await abrirPainelConta(j, 0, 4)
    await p.getByRole('button', { name: 'Desligar', exact: true }).click()
    await esperarEstado(a, c1!, ['desligada'])
    p = await abrirPainelConta(j, 0, 5)
    await p.getByRole('button', { name: 'Ligar', exact: true }).click()
    await esperarEstado(a, c1!, ['ativa', 'economica', 'escondida'])

    p = await abrirPainelConta(j, 0, 6)
    await p.getByRole('button', { name: /Destacar em janela própria/ }).click()
    await expect
      .poll(() => a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.janelas.soltas.has(id), c1!))
      .toBe(true)
    await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.janelas.soltas.get(id).close(), c1!)

    p = await abrirPainelConta(j, 0, 7)
    await p.getByRole('button', { name: /Lives da Twitch e da Kick/ }).click()
    await expect(j.getByRole('dialog', { name: /Lives de/ })).toBeVisible()
    await j.keyboard.press('Escape')

    p = await abrirPainelConta(j, 0, 8)
    await p.getByRole('button', { name: /Salvar e-mail e senha/ }).click()
    await expect(j.getByRole('dialog', { name: /Login de/ })).toBeVisible()
    await j.keyboard.press('Escape')

    p = await abrirPainelConta(j, 0, 9)
    await p.getByRole('switch', { name: 'Silenciar esta conta' }).click()
    await expect.poll(async () => (await conta()).som).toBe(false)
    await p.getByRole('button', { name: '+', exact: true }).click()
    await expect.poll(async () => (await conta()).zoom).toBe(1.1)
    await expect(p.getByText('110%')).toBeVisible()
    await p.getByRole('button', { name: '−', exact: true }).click()
    await expect.poll(async () => (await conta()).zoom).toBe(1)
    await p.getByRole('radio', { name: 'Economizar' }).click()
    await expect.poll(async () => (await conta()).politicaForaTela).toBe('economizar')

    await p.getByRole('button', { name: /Renomear/ }).click()
    const nome = p.getByRole('textbox', { name: 'Renomear' })
    await nome.fill('Nova conta x')
    await nome.press('Enter')
    await expect.poll(async () => (await conta()).nome).toBe('Nova conta x')

    await p.getByRole('button', { name: /Alterar o endereço/ }).click()
    const url = p.getByRole('textbox', { name: 'Alterar o endereço' })
    await url.fill(`${a.servidor.url}/jogo?mudou=1`)
    await p.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect.poll(async () => (await conta()).url).toContain('mudou=1')
    await j.keyboard.press('Escape')

    const b = await motor(a)('criarGrupo', 'Destino')
    p = await abrirPainelConta(j, 0, 10)
    await p.getByRole('combobox', { name: 'Mover para' }).selectOption(b.id)
    await expect(j.getByRole('dialog', { name: 'Mover conta' })).toBeVisible()
    await j.getByRole('dialog').getByRole('button', { name: 'Mover', exact: true }).click()
    await expect.poll(async () => (await conta()).grupoId).toBe(b.id)
    await motor(a)('moverConta', c1, (await snap(a)).grupos.find((x: H) => x.id !== b.id).id, 0)

    p = await abrirPainelConta(j, 0, 11)
    const antes = (await snap(a)).contas.length
    await p.getByRole('button', { name: /Duplicar configuração/ }).click()
    await expect.poll(async () => (await snap(a)).contas.length).toBe(antes + 1)

    p = await abrirPainelConta(j, 0, 12)
    await p.getByRole('button', { name: /Ferramentas do desenvolvedor/ }).click()
    await expect
      .poll(() =>
        a.app.evaluate(
          async (_e, id) => (await (globalThis as H).hdeckTeste.fabrica.pagina(id).nativo()).devtools,
          c1!,
        ),
      )
      .toBe(true)

    p = await abrirPainelConta(j, 0, 13)
    await p.getByRole('button', { name: /Limpar dados/ }).click()
    await j.getByRole('dialog').getByRole('button', { name: 'Limpar', exact: true }).click()
    await expect
      .poll(() => a.app.evaluate(() => (globalThis as H).hdeckTeste.motor.snapshot().contas.length))
      .toBe(antes + 1)

    p = await abrirPainelConta(j, 0, 14)
    await p.getByRole('button', { name: /Excluir conta/ }).click()
    await expect(j.getByRole('dialog', { name: 'Apagar conta' })).toBeVisible()
    await j.getByRole('dialog').getByRole('button', { name: 'Apagar', exact: true }).click()
    await expect.poll(async () => (await snap(a)).contas.some((x: H) => x.id === c1)).toBe(false)
  } finally {
    await a.fechar()
  }
})

test('RN-008 painel direito: mostra a conta selecionada, recolhe e expande, e os botões funcionam', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c1] = await criarContas(a, 2)
    await esperarEstado(a, c1!, ['ativa', 'economica', 'escondida'])
    await motor(a)('ativar', c1)
    const j = a.janela
    const painel = j.getByRole('complementary', { name: 'Configurações da conta' })
    await expect(painel).toBeVisible()
    await expect(painel.locator('.nome')).toHaveText('Conta 1')
    // RAM e CPU da conta aparecem (medidas pelo motor).
    await expect(painel.locator('.medida b').first()).toHaveText(/\d+ MB/, { timeout: 15_000 })
    await j.screenshot({ path: 'test-results/painel-direito.png' })
    // Som: liga e desliga o som da conta.
    const somAntes = (await snap(a)).contas.find((c: H) => c.id === c1).som
    await painel.getByRole('button', { name: 'Som' }).click()
    await expect.poll(async () => (await snap(a)).contas.find((c: H) => c.id === c1).som).toBe(!somAntes)
    // Otimizar entra no histórico desta conta.
    await painel.locator('.cartao-otimizar').click()
    await expect.poll(() => eventos(a, c1!)).toContain('recarga:otimizar')
    await expect(painel.locator('.historico')).toContainText('otimizada', { timeout: 20_000 })
    // Recolher deixa só a faixa; a conta ganha o espaço; expandir volta.
    const antes = await j.locator(`[data-conta="${c1}"] .corpo`).boundingBox()
    await painel.getByRole('button', { name: 'Recolher o painel da conta' }).click()
    await expect(painel.locator('.rolagem')).toHaveCount(0)
    await expect
      .poll(async () => (await j.locator(`[data-conta="${c1}"] .corpo`).boundingBox())?.width ?? 0)
      .toBeGreaterThan((antes?.width ?? 0) + 100)
    await painel.getByRole('button', { name: 'Abrir o painel da conta' }).click()
    await expect(painel.locator('.rolagem')).toBeVisible()
  } finally {
    await a.fechar()
  }
})

test('RN-007 o teclado preso na página de uma conta volta para a interface ao clicar ou passar o mouse num controle', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c1] = await criarContas(a, 1)
    await esperarEstado(a, c1!, ['ativa'])
    const j = a.janela
    const teclado = () =>
      a.app.evaluate(() => {
        const t = (globalThis as H).hdeckTeste
        return t.fabrica.donoDoTeclado(t.janelas.principal)
      })
    // O usuário clicou no jogo: o teclado foi para a janela nativa da conta.
    await a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.fabrica.pagina(id).focarTeclado(), c1!)
    await expect.poll(teclado).toBe('conta')
    // Um clique na interface devolve o teclado (antes os campos paravam de aceitar texto).
    await j.evaluate(() => (window as H).hdeck.app.focarInterface())
    await expect.poll(teclado).toBe('interface')
  } finally {
    await a.fechar()
  }
})

test('RN-008 painel direito personalizável: tira e põe de volta botões e blocos; RN-045 detalhamento do consumo', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c1] = await criarContas(a, 1)
    await esperarEstado(a, c1!, ['ativa'])
    const j = a.janela
    const painel = j.getByRole('complementary', { name: 'Configurações da conta' })
    await painel.getByRole('button', { name: 'Personalizar este painel' }).click()
    await painel.getByRole('button', { name: 'Tirar Histórico desta conta do painel' }).click()
    await painel.getByRole('button', { name: 'Tirar Destacar do painel' }).click()
    await expect.poll(async () => (await snap(a)).config.painelDireito.secoes).not.toContain('historico')
    await expect.poll(async () => (await snap(a)).config.painelDireito.botoes).not.toContain('destacar')
    // Volta pelo "Adicionar ao painel".
    await painel.locator('.item-secao', { hasText: 'Histórico desta conta' }).click()
    await expect.poll(async () => (await snap(a)).config.painelDireito.secoes).toContain('historico')
    await painel.getByRole('button', { name: 'Pronto' }).click()
    // Otimizar sozinho da conta: por RAM.
    await painel.getByRole('radio', { name: 'Por RAM' }).click()
    await expect
      .poll(async () => (await snap(a)).contas.find((c: H) => c.id === c1).otimizarAuto.modo)
      .toBe('memoria')
    // Clique no consumo da barra de título: detalhamento por parte.
    await j.locator('button.consumo').click()
    await expect(j.getByRole('menu')).toContainText('Tela do HDeck', { timeout: 10_000 })
    await expect(j.getByRole('menu')).toContainText('Grupo 1')
  } finally {
    await a.fechar()
  }
})

test('RN-008 RN-007 painéis recolhidos: contas por grupo e cor à esquerda, botões escolhidos à direita', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const [c1, c2] = await criarContas(a, 2)
    await esperarEstado(a, c1!, ['ativa', 'economica', 'escondida'])
    const j = a.janela
    await j.getByRole('button', { name: 'Recolher' }).first().click()
    const minis = j.locator('aside.lateral .mini-conta')
    await expect(minis).toHaveCount(2)
    // Clique esquerdo abre a conta; direito abre o painel dela.
    await minis.nth(1).click()
    await expect.poll(async () => (await snap(a)).ativaId).toBe(c2)
    await minis.nth(0).click({ button: 'right' })
    await expect(j.getByRole('menu')).toContainText('Conta 1')
    await j.keyboard.press('Escape')
    // Direita recolhida: tudo o que está no painel (cada botão e um ícone para cada bloco), mais o expandir.
    const painel = j.getByRole('complementary', { name: 'Configurações da conta' })
    await painel.getByRole('button', { name: 'Recolher o painel da conta' }).click()
    const cfg = (await snap(a)).config.painelDireito
    await expect(painel.locator('.mini-acao:not(.lives)')).toHaveCount(
      cfg.botoes.length +
        cfg.rodape.length +
        cfg.secoes.filter((x: string) => x !== 'acoes' && x !== 'lives').length +
        1,
    )
    await j.screenshot({ path: 'test-results/paineis-recolhidos.png' })
    // Clicar no ícone de um bloco abre o painel nele.
    await painel.getByRole('button', { name: 'Consumo na última hora' }).click()
    await expect(painel.locator('[data-secao="consumo"]')).toBeVisible()
    await painel.getByRole('button', { name: 'Recolher o painel da conta' }).click()
    await painel.getByRole('button', { name: 'Abrir o painel da conta' }).click()
    await expect(painel.locator('.rolagem')).toBeVisible()
    void c1
  } finally {
    await a.fechar()
  }
})

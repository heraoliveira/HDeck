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
      .poll(() =>
        a.app.evaluate((_e, id) => (globalThis as H).hdeckTeste.fabrica.view(id).webContents.getURL(), c1!),
      )
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
          (_e, id) => (globalThis as H).hdeckTeste.fabrica.view(id).webContents.isDevToolsOpened(),
          c1!,
        ),
      )
      .toBe(true)
    await a.app.evaluate(
      (_e, id) => (globalThis as H).hdeckTeste.fabrica.view(id).webContents.closeDevTools(),
      c1!,
    )

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

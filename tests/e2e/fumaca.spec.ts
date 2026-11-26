import { expect, test } from '@playwright/test'
import { abrirApp, criarContas, garantirJogoFalso } from './ajuda.ts'

test('RN-040 o app abre, mostra a grade e as contas do jogo falso', async () => {
  const a = await abrirApp()
  try {
    await garantirJogoFalso(a)
    const ids = await criarContas(a, 2)
    await expect(a.janela.locator('.moldura')).toHaveCount(2)
    await a.janela.locator('.moldura').first().click()
    await a.janela.screenshot({ path: 'test-results/fumaca-grade.png' })
    const estado = await a.app.evaluate(() => {
      const h = (
        globalThis as unknown as {
          hdeckTeste: { motor: { snapshot(): { estados: Record<string, { estado: string }> } } }
        }
      ).hdeckTeste
      return h.motor.snapshot().estados
    })
    expect(Object.keys(estado)).toEqual(expect.arrayContaining(ids))
  } finally {
    await a.fechar()
  }
})

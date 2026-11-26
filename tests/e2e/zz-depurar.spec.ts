import { test } from '@playwright/test'
import { abrirApp, criarContas, garantirJogoFalso } from './ajuda.ts'
test('depurar', async () => {
  const a = await abrirApp()
  a.janela.on('console', (m) => console.log('CONSOLE', m.type(), m.text()))
  await garantirJogoFalso(a)
  await criarContas(a, 2)
  await new Promise((r) => setTimeout(r, 1500))
  const r = await a.app.evaluate(() => {
    const m = (globalThis as any).hdeckTeste.motor
    return [...m.rt].map(([id, rt]: any) => ({ id, espaco: rt.espaco, exib: rt.exibicao, fase: rt.estado.fase }))
  })
  console.log(JSON.stringify(r, null, 1))
  await a.fechar()
})

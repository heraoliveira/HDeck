import { z } from 'zod'
import { type Jogo, jogoSchema } from '../tipos/dominio.ts'
import bruto from './jogos.json' with { type: 'json' }
import seletoresBrutos from './lives-seletores.json' with { type: 'json' }

export function catalogoDeJogos(): Jogo[] {
  return z.object({ versao: z.number(), jogos: z.array(jogoSchema) }).parse(bruto).jogos
}

const seletoresPlataforma = z.object({
  urlCanal: z.string(),
  dominios: z.array(z.string()),
  video: z.string(),
  aoVivo: z.string(),
  offline: z.string(),
  pedeLogin: z.string(),
  qualidade: z.object({
    tipo: z.literal('localStorage'),
    chave: z.string(),
    valores: z.record(z.string(), z.string()),
  }),
})
export type SeletoresPlataforma = z.infer<typeof seletoresPlataforma>

export function seletoresDasLives(): { twitch: SeletoresPlataforma; kick: SeletoresPlataforma } {
  return z
    .object({ versao: z.number(), twitch: seletoresPlataforma, kick: seletoresPlataforma })
    .parse(seletoresBrutos)
}

import { describe, expect, it } from 'vitest'
import { criarUrlConvite } from './link-convite'

describe('URL pública de convite', () => {
  it('usa a página inicial com o token na query string', () => {
    expect(criarUrlConvite('https://avaliacao.example', '/', 'tokenTeste_123'))
      .toBe('https://avaliacao.example/?convite=tokenTeste_123')
  })

  it('respeita o caminho base configurado para o frontend', () => {
    expect(criarUrlConvite('https://avaliacao.example', '/banca-viva/', 'tokenTeste_123'))
      .toBe('https://avaliacao.example/banca-viva/?convite=tokenTeste_123')
  })
})

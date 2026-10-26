import { describe, expect, it } from 'vitest'
import * as base from '../api'
import { HttpError, solicitacoes, usuarios } from '../api'
import { alterarPapel, alterarSituacao, cadastrarUsuario, listarPessoas, redefinirSenha, solicitarRecuperacao } from './acesso'
import { criarInstituicao, definirStatusInstituicao, designarAdmin, listarAuditoria, visaoPlataforma } from './plataforma'
import { arquivarProjeto, atualizarProjeto, atualizarProjetoAluno, criarProjeto, dadosExportacaoProjetos, definirEquipe } from './projetos'
import { arquivarBanca, criarBanca, definirCriterios, definirParticipantes, duplicarBanca, invalidarAvaliacao, mudarStatusBanca, obterBanca, progressoBanca, revisarAvaliacao, atualizarBanca } from './bancas'
import type { Contexto, Papel } from '../types'

const c = (usuarioId: number, instituicaoId: number, papel: Papel): Contexto => ({ usuarioId, instituicaoId, papel })
const SUPER = c(1, 0, 'superadmin'), ADMIN1 = c(2, 1, 'admin'), ADMIN2 = c(17, 2, 'admin'), COORD = c(7, 1, 'coordenador')
const ANDRE_AV = c(3, 1, 'avaliador'), CELSO = c(4, 1, 'avaliador'), LAURA = c(5, 1, 'avaliador'), BIA = c(6, 1, 'aluno'), ORI = c(10, 1, 'orientador')

async function falha(p: Promise<unknown> | (() => unknown), status: number) {
  try { await (typeof p === 'function' ? p() : p) } catch (e) { expect((e as HttpError).status).toBe(status); return }
  throw new Error(`esperava HTTP ${status}, mas a operação foi permitida`)
}
const descritores = Object.fromEntries([1, 2, 3, 4, 5].map(n => [n, `nota ${n} descrita`]))
const crit = (titulo: string, peso: number) => ({ titulo, peso, descritores })

describe('C1 – ingresso pendente → aprovado', () => {
  it('não acessa nada enquanto pendente e entra com o papel aprovado', async () => {
    await cadastrarUsuario({ nome: 'Nova Pessoa', email: 'nova@exemplo.com', senha: 'senha-forte-1', instituicaoId: 1, papel: 'orientador' })
    await falha(base.login('nova@exemplo.com', 'senha-forte-1'), 403)
    const u = usuarios.find(x => x.email === 'nova@exemplo.com')!
    await falha(base.listarProjetos(c(u.id, 1, 'orientador')), 401)
    const s = solicitacoes.find(x => x.usuarioId === u.id)!
    await falha(base.decidirSolicitacao(COORD, s.id, true), 403)
    await falha(base.decidirSolicitacao(ADMIN2, s.id, true), 404)
    await falha(base.decidirSolicitacao(ADMIN1, s.id, false, ''), 422)
    await base.decidirSolicitacao(ADMIN1, s.id, true)
    const logado = await base.login('nova@exemplo.com', 'senha-forte-1')
    expect(logado.vinculos[0]).toMatchObject({ instituicaoId: 1, papel: 'orientador', situacao: 'aprovado' })
  })
  it('recusa registra justificativa e o login explica o motivo', async () => {
    await cadastrarUsuario({ nome: 'Quem Recusa', email: 'recusado@exemplo.com', senha: 'senha-forte-1', instituicaoId: 1, papel: 'aluno' })
    const s = solicitacoes.find(x => x.email === 'recusado@exemplo.com')!
    await base.decidirSolicitacao(ADMIN1, s.id, false, 'Não consta na turma')
    await falha(base.login('recusado@exemplo.com', 'senha-forte-1'), 403)
    expect(s.justificativa).toBe('Não consta na turma')
  })
  it('valida cadastro: e-mail duplicado, senha curta e papel administrativo', async () => {
    await falha(cadastrarUsuario({ nome: 'Dup', email: 'admin@demo.dev', senha: 'senha-forte-1', instituicaoId: 1, papel: 'aluno' }), 409)
    await falha(cadastrarUsuario({ nome: 'Curta', email: 'curta@x.com', senha: '123', instituicaoId: 1, papel: 'aluno' }), 422)
    await falha(cadastrarUsuario({ nome: 'Espertinho', email: 'esp@x.com', senha: 'senha-forte-1', instituicaoId: 1, papel: 'admin' }), 422)
  })
  it('recuperação de senha não revela se a conta existe e redefine com o código', async () => {
    const a = await solicitarRecuperacao('naoexiste@x.com'), b = await solicitarRecuperacao('aluno@demo.dev')
    expect(a.mensagem).toBe(b.mensagem); expect(a.tokenDemo).toBe(undefined)
    await redefinirSenha(b.tokenDemo!, 'outra-senha-9')
    await falha(base.login('aluno@demo.dev', 'demo1234'), 401)
    await base.login('aluno@demo.dev', 'outra-senha-9')
    await falha(redefinirSenha(b.tokenDemo!, 'reuso-token-1'), 422)
  })
})

describe('C2 – isolamento entre instituições (RN10)', () => {
  it('trocar o ID retorna 404 sem vazar dados', async () => {
    await falha(base.obterProjeto(ADMIN1, 6), 404)
    await falha(atualizarProjeto(ADMIN1, 6, { nome: 'Invadido' }), 404)
    await falha(arquivarProjeto(ADMIN1, 6), 404)
    await falha(definirEquipe(ADMIN1, 6, { alunos: [] }), 404)
    expect((await base.listarProjetos(ADMIN1)).some(p => p.instituicaoId !== 1)).toBe(false)
    const b2 = await criarBanca(ADMIN2, { nome: 'Banca da Inst 2', inicio: '2026-01-01', fim: '2026-02-01', desempate: 'competicao', precisao: 2 })
    await falha(obterBanca(ADMIN1, b2.id), 404); await falha(base.ranking(ADMIN1, b2.id), 404); await falha(mudarStatusBanca(ADMIN1, b2.id, 'aberta'), 404)
  })
  it('contexto forjado (instituição/papel que o usuário não tem) é negado', async () => {
    await falha(base.listarProjetos(c(2, 2, 'admin')), 401)
    await falha(criarProjeto(c(6, 1, 'admin'), { nome: 'Fake', descricao: 'descrição longa o bastante', ano: 2026, semestre: 1, status: 'em_andamento' }), 403)
  })
  it('equipe/participantes não cruzam instituições (RN01)', async () => {
    await falha(definirEquipe(ADMIN1, 1, { alunos: [{ id: 16, funcao: 'x' }] }), 422)
    const b = await criarBanca(ADMIN1, { nome: 'Banca isolada', inicio: '2026-01-01', fim: '2026-02-01', desempate: 'competicao', precisao: 2 })
    await falha(definirParticipantes(ADMIN1, b.id, [6], []), 422)
    await falha(definirParticipantes(ADMIN1, b.id, [], [17]), 422)
  })
})

describe('restrições por perfil', () => {
  it('só admin/coordenador criam projetos; só admin arquiva', async () => {
    const d = { nome: 'Projeto Novo', descricao: 'descrição com mais de dez caracteres', ano: 2026, semestre: 1 as const, status: 'em_andamento' as const }
    await falha(criarProjeto(BIA, d), 403); await falha(criarProjeto(ORI, d), 403); await falha(criarProjeto(ANDRE_AV, d), 403)
    const p = await criarProjeto(COORD, d); expect(p.instituicaoId).toBe(1)
    await falha(arquivarProjeto(COORD, p.id), 403)
    await arquivarProjeto(ADMIN1, p.id)
    await falha(base.obterProjeto(ADMIN1, p.id), 404)
    expect(base.projetos.some(x => x.id === p.id)).toBe(true)
  })
  it('validação de projeto', async () => {
    await falha(criarProjeto(ADMIN1, { nome: 'A', descricao: 'descrição longa o suficiente', ano: 2026, semestre: 1, status: 'em_andamento' }), 422)
    await falha(criarProjeto(ADMIN1, { nome: 'Bom nome', descricao: 'curta', ano: 2026, semestre: 1, status: 'em_andamento' }), 422)
    await falha(criarProjeto(ADMIN1, { nome: 'Bom nome', descricao: 'descrição longa o suficiente', ano: 1999, semestre: 1, status: 'em_andamento' }), 422)
  })
  it('aluno edita só a descrição dos próprios projetos', async () => {
    await atualizarProjetoAluno(BIA, 1, { descricao: 'Nova descrição feita pela aluna.' })
    expect((await base.obterProjeto(BIA, 1)).descricao).toBe('Nova descrição feita pela aluna.')
    await falha(atualizarProjetoAluno(BIA, 3, { descricao: 'Tentando editar projeto alheio' }), 404)
    await falha(atualizarProjetoAluno(ORI, 1, { descricao: 'Orientador não usa esta rota' }), 403)
    await falha(atualizarProjeto(BIA, 1, { nome: 'Renomeado' }), 403)
  })
  it('visibilidade: orientador/aluno só veem vinculados; avaliador só os designados (C6)', async () => {
    expect((await base.listarProjetos(BIA)).map(p => p.id).sort()).toEqual([1, 2, 5])
    expect((await base.listarProjetos(ORI)).map(p => p.id).sort()).toEqual([1, 3, 5])
    expect((await base.listarProjetos(ANDRE_AV)).length).toBe(5)
    expect((await base.listarProjetos(c(3, 2, 'orientador'))).map(p => p.id)).toEqual([6])
    await falha(base.obterProjeto(BIA, 3), 404)
  })
  it('um usuário, dois papéis em duas instituições', async () => {
    expect(usuarios.find(u => u.id === 3)!.vinculos.map(v => `${v.instituicaoId}:${v.papel}`)).toEqual(['1:avaliador', '2:orientador'])
    await falha(base.enviarAvaliacao(c(3, 2, 'orientador'), 1, 1, {}), 404)
  })
  it('coordenador consulta pessoas, mas não altera vínculos', async () => {
    expect((await listarPessoas(COORD)).length).toBeGreaterThan(3)
    await falha(alterarSituacao(COORD, 12, 'bloqueado', 'tentativa indevida'), 403)
    await falha(alterarPapel(COORD, 12, 'admin'), 403)
    await falha(listarPessoas(BIA), 403)
  })
  it('somente superadmin gerencia instituições', async () => {
    await falha(criarInstituicao(ADMIN1, { nome: 'Minha Inst', identificador: 'minha-inst' }), 403)
    await falha(visaoPlataforma(ADMIN1), 403); await falha(definirStatusInstituicao(ADMIN1, 2, 'suspensa', 'sem permissão'), 403)
    await falha(listarAuditoria(COORD), 403)
  })
})

describe('C3/C4 – banca, critérios, notas e correção auditada', () => {
  let bid = 0, cid: number[] = []
  it('cria banca com 5 critérios, designa participantes e abre', async () => {
    const b = await criarBanca(COORD, { nome: 'Banca C3', inicio: '2026-03-01', fim: '2026-03-31', desempate: 'competicao', precisao: 2 }); bid = b.id
    await falha(mudarStatusBanca(COORD, bid, 'aberta'), 422)
    await definirCriterios(COORD, bid, ['A', 'B', 'C', 'D', 'E'].map(t => crit(`Critério ${t}`, 1)))
    await falha(definirCriterios(COORD, bid, [{ ...crit('Fraco', 1), descritores: { 1: 'x' } }]), 422)
    await falha(definirCriterios(COORD, bid, [crit('Peso zero', 0)]), 422)
    await definirParticipantes(COORD, bid, [1, 2], [3, 4])
    await mudarStatusBanca(COORD, bid, 'aberta')
    cid = (await obterBanca(COORD, bid)).criterios.map(x => x.id); expect(cid).toHaveLength(5)
  })
  it('só avaliador designado lança notas válidas (RN04)', async () => {
    const todas = (n: number) => Object.fromEntries(cid.map(i => [i, n]))
    await falha(base.enviarAvaliacao(LAURA, bid, 1, todas(3)), 403)
    await falha(base.enviarAvaliacao(ANDRE_AV, bid, 3, todas(3)), 403)
    await falha(base.enviarAvaliacao(ANDRE_AV, bid, 1, { ...todas(3), [cid[0]]: 6 }), 422)
    await falha(base.enviarAvaliacao(ANDRE_AV, bid, 1, { [cid[0]]: 3 }), 422)
    await falha(base.enviarAvaliacao(BIA, bid, 1, todas(3)), 403)
    const r = await base.enviarAvaliacao(ANDRE_AV, bid, 1, todas(4)); expect(r.versao).toBe(1)
  })
  it('segunda submissão é rejeitada; correção é auditada e versionada (C4/RN03)', async () => {
    const todas = (n: number) => Object.fromEntries(cid.map(i => [i, n]))
    await falha(base.enviarAvaliacao(ANDRE_AV, bid, 1, todas(5)), 409)
    const a = (await base.minhasAvaliacoes(ANDRE_AV, bid))[0]
    await falha(revisarAvaliacao(CELSO, a.id, todas(5)), 404)
    const rev = await revisarAvaliacao(ANDRE_AV, a.id, todas(5)); expect(rev.versao).toBe(2)
    const log = (await listarAuditoria(ADMIN1, { acao: 'avaliacao.revisar' }))[0]
    expect(log.detalhe).toContain('antes'); expect(log.atorNome).toBe('André Rocha')
  })
  it('critérios congelam após haver notas; invalidar libera reenvio; encerrada bloqueia correção', async () => {
    await falha(definirCriterios(ADMIN1, bid, [crit('Novo', 1)]), 409)
    await falha(atualizarBanca(ADMIN1, bid, { desempate: 'denso' }), 409)
    const copia = await duplicarBanca(ADMIN1, bid)
    expect(copia.criterios).toHaveLength(5); expect(copia.status).toBe('rascunho'); expect(copia.projetoIds).toEqual([])
    const a = (await base.minhasAvaliacoes(ANDRE_AV, bid))[0]
    await falha(invalidarAvaliacao(COORD, a.id, 'x'), 422); await falha(invalidarAvaliacao(ANDRE_AV, a.id, 'quero apagar'), 403)
    const pr = await progressoBanca(COORD, bid); expect(pr.concluidas).toBe(1); expect(pr.total).toBe(4)
    await invalidarAvaliacao(COORD, a.id, 'Lançada no projeto errado')
    expect((await progressoBanca(COORD, bid)).concluidas).toBe(0)
    await base.enviarAvaliacao(ANDRE_AV, bid, 1, Object.fromEntries(cid.map(i => [i, 2])))
    await mudarStatusBanca(COORD, bid, 'encerrada')
    await falha(base.enviarAvaliacao(CELSO, bid, 2, Object.fromEntries(cid.map(i => [i, 2]))), 409)
    await falha(revisarAvaliacao(ANDRE_AV, (await base.minhasAvaliacoes(ANDRE_AV, bid))[0].id, Object.fromEntries(cid.map(i => [i, 3]))), 409)
  })
  it('arquivar banca é lógico e só do admin', async () => {
    await falha(arquivarBanca(COORD, bid), 403); await arquivarBanca(ADMIN1, bid)
    await falha(obterBanca(ADMIN1, bid), 404); expect(base.avaliacoes.some(a => a.bancaId === bid)).toBe(true)
  })
})

describe('C5 – ranking com pesos, desempate e publicação (RN05–RN07)', () => {
  it('pondera por peso e aplica a política de empate', async () => {
    for (const [pol, esperado] of [['competicao', [1, 1, 3]], ['denso', [1, 1, 2]]] as const) {
      const b = await criarBanca(ADMIN1, { nome: `Banca ${pol}`, inicio: '2026-04-01', fim: '2026-04-30', desempate: pol, precisao: 2 })
      await definirCriterios(ADMIN1, b.id, [crit('Peso 3', 3), crit('Peso 1', 1)])
      await definirParticipantes(ADMIN1, b.id, [1, 2, 3], [3]); await mudarStatusBanca(ADMIN1, b.id, 'aberta')
      const [c1, c2] = (await obterBanca(ADMIN1, b.id)).criterios.map(x => x.id)
      await base.enviarAvaliacao(ANDRE_AV, b.id, 1, { [c1]: 5, [c2]: 1 })
      await base.enviarAvaliacao(ANDRE_AV, b.id, 2, { [c1]: 5, [c2]: 1 })
      await base.enviarAvaliacao(ANDRE_AV, b.id, 3, { [c1]: 1, [c2]: 5 })
      const r = await base.ranking(ADMIN1, b.id)
      expect(r.map(x => x.pontuacao)).toEqual([4, 4, 2]); expect(r.map(x => x.posicao)).toEqual(esperado)
      if (pol === 'competicao') {
        await falha(base.ranking(BIA, b.id), 403)
        await falha(base.ranking(ANDRE_AV, b.id), 403)
        await falha(base.publicarBanca(ANDRE_AV, b.id), 403)
        await mudarStatusBanca(ADMIN1, b.id, 'encerrada'); await base.publicarBanca(COORD, b.id)
        expect((await base.ranking(BIA, b.id)).length).toBe(3); expect((await base.ranking(ANDRE_AV, b.id))[0].pontuacao).toBe(4)
        await falha(atualizarBanca(ADMIN1, b.id, { nome: 'Alterando publicada' }), 409)
      }
    }
  })
  it('avaliações invalidadas não entram no ranking', async () => {
    const r1 = await base.ranking(ADMIN1, 1); const antes = r1.find(x => x.projeto.id === 1)!
    const av = base.avaliacoes.find(a => a.bancaId === 1 && a.projetoId === 1 && a.avaliadorId === 3)!
    await invalidarAvaliacao(ADMIN1, av.id, 'Nota duvidosa, pedir nova avaliação')
    const depois = (await base.ranking(ADMIN1, 1)).find(x => x.projeto.id === 1)!
    expect(depois.avaliacoes).toBe(antes.avaliacoes - 1)
  })
})

describe('C6 – filtros e exportação respeitam o escopo (RN09)', () => {
  it('aluno+ano+semestre', async () => {
    expect((await base.listarProjetos(ADMIN1, { alunoId: 6, ano: 2025, semestre: 1 })).map(p => p.id).sort()).toEqual([1, 2, 5])
    expect(await base.listarProjetos(ADMIN1, { alunoId: 6, ano: 2025, semestre: 2 })).toEqual([])
    expect((await base.listarProjetos(ADMIN1, { orientadorId: 11 })).map(p => p.id).sort()).toEqual([2, 4])
  })
  it('a exportação devolve só o que o solicitante pode ver, com os filtros', async () => {
    const todos = await dadosExportacaoProjetos(ADMIN1, () => true)
    const aluna = await dadosExportacaoProjetos(BIA, () => true)
    expect(aluna.length).toBe(3); expect(todos.length).toBeGreaterThan(aluna.length)
    expect(todos.some(l => l.nome === 'AgroLink')).toBe(false)
    expect((await dadosExportacaoProjetos(ADMIN1, p => p.status === 'concluido')).every(l => l.situacao === 'Concluído')).toBe(true)
    expect(await dadosExportacaoProjetos(ADMIN1, () => true, [1])).toHaveLength(1)
  })
})

describe('C7 – mudança de permissão vale na chamada seguinte', () => {
  it('bloqueio/revogação derrubam o acesso mesmo com contexto antigo; restaurar devolve', async () => {
    const caio = c(12, 1, 'aluno')
    await base.listarProjetos(caio)
    await falha(alterarSituacao(ADMIN1, 12, 'bloqueado', ''), 422)
    await alterarSituacao(ADMIN1, 12, 'bloqueado', 'Violação do regulamento')
    await falha(base.listarProjetos(caio), 401); await falha(base.login('caio@demo.dev', 'demo1234'), 403)
    await alterarSituacao(ADMIN1, 12, 'aprovado'); await base.listarProjetos(caio)
    await alterarSituacao(ADMIN1, 12, 'revogado', 'Desligado da turma'); await falha(base.listarProjetos(caio), 401)
    await alterarSituacao(ADMIN1, 12, 'aprovado')
  })
  it('mudar o papel muda o que pode ser feito', async () => {
    const d = { nome: 'Feito por Fabi', descricao: 'descrição longa o bastante', ano: 2026, semestre: 2 as const, status: 'em_andamento' as const }
    await falha(criarProjeto(c(15, 1, 'aluno'), d), 403)
    await alterarPapel(ADMIN1, 15, 'coordenador')
    await criarProjeto(c(15, 1, 'aluno'), d)
    await alterarPapel(ADMIN1, 15, 'aluno')
    await falha(criarProjeto(c(15, 1, 'coordenador'), d), 403)
  })
  it('suspender a instituição bloqueia todos; reativar libera', async () => {
    await falha(definirStatusInstituicao(SUPER, 2, 'suspensa', ''), 422)
    await definirStatusInstituicao(SUPER, 2, 'suspensa', 'Inadimplência contratual')
    await falha(base.listarProjetos(ADMIN2), 401); await falha(base.login('admin2@demo.dev', 'demo1234'), 403)
    await definirStatusInstituicao(SUPER, 2, 'ativa'); await base.listarProjetos(ADMIN2)
  })
  it('protege o último administrador e impede autoalteração', async () => {
    await falha(alterarPapel(ADMIN1, 2, 'coordenador'), 409)
    await falha(alterarSituacao(ADMIN1, 2, 'bloqueado', 'me bloqueando'), 409)
  })
})

describe('superadmin e auditoria (RF01, RF15)', () => {
  it('cria instituição, valida identificador único e designa administrador', async () => {
    const i = await criarInstituicao(SUPER, { nome: 'Nova Faculdade', identificador: 'nova-faculdade' })
    await falha(criarInstituicao(SUPER, { nome: 'Outra', identificador: 'nova-faculdade' }), 409)
    await falha(criarInstituicao(SUPER, { nome: 'Outra', identificador: 'Inválido Aqui' }), 422)
    await designarAdmin(SUPER, i.id, 'coord@demo.dev')
    expect((await listarPessoas(c(7, i.id, 'admin'))).length).toBeGreaterThan(0)
    expect((await visaoPlataforma(SUPER)).instituicoes).toBeGreaterThanOrEqual(3)
  })
  it('admin enxerga só a auditoria da própria instituição; superadmin, tudo', async () => {
    const dele = await listarAuditoria(ADMIN2), todos = await listarAuditoria(SUPER)
    expect(dele.every(a => a.instituicaoId === 2)).toBe(true); expect(todos.length).toBeGreaterThan(dele.length)
    expect(todos.some(a => a.acao === 'vinculo.aprovar')).toBe(true); expect(todos.some(a => a.acao === 'vinculo.bloquear')).toBe(true)
  })
})

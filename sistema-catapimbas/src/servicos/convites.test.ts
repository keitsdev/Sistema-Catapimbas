import { describe, expect, it } from 'vitest'
import * as base from '../api'
import type { HttpError } from '../api'
import { alterarSituacao, listarPessoas } from './acesso'
import { assinaturaAudio, validarMetadadosAudio } from './audio'
import { criarBanca, definirCriterios, definirParticipantes, mudarStatusBanca } from './bancas'
import { aceitarConvite, consultarConvite, convites, criarConvite, INVALIDO, listarConvites, opcoesConviteSuperadmin, revogarConvite } from './convites'
import { listarAuditoria } from './plataforma'
import { criarProjeto } from './projetos'
import type { Contexto, Papel } from '../types'

const c = (usuarioId: number, instituicaoId: number, papel: Papel): Contexto => ({ usuarioId, instituicaoId, papel })
const SUPER = c(1, 0, 'superadmin'), ADMIN1 = c(2, 1, 'admin'), ADMIN2 = c(17, 2, 'admin'), COORD = c(7, 1, 'coordenador'), AND = c(3, 1, 'avaliador'), BIA = c(6, 1, 'aluno')
async function falha(p: Promise<unknown>, status: number) {
  try { await p } catch (e) { expect((e as HttpError).status).toBe(status); return (e as HttpError).message }
  throw new Error(`esperava HTTP ${status}, mas a operação foi permitida`)
}
const crit = (t: string) => ({ titulo: t, peso: 1, descritores: Object.fromEntries([1, 2, 3, 4, 5].map(n => [n, `nota ${n} descrita`])) })
const dados = { validadeHoras: 24, maxUsos: 1 }

async function novaBanca(ctx: Contexto, projetoIds: number[], abrir = true) {
  const b = await criarBanca(ctx, { nome: `Banca convite ${Math.random()}`, inicio: '2026-06-01', fim: '2026-06-30', desempate: 'competicao', precisao: 2 })
  await definirCriterios(ctx, b.id, [crit('Critério A'), crit('Critério B')]); await definirParticipantes(ctx, b.id, projetoIds, [3])
  if (abrir) await mudarStatusBanca(ctx, b.id, 'aberta'); return b
}

describe('geração do convite (admin e superadmin)', () => {
  it('só admin/superadmin geram; admin não alcança banca de outra instituição (RN10)', async () => {
    const b = await novaBanca(ADMIN1, [1, 2])
    for (const quem of [COORD, AND, BIA]) await falha(criarConvite(quem, { bancaId: b.id, projetoId: 1, ...dados }), 403)
    await falha(criarConvite(ADMIN2, { bancaId: b.id, projetoId: 1, ...dados }), 404)
    await falha(criarConvite(ADMIN1, { bancaId: b.id, projetoId: 3, ...dados }), 422)
    await falha(criarConvite(ADMIN1, { bancaId: b.id, projetoId: 1, validadeHoras: 0, maxUsos: 1 }), 422)
    await falha(criarConvite(ADMIN1, { bancaId: b.id, projetoId: 1, validadeHoras: 24, maxUsos: 99 }), 422)
    const { token, convite } = await criarConvite(ADMIN1, { bancaId: b.id, projetoId: 1, ...dados })
    expect(token.length).toBeGreaterThanOrEqual(30); expect(convite.usos).toBe(0)
    const lista = await listarConvites(ADMIN1, { bancaId: b.id })
    expect(lista.length).toBe(1); expect('token' in lista[0]).toBe(false)
    expect((await listarConvites(ADMIN2, { bancaId: b.id })).length).toBe(0)
  })
  it('banca encerrada não aceita novos convites; superadmin gera para qualquer instituição', async () => {
    const b = await novaBanca(ADMIN1, [1]); await mudarStatusBanca(ADMIN1, b.id, 'encerrada')
    await falha(criarConvite(ADMIN1, { bancaId: b.id, projetoId: 1, ...dados }), 409)
    const p = await criarProjeto(ADMIN2, { nome: 'Projeto da Inst 2', descricao: 'descrição longa o bastante', ano: 2026, semestre: 1, status: 'em_andamento' })
    const b2 = await criarBanca(ADMIN2, { nome: 'Banca Inst 2', inicio: '2026-06-01', fim: '2026-06-30', desempate: 'competicao', precisao: 2 })
    await definirParticipantes(ADMIN2, b2.id, [p.id], [])
    const { token } = await criarConvite(SUPER, { bancaId: b2.id, projetoId: p.id, ...dados })
    expect((await consultarConvite(token)).instituicao).toBe('Incubadora Recôncavo')
    const op = await opcoesConviteSuperadmin(SUPER); expect(op.some(i => i.bancas.some(x => x.id === b2.id))).toBe(true)
    await falha(opcoesConviteSuperadmin(ADMIN1), 403)
  })
})

describe('cadastro pelo link e restrição ao projeto convidado', () => {
  it('cria avaliador que só vê e só avalia o projeto convidado', async () => {
    const b = await novaBanca(ADMIN1, [1, 2]); const { token } = await criarConvite(ADMIN1, { bancaId: b.id, projetoId: 1, validadeHoras: 24, maxUsos: 2 })
    expect((await consultarConvite(token)).projeto).toBeTruthy()
    await falha(aceitarConvite(token, { nome: 'Xi', email: 'x@y.com' }), 422)
    await falha(aceitarConvite(token, { nome: 'Fulana Convidada', email: 'sem-arroba' }), 422)
    const r = await aceitarConvite(token, { nome: 'Fulana Convidada', email: 'fulana@externa.com', organizacao: 'Empresa X' })
    expect(r.senhaTemporaria.length).toBeGreaterThanOrEqual(8)
    const u = await base.login('fulana@externa.com', r.senhaTemporaria)
    expect(u.vinculos[0]).toMatchObject({ papel: 'avaliador', situacao: 'aprovado' }); expect(u.organizacao).toBe('Empresa X')
    const eu = c(u.id, 1, 'avaliador')
    expect((await base.listarProjetos(eu)).map(p => p.id)).toEqual([1])
    expect((await base.listarBancas(eu)).map(x => x.id)).toEqual([b.id])
    await falha(base.obterProjeto(eu, 2), 404)
    const [ca, cb] = (await base.listarBancas(eu))[0].criterios.map(x => x.id)
    await falha(base.enviarAvaliacao(eu, b.id, 2, { [ca]: 3, [cb]: 3 }), 403)
    await falha(base.enviarAvaliacao(eu, 1, 1, {}), 403)
    expect((await base.enviarAvaliacao(eu, b.id, 1, { [ca]: 4, [cb]: 5 })).versao).toBe(1)
    await falha(base.enviarAvaliacao(eu, b.id, 1, { [ca]: 5, [cb]: 5 }), 409)
    await falha(listarPessoas(eu), 403); await falha(criarConvite(eu, { bancaId: b.id, projetoId: 1, ...dados }), 403)
    const outra = await novaBanca(ADMIN1, [3], false)
    await falha(definirParticipantes(ADMIN1, outra.id, [3], [3, u.id]), 422)
    expect((await listarPessoas(ADMIN1)).find(p => p.usuarioId === u.id)?.convidadoPara).toContain('AcolheMãe')
    await alterarSituacao(ADMIN1, u.id, 'bloqueado', 'Convite usado indevidamente'); await falha(base.listarProjetos(eu), 401)
  })
  it('respeita o limite de usos, e-mail repetido, revogação e expiração', async () => {
    const b = await novaBanca(ADMIN1, [1]); const um = await criarConvite(ADMIN1, { bancaId: b.id, projetoId: 1, ...dados })
    await aceitarConvite(um.token, { nome: 'Primeiro Usuario', email: 'primeiro@x.com' })
    expect(await falha(aceitarConvite(um.token, { nome: 'Segundo Usuario', email: 'segundo@x.com' }), 410)).toBe(INVALIDO)
    expect((await listarConvites(ADMIN1, { bancaId: b.id }))[0].situacao).toBe('esgotado')
    const dois = await criarConvite(ADMIN1, { bancaId: b.id, projetoId: 1, validadeHoras: 24, maxUsos: 5 })
    await falha(aceitarConvite(dois.token, { nome: 'Alguem Repetido', email: 'primeiro@x.com' }), 409)
    await falha(aceitarConvite(dois.token, { nome: 'Alguem Repetido', email: 'admin@demo.dev' }), 409)
    await falha(revogarConvite(ADMIN2, dois.convite.id), 404); await falha(revogarConvite(COORD, dois.convite.id), 403)
    await revogarConvite(ADMIN1, dois.convite.id)
    expect(await falha(consultarConvite(dois.token), 410)).toBe(INVALIDO); await falha(revogarConvite(ADMIN1, dois.convite.id), 409)
    const tres = await criarConvite(ADMIN1, { bancaId: b.id, projetoId: 1, ...dados })
    convites.find(x => x.id === tres.convite.id)!.expiraEm = new Date(Date.now() - 1000).toISOString()
    expect(await falha(consultarConvite(tres.token), 410)).toBe(INVALIDO)
    expect(await falha(consultarConvite('token-que-nao-existe'), 410)).toBe(INVALIDO)
    const quatro = await criarConvite(ADMIN1, { bancaId: b.id, projetoId: 1, ...dados })
    await mudarStatusBanca(ADMIN1, b.id, 'encerrada'); await falha(consultarConvite(quatro.token), 410)
  })
  it('registra criação e aceite na auditoria', async () => {
    const acoes = (await listarAuditoria(ADMIN1)).map(a => a.acao)
    expect(acoes).toContain('convite.criar'); expect(acoes).toContain('convite.aceitar'); expect(acoes).toContain('convite.revogar')
  })
})

describe('arquivo de áudio da música do pódio', () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  const txt = (s: string) => [...s].map(ch => ch.charCodeAt(0))
  it('reconhece MP3, WAV e OGG pelo conteúdo e recusa o resto', () => {
    expect(assinaturaAudio(bytes(...txt('ID3')))).toBe('mp3'); expect(assinaturaAudio(bytes(0xff, 0xfb, 0x90))).toBe('mp3')
    expect(assinaturaAudio(new Uint8Array([...txt('RIFF'), 1, 2, 3, 4, ...txt('WAVE')]))).toBe('wav'); expect(assinaturaAudio(bytes(...txt('OggS')))).toBe('ogg')
    expect(assinaturaAudio(bytes(...txt('%PDF')))).toBe(null); expect(assinaturaAudio(bytes(...txt('MZ')))).toBe(null)
  })
  it('valida extensão, tipo e tamanho', () => {
    expect(validarMetadadosAudio({ name: 'musica.mp3', type: 'audio/mpeg', size: 3_000_000 })).toBe(null)
    expect(validarMetadadosAudio({ name: 'musica.WAV', type: 'audio/x-wav', size: 1000 })).toBe(null)
    expect(validarMetadadosAudio({ name: 'musica.mp3', type: '', size: 1000 })).toBe(null)
    expect(validarMetadadosAudio({ name: 'virus.exe', type: 'application/octet-stream', size: 1000 })).toContain('Formato')
    expect(validarMetadadosAudio({ name: 'musica.mp3', type: 'video/mp4', size: 1000 })).toContain('Formato')
    expect(validarMetadadosAudio({ name: 'musica.m4a', type: 'audio/mp4', size: 1000 })).toContain('Formato')
    expect(validarMetadadosAudio({ name: 'enorme.mp3', type: 'audio/mpeg', size: 25 * 1024 * 1024 })).toContain('grande')
    expect(validarMetadadosAudio({ name: 'vazio.mp3', type: 'audio/mpeg', size: 0 })).toContain('vazio')
  })
})

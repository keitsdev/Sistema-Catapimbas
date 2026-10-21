/**
 * CAMADA DE API. Hoje usa dados simulados em memória para o frontend rodar sozinho.
 * Cada função recebe o Contexto (usuário + instituição ativa + papel) e aplica as mesmas
 * regras que o backend deve impor (RN01, RN04, RN05, RN06, RN10). A autorização REAL
 * precisa estar no servidor; aqui ela serve de contrato e de apoio aos testes de UI.
 * Para integrar: troque o corpo de cada função por fetch('/api/...', { credentials: 'include' }).
 */
import type { Avaliacao, Banca, Contexto, Instituicao, LinhaRanking, Papel, Projeto, Usuario } from './types'

export class HttpError extends Error { constructor(public status: number, message: string) { super(message) } }
const espera = () => new Promise(r => setTimeout(r, 120))

const instituicoes: Instituicao[] = [
  { id: 1, nome: 'Faculdade Atlântica', identificador: 'atlantica', status: 'ativa' },
  { id: 2, nome: 'Incubadora Recôncavo', identificador: 'reconcavo', status: 'ativa' },
]
const SENHA_DEMO = 'demo1234' // somente mock
const ap = (instituicaoId: number, papel: Papel) => ({ instituicaoId, papel, situacao: 'aprovado' as const })
const usuarios: Usuario[] = [
  { id: 1, nome: 'Super Admin', email: 'super@demo.dev', vinculos: [ap(0, 'superadmin')] },
  { id: 2, nome: 'Marina Admin', email: 'admin@demo.dev', vinculos: [ap(1, 'admin')] },
  { id: 3, nome: 'André Rocha', email: 'andre@demo.dev', vinculos: [ap(1, 'avaliador'), ap(2, 'orientador')] },
  { id: 4, nome: 'Celso Barreto', email: 'celso@demo.dev', vinculos: [ap(1, 'avaliador')] },
  { id: 5, nome: 'Laura Gurgel', email: 'laura@demo.dev', vinculos: [ap(1, 'avaliador')] },
  { id: 6, nome: 'Bia Aluna', email: 'aluno@demo.dev', vinculos: [ap(1, 'aluno')] },
  { id: 7, nome: 'Coord. Paulo', email: 'coord@demo.dev', vinculos: [ap(1, 'coordenador')] },
]
const projetos: Projeto[] = [
  ['AcolheMãe', 'Rede de apoio a gestantes em vulnerabilidade.', 'em_andamento'],
  ['InovArt', 'Marketplace de artesanato local.', 'em_andamento'],
  ['VANMO', 'Mobilidade compartilhada por vans.', 'concluido'],
  ['HECO', 'Gestão de resíduos para condomínios.', 'em_andamento'],
  ['SalvadorGO!', 'Roteiros turísticos personalizados.', 'concluido'],
].map(([nome, descricao, status], i): Projeto => ({
  id: i + 1, instituicaoId: 1, nome, descricao, ano: 2025, semestre: 1,
  status: status as Projeto['status'], orientador: i % 2 ? 'Profa. Helena' : 'Prof. Ricardo', equipe: ['Aluno A', 'Aluno B', 'Aluno C'],
})).concat([{ id: 6, instituicaoId: 2, nome: 'AgroLink', descricao: 'Cooperativas conectadas.', ano: 2025, semestre: 2, status: 'em_andamento', orientador: 'Prof. Joel', equipe: ['Aluno X'] }])

// Descritores vêm do cadastro (RF08): aqui são apenas dados de exemplo no seed.
const desc = (t: string) => ({ 1: `${t}: ausente`, 2: `${t}: insuficiente`, 3: `${t}: adequado`, 4: `${t}: consistente`, 5: `${t}: excelente` })
const bancas: Banca[] = [{
  id: 1, instituicaoId: 1, nome: '[DE 2025-1] Banca Final de Avaliação das Startups', status: 'aberta',
  avaliadorIds: [3, 4, 5], projetoIds: [1, 2, 3, 4, 5],
  criterios: ['Clareza do Problema', 'Mercado e Escalabilidade', 'Conceito e Produto', 'Estratégia de Diferenciação', 'Desempenho da Apresentação']
    .map((titulo, i) => ({ id: i + 1, titulo, peso: 1, descritores: desc(titulo) })),
}]
let avaliacoes: Avaliacao[] = []
let seq = 1
;[3, 4, 5].forEach(av => [1, 2, 3, 4, 5].forEach(p => {
  if (av === 5 && p > 3) return
  avaliacoes.push({ id: seq++, bancaId: 1, projetoId: p, avaliadorId: av, criadaEm: new Date().toISOString(),
    notas: Object.fromEntries([1, 2, 3, 4, 5].map(c => [c, 1 + ((p * 3 + c + av) % 5)])) })
}))
let solicitacoes = [
  { id: 1, instituicaoId: 1, nome: 'Rafael Lima', email: 'rafael@exemplo.com', papel: 'aluno' as Papel, situacao: 'pendente' as 'pendente' | 'aprovado' | 'recusado', justificativa: '' },
  { id: 2, instituicaoId: 1, nome: 'Camila Souza', email: 'camila@exemplo.com', papel: 'orientador' as Papel, situacao: 'pendente' as 'pendente' | 'aprovado' | 'recusado', justificativa: '' },
]

// --- guardas de isolamento (RN01/RN10): outra instituição => 404, sem vazar existência ---
const doTenant = <T extends { instituicaoId: number }>(ctx: Contexto, item?: T): T => {
  if (!item || item.instituicaoId !== ctx.instituicaoId) throw new HttpError(404, 'Recurso não encontrado.')
  return item
}
const exigir = (ctx: Contexto, ...papeis: Papel[]) => { if (!papeis.includes(ctx.papel)) throw new HttpError(403, 'Você não tem permissão para esta ação.') }

export async function login(email: string, senha: string): Promise<Usuario> {
  await espera()
  const u = usuarios.find(x => x.email === email)
  if (!u || senha !== SENHA_DEMO) throw new HttpError(401, 'E-mail ou senha incorretos.')
  if (!u.vinculos.some(v => v.situacao === 'aprovado')) throw new HttpError(403, 'Seu acesso ainda não foi aprovado.')
  return u
}
export const nomeInstituicao = (id: number) => instituicoes.find(i => i.id === id)?.nome ?? 'Plataforma'
export const listarInstituicoes = async (ctx: Contexto) => { await espera(); exigir(ctx, 'superadmin'); return [...instituicoes] }

export interface Filtros { busca?: string; ano?: number; semestre?: number }
export async function listarProjetos(ctx: Contexto, f: Filtros = {}): Promise<Projeto[]> {
  await espera()
  const q = f.busca?.toLowerCase()
  return projetos.filter(p => p.instituicaoId === ctx.instituicaoId
    && (!f.ano || p.ano === f.ano) && (!f.semestre || p.semestre === f.semestre)
    && (!q || [p.nome, p.orientador, ...p.equipe].some(s => s.toLowerCase().includes(q))))
}
export const obterProjeto = async (ctx: Contexto, id: number) => { await espera(); return doTenant(ctx, projetos.find(p => p.id === id)) }
export const listarBancas = async (ctx: Contexto) => { await espera(); return bancas.filter(b => b.instituicaoId === ctx.instituicaoId) }

export async function minhasAvaliacoes(ctx: Contexto, bancaId: number) {
  await espera(); doTenant(ctx, bancas.find(b => b.id === bancaId))
  return avaliacoes.filter(a => a.bancaId === bancaId && a.avaliadorId === ctx.usuarioId)
}
export async function enviarAvaliacao(ctx: Contexto, bancaId: number, projetoId: number, notas: Record<number, number>) {
  await espera()
  const banca = doTenant(ctx, bancas.find(b => b.id === bancaId))
  exigir(ctx, 'avaliador')
  if (banca.status !== 'aberta') throw new HttpError(409, 'Esta banca não está aberta para avaliação.')
  if (!banca.avaliadorIds.includes(ctx.usuarioId) || !banca.projetoIds.includes(projetoId)) throw new HttpError(403, 'Você não foi designado para este projeto.')
  if (banca.criterios.some(c => !(notas[c.id] >= 1 && notas[c.id] <= 5))) throw new HttpError(422, 'Preencha todos os critérios com notas de 1 a 5.')
  if (avaliacoes.some(a => a.bancaId === bancaId && a.projetoId === projetoId && a.avaliadorId === ctx.usuarioId))
    throw new HttpError(409, 'Você já avaliou este projeto nesta banca. Solicite uma correção ao coordenador.')
  const nova = { id: seq++, bancaId, projetoId, avaliadorId: ctx.usuarioId, notas, criadaEm: new Date().toISOString() }
  avaliacoes.push(nova)
  return nova // recibo
}

/** RN05: nota do avaliador = Σ(nota·peso)/Σ(pesos dos critérios lançados); projeto = média simples dos avaliadores, 2 casas.
 *  RN06: empate mantém a mesma posição (1, 1, 3) — nenhum desempate arbitrário. */
export async function ranking(ctx: Contexto, bancaId: number): Promise<LinhaRanking[]> {
  await espera()
  const banca = doTenant(ctx, bancas.find(b => b.id === bancaId))
  exigir(ctx, 'admin', 'coordenador', 'orientador', 'avaliador', 'aluno')
  if (banca.status !== 'publicada' && !['admin', 'coordenador'].includes(ctx.papel)) throw new HttpError(403, 'Resultados ainda não publicados.')
  const linhas = banca.projetoIds.map(pid => {
    const por = avaliacoes.filter(a => a.bancaId === bancaId && a.projetoId === pid).map(a => {
      const cs = banca.criterios.filter(c => a.notas[c.id] != null)
      return cs.reduce((s, c) => s + a.notas[c.id] * c.peso, 0) / cs.reduce((s, c) => s + c.peso, 0)
    })
    const pontuacao = por.length ? Math.round((por.reduce((a, b) => a + b, 0) / por.length) * 100) / 100 : 0
    return { projeto: projetos.find(p => p.id === pid)!, pontuacao, avaliacoes: por.length }
  }).sort((a, b) => b.pontuacao - a.pontuacao)
  return linhas.map((l, i) => ({ ...l, posicao: i > 0 && l.pontuacao === linhas[i - 1].pontuacao ? 0 : i + 1 }))
    .map((l, i, arr) => ({ ...l, posicao: l.posicao || arr.slice(0, i).reverse().find(x => x.posicao)!.posicao }))
}
export const publicarBanca = async (ctx: Contexto, id: number) => {
  await espera(); exigir(ctx, 'admin', 'coordenador'); doTenant(ctx, bancas.find(b => b.id === id))!.status = 'publicada'
}
export const dashboard = async (ctx: Contexto) => {
  const ps = await listarProjetos(ctx)
  const bs = bancas.filter(b => b.instituicaoId === ctx.instituicaoId)
  const esperadas = bs.reduce((s, b) => s + b.avaliadorIds.length * b.projetoIds.length, 0)
  const feitas = avaliacoes.filter(a => bs.some(b => b.id === a.bancaId)).length
  const cont = (k: (p: Projeto) => string) => Object.entries(ps.reduce<Record<string, number>>((m, p) => ({ ...m, [k(p)]: (m[k(p)] ?? 0) + 1 }), {})).map(([nome, total]) => ({ nome, total }))
  return { projetos: ps.length, bancas: bs.length, esperadas, feitas,
    porStatus: cont(p => ({ em_andamento: 'Em andamento', concluido: 'Concluído', arquivado: 'Arquivado' })[p.status]),
    porPeriodo: cont(p => `${p.ano}/${p.semestre}`) }
}
export const listarSolicitacoes = async (ctx: Contexto) => { await espera(); exigir(ctx, 'admin'); return solicitacoes.filter(s => s.instituicaoId === ctx.instituicaoId) }
export async function decidirSolicitacao(ctx: Contexto, id: number, aprovar: boolean, justificativa = '') {
  await espera(); exigir(ctx, 'admin')
  if (!aprovar && !justificativa.trim()) throw new HttpError(422, 'Informe a justificativa da recusa.')
  const s = doTenant(ctx, solicitacoes.find(x => x.id === id))
  s.situacao = aprovar ? 'aprovado' : 'recusado'; s.justificativa = justificativa
}

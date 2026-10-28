import type { Avaliacao, Banca, Contexto, Instituicao, LinhaRanking, Papel, Projeto, RegistroAuditoria, Solicitacao, Usuario } from './types'

export class HttpError extends Error { constructor(public status: number, message: string) { super(message) } }
export const espera = () => new Promise(r => setTimeout(r, 120))

export const instituicoes: Instituicao[] = [
  { id: 1, nome: 'Faculdade Atlântica', identificador: 'atlantica', status: 'ativa', cor: '#0e7c7b', lema: 'Inovar para transformar' },
  { id: 2, nome: 'Incubadora Recôncavo', identificador: 'reconcavo', status: 'ativa', cor: '#7a4fb5', lema: 'Startups do Recôncavo' },
]
const SENHA_DEMO = 'demo1234'
export const senhas: Record<number, string> = {}
const ap = (instituicaoId: number, papel: Papel) => ({ instituicaoId, papel, situacao: 'aprovado' as const })
export const usuarios: Usuario[] = [
  { id: 1, nome: 'Super Admin', email: 'super@demo.dev', vinculos: [ap(0, 'superadmin')] },
  { id: 2, nome: 'Marina Admin', email: 'admin@demo.dev', vinculos: [ap(1, 'admin')] },
  { id: 3, nome: 'André Rocha', email: 'andre@demo.dev', vinculos: [ap(1, 'avaliador'), ap(2, 'orientador')] },
  { id: 4, nome: 'Celso Barreto', email: 'celso@demo.dev', vinculos: [ap(1, 'avaliador')] },
  { id: 5, nome: 'Laura Gurgel', email: 'laura@demo.dev', vinculos: [ap(1, 'avaliador')] },
  { id: 6, nome: 'Bia Aluna', email: 'aluno@demo.dev', vinculos: [ap(1, 'aluno')] },
  { id: 7, nome: 'Coord. Paulo', email: 'coord@demo.dev', vinculos: [ap(1, 'coordenador')] },
  { id: 8, nome: 'Rafael Lima', email: 'rafael@exemplo.com', vinculos: [{ instituicaoId: 1, papel: 'aluno', situacao: 'pendente' }] },
  { id: 9, nome: 'Camila Souza', email: 'camila@exemplo.com', vinculos: [{ instituicaoId: 1, papel: 'orientador', situacao: 'pendente' }] },
  { id: 10, nome: 'Prof. Ricardo', email: 'ricardo@demo.dev', vinculos: [ap(1, 'orientador')] },
  { id: 11, nome: 'Profa. Helena', email: 'helena@demo.dev', vinculos: [ap(1, 'orientador')] },
  { id: 12, nome: 'Caio Aluno', email: 'caio@demo.dev', vinculos: [ap(1, 'aluno')] },
  { id: 13, nome: 'Duda Aluna', email: 'duda@demo.dev', vinculos: [ap(1, 'aluno')] },
  { id: 14, nome: 'Enzo Aluno', email: 'enzo@demo.dev', vinculos: [ap(1, 'aluno')] },
  { id: 15, nome: 'Fabi Aluna', email: 'fabi@demo.dev', vinculos: [ap(1, 'aluno')] },
  { id: 16, nome: 'Xavier Aluno', email: 'xavier@demo.dev', vinculos: [ap(2, 'aluno')] },
  { id: 17, nome: 'Admin Recôncavo', email: 'admin2@demo.dev', vinculos: [ap(2, 'admin')] },
]
export const projetos: Projeto[] = [
  ['AcolheMãe', 'Rede de apoio a gestantes em vulnerabilidade.', 'em_andamento'],
  ['InovArt', 'Marketplace de artesanato local.', 'em_andamento'],
  ['VANMO', 'Mobilidade compartilhada por vans.', 'concluido'],
  ['HECO', 'Gestão de resíduos para condomínios.', 'em_andamento'],
  ['SalvadorGO!', 'Roteiros turísticos personalizados.', 'concluido'],
].map(([nome, descricao, status], i): Projeto => ({
  id: i + 1, instituicaoId: 1, nome, descricao, ano: 2025, semestre: 1,
  status: status as Projeto['status'], orientador: i % 2 ? 'Profa. Helena' : 'Prof. Ricardo', equipe: ['Aluno A', 'Aluno B', 'Aluno C'],
})).concat([{ id: 6, instituicaoId: 2, nome: 'AgroLink', descricao: 'Cooperativas conectadas.', ano: 2025, semestre: 2, status: 'em_andamento', orientador: 'Prof. Joel', equipe: ['Aluno X'] }])
export const nomeUsuario = (id: number) => usuarios.find(u => u.id === id)?.nome ?? `Usuário ${id}`
export function sincronizarProjeto(p: Projeto) {
  if (p.orientadorId) p.orientador = nomeUsuario(p.orientadorId)
  if (p.equipeIds) p.equipe = p.equipeIds.map(nomeUsuario)
}
;([[10, [6, 12, 13]], [11, [6, 14, 15]], [10, [12, 13, 14]], [11, [14, 15, 13]], [10, [15, 12, 6]], [3, [16]]] as [number, number[]][]).forEach(([o, eq], i) => {
  Object.assign(projetos[i], { orientadorId: o, equipeIds: eq, funcoes: Object.fromEntries(eq.map((id, k) => [id, k === 0 ? 'Líder' : 'Integrante'])) }); sincronizarProjeto(projetos[i])
})

const desc = (t: string) => ({ 1: `${t}: ausente`, 2: `${t}: insuficiente`, 3: `${t}: adequado`, 4: `${t}: consistente`, 5: `${t}: excelente` })
export const bancas: Banca[] = [{
  id: 1, instituicaoId: 1, nome: '[DE 2025-1] Banca Final de Avaliação das Startups', status: 'aberta', inicio: '2025-06-01', fim: '2025-06-30', desempate: 'competicao', precisao: 2,
  avaliadorIds: [3, 4, 5], projetoIds: [1, 2, 3, 4, 5],
  criterios: ['Clareza do Problema', 'Mercado e Escalabilidade', 'Conceito e Produto', 'Estratégia de Diferenciação', 'Desempenho da Apresentação']
    .map((titulo, i) => ({ id: i + 1, titulo, peso: 1, descritores: desc(titulo) })),
}]
export const avaliacoes: Avaliacao[] = []
let seq = 1
export const novaAvaliacaoId = () => seq++
export const proximoId = (arr: { id: number }[]) => arr.reduce((m, x) => Math.max(m, x.id), 0) + 1
;[3, 4, 5].forEach(av => [1, 2, 3, 4, 5].forEach(p => {
  if (av === 5 && p > 3) return
  avaliacoes.push({ id: seq++, bancaId: 1, projetoId: p, avaliadorId: av, criadaEm: new Date().toISOString(),
    notas: Object.fromEntries([1, 2, 3, 4, 5].map(c => [c, 1 + ((p * 3 + c + av) % 5)])) })
}))
export const solicitacoes: Solicitacao[] = [
  { id: 1, usuarioId: 8, instituicaoId: 1, nome: 'Rafael Lima', email: 'rafael@exemplo.com', papel: 'aluno', situacao: 'pendente', justificativa: '' },
  { id: 2, usuarioId: 9, instituicaoId: 1, nome: 'Camila Souza', email: 'camila@exemplo.com', papel: 'orientador', situacao: 'pendente', justificativa: '' },
]

export const auditoria: RegistroAuditoria[] = []
export function registrarAuditoria(ctx: Contexto, acao: string, entidade: string, entidadeId: string | number, detalhe?: string, instituicaoId: number | null = ctx.instituicaoId) {
  auditoria.unshift({ id: proximoId(auditoria), quando: new Date().toISOString(), atorId: ctx.usuarioId, atorNome: usuarios.find(u => u.id === ctx.usuarioId)?.nome ?? '?', instituicaoId: instituicaoId || null, acao, entidade, entidadeId: String(entidadeId), detalhe })
}
let perdaDeAcesso: (() => void) | undefined
export const aoPerderAcesso = (fn: () => void) => { perdaDeAcesso = fn }

export const doTenant = <T extends { instituicaoId: number }>(ctx: Contexto, item?: T): T => {
  if (!item || item.instituicaoId !== ctx.instituicaoId) throw new HttpError(404, 'Recurso não encontrado.')
  return item
}

export function autorizar(ctx: Contexto, ...papeis: Papel[]): Papel {
  const u = usuarios.find(x => x.id === ctx.usuarioId)
  const v = u?.vinculos.find(x => x.instituicaoId === ctx.instituicaoId && x.situacao === 'aprovado')
  const inst = instituicoes.find(i => i.id === ctx.instituicaoId)
  if (!v || (ctx.instituicaoId !== 0 && inst?.status === 'suspensa')) { perdaDeAcesso?.(); throw new HttpError(401, 'Seu acesso a esta instituição foi suspenso ou revogado.') }
  if (papeis.length && !papeis.includes(v.papel)) throw new HttpError(403, 'Você não tem permissão para esta ação.')
  return v.papel
}
const exigir = (ctx: Contexto, ...papeis: Papel[]) => { autorizar(ctx, ...papeis) }

export async function login(email: string, senha: string): Promise<Usuario> {
  await espera()
  const u = usuarios.find(x => x.email === email)
  if (!u || senha !== (senhas[u.id] ?? SENHA_DEMO)) throw new HttpError(401, 'E-mail ou senha incorretos.')
  const ok = u.vinculos.filter(v => v.situacao === 'aprovado' && (v.instituicaoId === 0 || instituicoes.find(i => i.id === v.instituicaoId)?.status === 'ativa'))
  if (!ok.length) {
    const r = u.vinculos.find(v => v.situacao === 'recusado' || v.situacao === 'bloqueado' || v.situacao === 'revogado')
    if (r) throw new HttpError(403, `Acesso ${r.situacao === 'recusado' ? 'recusado' : r.situacao === 'bloqueado' ? 'bloqueado' : 'revogado'}${r.justificativa ? `: ${r.justificativa}` : '.'}`)
    if (u.vinculos.some(v => v.situacao === 'aprovado')) throw new HttpError(403, 'Sua instituição está suspensa.')
    throw new HttpError(403, 'Seu acesso ainda não foi aprovado.')
  }
  registrarAuditoria({ usuarioId: u.id, instituicaoId: ok[0].instituicaoId, papel: ok[0].papel }, 'login', 'usuario', u.id)
  return u
}
export const nomeInstituicao = (id: number) => instituicoes.find(i => i.id === id)?.nome ?? 'Plataforma'
export const listarInstituicoes = async (ctx: Contexto) => { await espera(); exigir(ctx, 'superadmin'); return [...instituicoes] }

export interface Filtros { busca?: string; ano?: number; semestre?: number; alunoId?: number; orientadorId?: number; status?: Projeto['status'] }
export const escopoDoAvaliador = (ctx: Contexto) => usuarios.find(u => u.id === ctx.usuarioId)?.vinculos.find(v => v.instituicaoId === ctx.instituicaoId && v.situacao === 'aprovado')?.escopo
export function projetosVisiveis(ctx: Contexto): Projeto[] {
  const papel = autorizar(ctx)
  const da = projetos.filter(p => p.instituicaoId === ctx.instituicaoId && p.status !== 'arquivado')
  if (papel === 'orientador') return da.filter(p => p.orientadorId === ctx.usuarioId)
  if (papel === 'aluno') return da.filter(p => p.equipeIds?.includes(ctx.usuarioId))
  if (papel === 'avaliador') {
    const esc = escopoDoAvaliador(ctx)
    if (esc) return da.filter(p => p.id === esc.projetoId && bancas.some(b => b.id === esc.bancaId && !b.arquivadaEm && b.projetoIds.includes(p.id)))
    const ids = new Set(bancas.filter(b => b.instituicaoId === ctx.instituicaoId && !b.arquivadaEm && b.avaliadorIds.includes(ctx.usuarioId)).flatMap(b => b.projetoIds))
    return da.filter(p => ids.has(p.id))
  }
  return da
}
export async function listarProjetos(ctx: Contexto, f: Filtros = {}): Promise<Projeto[]> {
  await espera()
  const q = f.busca?.toLowerCase()
  return projetosVisiveis(ctx).filter(p => (!f.ano || p.ano === f.ano) && (!f.semestre || p.semestre === f.semestre)
    && (!f.alunoId || p.equipeIds?.includes(f.alunoId)) && (!f.orientadorId || p.orientadorId === f.orientadorId) && (!f.status || p.status === f.status)
    && (!q || [p.nome, p.orientador, ...p.equipe].some(s => s.toLowerCase().includes(q))))
}
export const obterProjeto = async (ctx: Contexto, id: number) => { await espera(); const p = doTenant(ctx, projetos.find(x => x.id === id)); if (!projetosVisiveis(ctx).some(x => x.id === id)) throw new HttpError(404, 'Recurso não encontrado.'); return p }
export const bancasVisiveis = (ctx: Contexto): Banca[] => {
  const papel = autorizar(ctx)
  const da = bancas.filter(b => b.instituicaoId === ctx.instituicaoId && !b.arquivadaEm)
  if (papel === 'admin' || papel === 'coordenador') return da
  if (papel === 'avaliador') { const esc = escopoDoAvaliador(ctx); return da.filter(b => b.avaliadorIds.includes(ctx.usuarioId) && (!esc || b.id === esc.bancaId)) }
  return da.filter(b => b.status === 'publicada')
}
export const listarBancas = async (ctx: Contexto) => { await espera(); return bancasVisiveis(ctx) }

export async function minhasAvaliacoes(ctx: Contexto, bancaId: number) {
  await espera(); doTenant(ctx, bancas.find(b => b.id === bancaId))
  return avaliacoes.filter(a => a.bancaId === bancaId && a.avaliadorId === ctx.usuarioId && a.status !== 'invalidada')
}
export async function enviarAvaliacao(ctx: Contexto, bancaId: number, projetoId: number, notas: Record<number, number>) {
  await espera()
  const banca = doTenant(ctx, bancas.find(b => b.id === bancaId))
  exigir(ctx, 'avaliador')
  const esc = escopoDoAvaliador(ctx)
  if (esc && (esc.bancaId !== bancaId || esc.projetoId !== projetoId)) throw new HttpError(403, 'Seu convite permite avaliar somente o projeto para o qual você foi convidado.')
  if (banca.status !== 'aberta') throw new HttpError(409, 'Esta banca não está aberta para avaliação.')
  if (!banca.avaliadorIds.includes(ctx.usuarioId) || !banca.projetoIds.includes(projetoId)) throw new HttpError(403, 'Você não foi designado para este projeto.')
  if (banca.criterios.some(c => !(notas[c.id] >= 1 && notas[c.id] <= 5))) throw new HttpError(422, 'Preencha todos os critérios com notas de 1 a 5.')
  if (avaliacoes.some(a => a.bancaId === bancaId && a.projetoId === projetoId && a.avaliadorId === ctx.usuarioId && a.status !== 'invalidada'))
    throw new HttpError(409, 'Você já avaliou este projeto nesta banca. Solicite uma correção ao coordenador.')
  const nova: Avaliacao = { id: seq++, bancaId, projetoId, avaliadorId: ctx.usuarioId, notas, criadaEm: new Date().toISOString(), versao: 1, status: 'valida' }
  avaliacoes.push(nova)
  registrarAuditoria(ctx, 'avaliacao.enviar', 'avaliacao', nova.id, `banca ${bancaId}, projeto ${projetoId}`)
  return nova
}

export async function ranking(ctx: Contexto, bancaId: number): Promise<LinhaRanking[]> {
  await espera()
  const banca = doTenant(ctx, bancas.find(b => b.id === bancaId))
  exigir(ctx, 'admin', 'coordenador', 'orientador', 'avaliador', 'aluno')
  if (banca.status !== 'publicada' && !['admin', 'coordenador'].includes(ctx.papel)) throw new HttpError(403, 'Resultados ainda não publicados.')
  const linhas = banca.projetoIds.filter(pid => projetos.some(p => p.id === pid)).map(pid => {
    const por = avaliacoes.filter(a => a.bancaId === bancaId && a.projetoId === pid && a.status !== 'invalidada').map(a => { // RN06: só avaliações válidas
      const cs = banca.criterios.filter(c => a.notas[c.id] != null)
      return cs.reduce((s, c) => s + a.notas[c.id] * c.peso, 0) / cs.reduce((s, c) => s + c.peso, 0)
    })
    const fator = 10 ** (banca.precisao ?? 2); const pontuacao = por.length ? Math.round((por.reduce((a, b) => a + b, 0) / por.length) * fator) / fator : 0
    return { projeto: projetos.find(p => p.id === pid)!, pontuacao, avaliacoes: por.length }
  }).sort((a, b) => b.pontuacao - a.pontuacao)
  const denso = banca.desempate === 'denso'; let pos = 0
  return linhas.map((l, i) => { const empata = i > 0 && l.pontuacao === linhas[i - 1].pontuacao; if (!empata) pos = denso ? pos + 1 : i + 1; return { ...l, posicao: pos } })
}
export const publicarBanca = async (ctx: Contexto, id: number) => {
  await espera(); exigir(ctx, 'admin', 'coordenador'); doTenant(ctx, bancas.find(b => b.id === id))!.status = 'publicada'
  registrarAuditoria(ctx, 'banca.publicar', 'banca', id)
}
export const dashboard = async (ctx: Contexto, f: { ano?: number; semestre?: number } = {}) => {
  const ps = await listarProjetos(ctx, f)
  const bs = bancas.filter(b => b.instituicaoId === ctx.instituicaoId && !b.arquivadaEm)
  const esperadas = bs.reduce((s, b) => s + b.avaliadorIds.length * b.projetoIds.length, 0)
  const feitas = avaliacoes.filter(a => a.status !== 'invalidada' && bs.some(b => b.id === a.bancaId)).length
  const cont = (k: (p: Projeto) => string) => Object.entries(ps.reduce<Record<string, number>>((m, p) => ({ ...m, [k(p)]: (m[k(p)] ?? 0) + 1 }), {})).map(([nome, total]) => ({ nome, total }))
  const pendencias = solicitacoes.filter(s => s.instituicaoId === ctx.instituicaoId && s.situacao === 'pendente').length
  return { projetos: ps.length, bancas: bs.length, esperadas, feitas, pendencias,
    porStatus: cont(p => ({ em_andamento: 'Em andamento', concluido: 'Concluído', arquivado: 'Arquivado' })[p.status]),
    porPeriodo: cont(p => `${p.ano}/${p.semestre}`) }
}
export const listarSolicitacoes = async (ctx: Contexto) => { await espera(); exigir(ctx, 'admin'); return solicitacoes.filter(s => s.instituicaoId === ctx.instituicaoId) }
export async function decidirSolicitacao(ctx: Contexto, id: number, aprovar: boolean, justificativa = '', papel?: Papel) {
  await espera(); exigir(ctx, 'admin')
  if (!aprovar && !justificativa.trim()) throw new HttpError(422, 'Informe a justificativa da recusa.')
  const s = doTenant(ctx, solicitacoes.find(x => x.id === id))
  if (s.situacao !== 'pendente') throw new HttpError(409, 'Esta solicitação já foi decidida.')
  s.situacao = aprovar ? 'aprovado' : 'recusado'; s.justificativa = justificativa
  if (papel && aprovar) s.papel = papel
  const v = usuarios.find(u => u.id === s.usuarioId)?.vinculos.find(x => x.instituicaoId === s.instituicaoId)
  if (v) { v.situacao = aprovar ? 'aprovado' : 'recusado'; v.justificativa = aprovar ? undefined : justificativa; if (aprovar) v.papel = s.papel }
  registrarAuditoria(ctx, aprovar ? 'vinculo.aprovar' : 'vinculo.recusar', 'vinculo', s.usuarioId ?? s.id, `${s.nome} como ${s.papel}${justificativa ? ` – ${justificativa}` : ''}`)
}

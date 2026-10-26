import { HttpError, auditoria, autorizar, bancas, espera, instituicoes, projetos, proximoId, registrarAuditoria, solicitacoes, usuarios } from '../api'
import type { Contexto, Instituicao, Papel, RegistroAuditoria } from '../types'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const COR = /^#[0-9a-fA-F]{6}$/
const su = (ctx: Contexto) => autorizar(ctx, 'superadmin')

function validar(d: Partial<Pick<Instituicao, 'nome' | 'identificador' | 'cor' | 'lema'>>, id?: number) {
  if (d.nome !== undefined && (d.nome.trim().length < 3 || d.nome.trim().length > 160)) throw new HttpError(422, 'O nome deve ter de 3 a 160 caracteres.')
  if (d.identificador !== undefined) {
    if (!SLUG.test(d.identificador) || d.identificador.length > 80) throw new HttpError(422, 'Identificador inválido: use letras minúsculas, números e hifens (ex.: minha-faculdade).')
    if (instituicoes.some(i => i.identificador === d.identificador && i.id !== id)) throw new HttpError(409, 'Já existe uma instituição com este identificador.')
  }
  if (d.cor && !COR.test(d.cor)) throw new HttpError(422, 'Cor inválida (use #RRGGBB).')
}

export async function criarInstituicao(ctx: Contexto, d: { nome: string; identificador: string; cor?: string; lema?: string }) {
  await espera(); su(ctx); validar(d)
  const i: Instituicao = { id: proximoId(instituicoes), nome: d.nome.trim(), identificador: d.identificador, status: 'ativa', cor: d.cor || '#0e7c7b', lema: d.lema?.trim() }
  instituicoes.push(i); registrarAuditoria(ctx, 'instituicao.criar', 'instituicao', i.id, i.nome, i.id); return { ...i }
}
export async function atualizarInstituicao(ctx: Contexto, id: number, d: Partial<Pick<Instituicao, 'nome' | 'identificador' | 'cor' | 'lema'>>) {
  await espera(); su(ctx); validar(d, id)
  const i = instituicoes.find(x => x.id === id); if (!i) throw new HttpError(404, 'Instituição não encontrada.')
  if (d.nome !== undefined) i.nome = d.nome.trim()
  if (d.identificador !== undefined) i.identificador = d.identificador
  if (d.cor !== undefined) i.cor = d.cor
  if (d.lema !== undefined) i.lema = d.lema.trim()
  registrarAuditoria(ctx, 'instituicao.atualizar', 'instituicao', id, i.nome, id); return { ...i }
}
export async function definirStatusInstituicao(ctx: Contexto, id: number, status: Instituicao['status'], motivo = '') {
  await espera(); su(ctx)
  const i = instituicoes.find(x => x.id === id); if (!i) throw new HttpError(404, 'Instituição não encontrada.')
  if (status === 'suspensa' && motivo.trim().length < 5) throw new HttpError(422, 'Informe o motivo da suspensão (mín. 5 caracteres).')
  i.status = status; registrarAuditoria(ctx, status === 'ativa' ? 'instituicao.ativar' : 'instituicao.suspender', 'instituicao', id, motivo.trim() || undefined, id)
}
export async function designarAdmin(ctx: Contexto, instituicaoId: number, email: string) {
  await espera(); su(ctx)
  if (!instituicoes.some(i => i.id === instituicaoId)) throw new HttpError(404, 'Instituição não encontrada.')
  const u = usuarios.find(x => x.email.toLowerCase() === email.trim().toLowerCase())
  if (!u) throw new HttpError(404, 'Nenhum usuário com este e-mail. Peça que ele crie a conta primeiro.')
  const v = u.vinculos.find(x => x.instituicaoId === instituicaoId)
  if (v) { v.papel = 'admin'; v.situacao = 'aprovado'; v.justificativa = undefined } else u.vinculos.push({ instituicaoId, papel: 'admin', situacao: 'aprovado' })
  registrarAuditoria(ctx, 'vinculo.designar_admin', 'vinculo', u.id, u.email, instituicaoId)
}

export async function visaoPlataforma(ctx: Contexto) {
  await espera(); su(ctx)
  return {
    instituicoes: instituicoes.length, ativas: instituicoes.filter(i => i.status === 'ativa').length,
    usuarios: usuarios.length, projetos: projetos.filter(p => p.status !== 'arquivado').length, bancas: bancas.filter(b => !b.arquivadaEm).length,
    pendentes: solicitacoes.filter(s => s.situacao === 'pendente').length,
    porInstituicao: instituicoes.map(i => ({ id: i.id, nome: i.nome, status: i.status,
      pessoas: usuarios.filter(u => u.vinculos.some(v => v.instituicaoId === i.id && v.situacao === 'aprovado')).length,
      projetos: projetos.filter(p => p.instituicaoId === i.id && p.status !== 'arquivado').length })),
  }
}
export async function listarUsuariosPlataforma(ctx: Contexto) {
  await espera(); su(ctx)
  return usuarios.map(u => ({ id: u.id, nome: u.nome, email: u.email, vinculos: u.vinculos.map(v => ({ ...v, instituicao: instituicoes.find(i => i.id === v.instituicaoId)?.nome ?? 'Plataforma' })) }))
}
export async function solicitacoesPlataforma(ctx: Contexto) {
  await espera(); su(ctx)
  return solicitacoes.filter(s => s.situacao === 'pendente').map(s => ({ ...s, instituicao: instituicoes.find(i => i.id === s.instituicaoId)?.nome ?? '?' }))
}
export async function decidirSolicitacaoPlataforma(ctx: Contexto, id: number, aprovar: boolean, justificativa = '', papel?: Papel) {
  await espera(); su(ctx)
  const s = solicitacoes.find(x => x.id === id); if (!s) throw new HttpError(404, 'Solicitação não encontrada.')
  if (s.situacao !== 'pendente') throw new HttpError(409, 'Esta solicitação já foi decidida.')
  if (!aprovar && !justificativa.trim()) throw new HttpError(422, 'Informe a justificativa da recusa.')
  s.situacao = aprovar ? 'aprovado' : 'recusado'; s.justificativa = justificativa; if (aprovar && papel) s.papel = papel
  const v = usuarios.find(u => u.id === s.usuarioId)?.vinculos.find(x => x.instituicaoId === s.instituicaoId)
  if (v) { v.situacao = s.situacao; v.justificativa = aprovar ? undefined : justificativa; if (aprovar) v.papel = s.papel }
  registrarAuditoria(ctx, aprovar ? 'vinculo.aprovar' : 'vinculo.recusar', 'vinculo', s.usuarioId ?? s.id, `${s.nome} como ${s.papel} (supervisão)`, s.instituicaoId)
}

export interface FiltroAuditoria { acao?: string; instituicaoId?: number }
export async function listarAuditoria(ctx: Contexto, f: FiltroAuditoria = {}): Promise<RegistroAuditoria[]> {
  await espera(); const papel = autorizar(ctx, 'admin', 'superadmin')
  return auditoria.filter(a => (papel === 'superadmin' ? (!f.instituicaoId || a.instituicaoId === f.instituicaoId) : a.instituicaoId === ctx.instituicaoId)
    && (!f.acao || a.acao.startsWith(f.acao)))
}

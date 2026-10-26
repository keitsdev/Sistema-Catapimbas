import { HttpError, autorizar, doTenant, espera, projetos, projetosVisiveis, proximoId, registrarAuditoria, sincronizarProjeto, usuarios } from '../api'
import type { Contexto, Projeto } from '../types'
import { diretorio } from './acesso'

export interface DadosProjeto { nome: string; descricao: string; ano: number; semestre: 1 | 2; status: 'em_andamento' | 'concluido' }
function validar(d: Partial<DadosProjeto>) {
  if (d.nome !== undefined && (d.nome.trim().length < 2 || d.nome.length > 180)) throw new HttpError(422, 'O nome deve ter de 2 a 180 caracteres.')
  if (d.descricao !== undefined && (d.descricao.trim().length < 10 || d.descricao.length > 5000)) throw new HttpError(422, 'A descrição deve ter de 10 a 5000 caracteres.')
  if (d.ano !== undefined && !(Number.isInteger(d.ano) && d.ano >= 2000 && d.ano <= 2100)) throw new HttpError(422, 'Ano inválido.')
  if (d.semestre !== undefined && ![1, 2].includes(d.semestre)) throw new HttpError(422, 'Semestre deve ser 1 ou 2.')
}
const doProjeto = (ctx: Contexto, id: number) => { const p = doTenant(ctx, projetos.find(x => x.id === id)); if (p.status === 'arquivado') throw new HttpError(404, 'Recurso não encontrado.'); return p }

export async function criarProjeto(ctx: Contexto, d: DadosProjeto) {
  await espera(); autorizar(ctx, 'admin', 'coordenador'); validar(d)
  const p: Projeto = { id: proximoId(projetos), instituicaoId: ctx.instituicaoId, nome: d.nome.trim(), descricao: d.descricao.trim(), ano: d.ano, semestre: d.semestre, status: d.status ?? 'em_andamento', orientador: '—', equipe: [], equipeIds: [], funcoes: {} }
  projetos.push(p); registrarAuditoria(ctx, 'projeto.criar', 'projeto', p.id, p.nome); return { ...p }
}
export async function atualizarProjeto(ctx: Contexto, id: number, d: Partial<DadosProjeto>) {
  await espera(); autorizar(ctx, 'admin', 'coordenador'); validar(d)
  const p = doProjeto(ctx, id)
  if (d.nome !== undefined) p.nome = d.nome.trim()
  if (d.descricao !== undefined) p.descricao = d.descricao.trim()
  if (d.ano !== undefined) p.ano = d.ano
  if (d.semestre !== undefined) p.semestre = d.semestre
  if (d.status !== undefined) p.status = d.status
  registrarAuditoria(ctx, 'projeto.atualizar', 'projeto', id, JSON.stringify(d)); return { ...p }
}
export async function arquivarProjeto(ctx: Contexto, id: number) {
  await espera(); autorizar(ctx, 'admin'); const p = doProjeto(ctx, id)
  p.status = 'arquivado'; registrarAuditoria(ctx, 'projeto.arquivar', 'projeto', id, p.nome)
}
export async function definirEquipe(ctx: Contexto, id: number, d: { orientadorId?: number; alunos: { id: number; funcao: string }[] }) {
  await espera(); autorizar(ctx, 'admin', 'coordenador'); const p = doProjeto(ctx, id)
  const alunosOk = new Set((await diretorio(ctx, 'aluno')).map(x => x.id)); const orientOk = new Set((await diretorio(ctx, 'orientador')).map(x => x.id))
  if (d.orientadorId && !orientOk.has(d.orientadorId)) throw new HttpError(422, 'Orientador inválido para esta instituição.')
  if (d.alunos.some(a => !alunosOk.has(a.id))) throw new HttpError(422, 'Há integrante que não é aluno aprovado desta instituição.')
  if (new Set(d.alunos.map(a => a.id)).size !== d.alunos.length) throw new HttpError(422, 'Integrante repetido.')
  p.orientadorId = d.orientadorId; p.equipeIds = d.alunos.map(a => a.id)
  p.funcoes = Object.fromEntries(d.alunos.map(a => [a.id, a.funcao.trim() || 'Integrante']))
  if (!d.orientadorId) p.orientador = '—'
  sincronizarProjeto(p); registrarAuditoria(ctx, 'projeto.equipe', 'projeto', id, `${d.alunos.length} integrante(s)`); return { ...p }
}
export async function atualizarProjetoAluno(ctx: Contexto, id: number, d: { descricao: string }) {
  await espera(); autorizar(ctx, 'aluno'); validar({ descricao: d.descricao })
  const p = doProjeto(ctx, id)
  if (!p.equipeIds?.includes(ctx.usuarioId)) throw new HttpError(404, 'Recurso não encontrado.')
  p.descricao = d.descricao.trim(); registrarAuditoria(ctx, 'projeto.atualizar_descricao', 'projeto', id); return { ...p }
}
export interface LinhaProjeto { nome: string; descricao: string; periodo: string; situacao: string; orientador: string; equipe: string }
export async function dadosExportacaoProjetos(ctx: Contexto, filtro: (p: Projeto) => boolean, ids?: number[]): Promise<LinhaProjeto[]> {
  await espera()
  return projetosVisiveis(ctx).filter(p => filtro(p) && (!ids?.length || ids.includes(p.id))).map(p => ({
    nome: p.nome, descricao: p.descricao, periodo: `${p.ano}/${p.semestre}`, situacao: ({ em_andamento: 'Em andamento', concluido: 'Concluído', arquivado: 'Arquivado' })[p.status], orientador: p.orientador, equipe: p.equipe.join(', ') }))
}
export const emailDe = (id: number) => usuarios.find(u => u.id === id)?.email ?? ''

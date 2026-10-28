import { HttpError, autorizar, bancas, espera, instituicoes, projetos, proximoId, registrarAuditoria, senhas, solicitacoes, usuarios } from '../api'
import type { Contexto, Papel, Pessoa, Vinculo } from '../types'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PAPEIS_SOLICITAVEIS: Papel[] = ['aluno', 'orientador', 'avaliador']
export const PAPEIS_INSTITUCIONAIS: Papel[] = ['admin', 'coordenador', 'orientador', 'avaliador', 'aluno']

function validarSenha(s: string) { if (s.length < 8) throw new HttpError(422, 'A senha deve ter ao menos 8 caracteres.') }

export async function listarInstituicoesPublicas() {
  await espera()
  return instituicoes.filter(i => i.status === 'ativa').map(i => ({ id: i.id, nome: i.nome, identificador: i.identificador }))
}

export async function cadastrarUsuario(d: { nome: string; email: string; senha: string; instituicaoId: number; papel: Papel }) {
  await espera()
  if (d.nome.trim().length < 3) throw new HttpError(422, 'Informe o nome completo.')
  if (!EMAIL.test(d.email)) throw new HttpError(422, 'E-mail inválido.')
  validarSenha(d.senha)
  if (!PAPEIS_SOLICITAVEIS.includes(d.papel)) throw new HttpError(422, 'Papel não permitido no cadastro.')
  const inst = instituicoes.find(i => i.id === d.instituicaoId && i.status === 'ativa')
  if (!inst) throw new HttpError(422, 'Instituição indisponível.')
  const email = d.email.trim().toLowerCase()
  if (usuarios.some(u => u.email.toLowerCase() === email)) throw new HttpError(409, 'Já existe uma conta com este e-mail. Entre e solicite ingresso pelo seu perfil.')
  const id = proximoId(usuarios)
  usuarios.push({ id, nome: d.nome.trim(), email, vinculos: [{ instituicaoId: inst.id, papel: d.papel, situacao: 'pendente' }] })
  senhas[id] = d.senha
  solicitacoes.push({ id: proximoId(solicitacoes), usuarioId: id, instituicaoId: inst.id, nome: d.nome.trim(), email, papel: d.papel, situacao: 'pendente', justificativa: '' })
  registrarAuditoria({ usuarioId: id, instituicaoId: inst.id, papel: d.papel }, 'vinculo.solicitar', 'vinculo', id, `como ${d.papel}`, inst.id)
}

export async function solicitarIngresso(usuarioId: number, instituicaoId: number, papel: Papel) {
  await espera()
  const u = usuarios.find(x => x.id === usuarioId); if (!u) throw new HttpError(401, 'Sessão inválida.')
  if (!PAPEIS_SOLICITAVEIS.includes(papel)) throw new HttpError(422, 'Papel não permitido na solicitação.')
  if (!instituicoes.some(i => i.id === instituicaoId && i.status === 'ativa')) throw new HttpError(422, 'Instituição indisponível.')
  const atual = u.vinculos.find(v => v.instituicaoId === instituicaoId)
  if (atual && atual.situacao !== 'recusado') throw new HttpError(409, `Você já possui vínculo nesta instituição (${atual.situacao}).`)
  if (atual) { atual.papel = papel; atual.situacao = 'pendente'; atual.justificativa = undefined } else u.vinculos.push({ instituicaoId, papel, situacao: 'pendente' })
  solicitacoes.push({ id: proximoId(solicitacoes), usuarioId, instituicaoId, nome: u.nome, email: u.email, papel, situacao: 'pendente', justificativa: '' })
  registrarAuditoria({ usuarioId, instituicaoId, papel }, 'vinculo.solicitar', 'vinculo', usuarioId, `como ${papel}`, instituicaoId)
}

const tokens = new Map<string, number>()
export async function solicitarRecuperacao(email: string) {
  await espera()
  const u = usuarios.find(x => x.email.toLowerCase() === email.trim().toLowerCase())
  let tokenDemo: string | undefined
  if (u) { tokenDemo = Math.random().toString(36).slice(2, 10); tokens.set(tokenDemo, u.id) }
  return { mensagem: 'Se o e-mail existir, enviaremos as instruções de recuperação.', tokenDemo }
}
export async function redefinirSenha(token: string, nova: string) {
  await espera(); validarSenha(nova)
  const id = tokens.get(token.trim()); if (!id) throw new HttpError(422, 'Código inválido ou expirado.')
  senhas[id] = nova; tokens.delete(token.trim())
  registrarAuditoria({ usuarioId: id, instituicaoId: 0, papel: 'aluno' }, 'senha.redefinir', 'usuario', id, undefined, null)
}
export async function alterarSenha(ctx: Contexto, atual: string, nova: string) {
  await espera(); autorizar(ctx); validarSenha(nova)
  if (atual !== (senhas[ctx.usuarioId] ?? 'demo1234')) throw new HttpError(401, 'A senha atual está incorreta.')
  senhas[ctx.usuarioId] = nova; registrarAuditoria(ctx, 'senha.alterar', 'usuario', ctx.usuarioId)
}

const pessoasDa = (instId: number): Pessoa[] => usuarios.flatMap(u => u.vinculos.filter(v => v.instituicaoId === instId)
  .map(v => ({ usuarioId: u.id, nome: u.nome, email: u.email, papel: v.papel, situacao: v.situacao, justificativa: v.justificativa,
    convidadoPara: v.escopo ? `${projetos.find(p => p.id === v.escopo!.projetoId)?.nome ?? '?'} · ${bancas.find(b => b.id === v.escopo!.bancaId)?.nome ?? '?'}` : undefined })))

export async function listarPessoas(ctx: Contexto): Promise<Pessoa[]> {
  await espera(); autorizar(ctx, 'admin', 'coordenador')
  return pessoasDa(ctx.instituicaoId).filter(p => p.situacao !== 'pendente').sort((a, b) => a.nome.localeCompare(b.nome))
}

export async function diretorio(ctx: Contexto, papel: Papel) {
  await espera(); autorizar(ctx, 'admin', 'coordenador')
  return pessoasDa(ctx.instituicaoId).filter(p => p.papel === papel && p.situacao === 'aprovado').map(p => ({ id: p.usuarioId, nome: p.nome, email: p.email, convidadoPara: p.convidadoPara }))
}
const vinculoAlvo = (instId: number, usuarioId: number): Vinculo => {
  const v = usuarios.find(u => u.id === usuarioId)?.vinculos.find(x => x.instituicaoId === instId)
  if (!v) throw new HttpError(404, 'Vínculo não encontrado.')
  return v
}
const adminsAprovados = (instId: number) => pessoasDa(instId).filter(p => p.papel === 'admin' && p.situacao === 'aprovado').length

export async function alterarPapel(ctx: Contexto, usuarioId: number, papel: Papel) {
  await espera(); autorizar(ctx, 'admin')
  if (!PAPEIS_INSTITUCIONAIS.includes(papel)) throw new HttpError(422, 'Papel inválido.')
  const v = vinculoAlvo(ctx.instituicaoId, usuarioId)
  if (v.situacao !== 'aprovado') throw new HttpError(409, 'Só é possível alterar o papel de vínculos aprovados.')
  if (v.papel === 'admin' && papel !== 'admin' && adminsAprovados(ctx.instituicaoId) <= 1) throw new HttpError(409, 'A instituição precisa manter ao menos um administrador.')
  const antes = v.papel; v.papel = papel
  registrarAuditoria(ctx, 'vinculo.papel', 'vinculo', usuarioId, `${antes} → ${papel}`)
}
export async function alterarSituacao(ctx: Contexto, usuarioId: number, situacao: 'aprovado' | 'bloqueado' | 'revogado', motivo = '') {
  await espera(); autorizar(ctx, 'admin')
  if (situacao !== 'aprovado' && motivo.trim().length < 5) throw new HttpError(422, 'Informe a justificativa (mín. 5 caracteres).')
  const v = vinculoAlvo(ctx.instituicaoId, usuarioId)
  if (!['aprovado', 'bloqueado', 'revogado'].includes(v.situacao)) throw new HttpError(409, 'Solicitações pendentes ou recusadas são tratadas em Aprovações.')
  if (usuarioId === ctx.usuarioId) throw new HttpError(409, 'Você não pode alterar o próprio acesso.')
  if (v.papel === 'admin' && situacao !== 'aprovado' && adminsAprovados(ctx.instituicaoId) <= 1) throw new HttpError(409, 'A instituição precisa manter ao menos um administrador.')
  const antes = v.situacao; v.situacao = situacao; v.justificativa = situacao === 'aprovado' ? undefined : motivo.trim()
  registrarAuditoria(ctx, `vinculo.${situacao === 'aprovado' ? 'restaurar' : situacao === 'bloqueado' ? 'bloquear' : 'revogar'}`, 'vinculo', usuarioId, `${antes} → ${situacao}${motivo ? ` – ${motivo.trim()}` : ''}`)
}

export async function exportarMeusDados(ctx: Contexto) {
  await espera(); autorizar(ctx)
  const u = usuarios.find(x => x.id === ctx.usuarioId)!
  registrarAuditoria(ctx, 'lgpd.exportar', 'usuario', u.id)
  return { geradoEm: new Date().toISOString(), nome: u.nome, email: u.email,
    vinculos: u.vinculos.map(v => ({ instituicao: instituicoes.find(i => i.id === v.instituicaoId)?.nome ?? 'Plataforma', papel: v.papel, situacao: v.situacao })) }
}
export async function solicitarExclusao(ctx: Contexto, motivo: string) {
  await espera(); autorizar(ctx)
  if (motivo.trim().length < 5) throw new HttpError(422, 'Descreva o pedido (mín. 5 caracteres).')
  registrarAuditoria(ctx, 'lgpd.exclusao', 'usuario', ctx.usuarioId, motivo.trim())
}

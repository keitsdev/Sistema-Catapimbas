import { HttpError, autorizar, bancas, espera, instituicoes, projetos, proximoId, registrarAuditoria, senhas, usuarios } from '../api'
import type { Convite, Contexto, SituacaoConvite } from '../types'

export const convites: Convite[] = []
const tokens = new Map<number, string>()
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const VALIDADES = [[1, '1 hora'], [24, '24 horas'], [72, '3 dias'], [168, '7 dias']] as const
export const INVALIDO = 'Este convite não é mais válido. Peça um novo link a quem convidou você.'

const aleatorio = (n: number) => crypto.getRandomValues(new Uint8Array(n))
export const gerarToken = () => btoa(String.fromCharCode(...aleatorio(24))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export function gerarSenhaTemporaria() {
  const al = 'abcdefghjkmnpqrstuvwxyz23456789'; const c = Array.from(aleatorio(10), b => al[b % al.length])
  return `${c.slice(0, 5).join('')}-${c.slice(5).join('')}`
}

export const situacaoConvite = (c: Convite, agora = Date.now()): SituacaoConvite =>
  c.revogadoEm ? 'revogado' : new Date(c.expiraEm).getTime() <= agora ? 'expirado' : c.usos >= c.maxUsos ? 'esgotado' : 'ativo'

function escopoDe(ctx: Contexto, bancaId: number, projetoId: number) {
  const papel = autorizar(ctx, 'admin', 'superadmin')
  const banca = bancas.find(b => b.id === bancaId && !b.arquivadaEm)
  if (!banca || (papel === 'admin' && banca.instituicaoId !== ctx.instituicaoId)) throw new HttpError(404, 'Recurso não encontrado.')
  const projeto = projetos.find(p => p.id === projetoId && p.instituicaoId === banca.instituicaoId && p.status !== 'arquivado')
  if (!projeto || !banca.projetoIds.includes(projeto.id)) throw new HttpError(422, 'Este projeto não participa da banca escolhida.')
  return { banca, projeto }
}

export async function criarConvite(ctx: Contexto, d: { bancaId: number; projetoId: number; validadeHoras: number; maxUsos: number }) {
  await espera(); const { banca, projeto } = escopoDe(ctx, d.bancaId, d.projetoId)
  if (banca.status === 'encerrada' || banca.status === 'publicada') throw new HttpError(409, 'Esta banca já foi encerrada: só é possível convidar enquanto ela está em rascunho ou aberta.')
  if (!Number.isInteger(d.validadeHoras) || d.validadeHoras < 1 || d.validadeHoras > 168) throw new HttpError(422, 'Validade de 1 hora a 7 dias.')
  if (!Number.isInteger(d.maxUsos) || d.maxUsos < 1 || d.maxUsos > 20) throw new HttpError(422, 'O link pode ser usado por 1 a 20 pessoas.')
  const c: Convite = { id: proximoId(convites), instituicaoId: banca.instituicaoId, bancaId: banca.id, projetoId: projeto.id, criadoPor: ctx.usuarioId,
    criadoEm: new Date().toISOString(), expiraEm: new Date(Date.now() + d.validadeHoras * 3600_000).toISOString(), maxUsos: d.maxUsos, usos: 0, usadoPor: [] }
  const token = gerarToken(); convites.push(c); tokens.set(c.id, token)
  registrarAuditoria(ctx, 'convite.criar', 'convite', c.id, `projeto ${projeto.nome}, banca ${banca.nome}`, banca.instituicaoId)
  return { convite: { ...c }, token }
}

export async function listarConvites(ctx: Contexto, f: { bancaId?: number; projetoId?: number } = {}) {
  await espera(); const papel = autorizar(ctx, 'admin', 'superadmin')
  return convites.filter(c => (papel === 'superadmin' || c.instituicaoId === ctx.instituicaoId) && (!f.bancaId || c.bancaId === f.bancaId) && (!f.projetoId || c.projetoId === f.projetoId))
    .map(c => ({ ...c, situacao: situacaoConvite(c) })).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
}
export async function revogarConvite(ctx: Contexto, id: number) {
  await espera(); const papel = autorizar(ctx, 'admin', 'superadmin')
  const c = convites.find(x => x.id === id)
  if (!c || (papel === 'admin' && c.instituicaoId !== ctx.instituicaoId)) throw new HttpError(404, 'Recurso não encontrado.')
  if (c.revogadoEm) throw new HttpError(409, 'Este convite já foi revogado.')
  c.revogadoEm = new Date().toISOString(); registrarAuditoria(ctx, 'convite.revogar', 'convite', id, undefined, c.instituicaoId)
}

export async function opcoesConviteSuperadmin(ctx: Contexto) {
  await espera(); autorizar(ctx, 'superadmin')
  return instituicoes.filter(i => i.status === 'ativa').map(i => ({ id: i.id, nome: i.nome,
    bancas: bancas.filter(b => b.instituicaoId === i.id && !b.arquivadaEm && (b.status === 'rascunho' || b.status === 'aberta')).map(b => ({ id: b.id, nome: b.nome, status: b.status,
      projetos: b.projetoIds.map(pid => projetos.find(p => p.id === pid)).filter(p => p && p.status !== 'arquivado').map(p => ({ id: p!.id, nome: p!.nome })) })) }))
}

function convitePorToken(token: string) {
  const id = [...tokens.entries()].find(([, t]) => t === token)?.[0]
  const c = convites.find(x => x.id === id)
  const banca = c && bancas.find(b => b.id === c.bancaId); const projeto = c && projetos.find(p => p.id === c.projetoId); const inst = c && instituicoes.find(i => i.id === c.instituicaoId)
  if (!c || !banca || !projeto || !inst || situacaoConvite(c) !== 'ativo' || banca.arquivadaEm || !['rascunho', 'aberta'].includes(banca.status) || projeto.status === 'arquivado' || inst.status !== 'ativa') throw new HttpError(410, INVALIDO)
  return { c, banca, projeto, inst }
}
export async function consultarConvite(token: string) {
  await espera(); const { c, banca, projeto, inst } = convitePorToken(token)
  return { projeto: projeto.nome, banca: banca.nome, instituicao: inst.nome, expiraEm: c.expiraEm }
}
export async function aceitarConvite(token: string, d: { nome: string; email: string; organizacao?: string }) {
  await espera()
  if (d.nome.trim().length < 3) throw new HttpError(422, 'Informe seu nome.')
  if (!EMAIL.test(d.email.trim())) throw new HttpError(422, 'E-mail inválido.')
  const { c, banca, projeto } = convitePorToken(token); const email = d.email.trim().toLowerCase()
  if (usuarios.some(u => u.email.toLowerCase() === email)) throw new HttpError(409, 'Já existe uma conta com este e-mail. Entre com a sua senha ou peça a quem convidou que use outro e-mail.')
  const id = proximoId(usuarios); const senha = gerarSenhaTemporaria()
  usuarios.push({ id, nome: d.nome.trim(), email, organizacao: d.organizacao?.trim() || undefined,
    vinculos: [{ instituicaoId: c.instituicaoId, papel: 'avaliador', situacao: 'aprovado', escopo: { bancaId: banca.id, projetoId: projeto.id, conviteId: c.id } }] })
  senhas[id] = senha
  if (!banca.avaliadorIds.includes(id)) banca.avaliadorIds.push(id)
  c.usos++; c.usadoPor.push({ usuarioId: id, nome: d.nome.trim(), quando: new Date().toISOString() })
  registrarAuditoria({ usuarioId: id, instituicaoId: c.instituicaoId, papel: 'avaliador' }, 'convite.aceitar', 'convite', c.id, `${d.nome.trim()} (${email}) para o projeto ${projeto.nome}`, c.instituicaoId)
  return { email, senhaTemporaria: senha, projeto: projeto.nome }
}

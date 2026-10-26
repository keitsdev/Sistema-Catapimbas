import { HttpError, autorizar, avaliacoes, bancas, bancasVisiveis, doTenant, espera, projetos, proximoId, registrarAuditoria, usuarios } from '../api'
import type { Apresentacao, Avaliacao, Banca, Contexto, Criterio } from '../types'
import { diretorio } from './acesso'

export const ESCALA = [1, 2, 3, 4, 5] as const
export const APRESENTACAO_PADRAO: Apresentacao = { musicaAtiva: false, musicaTitulo: '', musicaUrl: '', volume: 0.8, atrasoMs: 1400, confete: true }
const GESTAO = ['admin', 'coordenador'] as const

export interface DadosBanca { nome: string; inicio: string; fim: string; desempate: 'competicao' | 'denso'; precisao: number }
function validar(d: Partial<DadosBanca>) {
  if (d.nome !== undefined && (d.nome.trim().length < 3 || d.nome.length > 180)) throw new HttpError(422, 'O nome deve ter de 3 a 180 caracteres.')
  if (d.inicio !== undefined && d.fim !== undefined && !(d.fim > d.inicio)) throw new HttpError(422, 'O término deve ser posterior ao início.')
  if (d.precisao !== undefined && !(Number.isInteger(d.precisao) && d.precisao >= 0 && d.precisao <= 4)) throw new HttpError(422, 'Casas decimais: de 0 a 4.')
}
const daBanca = (ctx: Contexto, id: number) => { const b = doTenant(ctx, bancas.find(x => x.id === id)); if (b.arquivadaEm) throw new HttpError(404, 'Recurso não encontrado.'); return b }
const temAvaliacoes = (id: number) => avaliacoes.some(a => a.bancaId === id)

export async function obterBanca(ctx: Contexto, id: number): Promise<Banca> {
  await espera(); const b = daBanca(ctx, id)
  if (!bancasVisiveis(ctx).some(x => x.id === id)) throw new HttpError(404, 'Recurso não encontrado.')
  return b
}
export async function criarBanca(ctx: Contexto, d: DadosBanca) {
  await espera(); autorizar(ctx, ...GESTAO); validar(d)
  const b: Banca = { id: proximoId(bancas), instituicaoId: ctx.instituicaoId, nome: d.nome.trim(), status: 'rascunho', avaliadorIds: [], projetoIds: [], criterios: [], inicio: d.inicio, fim: d.fim, desempate: d.desempate, precisao: d.precisao, apresentacao: { ...APRESENTACAO_PADRAO } }
  bancas.push(b); registrarAuditoria(ctx, 'banca.criar', 'banca', b.id, b.nome); return b
}
export async function atualizarBanca(ctx: Contexto, id: number, d: Partial<DadosBanca>) {
  await espera(); autorizar(ctx, ...GESTAO); const b = daBanca(ctx, id)
  if (b.status === 'publicada') throw new HttpError(409, 'Resultados publicados: retire a publicação antes de editar a banca.')
  validar({ ...d, inicio: d.inicio ?? b.inicio, fim: d.fim ?? b.fim } as Partial<DadosBanca>)
  if ((d.desempate && d.desempate !== b.desempate) || (d.precisao !== undefined && d.precisao !== b.precisao)) if (temAvaliacoes(id)) throw new HttpError(409, 'Já existem avaliações: desempate e precisão não podem mais mudar.')
  Object.assign(b, { ...(d.nome !== undefined && { nome: d.nome.trim() }), ...(d.inicio && { inicio: d.inicio }), ...(d.fim && { fim: d.fim }), ...(d.desempate && { desempate: d.desempate }), ...(d.precisao !== undefined && { precisao: d.precisao }) })
  registrarAuditoria(ctx, 'banca.atualizar', 'banca', id, JSON.stringify(d)); return b
}
export async function mudarStatusBanca(ctx: Contexto, id: number, novo: 'rascunho' | 'aberta' | 'encerrada') {
  await espera(); autorizar(ctx, ...GESTAO); const b = daBanca(ctx, id)
  if (b.status === 'publicada') throw new HttpError(409, 'Resultados publicados: retire a publicação primeiro.')
  if (novo === 'aberta') {
    if (!b.projetoIds.length) throw new HttpError(422, 'Designe ao menos um projeto antes de abrir.')
    if (!b.avaliadorIds.length) throw new HttpError(422, 'Designe ao menos um avaliador antes de abrir.')
    if (!b.criterios.length) throw new HttpError(422, 'Cadastre ao menos um critério antes de abrir.')
    if (b.inicio && b.fim && !(b.fim > b.inicio)) throw new HttpError(422, 'Período inválido.')
  }
  if (novo === 'rascunho' && temAvaliacoes(id)) throw new HttpError(409, 'Já existem avaliações: a banca não pode voltar a rascunho.')
  const antes = b.status; b.status = novo; registrarAuditoria(ctx, 'banca.status', 'banca', id, `${antes} → ${novo}`); return b
}
export async function retirarPublicacao(ctx: Contexto, id: number, motivo: string) {
  await espera(); autorizar(ctx, 'admin'); const b = daBanca(ctx, id)
  if (b.status !== 'publicada') throw new HttpError(409, 'A banca não está publicada.')
  if (motivo.trim().length < 5) throw new HttpError(422, 'Informe o motivo (mín. 5 caracteres).')
  b.status = 'encerrada'; registrarAuditoria(ctx, 'banca.despublicar', 'banca', id, motivo.trim())
}
export async function arquivarBanca(ctx: Contexto, id: number) {
  await espera(); autorizar(ctx, 'admin'); const b = daBanca(ctx, id)
  if (b.status === 'aberta') throw new HttpError(409, 'Encerre a banca antes de arquivar.')
  b.arquivadaEm = new Date().toISOString(); registrarAuditoria(ctx, 'banca.arquivar', 'banca', id, b.nome)
}
export async function duplicarBanca(ctx: Contexto, id: number) {
  await espera(); autorizar(ctx, ...GESTAO); const o = daBanca(ctx, id)
  const b: Banca = { ...structuredClone(o), id: proximoId(bancas), nome: `${o.nome} (cópia)`, status: 'rascunho', projetoIds: [], arquivadaEm: undefined }
  bancas.push(b); registrarAuditoria(ctx, 'banca.duplicar', 'banca', b.id, `a partir de #${id}`); return b
}

export async function definirParticipantes(ctx: Contexto, id: number, projetoIds: number[], avaliadorIds: number[]) {
  await espera(); autorizar(ctx, ...GESTAO); const b = daBanca(ctx, id)
  if (b.status === 'publicada') throw new HttpError(409, 'Resultados publicados: não é possível alterar participantes.')
  const validosP = new Set(projetos.filter(p => p.instituicaoId === ctx.instituicaoId && p.status !== 'arquivado').map(p => p.id))
  const validosA = new Set((await diretorio(ctx, 'avaliador')).map(x => x.id))
  if (projetoIds.some(p => !validosP.has(p))) throw new HttpError(422, 'Há projeto que não pertence a esta instituição.')
  if (avaliadorIds.some(a => !validosA.has(a))) throw new HttpError(422, 'Há avaliador sem vínculo aprovado nesta instituição.')
  const comNota = avaliacoes.filter(a => a.bancaId === id)
  if (comNota.some(a => !projetoIds.includes(a.projetoId) || !avaliadorIds.includes(a.avaliadorId))) throw new HttpError(409, 'Há avaliações lançadas para algum participante removido. Invalide-as antes ou duplique a banca.')
  b.projetoIds = [...new Set(projetoIds)]; b.avaliadorIds = [...new Set(avaliadorIds)]
  registrarAuditoria(ctx, 'banca.participantes', 'banca', id, `${b.projetoIds.length} projeto(s), ${b.avaliadorIds.length} avaliador(es)`); return b
}

export interface CriterioEntrada { id?: number; titulo: string; peso: number; descricao?: string; descritores: Record<number, string> }
export async function definirCriterios(ctx: Contexto, id: number, criterios: CriterioEntrada[]) {
  await espera(); autorizar(ctx, ...GESTAO); const b = daBanca(ctx, id)
  if (b.status === 'publicada') throw new HttpError(409, 'Resultados publicados: não é possível alterar critérios.')
  if (temAvaliacoes(id)) throw new HttpError(409, 'Já existem avaliações: os critérios ficam congelados para preservar o histórico. Duplique a banca para criar uma nova versão.')
  if (!criterios.length || criterios.length > 50) throw new HttpError(422, 'Informe de 1 a 50 critérios.')
  const novos: Criterio[] = []; let seq = Math.max(0, ...b.criterios.map(c => c.id))
  for (const c of criterios) {
    if (c.titulo.trim().length < 3 || c.titulo.length > 180) throw new HttpError(422, 'Cada critério precisa de um título (3 a 180 caracteres).')
    if (!(c.peso > 0 && c.peso <= 1000)) throw new HttpError(422, `Peso inválido em "${c.titulo}" (deve ser maior que 0).`)
    for (const n of ESCALA) if ((c.descritores?.[n] ?? '').trim().length < 3) throw new HttpError(422, `Descreva a nota ${n} do critério "${c.titulo}".`)
    novos.push({ id: c.id ?? ++seq, titulo: c.titulo.trim(), peso: c.peso, descricao: c.descricao?.trim() ?? '', descritores: Object.fromEntries(ESCALA.map(n => [n, c.descritores[n].trim()])) })
  }
  b.criterios = novos; registrarAuditoria(ctx, 'banca.criterios', 'banca', id, `${novos.length} critério(s), soma de pesos ${novos.reduce((s, c) => s + c.peso, 0)}`); return b
}

export async function configurarApresentacao(ctx: Contexto, id: number, a: Apresentacao) {
  await espera(); autorizar(ctx, ...GESTAO); const b = daBanca(ctx, id)
  if (!(a.volume >= 0 && a.volume <= 1)) throw new HttpError(422, 'Volume entre 0 e 1.')
  if (!(Number.isInteger(a.atrasoMs) && a.atrasoMs >= 0 && a.atrasoMs <= 60000)) throw new HttpError(422, 'Atraso entre 0 e 60000 ms.')
  if (a.musicaAtiva && !/^https?:\/\/\S+$/.test(a.musicaUrl)) throw new HttpError(422, 'Informe a URL (http/https) da música habilitada.')
  b.apresentacao = { ...a }; registrarAuditoria(ctx, 'banca.apresentacao', 'banca', id); return b
}

export async function obterApresentacao(ctx: Contexto, id: number): Promise<Apresentacao> {
  await espera(); const b = bancasVisiveis(ctx).find(x => x.id === id); if (!b) throw new HttpError(404, 'Recurso não encontrado.')
  return b.apresentacao ?? APRESENTACAO_PADRAO
}

export interface CelulaProgresso { projetoId: number; avaliadorId: number; estado: 'pendente' | 'enviada'; avaliacaoId?: number; media?: number }
export async function progressoBanca(ctx: Contexto, id: number) {
  await espera(); autorizar(ctx, ...GESTAO); const b = daBanca(ctx, id)
  const celulas: CelulaProgresso[] = b.projetoIds.flatMap(projetoId => b.avaliadorIds.map(avaliadorId => {
    const a = avaliacoes.find(x => x.bancaId === id && x.projetoId === projetoId && x.avaliadorId === avaliadorId && x.status !== 'invalidada')
    const cs = a ? b.criterios.filter(c => a.notas[c.id] != null) : []
    const media = a && cs.length ? cs.reduce((s, c) => s + a.notas[c.id] * c.peso, 0) / cs.reduce((s, c) => s + c.peso, 0) : undefined
    return { projetoId, avaliadorId, estado: a ? 'enviada' as const : 'pendente' as const, avaliacaoId: a?.id, media }
  }))
  return { banca: b, celulas, concluidas: celulas.filter(c => c.estado === 'enviada').length, total: celulas.length,
    projetos: b.projetoIds.map(p => ({ id: p, nome: projetos.find(x => x.id === p)?.nome ?? '?' })),
    avaliadores: b.avaliadorIds.map(a => ({ id: a, nome: usuarios.find(u => u.id === a)?.nome ?? '?' })) }
}
export async function minhasAvaliacoesDetalhadas(ctx: Contexto) {
  await espera(); autorizar(ctx, 'avaliador')
  return avaliacoes.filter(a => a.avaliadorId === ctx.usuarioId && a.status !== 'invalidada')
    .map(a => ({ ...a, banca: bancas.find(b => b.id === a.bancaId)!, projeto: projetos.find(p => p.id === a.projetoId)! }))
    .filter(a => a.banca.instituicaoId === ctx.instituicaoId).sort((x, y) => y.criadaEm.localeCompare(x.criadaEm))
}
export async function revisarAvaliacao(ctx: Contexto, id: number, notas: Record<number, number>) {
  await espera(); autorizar(ctx, 'avaliador')
  const a = avaliacoes.find(x => x.id === id && x.avaliadorId === ctx.usuarioId); if (!a) throw new HttpError(404, 'Recurso não encontrado.')
  const b = daBanca(ctx, a.bancaId)
  if (a.status === 'invalidada') throw new HttpError(409, 'Esta avaliação foi invalidada.')
  if (b.status !== 'aberta') throw new HttpError(409, 'A banca não está aberta: a correção não é mais permitida.')
  if (b.criterios.some(c => !(Number.isInteger(notas[c.id]) && notas[c.id] >= 1 && notas[c.id] <= 5))) throw new HttpError(422, 'Preencha todos os critérios com notas de 1 a 5.')
  const antes = { ...a.notas }; a.notas = { ...notas }; a.versao = (a.versao ?? 1) + 1
  registrarAuditoria(ctx, 'avaliacao.revisar', 'avaliacao', id, `v${a.versao}: antes ${JSON.stringify(antes)} → depois ${JSON.stringify(a.notas)}`); return a
}

export async function invalidarAvaliacao(ctx: Contexto, id: number, motivo: string) {
  await espera(); autorizar(ctx, ...GESTAO)
  const a = avaliacoes.find(x => x.id === id); if (!a) throw new HttpError(404, 'Recurso não encontrado.')
  const b = daBanca(ctx, a.bancaId)
  if (b.status === 'publicada') throw new HttpError(409, 'Resultados publicados: retire a publicação antes de invalidar notas.')
  if (a.status === 'invalidada') throw new HttpError(409, 'Já invalidada.')
  if (motivo.trim().length < 5) throw new HttpError(422, 'Informe a justificativa (mín. 5 caracteres).')
  a.status = 'invalidada'; a.motivoInvalidacao = motivo.trim()
  registrarAuditoria(ctx, 'avaliacao.invalidar', 'avaliacao', id, motivo.trim())
}
export type { Avaliacao }

export async function contarAvaliacoes(ctx: Contexto, id: number) {
  await espera(); autorizar(ctx, ...GESTAO); daBanca(ctx, id)
  return avaliacoes.filter(a => a.bancaId === id).length
}

export type Papel = 'superadmin' | 'admin' | 'coordenador' | 'orientador' | 'avaliador' | 'aluno'
export const PAPEL_LABEL: Record<Papel, string> = {
  superadmin: 'Superadministrador', admin: 'Administrador institucional', coordenador: 'Coordenador',
  orientador: 'Orientador', avaliador: 'Avaliador', aluno: 'Aluno',
}
export interface Instituicao { id: number; nome: string; identificador: string; status: 'ativa' | 'suspensa'; cor?: string; lema?: string }
export interface Vinculo { instituicaoId: number; papel: Papel; situacao: 'aprovado' | 'pendente' | 'recusado' | 'bloqueado' | 'revogado'; justificativa?: string }
export interface Usuario { id: number; nome: string; email: string; vinculos: Vinculo[] }
export interface Projeto {
  id: number; instituicaoId: number; nome: string; descricao: string; ano: number; semestre: 1 | 2
  status: 'em_andamento' | 'concluido' | 'arquivado'; orientador: string; equipe: string[]
  orientadorId?: number; equipeIds?: number[]; funcoes?: Record<number, string>
}
export interface Criterio { id: number; titulo: string; peso: number; descritores: Record<number, string>; descricao?: string }
export interface Banca {
  id: number; instituicaoId: number; nome: string; status: 'rascunho' | 'aberta' | 'encerrada' | 'publicada'
  avaliadorIds: number[]; projetoIds: number[]; criterios: Criterio[]
  inicio?: string; fim?: string; desempate?: 'competicao' | 'denso'; precisao?: number; arquivadaEm?: string
  apresentacao?: Apresentacao
}
export interface Apresentacao { musicaAtiva: boolean; musicaTitulo: string; musicaUrl: string; volume: number; atrasoMs: number; confete: boolean }
export interface Avaliacao { id: number; bancaId: number; projetoId: number; avaliadorId: number; notas: Record<number, number>; criadaEm: string; versao?: number; status?: 'valida' | 'invalidada'; motivoInvalidacao?: string }
export interface Contexto { usuarioId: number; instituicaoId: number; papel: Papel }
export interface LinhaRanking { posicao: number; projeto: Projeto; pontuacao: number; avaliacoes: number }

export interface Solicitacao { id: number; usuarioId?: number; instituicaoId: number; nome: string; email: string; papel: Papel; situacao: 'pendente' | 'aprovado' | 'recusado'; justificativa: string }
export interface RegistroAuditoria { id: number; quando: string; atorId: number; atorNome: string; instituicaoId: number | null; acao: string; entidade: string; entidadeId: string; detalhe?: string }
export interface Pessoa { usuarioId: number; nome: string; email: string; papel: Papel; situacao: Vinculo['situacao']; justificativa?: string }
export const SITUACAO_LABEL: Record<Vinculo['situacao'], string> = { aprovado: 'Aprovado', pendente: 'Pendente', recusado: 'Recusado', bloqueado: 'Bloqueado', revogado: 'Revogado' }
export const BANCA_LABEL: Record<Banca['status'], string> = { rascunho: 'Rascunho', aberta: 'Aberta', encerrada: 'Encerrada', publicada: 'Publicada' }

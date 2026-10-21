export type Papel = 'superadmin' | 'admin' | 'coordenador' | 'orientador' | 'avaliador' | 'aluno'
export const PAPEL_LABEL: Record<Papel, string> = {
  superadmin: 'Superadministrador', admin: 'Administrador institucional', coordenador: 'Coordenador',
  orientador: 'Orientador', avaliador: 'Avaliador', aluno: 'Aluno',
}
export interface Instituicao { id: number; nome: string; identificador: string; status: 'ativa' | 'suspensa' }
export interface Vinculo { instituicaoId: number; papel: Papel; situacao: 'aprovado' | 'pendente' | 'recusado' | 'bloqueado'; justificativa?: string }
export interface Usuario { id: number; nome: string; email: string; vinculos: Vinculo[] }
export interface Projeto {
  id: number; instituicaoId: number; nome: string; descricao: string; ano: number; semestre: 1 | 2
  status: 'em_andamento' | 'concluido' | 'arquivado'; orientador: string; equipe: string[]
}
export interface Criterio { id: number; titulo: string; peso: number; descritores: Record<number, string> }
export interface Banca {
  id: number; instituicaoId: number; nome: string; status: 'rascunho' | 'aberta' | 'publicada'
  avaliadorIds: number[]; projetoIds: number[]; criterios: Criterio[]
}
export interface Avaliacao { id: number; bancaId: number; projetoId: number; avaliadorId: number; notas: Record<number, number>; criadaEm: string }
export interface Contexto { usuarioId: number; instituicaoId: number; papel: Papel }
export interface LinhaRanking { posicao: number; projeto: Projeto; pontuacao: number; avaliacoes: number }

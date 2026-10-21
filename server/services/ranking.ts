import { supabase } from '../../src/lib/supabase';
import { HttpError } from '../../src/lib/http-error';

export interface RankingResult {
  posicao: number;
  projeto_id: string;
  nome_projeto: string;
  media_final: number;
  total_avaliacoes: number;
}

export async function calcularRankingBanca(bancaId: string, institutionId: string): Promise<RankingResult[]> {
  // Validar se a banca pertence à instituição do usuário (RN01, RN10)
  const { data: banca, error: bancaErr } = await supabase
    .from('bancas')
    .select('id, instituicao_id, status, publicar_resultados')
    .eq('id', bancaId)
    .single();

  if (bancaErr || !banca || banca.instituicao_id !== institutionId) {
    throw new HttpError(404, 'Banca não encontrada ou acesso negado.');
  }

  // Buscar projetos, avaliações e critérios
  const { data: avaliacoes, error: evalErr } = await supabase
    .from('avaliacoes')
    .select(`
      id,
      projeto_id,
      nota,
      status,
      criterios ( peso ),
      projetos ( id, nome )
    `)
    .eq('banca_id', bancaId)
    .eq('status', 'valida');

  if (evalErr) throw evalErr;

  // Agrupamento por projeto
  const mapaProjetos: Record<string, { nome: string; somaPontos: number; somaPesos: number; qtd: number }> = {};

  avaliacoes?.forEach((av: any) => {
    const projId = av.projeto_id;
    const nomeProj = av.projetos?.nome || 'Projeto Sem Nome';
    const peso = av.criterios?.peso || 1;
    const nota = av.nota || 0;

    if (!mapaProjetos[projId]) {
      mapaProjetos[projId] = { nome: nomeProj, somaPontos: 0, somaPesos: 0, qtd: 0 };
    }

    mapaProjetos[projId].somaPontos += nota * peso;
    mapaProjetos[projId].somaPesos += peso;
    mapaProjetos[projId].qtd += 1;
  });

  const listaRanking = Object.keys(mapaProjetos).map((projId) => {
    const item = mapaProjetos[projId];
    const mediaFinal = item.somaPesos > 0 ? parseFloat((item.somaPontos / item.somaPesos).toFixed(2)) : 0;
    return {
      projeto_id: projId,
      nome_projeto: item.nome,
      media_final: mediaFinal,
      total_avaliacoes: item.qtd
    };
  });

  // Ordenação por nota e aplicação da política de desempate
  listaRanking.sort((a, b) => {
    if (b.media_final !== a.media_final) {
      return b.media_final - a.media_final;
    }
    return b.total_avaliacoes - a.total_avaliacoes; // Critério secundário: maior volume de avaliações
  });

  return listaRanking.map((item, index) => ({
    posicao: index + 1,
    ...item
  }));
}
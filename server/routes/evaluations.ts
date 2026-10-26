import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { supabase } from '../../src/lib/supabase';
import { HttpError } from '../../src/lib/http-error';
import { registrarAuditoria } from '../services/audit';

const router = Router();

router.post('/', requireAuth, requireRole(['avaliador', 'admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { banca_id, projeto_id, notas } = req.body;
    const usuarioId = req.user!.id;
    const instituicaoId = req.user!.institution_id!;

    const { data: designacao } = await supabase
      .from('banca_avaliadores')
      .select('id')
      .eq('banca_id', banca_id)
      .eq('avaliador_id', usuarioId)
      .single();

    if (!designacao && !req.user!.is_superadmin) {
      throw new HttpError(403, 'Você não está designado como avaliador nesta banca.');
    }

    const { data: existente } = await supabase
      .from('avaliacoes')
      .select('id')
      .eq('banca_id', banca_id)
      .eq('projeto_id', projeto_id)
      .eq('avaliador_id', usuarioId)
      .eq('status', 'valida');

    if (existente && existente.length > 0) {
      throw new HttpError(400, 'Submissão duplicada: Você já enviou uma avaliação ativa para este projeto nesta banca.');
    }

    const inserts = notas.map((item: { criterio_id: string; nota: number }) => ({
      banca_id,
      projeto_id,
      avaliador_id: usuarioId,
      criterio_id: item.criterio_id,
      nota: item.nota,
      status: 'valida',
      created_at: new Date().toISOString()
    }));

    const { data: result, error } = await supabase.from('avaliacoes').insert(inserts).select();
    if (error) throw error;

    await registrarAuditoria({
      ator_id: usuarioId,
      operacao: 'SUBMISAO_AVALIACAO',
      entidade: 'avaliacoes',
      identificador: `${banca_id}:${projeto_id}`,
      detalhes: { quantidade_criterios: notas.length }
    });

    res.status(201).json({ status: 'sucesso', mensagem: 'Avaliação lançada com sucesso.', dados: result });
  } catch (err) {
    next(err);
  }
});

export default router;
export { evaluationsRouter } from "./evaluations.contract.js";

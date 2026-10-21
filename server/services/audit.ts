import { supabase } from '../../src/lib/supabase';

export interface AuditLogPayload {
  ator_id: string;
  operacao: string;
  entidade: string;
  identificador: string;
  detalhes?: Record<string, any>;
}

export async function registrarAuditoria(payload: AuditLogPayload): Promise<void> {
  try {
    await supabase.from('auditoria').insert({
      ator_id: payload.ator_id,
      operacao: payload.operacao,
      entidade: payload.entidade,
      identificador: payload.identificador,
      detalhes: payload.detalhes || {},
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Falha ao gravar log de auditoria:', err);
  }
}
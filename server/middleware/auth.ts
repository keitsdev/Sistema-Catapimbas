import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../../src/lib/http-error';
import { supabase } from '../../src/lib/supabase';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.split(' ')[1] 
      : req.cookies?.session_token;

    if (!token) {
      throw new HttpError(401, 'Não autenticado. Token de acesso ausente.');
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      throw new HttpError(401, 'Sessão inválida ou expirada.');
    }

    // Consulta perfil
    const { data: profile, error: profileError } = await supabase
      .from('usuarios')
      .select('id, nome, email, status, is_superadmin')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile || profile.status !== 'ativo') {
      throw new HttpError(403, 'Acesso negado: Conta inativa, pendente ou recusada.');
    }

    const targetInstitutionId = (req.headers['x-institution-id'] as string) || (req.query.institution_id as string);

    let role: string | undefined = undefined;
    if (targetInstitutionId) {
      const { data: vinculo } = await supabase
        .from('vinculos_institucionais')
        .select('papel, situacao')
        .eq('usuario_id', profile.id)
        .eq('instituicao_id', targetInstitutionId)
        .maybeSingle();

      if (vinculo && vinculo.situacao === 'aprovado') {
        role = vinculo.papel;
      }
    }

    req.user = {
      id: profile.id,
      email: profile.email,
      nome: profile.nome,
      is_superadmin: !!profile.is_superadmin,
      institution_id: targetInstitutionId,
      role: role
    };

    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new HttpError(401, 'Usuário não autenticado.'));
    }

    if (req.user.is_superadmin) {
      return next();
    }

    if (!req.user.role || !allowedRoles.includes(req.user.role)) {
      return next(new HttpError(403, 'Permissão insuficiente para executar esta operação nesta instituição.'));
    }

    next();
  };
}
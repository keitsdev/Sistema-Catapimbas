import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      log?: {
        error: (object: Record<string, unknown>, message?: string) => void;
      };
      user?: {
        id: string;
        email: string;
        nome: string;
        is_superadmin: boolean;
        institution_id?: string;
        role?: string;
      };
      legacyAccount?: {
        userId: number;
        authUserId: string;
        email: string;
        name: string;
        institutionId: number;
        role: "admin" | "coordenador" | "orientador" | "avaliador" | "aluno";
      };
    }
  }
}

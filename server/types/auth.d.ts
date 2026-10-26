import type { User } from "@supabase/supabase-js";

export type InstitutionRole = "institution_admin" | "coordinator" | "advisor" | "evaluator" | "student";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        user: User;
        systemRole?: "superadmin";
        institutionId?: string;
        role?: InstitutionRole;
        supervising?: boolean;
      };
    }
  }
}

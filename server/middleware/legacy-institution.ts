import type { RequestHandler } from "express";
import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";
import { LEGACY_SCHEMA } from "../repositories/legacy-users.js";

export type LegacyRole = "admin" | "coordenador" | "orientador" | "avaliador" | "aluno";

const ROLE_MAP: Record<string, LegacyRole> = {
  admin: "admin",
  administrador: "admin",
  institution_admin: "admin",
  coordenador: "coordenador",
  coordinator: "coordenador",
  orientador: "orientador",
  advisor: "orientador",
  avaliador: "avaliador",
  evaluator: "avaliador",
  aluno: "aluno",
  student: "aluno",
};

const ACTIVE_USER_STATUSES = new Set(["ativo", "active", "aprovado", "approved"]);
const ACTIVE_INSTITUTION_STATUSES = new Set(["ativa", "ativo", "active"]);

export function mapLegacyRole(value: unknown): LegacyRole {
  const role = typeof value === "string" ? ROLE_MAP[value.trim().toLowerCase()] : undefined;
  if (!role) throw new HttpError(500, "LEGACY_ROLE_UNMAPPED", "Papel institucional sem mapeamento no adaptador legado");
  return role;
}

export function mapLegacySituation(value: unknown): "aprovado" | "pendente" | "recusado" | "bloqueado" | "revogado" {
  const map: Record<string, "aprovado" | "pendente" | "recusado" | "bloqueado" | "revogado"> = {
    aprovado: "aprovado", approved: "aprovado",
    pendente: "pendente", pending: "pendente",
    recusado: "recusado", rejected: "recusado",
    bloqueado: "bloqueado", blocked: "bloqueado",
    revogado: "revogado", revoked: "revogado",
  };
  const status = typeof value === "string" ? map[value.trim().toLowerCase()] : undefined;
  if (!status) throw new HttpError(500, "LEGACY_STATUS_UNMAPPED", "Situação de vínculo sem mapeamento no adaptador legado");
  return status;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, "INVALID_ID", `${field} deve ser um número inteiro positivo`);
  }
  return parsed;
}

export function requireLegacyInstitution(...allowedRoles: LegacyRole[]): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (!req.auth?.user) throw new HttpError(401, "UNAUTHENTICATED", "Autenticação obrigatória");
      const institutionId = positiveInteger(req.header("x-institution-id"), "x-institution-id");
      const db = getAdminSupabase();

      const profile = assertDatabaseResult(
        await db.from(LEGACY_SCHEMA.users)
          .select("id,nome,email,status,auth_user_id")
          .eq("auth_user_id", req.auth.user.id)
          .maybeSingle(),
      ) as { id: number; nome: string; email: string; status: string; auth_user_id: string } | null;
      if (!profile) throw new HttpError(403, "PROFILE_NOT_LINKED", "Conta Auth sem perfil vinculado em Usuario");
      if (!ACTIVE_USER_STATUSES.has(String(profile.status).toLowerCase())) {
        throw new HttpError(403, "PROFILE_INACTIVE", "Conta inativa");
      }

      const institution = assertDatabaseResult(
        await db.from(LEGACY_SCHEMA.institutions).select("id,status").eq("id", institutionId).maybeSingle(),
      ) as { id: number; status: string } | null;
      if (!institution || !ACTIVE_INSTITUTION_STATUSES.has(String(institution.status).toLowerCase())) {
        throw new HttpError(403, "INSTITUTION_UNAVAILABLE", "Instituição inexistente ou inativa");
      }

      const membership = assertDatabaseResult(
        await db.from(LEGACY_SCHEMA.memberships)
          .select("papel,situacao")
          .eq("usuario_id", profile.id)
          .eq("instituicao_id", institutionId)
          .maybeSingle(),
      ) as { papel: string; situacao: string } | null;
      if (!membership || mapLegacySituation(membership.situacao) !== "aprovado") {
        throw new HttpError(403, "MEMBERSHIP_NOT_APPROVED", "Não há vínculo aprovado nesta instituição");
      }

      const role = mapLegacyRole(membership.papel);
      if (allowedRoles.length && !allowedRoles.includes(role)) {
        throw new HttpError(403, "FORBIDDEN", "Permissão insuficiente para esta operação");
      }

      req.legacyAccount = {
        userId: positiveInteger(profile.id, "Usuario.id"),
        authUserId: req.auth.user.id,
        email: profile.email || req.auth.user.email || "",
        name: profile.nome,
        institutionId,
        role,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export async function getLegacyProfileByAuthId(authUserId: string) {
  const row = assertDatabaseResult(
    await getAdminSupabase().from(LEGACY_SCHEMA.users)
      .select("id,nome,email,status,auth_user_id")
      .eq("auth_user_id", authUserId)
      .maybeSingle(),
  ) as { id: number; nome: string; email: string; status: string; auth_user_id: string } | null;
  if (!row) throw new HttpError(403, "PROFILE_NOT_LINKED", "Conta Auth sem perfil vinculado em Usuario");
  if (!ACTIVE_USER_STATUSES.has(String(row.status).toLowerCase())) {
    throw new HttpError(403, "PROFILE_INACTIVE", "Conta inativa");
  }
  return row;
}

export function parseLegacyId(value: unknown, field = "id"): number {
  return positiveInteger(value, field);
}

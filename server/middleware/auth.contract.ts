import type { RequestHandler } from "express";
import { z } from "zod";
import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase, getPublicSupabase } from "../lib/supabase.js";
import type { InstitutionRole } from "../types/auth.js";

export const authenticate: RequestHandler = async (req, _res, next) => {
  const [scheme, token] = (req.header("authorization") ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) throw new HttpError(401, "UNAUTHENTICATED", "Autenticação obrigatória");
  const { data, error } = await getPublicSupabase().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "UNAUTHENTICATED", "Sessão inválida ou expirada");
  req.auth = { user: data.user, systemRole: data.user.app_metadata?.system_role === "superadmin" ? "superadmin" : undefined };
  next();
};

export function requireSystemRole(role: "superadmin"): RequestHandler {
  return (req, _res, next) => {
    if (req.auth?.systemRole !== role) throw new HttpError(403, "FORBIDDEN", "Permissão insuficiente");
    next();
  };
}

export function requireInstitution(...roles: InstitutionRole[]): RequestHandler {
  return async (req, _res, next) => {
    if (!req.auth) throw new HttpError(401, "UNAUTHENTICATED", "Autenticação obrigatória");
    const parsed = z.string().uuid().safeParse(req.header("x-institution-id"));
    if (!parsed.success) throw new HttpError(400, "INSTITUTION_REQUIRED", "Informe a instituição no cabeçalho x-institution-id");
    const institutionId = parsed.data;

    const db = getAdminSupabase();
    const institution = assertDatabaseResult(await db.from("institutions").select("id,status").eq("id", institutionId).maybeSingle());
    let role: InstitutionRole | undefined;
    let supervising = false;
    if (req.auth.systemRole === "superadmin") {
      if (!institution) throw new HttpError(404, "NOT_FOUND", "Recurso não encontrado");
      role = "institution_admin";
      supervising = true;
    } else {
      const membership = assertDatabaseResult(
        await db.from("institutional_memberships").select("role,status").eq("institution_id", institutionId).eq("user_id", req.auth.user.id).maybeSingle(),
      );
      if (!institution || !membership || membership.status !== "approved") throw new HttpError(403, "FORBIDDEN", "Acesso negado a esta instituição");
      if (institution.status !== "active") throw new HttpError(403, "INSTITUTION_SUSPENDED", "Instituição suspensa");
      role = membership.role as InstitutionRole;
    }
    if (roles.length && !roles.includes(role)) throw new HttpError(403, "FORBIDDEN", "Permissão insuficiente");
    req.auth = { ...req.auth, institutionId, role, supervising };
    next();
  };
}

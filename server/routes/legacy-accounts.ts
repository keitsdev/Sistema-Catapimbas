import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { getLegacyProfileByAuthId, mapLegacyRole, mapLegacySituation, parseLegacyId, requireLegacyInstitution, type LegacyRole } from "../middleware/legacy-institution.js";
import { validate } from "../middleware/validate.js";
import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase, getPublicSupabase } from "../lib/supabase.js";
import { LEGACY_SCHEMA } from "../repositories/legacy-users.js";

export const legacyAccountsRouter = Router();
const signupLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false });
const requestedRoles = ["aluno", "orientador", "avaliador"] as const;
const institutionalRoles = ["admin", "coordenador", "orientador", "avaliador", "aluno"] as const;
const activeInstitutionStatuses = ["ativa", "ativo", "active"];

interface LegacyInstitutionRow {
  id: number;
  nome: string;
  identificador: string;
  status: string;
}
interface LegacyUserRow {
  id: number;
  nome: string;
  email: string;
}
interface LegacyMembershipRow {
  usuario_id: number;
  instituicao_id: number;
  papel: string;
  situacao: string;
  justificativa?: string | null;
}

async function auditAccountAction(input: {
  actorAuthUserId?: string | null;
  actorUserId?: number | null;
  targetUserId?: number | null;
  institutionId?: number | null;
  action: string;
  details?: Record<string, unknown>;
}) {
  const { error } = await getAdminSupabase().from("AuditoriaIntegracaoContas").insert({
    ator_auth_user_id: input.actorAuthUserId ?? null,
    ator_usuario_id: input.actorUserId ?? null,
    usuario_alvo_id: input.targetUserId ?? null,
    instituicao_id: input.institutionId ?? null,
    acao: input.action,
    detalhes: input.details ?? {},
  });
  // Não gravar senha, token ou segredo na trilha de auditoria.
  if (error) console.error("[legacy-account-audit] falha ao gravar evento", error.code, error.message);
}

function roleForSignup(value: string): LegacyRole {
  if (!(institutionalRoles as readonly string[]).includes(value) || value === "admin") {
    throw new HttpError(422, "INVALID_ROLE", "Papel não permitido para solicitação de ingresso");
  }
  return value as LegacyRole;
}

function isActiveInstitution(status: string) {
  return activeInstitutionStatuses.includes(status.trim().toLowerCase());
}

async function getInstitution(id: number) {
  const result = assertDatabaseResult(
    await getAdminSupabase().from(LEGACY_SCHEMA.institutions)
      .select("id,nome,identificador,status")
      .eq("id", id)
      .maybeSingle(),
  ) as LegacyInstitutionRow | null;
  return result;
}

async function listProfiles(userIds: number[]) {
  if (!userIds.length) return new Map<number, LegacyUserRow>();
  const rows = assertDatabaseResult(
    await getAdminSupabase().from(LEGACY_SCHEMA.users)
      .select("id,nome,email")
      .in("id", userIds),
  ) as LegacyUserRow[];
  return new Map(rows.map((row) => [Number(row.id), row]));
}

function mapMembership(row: LegacyMembershipRow, profile?: LegacyUserRow) {
  return {
    usuarioId: Number(row.usuario_id),
    instituicaoId: Number(row.instituicao_id),
    nome: profile?.nome ?? "",
    email: profile?.email ?? "",
    papel: mapLegacyRole(row.papel),
    situacao: mapLegacySituation(row.situacao),
    justificativa: row.justificativa ?? undefined,
  };
}

legacyAccountsRouter.get("/public/institutions", async (_req, res) => {
  const rows = assertDatabaseResult(
    await getAdminSupabase().from(LEGACY_SCHEMA.institutions)
      .select("id,nome,identificador,status")
      .in("status", activeInstitutionStatuses)
      .order("nome"),
  ) as LegacyInstitutionRow[];
  return res.json({ data: rows.map(({ id, nome, identificador }) => ({ id: Number(id), nome, identificador })) });
});

legacyAccountsRouter.post(
  "/public/signup-request",
  signupLimiter,
  validate({
    body: z.object({
      name: z.string().trim().min(3).max(120),
      email: z.string().trim().toLowerCase().email().max(254),
      password: z.string().min(8).max(72),
      institutionId: z.coerce.number().int().positive(),
      role: z.enum(requestedRoles),
    }),
  }),
  async (req, res) => {
    const name = String(req.body.name).trim();
    const email = String(req.body.email).trim().toLowerCase();
    const role = roleForSignup(String(req.body.role));
    const institutionId = parseLegacyId(req.body.institutionId, "institutionId");
    const db = getAdminSupabase();
    const institution = await getInstitution(institutionId);
    if (!institution || !isActiveInstitution(institution.status)) {
      throw new HttpError(422, "INSTITUTION_UNAVAILABLE", "Instituição indisponível");
    }

    const existingProfile = assertDatabaseResult(
      await db.from(LEGACY_SCHEMA.users).select("id,auth_user_id").ilike("email", email).maybeSingle(),
    ) as { id: number; auth_user_id: string | null } | null;
    if (existingProfile) {
      throw new HttpError(409, "EMAIL_PROFILE_EXISTS", "Já existe um perfil com este e-mail. Entre na conta ou solicite o vínculo pelo perfil.");
    }

    const signup = await getPublicSupabase().auth.signUp({
      email,
      password: String(req.body.password),
      options: { data: { name } },
    });
    if (signup.error || !signup.data.user || (signup.data.user.identities?.length ?? 0) === 0) {
      throw new HttpError(409, "SIGNUP_FAILED", "Não foi possível criar a conta. Confira o e-mail ou entre na conta existente.");
    }

    const authUserId = signup.data.user.id;
    try {
      const profile = assertDatabaseResult(
        await db.from(LEGACY_SCHEMA.users)
          .insert({ nome: name, email, status: "ativo", auth_user_id: authUserId })
          .select("id")
          .single(),
      ) as { id: number };
      assertDatabaseResult(
        await db.from(LEGACY_SCHEMA.memberships).insert({
          usuario_id: profile.id,
          instituicao_id: institutionId,
          papel: role,
          situacao: "pendente",
          justificativa: null,
        }),
      );
      await auditAccountAction({
        actorAuthUserId: authUserId,
        targetUserId: Number(profile.id),
        institutionId,
        action: "conta.solicitacao_criada",
        details: { papel: role },
      });
    } catch (error) {
      // Supabase Auth e PostgREST não compartilham uma transação. Fazemos compensação
      // para não deixar uma identidade sem perfil/vínculo quando alguma escrita falhar.
      const cleanupProfile = await db.from(LEGACY_SCHEMA.users).delete().eq("auth_user_id", authUserId);
      if (cleanupProfile.error) console.error("[legacy-signup] falha ao remover perfil incompleto", cleanupProfile.error.message);
      const cleanupAuth = await db.auth.admin.deleteUser(authUserId);
      if (cleanupAuth.error) console.error("[legacy-signup] falha ao remover usuário Auth incompleto", cleanupAuth.error.message);
      throw error;
    }

    return res.status(201).json({ data: { status: "pendente", emailConfirmationRequired: !signup.data.session } });
  },
);

legacyAccountsRouter.post(
  "/join-requests",
  authenticate,
  validate({ body: z.object({ institutionId: z.coerce.number().int().positive(), role: z.enum(requestedRoles) }) }),
  async (req, res) => {
    const institutionId = parseLegacyId(req.body.institutionId, "institutionId");
    const institution = await getInstitution(institutionId);
    if (!institution || !isActiveInstitution(institution.status)) {
      throw new HttpError(422, "INSTITUTION_UNAVAILABLE", "Instituição indisponível");
    }
    const profile = await getLegacyProfileByAuthId(req.auth!.user.id);
    const db = getAdminSupabase();
    const existing = assertDatabaseResult(
      await db.from(LEGACY_SCHEMA.memberships)
        .select("usuario_id,papel,situacao")
        .eq("usuario_id", profile.id)
        .eq("instituicao_id", institutionId)
        .maybeSingle(),
    ) as { usuario_id: number; papel: string; situacao: string } | null;

    if (existing && mapLegacySituation(existing.situacao) !== "recusado") {
      throw new HttpError(409, "MEMBERSHIP_EXISTS", `Você já possui vínculo nesta instituição (${mapLegacySituation(existing.situacao)}).`);
    }
    const values = { papel: roleForSignup(String(req.body.role)), situacao: "pendente", justificativa: null };
    if (existing) {
      assertDatabaseResult(await db.from(LEGACY_SCHEMA.memberships).update(values)
        .eq("usuario_id", profile.id).eq("instituicao_id", institutionId));
    } else {
      assertDatabaseResult(await db.from(LEGACY_SCHEMA.memberships).insert({
        usuario_id: profile.id,
        instituicao_id: institutionId,
        ...values,
      }));
    }
    await auditAccountAction({
      actorAuthUserId: req.auth!.user.id,
      actorUserId: Number(profile.id),
      targetUserId: Number(profile.id),
      institutionId,
      action: "vinculo.solicitado",
      details: { papel: values.papel },
    });
    return res.status(201).json({ data: { status: "pendente" } });
  },
);

legacyAccountsRouter.get(
  "/join-requests",
  authenticate,
  requireLegacyInstitution("admin"),
  async (req, res) => {
    const rows = assertDatabaseResult(
      await getAdminSupabase().from(LEGACY_SCHEMA.memberships)
        .select("usuario_id,instituicao_id,papel,situacao,justificativa")
        .eq("instituicao_id", req.legacyAccount!.institutionId)
        .eq("situacao", "pendente"),
    ) as LegacyMembershipRow[];
    const profiles = await listProfiles(rows.map((row) => Number(row.usuario_id)));
    return res.json({ data: rows.map((row) => ({
      id: Number(row.usuario_id),
      ...mapMembership(row, profiles.get(Number(row.usuario_id))),
    })) });
  },
);

legacyAccountsRouter.patch(
  "/join-requests/:userId",
  authenticate,
  requireLegacyInstitution("admin"),
  validate({
    params: z.object({ userId: z.coerce.number().int().positive() }),
    body: z.discriminatedUnion("status", [
      z.object({ status: z.literal("aprovado"), role: z.enum(institutionalRoles).optional() }),
      z.object({ status: z.literal("recusado"), reason: z.string().trim().min(5).max(500) }),
    ]),
  }),
  async (req, res) => {
    const userId = parseLegacyId(req.params.userId, "userId");
    const institutionId = req.legacyAccount!.institutionId;
    const db = getAdminSupabase();
    const current = assertDatabaseResult(
      await db.from(LEGACY_SCHEMA.memberships)
        .select("usuario_id,instituicao_id,papel,situacao,justificativa")
        .eq("usuario_id", userId)
        .eq("instituicao_id", institutionId)
        .eq("situacao", "pendente")
        .maybeSingle(),
    ) as LegacyMembershipRow | null;
    if (!current) throw new HttpError(404, "REQUEST_NOT_FOUND", "Solicitação pendente não encontrada");

    const update = req.body.status === "aprovado"
      ? { situacao: "aprovado", papel: req.body.role ?? mapLegacyRole(current.papel), justificativa: null }
      : { situacao: "recusado", justificativa: req.body.reason.trim() };
    const updated = assertDatabaseResult(
      await db.from(LEGACY_SCHEMA.memberships).update(update)
        .eq("usuario_id", userId)
        .eq("instituicao_id", institutionId)
        .eq("situacao", "pendente")
        .select("usuario_id,instituicao_id,papel,situacao,justificativa")
        .maybeSingle(),
    ) as LegacyMembershipRow | null;
    if (!updated) throw new HttpError(409, "REQUEST_ALREADY_DECIDED", "A solicitação já foi tratada");
    await auditAccountAction({
      actorAuthUserId: req.auth!.user.id,
      actorUserId: req.legacyAccount!.userId,
      targetUserId: userId,
      institutionId,
      action: `vinculo.${updated.situacao}`,
      details: { papel: updated.papel, justificativa: updated.justificativa ?? null },
    });
    const profiles = await listProfiles([userId]);
    return res.json({ data: mapMembership(updated, profiles.get(userId)) });
  },
);

legacyAccountsRouter.get(
  "/members",
  authenticate,
  requireLegacyInstitution("admin", "coordenador"),
  async (req, res) => {
    const rows = assertDatabaseResult(
      await getAdminSupabase().from(LEGACY_SCHEMA.memberships)
        .select("usuario_id,instituicao_id,papel,situacao,justificativa")
        .eq("instituicao_id", req.legacyAccount!.institutionId)
        .neq("situacao", "pendente"),
    ) as LegacyMembershipRow[];
    const profiles = await listProfiles(rows.map((row) => Number(row.usuario_id)));
    const data = rows
      .map((row) => mapMembership(row, profiles.get(Number(row.usuario_id))))
      .filter((row) => row.nome)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return res.json({ data });
  },
);

legacyAccountsRouter.patch(
  "/members/:userId",
  authenticate,
  requireLegacyInstitution("admin"),
  validate({
    params: z.object({ userId: z.coerce.number().int().positive() }),
    body: z.object({
      role: z.enum(institutionalRoles).optional(),
      status: z.enum(["aprovado", "bloqueado", "revogado"]).optional(),
      reason: z.string().trim().min(5).max(500).optional(),
    }).refine((body) => body.role || body.status, { message: "Informe papel ou situação" })
      .refine((body) => !body.status || body.status === "aprovado" || Boolean(body.reason), {
        message: "Informe uma justificativa de pelo menos 5 caracteres",
        path: ["reason"],
      }),
  }),
  async (req, res) => {
    const userId = parseLegacyId(req.params.userId, "userId");
    const { institutionId, userId: actorId } = req.legacyAccount!;
    if (userId === actorId) throw new HttpError(409, "SELF_ACCESS_CHANGE", "Você não pode alterar o próprio acesso");
    const db = getAdminSupabase();
    const current = assertDatabaseResult(
      await db.from(LEGACY_SCHEMA.memberships)
        .select("usuario_id,instituicao_id,papel,situacao,justificativa")
        .eq("usuario_id", userId).eq("instituicao_id", institutionId).maybeSingle(),
    ) as LegacyMembershipRow | null;
    if (!current) throw new HttpError(404, "MEMBERSHIP_NOT_FOUND", "Vínculo não encontrado");
    const currentRole = mapLegacyRole(current.papel);
    const currentStatus = mapLegacySituation(current.situacao);
    if (currentStatus === "pendente" || currentStatus === "recusado") {
      throw new HttpError(409, "REQUEST_NOT_APPROVED", "Solicitações pendentes ou recusadas são tratadas em Aprovações");
    }
    const nextRole = req.body.role as LegacyRole | undefined;
    const nextStatus = req.body.status as "aprovado" | "bloqueado" | "revogado" | undefined;

    if (currentRole === "admin" && ((nextRole && nextRole !== "admin") || (nextStatus && nextStatus !== "aprovado"))) {
      const admins = assertDatabaseResult(
        await db.from(LEGACY_SCHEMA.memberships)
          .select("usuario_id,papel,situacao")
          .eq("instituicao_id", institutionId)
          .eq("situacao", "aprovado")
          .in("papel", ["admin", "administrador", "institution_admin"]),
      ) as Array<{ usuario_id: number }>;
      if (admins.length <= 1) throw new HttpError(409, "LAST_ADMIN", "A instituição precisa manter ao menos um administrador aprovado");
    }

    const update: Record<string, unknown> = {};
    if (nextRole) update.papel = nextRole;
    if (nextStatus) update.situacao = nextStatus;
    if (req.body.reason) update.justificativa = req.body.reason.trim();
    else if (nextStatus === "aprovado") update.justificativa = null;

    const updated = assertDatabaseResult(
      await db.from(LEGACY_SCHEMA.memberships).update(update)
        .eq("usuario_id", userId).eq("instituicao_id", institutionId)
        .select("usuario_id,instituicao_id,papel,situacao,justificativa").maybeSingle(),
    ) as LegacyMembershipRow | null;
    if (!updated) throw new HttpError(404, "MEMBERSHIP_NOT_FOUND", "Vínculo não encontrado");
    await auditAccountAction({
      actorAuthUserId: req.auth!.user.id,
      actorUserId: actorId,
      targetUserId: userId,
      institutionId,
      action: "vinculo.atualizado",
      details: { papel: updated.papel, situacao: updated.situacao, justificativa: updated.justificativa ?? null },
    });
    const profiles = await listProfiles([userId]);
    return res.json({ data: mapMembership(updated, profiles.get(userId)) });
  },
);

legacyAccountsRouter.get(
  "/me/export",
  authenticate,
  async (req, res) => {
    const profile = await getLegacyProfileByAuthId(req.auth!.user.id);
    const memberships = assertDatabaseResult(
      await getAdminSupabase().from(LEGACY_SCHEMA.memberships)
        .select("instituicao_id,papel,situacao,justificativa")
        .eq("usuario_id", profile.id),
    ) as LegacyMembershipRow[];
    const institutions = memberships.length
      ? assertDatabaseResult(await getAdminSupabase().from(LEGACY_SCHEMA.institutions)
          .select("id,nome").in("id", memberships.map((row) => row.instituicao_id))) as Array<{ id: number; nome: string }>
      : [];
    const names = new Map(institutions.map((row) => [Number(row.id), row.nome]));
    return res.json({ data: {
      geradoEm: new Date().toISOString(), nome: profile.nome, email: profile.email,
      vinculos: memberships.map((row) => ({
        instituicao: names.get(Number(row.instituicao_id)) ?? "Instituição",
        papel: mapLegacyRole(row.papel),
        situacao: mapLegacySituation(row.situacao),
        justificativa: row.justificativa ?? undefined,
      })),
    } });
  },
);

const passwordLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false });
legacyAccountsRouter.post(
  "/me/password",
  authenticate,
  passwordLimiter,
  validate({ body: z.object({ currentPassword: z.string().min(1).max(72), newPassword: z.string().min(8).max(72) }) }),
  async (req, res) => {
    const profile = await getLegacyProfileByAuthId(req.auth!.user.id);
    const verified = await getPublicSupabase().auth.signInWithPassword({
      email: profile.email || req.auth!.user.email || "",
      password: String(req.body.currentPassword),
    });
    if (verified.error || verified.data.user?.id !== req.auth!.user.id) {
      throw new HttpError(401, "INVALID_CURRENT_PASSWORD", "A senha atual está incorreta");
    }
    const changed = await getAdminSupabase().auth.admin.updateUserById(req.auth!.user.id, {
      password: String(req.body.newPassword),
    });
    if (changed.error) throw new HttpError(400, "PASSWORD_CHANGE_FAILED", "Não foi possível alterar a senha");
    await auditAccountAction({
      actorAuthUserId: req.auth!.user.id,
      actorUserId: Number(profile.id),
      targetUserId: Number(profile.id),
      action: "conta.senha_alterada",
    });
    return res.json({ data: { changed: true } });
  },
);

legacyAccountsRouter.post(
  "/me/deletion-request",
  authenticate,
  validate({ body: z.object({ reason: z.string().trim().min(5).max(1000) }) }),
  async (req, res) => {
    const profile = await getLegacyProfileByAuthId(req.auth!.user.id);
    const result = assertDatabaseResult(
      await getAdminSupabase().from("SolicitacaoExclusaoConta").insert({
        auth_user_id: req.auth!.user.id,
        usuario_id: profile.id,
        email: profile.email || req.auth!.user.email || "",
        motivo: String(req.body.reason).trim(),
        situacao: "pendente",
      }).select("id,situacao,criado_em").single(),
    ) as { id: number; situacao: string; criado_em: string };
    await auditAccountAction({
      actorAuthUserId: req.auth!.user.id,
      actorUserId: Number(profile.id),
      targetUserId: Number(profile.id),
      action: "conta.exclusao_solicitada",
      details: { solicitacaoId: result.id },
    });
    return res.status(201).json({ data: { id: result.id, status: result.situacao, createdAt: result.criado_em } });
  },
);

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase, getPublicSupabase } from "../lib/supabase.js";
import { audit } from "../services/audit.js";
import { INVITATION_INVALID_MESSAGE, TOKEN_PATTERN, generateTemporaryPassword, hashToken } from "../services/invitations.js";
import { findUsableInvitation } from "../services/invitations-db.js";

export const publicRouter = Router();
const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });

publicRouter.get("/institutions", async (_req, res) => {
  const data = assertDatabaseResult(await getAdminSupabase().from("institutions").select("id,name,slug").eq("status", "active").order("name"));
  return res.json({ data });
});

publicRouter.post(
  "/signup-request",
  limiter,
  validate({
    body: z.object({
      name: z.string().trim().min(3).max(120),
      email: z.string().trim().toLowerCase().email().max(254),
      password: z.string().min(8).max(72),
      institutionId: z.string().uuid(),
      role: z.enum(["advisor", "evaluator", "student"]),
    }),
  }),
  async (req, res) => {
    const db = getAdminSupabase();
    const institution = assertDatabaseResult(await db.from("institutions").select("id,status").eq("id", req.body.institutionId).maybeSingle());
    if (!institution || institution.status !== "active") throw new HttpError(422, "INSTITUTION_UNAVAILABLE", "Instituição indisponível");
    const { data, error } = await getPublicSupabase().auth.signUp({ email: req.body.email, password: req.body.password, options: { data: { name: req.body.name } } });
    if (error) throw new HttpError(400, "SIGNUP_FAILED", "Não foi possível concluir o cadastro");
    if (!data.user || (data.user.identities?.length ?? 0) === 0) throw new HttpError(409, "EMAIL_IN_USE", "Não foi possível concluir o cadastro. Se você já tem conta, entre e solicite ingresso pelo seu perfil.");
    assertDatabaseResult(await db.from("institutional_memberships").insert({ institution_id: institution.id, user_id: data.user.id, role: req.body.role, status: "pending" }));
    await audit(req, "membership.request", "institutional_membership", data.user.id, { role: req.body.role }, institution.id);
    return res.status(201).json({ data: { status: "pending" } });
  },
);

const inviteLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });
const tokenParam = z.object({ token: z.string().regex(TOKEN_PATTERN) });

publicRouter.get("/invitations/:token", inviteLimiter, validate({ params: tokenParam }), async (req, res) => {
  const invitation = await findUsableInvitation(String(req.params.token));
  return res.json({ data: { project: invitation.projectName, board: invitation.boardName, institution: invitation.institutionName, expiresAt: invitation.expiresAt } });
});

publicRouter.post(
  "/invitations/:token/accept",
  inviteLimiter,
  validate({
    params: tokenParam,
    body: z.object({
      name: z.string().trim().min(3).max(120),
      email: z.string().trim().toLowerCase().email().max(254),
      organization: z.string().trim().max(160).optional(),
    }),
  }),
  async (req, res) => {
    const token = String(req.params.token);
    const { name, email, organization } = req.body as { name: string; email: string; organization?: string };
    const db = getAdminSupabase();
    const invitation = await findUsableInvitation(token);

    const claim = await db.rpc("claim_board_invitation", { p_token_hash: hashToken(token) });
    if (claim.error) throw new HttpError(410, "INVITATION_INVALID", INVITATION_INVALID_MESSAGE);
    const release = async () => { await db.rpc("release_board_invitation", { p_id: invitation.id }); };

    const password = generateTemporaryPassword();
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, organization: organization ?? null } });
    if (created.error || !created.data.user) {
      await release();
      const taken = created.error?.code === "email_exists" || /already|registered/i.test(created.error?.message ?? "");
      if (taken) throw new HttpError(409, "EMAIL_IN_USE", "Já existe uma conta com este e-mail. Entre com a sua senha ou use outro e-mail.");
      throw new HttpError(400, "SIGNUP_FAILED", "Não foi possível concluir o cadastro");
    }
    const userId = created.data.user.id;
    try {
      assertDatabaseResult(
        await db.from("institutional_memberships").insert({
          institution_id: invitation.institutionId, user_id: userId, role: "evaluator", status: "approved", approved_at: new Date().toISOString(),
          scope_board_id: invitation.boardId, scope_project_id: invitation.projectId, invitation_id: invitation.id, organization: organization || null,
        }),
      );
      assertDatabaseResult(await db.from("board_evaluators").insert({ board_id: invitation.boardId, evaluator_id: userId }));
    } catch (error) {
      await db.auth.admin.deleteUser(userId);
      await release();
      throw error;
    }
    await audit(req, "invitation.accept", "board_invitation", invitation.id, { userId, email, projectId: invitation.projectId }, invitation.institutionId);
    return res.status(201).json({ data: { email, temporaryPassword: password } });
  },
);

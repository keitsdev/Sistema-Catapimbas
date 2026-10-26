import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase, getPublicSupabase } from "../lib/supabase.js";
import { audit } from "../services/audit.js";

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

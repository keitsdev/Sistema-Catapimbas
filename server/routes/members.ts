import { Router } from "express";
import { z } from "zod";
import { authenticate, requireInstitution } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";
import { audit } from "../services/audit.js";

export const membersRouter = Router();
membersRouter.use(authenticate, requireInstitution("institution_admin"));

membersRouter.get("/", async (req, res) => {
  const data = assertDatabaseResult(
    await getAdminSupabase()
      .from("institutional_memberships")
      .select("id,user_id,role,status,rejection_reason,created_at,approved_at")
      .eq("institution_id", req.auth!.institutionId)
      .order("created_at", { ascending: false }),
  );
  return res.json({ data });
});

membersRouter.patch(
  "/:id",
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z
      .object({
        role: z
          .enum(["institution_admin", "coordinator", "advisor", "evaluator", "student"])
          .optional(),
        status: z.enum(["approved", "blocked", "revoked"]).optional(),
        reason: z.string().trim().min(5).max(500).optional(),
      })
      .refine((value) => value.role || value.status, {
        message: "Informe um papel ou uma situação",
      })
      .refine((value) => !value.status || value.status === "approved" || Boolean(value.reason), {
        message: "Informe a justificativa do bloqueio ou da revogação",
        path: ["reason"],
      }),
  }),
  async (req, res) => {
    const update = {
      ...(req.body.role ? { role: req.body.role } : {}),
      ...(req.body.status ? { status: req.body.status } : {}),
      ...(req.body.reason ? { status_reason: req.body.reason } : {}),
      updated_by: req.auth!.user.id,
      updated_at: new Date().toISOString(),
    };
    const membership = assertDatabaseResult(
      await getAdminSupabase()
        .from("institutional_memberships")
        .update(update)
        .eq("id", req.params.id)
        .eq("institution_id", req.auth!.institutionId)
        .select()
        .maybeSingle(),
    );
    if (!membership) throw new HttpError(404, "MEMBERSHIP_NOT_FOUND", "Vínculo não encontrado");
    await audit(req, "membership.update", "institutional_membership", membership.id, update);
    return res.json({ data: membership });
  },
);

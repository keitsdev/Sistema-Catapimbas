import { Router } from "express";
import { z } from "zod";
import { authenticate, requireInstitution, requireSystemRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";
import { audit } from "../services/audit.js";

export const institutionsRouter = Router();

const institutionSchema = z.object({
  name: z.string().trim().min(3).max(160),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(80),
  status: z.enum(["active", "suspended"]).default("active"),
  visual_config: z.record(z.string(), z.unknown()).default({}),
});

institutionsRouter.use(authenticate);

institutionsRouter.get("/", async (req, res) => {
  if (req.auth!.systemRole === "superadmin") {
    const data = assertDatabaseResult(
      await getAdminSupabase().from("institutions").select("*").order("name"),
    );
    return res.json({ data });
  }
  const data = assertDatabaseResult(
    await getAdminSupabase()
      .from("institutional_memberships")
      .select("role,status,institutions(*)")
      .eq("user_id", req.auth!.user.id),
  );
  return res.json({ data });
});

institutionsRouter.post(
  "/",
  requireSystemRole("superadmin"),
  validate({ body: institutionSchema }),
  async (req, res) => {
    const institution = assertDatabaseResult(
      await getAdminSupabase().from("institutions").insert(req.body).select().single(),
    );
    await audit(req, "create", "institution", institution.id, req.body);
    return res.status(201).json({ data: institution });
  },
);

institutionsRouter.patch(
  "/:id",
  requireSystemRole("superadmin"),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: institutionSchema.partial().refine((value) => Object.keys(value).length > 0),
  }),
  async (req, res) => {
    const institution = assertDatabaseResult(
      await getAdminSupabase()
        .from("institutions")
        .update(req.body)
        .eq("id", req.params.id)
        .select()
        .maybeSingle(),
    );
    if (!institution)
      throw new HttpError(404, "INSTITUTION_NOT_FOUND", "Instituição não encontrada");
    await audit(req, "update", "institution", institution.id, req.body);
    return res.json({ data: institution });
  },
);

institutionsRouter.post(
  "/:id/join-requests",
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      requestedRole: z.enum(["advisor", "evaluator", "student"]),
    }),
  }),
  async (req, res) => {
    const membership = assertDatabaseResult(
      await getAdminSupabase()
        .from("institutional_memberships")
        .insert({
          institution_id: req.params.id,
          user_id: req.auth!.user.id,
          role: req.body.requestedRole,
          status: "pending",
        })
        .select()
        .single(),
    );
    return res.status(201).json({ data: membership });
  },
);

institutionsRouter.get(
  "/:id/join-requests",
  requireInstitution("institution_admin"),
  async (req, res) => {
    if (req.params.id !== req.auth!.institutionId) {
      throw new HttpError(403, "INSTITUTION_MISMATCH", "Instituição divergente do contexto");
    }
    const data = assertDatabaseResult(
      await getAdminSupabase()
        .from("institutional_memberships")
        .select("id,user_id,role,status,rejection_reason,created_at")
        .eq("institution_id", req.auth!.institutionId)
        .eq("status", "pending")
        .order("created_at"),
    );
    return res.json({ data });
  },
);

institutionsRouter.patch(
  "/:id/join-requests/:membershipId",
  requireInstitution("institution_admin"),
  validate({
    params: z.object({
      id: z.string().uuid(),
      membershipId: z.string().uuid(),
    }),
    body: z.discriminatedUnion("status", [
      z.object({
        status: z.literal("approved"),
        role: z.enum(["institution_admin", "coordinator", "advisor", "evaluator", "student"]),
      }),
      z.object({
        status: z.literal("rejected"),
        rejectionReason: z.string().trim().min(5).max(500),
      }),
    ]),
  }),
  async (req, res) => {
    if (req.params.id !== req.auth!.institutionId) {
      throw new HttpError(403, "INSTITUTION_MISMATCH", "Instituição divergente do contexto");
    }
    const update =
      req.body.status === "approved"
        ? {
            status: "approved",
            role: req.body.role,
            approved_by: req.auth!.user.id,
            approved_at: new Date().toISOString(),
            rejection_reason: null,
          }
        : {
            status: "rejected",
            rejection_reason: req.body.rejectionReason,
            approved_by: req.auth!.user.id,
            approved_at: new Date().toISOString(),
          };
    const membership = assertDatabaseResult(
      await getAdminSupabase()
        .from("institutional_memberships")
        .update(update)
        .eq("id", req.params.membershipId)
        .eq("institution_id", req.auth!.institutionId)
        .eq("status", "pending")
        .select()
        .maybeSingle(),
    );
    if (!membership)
      throw new HttpError(404, "REQUEST_NOT_FOUND", "Solicitação pendente não encontrada");
    await audit(
      req,
      `membership.${req.body.status}`,
      "institutional_membership",
      membership.id,
      update,
    );
    return res.json({ data: membership });
  },
);

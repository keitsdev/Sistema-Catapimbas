import { Router } from "express";
import { z } from "zod";
import { authenticate, requireInstitution } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";
import { audit } from "../services/audit.js";

export const projectsExtraRouter = Router();

projectsExtraRouter.patch(
  "/:id/profile",
  authenticate,
  requireInstitution("student"),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ description: z.string().trim().min(10).max(5000) }).strict(),
  }),
  async (req, res) => {
    const id = req.params.id as string;
    const db = getAdminSupabase();
    const inst = req.auth!.institutionId;

    const member = assertDatabaseResult(
      await db
        .from("team_members")
        .select("project_id,projects!inner(institution_id,archived_at)")
        .eq("project_id", id)
        .eq("user_id", req.auth!.user.id)
        .eq("projects.institution_id", inst)
        .is("projects.archived_at", null)
        .maybeSingle()
    );

    if (!member) throw new HttpError(404, "PROJECT_NOT_FOUND", "Projeto não encontrado");

    const project = assertDatabaseResult(
      await db
        .from("projects")
        .update({ description: req.body.description })
        .eq("id", id)
        .eq("institution_id", inst)
        .select("id,description")
        .single()
    ) as { id: string; description: string };

    await audit(req, "update_description", "project", project.id);
    return res.json({ data: project });
  },
);
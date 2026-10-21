import { Router } from "express";
import { z } from "zod";
import { authenticate, requireInstitution } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";
import { audit } from "../services/audit.js";

export const projectsRouter = Router();

const projectSchema = z.object({
  name: z.string().trim().min(2).max(180),
  description: z.string().trim().min(10).max(5000),
  year: z.number().int().min(2000).max(2100),
  semester: z.number().int().min(1).max(2),
  status: z.enum(["draft", "active", "completed", "cancelled"]).default("draft"),
});

projectsRouter.use(authenticate, requireInstitution());

projectsRouter.get(
  "/",
  validate({
    query: z.object({
      search: z.string().trim().max(100).optional(),
      year: z.coerce.number().int().optional(),
      semester: z.coerce.number().int().min(1).max(2).optional(),
      status: z.string().optional(),
      studentId: z.string().uuid().optional(),
      advisorId: z.string().uuid().optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }),
  }),
  async (req, res) => {
    const queryValues = req.query as Record<string, string>;
    const page = Number(queryValues.page);
    const pageSize = Number(queryValues.pageSize);
    let query = getAdminSupabase()
      .from("projects")
      .select("*,team_members(user_id,role),project_advisors(user_id)", {
        count: "exact",
      })
      .eq("institution_id", req.auth!.institutionId)
      .is("archived_at", null);

    if (queryValues.search) query = query.ilike("name", `%${queryValues.search}%`);
    if (queryValues.year) query = query.eq("year", Number(queryValues.year));
    if (queryValues.semester) query = query.eq("semester", Number(queryValues.semester));
    if (queryValues.status) query = query.eq("status", queryValues.status);
    if (queryValues.studentId) query = query.eq("team_members.user_id", queryValues.studentId);
    if (queryValues.advisorId) query = query.eq("project_advisors.user_id", queryValues.advisorId);

    const result = await query.order("name").range((page - 1) * pageSize, page * pageSize - 1);
    if (result.error) throw new HttpError(500, "DATABASE_ERROR", "Falha ao listar projetos");
    return res.json({
      data: result.data,
      pagination: { page, pageSize, total: result.count ?? 0 },
    });
  },
);

projectsRouter.post(
  "/",
  requireInstitution("institution_admin", "coordinator"),
  validate({ body: projectSchema }),
  async (req, res) => {
    const project = assertDatabaseResult(
      await getAdminSupabase()
        .from("projects")
        .insert({ ...req.body, institution_id: req.auth!.institutionId })
        .select()
        .single(),
    );
    await audit(req, "create", "project", project.id, req.body);
    return res.status(201).json({ data: project });
  },
);

projectsRouter.get(
  "/:id",
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const project = assertDatabaseResult(
      await getAdminSupabase()
        .from("projects")
        .select("*,team_members(*),project_advisors(*)")
        .eq("id", req.params.id)
        .eq("institution_id", req.auth!.institutionId)
        .is("archived_at", null)
        .maybeSingle(),
    );
    if (!project) throw new HttpError(404, "PROJECT_NOT_FOUND", "Projeto não encontrado");
    return res.json({ data: project });
  },
);

projectsRouter.patch(
  "/:id",
  requireInstitution("institution_admin", "coordinator"),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: projectSchema.partial().refine((value) => Object.keys(value).length > 0),
  }),
  async (req, res) => {
    const project = assertDatabaseResult(
      await getAdminSupabase()
        .from("projects")
        .update(req.body)
        .eq("id", req.params.id)
        .eq("institution_id", req.auth!.institutionId)
        .is("archived_at", null)
        .select()
        .maybeSingle(),
    );
    if (!project) throw new HttpError(404, "PROJECT_NOT_FOUND", "Projeto não encontrado");
    await audit(req, "update", "project", project.id, req.body);
    return res.json({ data: project });
  },
);

projectsRouter.delete(
  "/:id",
  requireInstitution("institution_admin"),
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const project = assertDatabaseResult(
      await getAdminSupabase()
        .from("projects")
        .update({
          archived_at: new Date().toISOString(),
          archived_by: req.auth!.user.id,
        })
        .eq("id", req.params.id)
        .eq("institution_id", req.auth!.institutionId)
        .is("archived_at", null)
        .select("id")
        .maybeSingle(),
    );
    if (!project) throw new HttpError(404, "PROJECT_NOT_FOUND", "Projeto não encontrado");
    await audit(req, "archive", "project", project.id);
    return res.status(204).send();
  },
);

projectsRouter.put(
  "/:id/team",
  requireInstitution("institution_admin", "coordinator"),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      members: z
        .array(
          z.object({
            userId: z.string().uuid(),
            role: z.string().trim().min(2).max(80),
          }),
        )
        .max(50),
      advisorIds: z.array(z.string().uuid()).max(10),
    }),
  }),
  async (req, res) => {
    const result = assertDatabaseResult(
      await getAdminSupabase().rpc("replace_project_team", {
        p_institution_id: req.auth!.institutionId,
        p_project_id: req.params.id,
        p_members: req.body.members,
        p_advisor_ids: req.body.advisorIds,
        p_actor_id: req.auth!.user.id,
      }),
      "Não foi possível atualizar a equipe",
    );
    await audit(req, "team.replace", "project", String(req.params.id), req.body);
    return res.json({ data: result });
  },
);

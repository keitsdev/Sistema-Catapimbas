import { Router } from "express";
import { z } from "zod";
import { authenticate, requireInstitution } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";
import { audit } from "../services/audit.js";

export const evaluationsRouter = Router();
evaluationsRouter.use(authenticate, requireInstitution());

const scoresSchema = z.array(
  z.object({
    criterionId: z.string().uuid(),
    score: z.number().int(),
    comment: z.string().trim().max(2000).optional(),
  })
).min(1).max(50);

function rpcError(error: { code?: string; message: string }): never {
  if (error.code === "42501") throw new HttpError(403, "FORBIDDEN", "Permissão insuficiente");
  if (error.code === "23505") throw new HttpError(409, "DUPLICATE_EVALUATION", "Já existe avaliação ativa deste avaliador para o projeto nesta banca (RN03)");
  if (error.code === "P0001") throw new HttpError(422, "BUSINESS_RULE", error.message);
  console.error("[rpc]", error.code, error.message);
  throw new HttpError(500, "DATABASE_ERROR", "Falha ao acessar o banco de dados");
}

evaluationsRouter.get(
  "/",
  requireInstitution("evaluator", "institution_admin", "coordinator"),
  validate({ query: z.object({ boardId: z.string().uuid().optional() }) }),
  async (req, res) => {
    const boardId = (req.query as { boardId?: string }).boardId;
    let q = getAdminSupabase()
      .from("evaluations")
      .select("id,board_id,project_id,evaluator_id,status,notes,version,submitted_at,evaluation_scores(criterion_id,score,comment)")
      .eq("institution_id", req.auth!.institutionId);

    if (boardId) q = q.eq("board_id", boardId);
    if (req.auth!.role === "evaluator") q = q.eq("evaluator_id", req.auth!.user.id);

    const data = assertDatabaseResult(await q.order("submitted_at", { ascending: false }));
    return res.json({ data });
  },
);

evaluationsRouter.post(
  "/",
  requireInstitution("evaluator"),
  validate({
    body: z.object({
      boardId: z.string().uuid(),
      projectId: z.string().uuid(),
      scores: scoresSchema,
      notes: z.string().trim().max(5000).optional(),
    }),
  }),
  async (req, res) => {
    const { data, error } = await getAdminSupabase().rpc("submit_evaluation" as never, {
      p_institution_id: req.auth!.institutionId,
      p_board_id: req.body.boardId,
      p_project_id: req.body.projectId,
      p_evaluator_id: req.auth!.user.id,
      p_scores: req.body.scores as unknown,
      p_notes: req.body.notes ?? null,
    } as never);

    if (error) rpcError(error);
    await audit(req, "evaluation.submit", "evaluation", String(data), { boardId: req.body.boardId, projectId: req.body.projectId });
    return res.status(201).json({ data: { id: data, receipt: `AV-${String(data).slice(0, 8).toUpperCase()}` } });
  },
);

evaluationsRouter.put(
  "/:id",
  requireInstitution("evaluator"),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ scores: scoresSchema, notes: z.string().trim().max(5000).optional() }),
  }),
  async (req, res) => {
    const evaluationId = req.params.id as string;

    const before = assertDatabaseResult(
      await getAdminSupabase()
        .from("evaluations")
        .select("version,evaluation_scores(criterion_id,score)")
        .eq("id", evaluationId)
        .eq("institution_id", req.auth!.institutionId)
        .eq("evaluator_id", req.auth!.user.id)
        .maybeSingle()
    ) as { version: number; evaluation_scores: unknown } | null;

    if (!before) throw new HttpError(404, "NOT_FOUND", "Recurso não encontrado");

    const { data, error } = await getAdminSupabase().rpc("revise_evaluation" as never, {
      p_institution_id: req.auth!.institutionId,
      p_evaluation_id: evaluationId,
      p_evaluator_id: req.auth!.user.id,
      p_scores: req.body.scores as unknown,
      p_notes: req.body.notes ?? null,
    } as never);

    if (error) rpcError(error);

    await audit(req, "evaluation.revise", "evaluation", evaluationId, {
      previous: before.evaluation_scores,
      current: req.body.scores,
      previousVersion: before.version,
    });

    return res.json({ data: { id: data } });
  },
);

evaluationsRouter.post(
  "/:id/invalidate",
  requireInstitution("institution_admin", "coordinator"),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ reason: z.string().trim().min(5).max(500) }),
  }),
  async (req, res) => {
    const evaluationId = req.params.id as string;
    const db = getAdminSupabase();

    const ev = assertDatabaseResult(
      await db
        .from("evaluations")
        .select("id,status,boards(results_status)")
        .eq("id", evaluationId)
        .eq("institution_id", req.auth!.institutionId)
        .maybeSingle()
    ) as {
      id: string;
      status: string;
      boards: { results_status: string } | Array<{ results_status: string }> | null;
    } | null;

    if (!ev) throw new HttpError(404, "NOT_FOUND", "Recurso não encontrado");

    const board = Array.isArray(ev.boards) ? ev.boards[0] : ev.boards;
    if (board?.results_status === "published") {
      throw new HttpError(409, "RESULTS_PUBLISHED", "Resultados publicados: retire a publicação antes de invalidar notas");
    }

    if (ev.status === "invalidated") {
      throw new HttpError(409, "ALREADY_INVALIDATED", "Avaliação já invalidada");
    }

    assertDatabaseResult(
      await db
        .from("evaluations")
        .update({ status: "invalidated" })
        .eq("id", evaluationId)
        .eq("institution_id", req.auth!.institutionId)
    );

    await audit(req, "evaluation.invalidate", "evaluation", evaluationId, { reason: req.body.reason });
    return res.json({ data: { id: evaluationId, status: "invalidated" } });
  },
);
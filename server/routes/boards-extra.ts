import { Router } from "express";
import { z } from "zod";
import { authenticate, requireInstitution } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";
import { audit } from "../services/audit.js";
import { loadUsers } from "../services/users.js";

export const boardsExtraRouter = Router();
boardsExtraRouter.use(authenticate);

const params = validate({ params: z.object({ id: z.string().uuid() }) });

type RubricItem = {
  score: number;
  descriptor: string;
};

type CriterionItem = {
  title: string;
  description: string | null;
  weight: number;
  minimum_score: number;
  maximum_score: number;
  active: boolean;
  rubrics: RubricItem[];
};

type EvaluatorItem = {
  evaluator_id: string;
};

type BoardDuplicateSource = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  tie_policy: string;
  score_precision: number;
  criteria: CriterionItem[];
  board_evaluators: EvaluatorItem[];
};

type EvaluationItem = {
  id: string;
  project_id: string;
  evaluator_id: string;
  status: string;
};

type BoardProgressSource = {
  id: string;
  board_projects: Array<{
    project_id: string;
    projects: { name: string } | Array<{ name: string }> | null;
  }>;
  board_evaluators: EvaluatorItem[];
};

boardsExtraRouter.delete("/:id", requireInstitution("institution_admin"), params, async (req, res) => {
  const db = getAdminSupabase();

  const result = await db
    .from("boards")
    .select("id,status")
    .eq("id", req.params.id)
    .eq("institution_id", req.auth!.institutionId)
    .is("archived_at", null)
    .maybeSingle();

  const board = assertDatabaseResult(result) as { id: string; status: string } | null;
  if (!board) throw new HttpError(404, "BOARD_NOT_FOUND", "Banca não encontrada");
  if (board.status === "open") throw new HttpError(409, "BOARD_OPEN", "Encerre a banca antes de arquivar");

  const updateResult = await db
    .from("boards")
    .update({ archived_at: new Date().toISOString(), status: "archived" })
    .eq("id", board.id)
    .eq("institution_id", req.auth!.institutionId);

  assertDatabaseResult(updateResult);
  await audit(req, "archive", "board", board.id);
  return res.status(204).end();
});

boardsExtraRouter.post("/:id/duplicate", requireInstitution("institution_admin", "coordinator"), params, async (req, res) => {
  const db = getAdminSupabase();
  const inst = req.auth!.institutionId;

  const srcResult = await db
    .from("boards")
    .select("*,criteria(*,rubrics(*)),board_evaluators(evaluator_id)")
    .eq("id", req.params.id)
    .eq("institution_id", inst)
    .maybeSingle();

  const src = assertDatabaseResult(srcResult) as BoardDuplicateSource | null;
  if (!src) throw new HttpError(404, "BOARD_NOT_FOUND", "Banca não encontrada");

  const createdResult = await db
    .from("boards")
    .insert({
      institution_id: inst,
      name: `${src.name} (cópia)`.slice(0, 180),
      starts_at: src.starts_at,
      ends_at: src.ends_at,
      tie_policy: src.tie_policy,
      score_precision: src.score_precision,
    })
    .select()
    .single();

  const created = assertDatabaseResult(createdResult) as { id: string };

  try {
    const activeCriteria = (src.criteria ?? []).filter((x) => x.active);

    for (const c of activeCriteria) {
      const ncResult = await db
        .from("criteria")
        .insert({
          board_id: created.id,
          title: c.title,
          description: c.description,
          weight: c.weight,
          minimum_score: c.minimum_score,
          maximum_score: c.maximum_score,
        })
        .select("id")
        .single();

      const nc = assertDatabaseResult(ncResult) as { id: string };

      if (c.rubrics && c.rubrics.length > 0) {
        const rubricsResult = await db.from("rubrics").insert(
          c.rubrics.map((r) => ({
            criterion_id: nc.id,
            score: r.score,
            descriptor: r.descriptor,
          }))
        );
        assertDatabaseResult(rubricsResult);
      }
    }

    const evaluators = src.board_evaluators ?? [];
    if (evaluators.length > 0) {
      const evaluatorsResult = await db.from("board_evaluators").insert(
        evaluators.map((e) => ({
          board_id: created.id,
          evaluator_id: e.evaluator_id,
        }))
      );
      assertDatabaseResult(evaluatorsResult);
    }
  } catch (e) {
    await db.from("boards").delete().eq("id", created.id);
    throw e;
  }

  await audit(req, "duplicate", "board", created.id, { from: src.id });
  return res.status(201).json({ data: created });
});

/** Matriz de progresso */
boardsExtraRouter.get("/:id/progress", requireInstitution("institution_admin", "coordinator"), params, async (req, res) => {
  const db = getAdminSupabase();
  const inst = req.auth!.institutionId;

  const boardResult = await db
    .from("boards")
    .select("id,board_projects(project_id,projects(name)),board_evaluators(evaluator_id)")
    .eq("id", req.params.id)
    .eq("institution_id", inst)
    .maybeSingle();

  const board = assertDatabaseResult(boardResult) as BoardProgressSource | null;
  if (!board) throw new HttpError(404, "BOARD_NOT_FOUND", "Banca não encontrada");

  const evalsResult = await db
    .from("evaluations")
    .select("id,project_id,evaluator_id,status")
    .eq("board_id", board.id)
    .eq("institution_id", inst)
    .in("status", ["submitted", "validated"]);

  const evals = (assertDatabaseResult(evalsResult) ?? []) as EvaluationItem[];

  const evaluators = board.board_evaluators ?? [];
  const projects = board.board_projects ?? [];

  const users = await loadUsers(evaluators.map((e) => e.evaluator_id));

  const cells = projects.flatMap((p) =>
    evaluators.map((e) => {
      const hit = evals.find((x) => x.project_id === p.project_id && x.evaluator_id === e.evaluator_id);
      return {
        projectId: p.project_id,
        evaluatorId: e.evaluator_id,
        state: hit ? "submitted" : "pending",
        evaluationId: hit?.id ?? null,
      };
    })
  );

  return res.json({
    data: {
      total: cells.length,
      completed: cells.filter((c) => c.state === "submitted").length,
      cells,
      evaluators: evaluators.map((e) => ({
        id: e.evaluator_id,
        name: users.get(e.evaluator_id)?.name ?? "",
      })),
      projects: projects.map((p) => ({
        id: p.project_id,
        name: (Array.isArray(p.projects) ? p.projects[0] : p.projects)?.name ?? "",
      })),
    },
  });
});
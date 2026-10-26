import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";
import { rankProjects } from "./ranking-core.js";

interface CriterionRow {
  id: string;
  weight: number | string;
}

interface BoardProjectRow {
  eligible: boolean;
  projects: { id: string; name: string } | { id: string; name: string }[] | null;
}

interface EvaluationScoreRow {
  criterion_id: string;
  score: number;
}

interface EvaluationRow {
  evaluator_id: string;
  project_id: string;
  status: string;
  evaluation_scores: EvaluationScoreRow[];
}

interface BoardRow {
  id: string;
  name: string;
  status: string;
  results_status: string;
  tie_policy: "competition" | "dense";
  score_precision: number;
}

export async function calculateRanking(institutionId: string, boardId: string) {
  const db = getAdminSupabase();

  const rawBoard = assertDatabaseResult(
    await db
      .from("boards")
      .select("id,name,status,results_status,tie_policy,score_precision")
      .eq("id", boardId)
      .eq("institution_id", institutionId)
      .is("archived_at", null)
      .maybeSingle()
  ) as BoardRow | null;

  if (!rawBoard) throw new HttpError(404, "NOT_FOUND", "Recurso não encontrado");
  const board = rawBoard;

  const criteria = (assertDatabaseResult(
    await db.from("criteria").select("id,weight").eq("board_id", boardId).eq("active", true)
  ) ?? []) as CriterionRow[];

  const boardProjects = (assertDatabaseResult(
    await db.from("board_projects").select("eligible,projects(id,name)").eq("board_id", boardId)
  ) ?? []) as BoardProjectRow[];

  const evaluations = (assertDatabaseResult(
    await db
      .from("evaluations")
      .select("evaluator_id,project_id,status,evaluation_scores(criterion_id,score)")
      .eq("board_id", boardId)
      .eq("institution_id", institutionId)
  ) ?? []) as EvaluationRow[];

  const result = rankProjects({
    criteria: criteria.map((c) => ({
      id: c.id,
      weight: Number(c.weight),
    })),
    projects: boardProjects.map((bp) => {
      const p = Array.isArray(bp.projects) ? bp.projects[0] : bp.projects;
      return {
        id: p?.id ?? "",
        name: p?.name ?? "",
        eligible: bp.eligible,
      };
    }),
    evaluations: evaluations.map((e) => ({
      evaluatorId: e.evaluator_id,
      projectId: e.project_id,
      status: e.status,
      scores: Object.fromEntries(
        (e.evaluation_scores ?? []).map((s) => [s.criterion_id, s.score])
      ),
    })),
    tiePolicy: board.tie_policy,
    precision: board.score_precision,
  });

  return {
    board: {
      id: board.id,
      name: board.name,
      status: board.status,
      resultsStatus: board.results_status,
      tiePolicy: board.tie_policy,
      scorePrecision: board.score_precision,
    },
    entries: result.entries,
    pending: result.pending,
  };
}
import type { Request } from "express";
import { assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";

type Auth = NonNullable<Request["auth"]>;
export const isManager = (auth?: Auth) => auth?.role === "institution_admin" || auth?.role === "coordinator";

interface ProjectIdRow {
  project_id: string;
}

interface BoardIdRow {
  board_id: string;
}

interface IdRow {
  id: string;
}

interface ScopeRow {
  scope_board_id: string | null;
  scope_project_id: string | null;
}

export async function evaluatorScope(auth: Auth): Promise<{ boardId: string; projectId: string } | null> {
  const result = await getAdminSupabase()
    .from("institutional_memberships")
    .select("scope_board_id,scope_project_id")
    .eq("institution_id", auth.institutionId!)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const row = assertDatabaseResult(result) as unknown as ScopeRow | null;
  return row?.scope_board_id && row.scope_project_id ? { boardId: row.scope_board_id, projectId: row.scope_project_id } : null;
}

export async function visibleProjectIds(auth: Auth): Promise<string[] | null> {
  if (isManager(auth)) return null;
  const db = getAdminSupabase();
  const inst = auth.institutionId!;
  const uid = auth.user.id;

  if (auth.role === "student" || auth.role === "advisor") {
    const table = auth.role === "student" ? "team_members" : "project_advisors";

    const queryResult = await (db.from(table as never) as ReturnType<typeof db.from>)
      .select("project_id,projects!inner(institution_id)")
      .eq("user_id", uid)
      .eq("projects.institution_id", inst);

    const rows = (assertDatabaseResult(queryResult) ?? []) as ProjectIdRow[];
    return rows.map((r) => r.project_id);
  }

  const scope = await evaluatorScope(auth);
  if (scope) return [scope.projectId];

  const boardsResult = await db
    .from("board_evaluators")
    .select("board_id,boards!inner(institution_id,archived_at)")
    .eq("evaluator_id", uid)
    .eq("boards.institution_id", inst)
    .is("boards.archived_at", null);

  const boards = (assertDatabaseResult(boardsResult) ?? []) as BoardIdRow[];
  const ids = boards.map((b) => b.board_id);
  if (!ids.length) return [];

  const rowsResult = await db.from("board_projects").select("project_id").in("board_id", ids);
  const rows = (assertDatabaseResult(rowsResult) ?? []) as ProjectIdRow[];

  return [...new Set(rows.map((r) => r.project_id))];
}

export async function visibleBoardIds(auth: Auth): Promise<string[] | null> {
  if (isManager(auth)) return null;
  const db = getAdminSupabase();

  if (auth.role === "evaluator") {
    const scope = await evaluatorScope(auth);
    if (scope) return [scope.boardId];
    const queryResult = await db.from("board_evaluators").select("board_id").eq("evaluator_id", auth.user.id);
    const rows = (assertDatabaseResult(queryResult) ?? []) as BoardIdRow[];
    return rows.map((r) => r.board_id);
  }

  const queryResult = await db
    .from("boards")
    .select("id")
    .eq("institution_id", auth.institutionId!)
    .eq("results_status", "published")
    .is("archived_at", null);

  const rows = (assertDatabaseResult(queryResult) ?? []) as IdRow[];
  return rows.map((r) => r.id);
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
export const inList = (ids: string[] | null, requested: string) => (ids === null ? [requested] : ids.length ? ids : [NIL_UUID]);
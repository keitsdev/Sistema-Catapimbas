import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../supabase/migrations/20261001000000_initial_schema.sql",
  import.meta.url,
);

describe("contrato do banco", () => {
  it("declara todas as tabelas usadas pela API", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    const tables = [
      "institutions",
      "institutional_memberships",
      "projects",
      "team_members",
      "project_advisors",
      "boards",
      "board_projects",
      "board_evaluators",
      "criteria",
      "rubrics",
      "evaluations",
      "evaluation_scores",
      "presentation_settings",
      "audit_logs",
    ];

    for (const table of tables) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("declara todas as RPCs chamadas pela API", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    const functions = [
      "replace_project_team",
      "replace_board_participants",
      "replace_board_criteria",
      "submit_evaluation",
      "revise_evaluation",
      "institution_dashboard",
    ];

    for (const functionName of functions) {
      expect(sql).toContain(`function public.${functionName}(`);
      expect(sql).toContain(`grant execute on function public.${functionName}(`);
    }
  });
});

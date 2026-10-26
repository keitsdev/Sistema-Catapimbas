import type { Request } from "express";
import ExcelJS from "exceljs";
import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";
import { calculateRanking } from "./ranking.contract.js";
import { loadUsers } from "./users.js";
import { isManager, visibleProjectIds } from "./visibility.js";

type Auth = NonNullable<Request["auth"]>;
const STATUS: Record<string, string> = { draft: "Rascunho", active: "Ativo", completed: "Concluído", cancelled: "Cancelado" };

export async function exportProjects(institutionId: string, query: Record<string, unknown>, auth: Auth) {
  const db = getAdminSupabase();
  const q = (k: string) => (typeof query[k] === "string" && query[k] ? String(query[k]) : undefined);
  const studentId = q("studentId"), advisorId = q("advisorId");
  let req = db.from("projects")
    .select(`id,name,description,year,semester,status,team_members${studentId ? "!inner" : ""}(user_id,role),project_advisors${advisorId ? "!inner" : ""}(user_id)`)
    .eq("institution_id", institutionId).is("archived_at", null);
  if (q("search")) req = req.ilike("name", `%${q("search")!.replace(/[%,]/g, "")}%`);
  if (q("year")) req = req.eq("year", Number(q("year")));
  if (q("semester")) req = req.eq("semester", Number(q("semester")));
  if (q("status")) req = req.eq("status", q("status")!);
  if (studentId) req = req.eq("team_members.user_id", studentId);
  if (advisorId) req = req.eq("project_advisors.user_id", advisorId);
  const picked = q("ids")?.split(",").filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  if (picked?.length) req = req.in("id", picked);
  const visible = await visibleProjectIds(auth);
  if (visible) req = req.in("id", visible.length ? visible : ["00000000-0000-0000-0000-000000000000"]);
  const projects = assertDatabaseResult(await req.order("name"));

  type Row = { id: string; name: string; description: string; year: number; semester: number; status: string; team_members: { user_id: string; role: string }[]; project_advisors: { user_id: string }[] };
  const rows = projects as unknown as Row[];
  const users = await loadUsers(rows.flatMap((p) => [...p.team_members.map((t) => t.user_id), ...p.project_advisors.map((a) => a.user_id)]));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Projetos");
  ws.columns = [{ header: "Projeto", key: "name", width: 30 }, { header: "Período", key: "period", width: 10 }, { header: "Situação", key: "status", width: 14 }, { header: "Orientador(es)", key: "advisors", width: 28 }, { header: "Equipe", key: "team", width: 44 }, { header: "Descrição", key: "description", width: 70 }];
  rows.forEach((p) => ws.addRow({ name: p.name, period: `${p.year}/${p.semester}`, status: STATUS[p.status] ?? p.status, advisors: p.project_advisors.map((a) => users.get(a.user_id)?.name).filter(Boolean).join(", "), team: p.team_members.map((t) => `${users.get(t.user_id)?.name ?? "?"} (${t.role})`).join(", "), description: p.description }));
  ws.getRow(1).font = { bold: true };
  return wb.xlsx.writeBuffer();
}

export async function exportRanking(institutionId: string, boardId: string, auth: Auth) {
  const ranking = await calculateRanking(institutionId, boardId);
  if (ranking.board.resultsStatus !== "published" && !isManager(auth)) throw new HttpError(403, "RESULTS_NOT_PUBLISHED", "Os resultados ainda não foram publicados");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ranking");
  ws.columns = [{ header: "Posição", key: "rank", width: 10 }, { header: "Projeto", key: "name", width: 34 }, { header: "Pontuação", key: "score", width: 12 }, { header: "Avaliações", key: "n", width: 12 }, { header: "Empate", key: "tied", width: 10 }];
  ranking.entries.forEach((e) => ws.addRow({ rank: e.rank, name: e.projectName, score: e.score, n: e.evaluationCount, tied: e.tied ? "sim" : "" }));
  ws.getRow(1).font = { bold: true };
  return wb.xlsx.writeBuffer();
}

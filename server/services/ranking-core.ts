export interface CriterionIn { id: string; weight: number }
export interface EvaluationIn { evaluatorId: string; projectId: string; status: string; scores: Record<string, number> }
export interface ProjectIn { id: string; name: string; eligible: boolean }
export interface RankingEntry { rank: number; projectId: string; projectName: string; score: number; evaluationCount: number; tied: boolean }

export const VALID_STATUSES = ["submitted", "validated"];

export function evaluatorScore(criteria: CriterionIn[], scores: Record<string, number>): number | null {
  let num = 0, den = 0;
  for (const c of criteria) {
    const s = scores[c.id];
    if (typeof s === "number" && Number.isFinite(s)) { num += s * c.weight; den += c.weight; }
  }
  return den > 0 ? num / den : null;
}

export function rankProjects(opts: { criteria: CriterionIn[]; projects: ProjectIn[]; evaluations: EvaluationIn[]; tiePolicy: "competition" | "dense"; precision: number }) {
  const factor = 10 ** opts.precision;
  const rows = opts.projects.filter((p) => p.eligible).map((p) => {
    const vals = opts.evaluations
      .filter((e) => e.projectId === p.id && VALID_STATUSES.includes(e.status))
      .map((e) => evaluatorScore(opts.criteria, e.scores))
      .filter((v): v is number => v !== null);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { projectId: p.id, projectName: p.name, evaluationCount: vals.length, score: avg === null ? null : Math.round(avg * factor) / factor };
  });
  const ranked = rows.filter((r): r is typeof r & { score: number } => r.score !== null).sort((a, b) => b.score - a.score || a.projectName.localeCompare(b.projectName));
  let position = 0;
  const entries: RankingEntry[] = ranked.map((r, i) => {
    const tie = i > 0 && r.score === ranked[i - 1].score;
    if (!tie) position = opts.tiePolicy === "dense" ? position + 1 : i + 1;
    return { rank: position, ...r, tied: false };
  });
  entries.forEach((e) => { e.tied = entries.filter((x) => x.rank === e.rank).length > 1; });
  return { entries, pending: rows.filter((r) => r.score === null).map((r) => ({ projectId: r.projectId, projectName: r.projectName })) };
}

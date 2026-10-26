import { describe, expect, it } from "vitest";
import { evaluatorScore, rankProjects } from "./services/ranking-core.js";

const criteria = [{ id: "a", weight: 3 }, { id: "b", weight: 1 }];
const projects = [{ id: "p1", name: "Alfa", eligible: true }, { id: "p2", name: "Beta", eligible: true }, { id: "p3", name: "Gama", eligible: true }, { id: "px", name: "Inelegível", eligible: false }];
const ev = (evaluatorId: string, projectId: string, a: number, b: number, status = "submitted") => ({ evaluatorId, projectId, status, scores: { a, b } });

describe("ranking (RN05/RN06)", () => {
  it("pondera por peso: (5×3 + 1×1) / 4 = 4", () => expect(evaluatorScore(criteria, { a: 5, b: 1 })).toBe(4));
  it("nota ausente não entra no divisor", () => expect(evaluatorScore(criteria, { a: 4 })).toBe(4));
  it("média entre avaliadores e arredondamento no final", () => {
    const r = rankProjects({ criteria, projects, evaluations: [ev("x", "p1", 5, 1), ev("y", "p1", 4, 4)], tiePolicy: "competition", precision: 2 });
    expect(r.entries[0].score).toBe(4); // (4 + 4) / 2
    expect(r.entries[0].evaluationCount).toBe(2);
  });
  it("ignora avaliações invalidadas e projetos inelegíveis", () => {
    const r = rankProjects({ criteria, projects, evaluations: [ev("x", "p1", 5, 5), ev("y", "p1", 1, 1, "invalidated"), ev("x", "px", 5, 5)], tiePolicy: "competition", precision: 2 });
    expect(r.entries.map((e) => e.projectId)).toEqual(["p1"]);
    expect(r.entries[0].score).toBe(5);
    expect(r.pending.map((p) => p.projectId)).toEqual(["p2", "p3"]);
  });
  it("empate: competição (1,1,3) e densa (1,1,2), sem desempate arbitrário", () => {
    const evaluations = [ev("x", "p1", 5, 1), ev("x", "p2", 5, 1), ev("x", "p3", 1, 5)];
    const c = rankProjects({ criteria, projects, evaluations, tiePolicy: "competition", precision: 2 });
    const d = rankProjects({ criteria, projects, evaluations, tiePolicy: "dense", precision: 2 });
    expect(c.entries.map((e) => e.rank)).toEqual([1, 1, 3]);
    expect(d.entries.map((e) => e.rank)).toEqual([1, 1, 2]);
    expect(c.entries.map((e) => e.tied)).toEqual([true, true, false]);
  });
  it("respeita a precisão configurada", () => {
    const r = rankProjects({ criteria: [{ id: "a", weight: 1 }, { id: "b", weight: 1 }, { id: "c", weight: 1 }], projects: [projects[0]], evaluations: [{ evaluatorId: "x", projectId: "p1", status: "submitted", scores: { a: 5, b: 4, c: 4 } }], tiePolicy: "competition", precision: 1 });
    expect(r.entries[0].score).toBe(4.3);
  });
});

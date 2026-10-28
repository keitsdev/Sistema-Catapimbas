import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "./services/invitations.js";

vi.mock("@supabase/supabase-js", () => ({ createClient: () => (globalThis as Record<string, unknown>).__fakeSupabase }));

type Row = Record<string, unknown>;
const TOKEN = "tokenDeTesteComMaisDeVinteCaracteres_AB";
const INST = "11111111-1111-4111-8111-111111111111", BOARD = "22222222-2222-4222-8222-222222222222", PROJECT = "33333333-3333-4333-8333-333333333333";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let tables: Record<string, Row[]>;

const fake = () => ({
  from: (table: string) => {
    const filters: [string, unknown][] = [];
    const chain = { select: () => chain, eq: (c: string, v: unknown) => (filters.push([c, v]), chain),
      maybeSingle: async () => ({ data: (tables[table] ?? []).find((r) => filters.every(([c, v]) => r[c] === v)) ?? null, error: null }) };
    return chain;
  },
});
const invitation = (over: Row = {}) => ({
  id: "inv-1", institution_id: INST, board_id: BOARD, project_id: PROJECT, token_hash: hashToken(TOKEN), max_uses: 2, uses: 0,
  expires_at: new Date(Date.now() + 3_600_000).toISOString(), revoked_at: null,
  boards: { name: "Banca Final", status: "open", archived_at: null }, projects: { name: "AcolheMãe", archived_at: null }, institutions: { name: "Faculdade", status: "active" }, ...over,
});
async function statusOf(p: Promise<unknown>) { try { await p; return 200; } catch (e) { return (e as { status: number }).status; } }
const lib = () => import("./services/invitations-db.js");

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_ANON_KEY = "anon-key-with-at-least-twenty-characters"; process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-with-at-least-twenty-characters";
  tables = { board_invitations: [invitation()], institutional_memberships: [] };
  (globalThis as Record<string, unknown>).__fakeSupabase = fake();
});

describe("findUsableInvitation", () => {
  it("convite válido devolve só o necessário para a tela de cadastro", async () => {
    const r = await (await lib()).findUsableInvitation(TOKEN);
    expect(r.projectName).toBe("AcolheMãe"); expect(r.boardId).toBe(BOARD); expect(r.institutionId).toBe(INST);
  });
  it("todas as falhas respondem 410 com a MESMA mensagem (não revela se o link existiu)", async () => {
    const { findUsableInvitation } = await lib();
    const cases: Row[] = [
      { revoked_at: new Date().toISOString() }, { expires_at: new Date(Date.now() - 1000).toISOString() }, { uses: 2 },
      { boards: { name: "B", status: "closed", archived_at: null } }, { boards: { name: "B", status: "open", archived_at: "2026-01-01" } },
      { projects: { name: "P", archived_at: "2026-01-01" } }, { institutions: { name: "I", status: "suspended" } },
    ];
    const messages = new Set<string>();
    for (const over of cases) {
      tables.board_invitations = [invitation(over)];
      try { await findUsableInvitation(TOKEN); throw new Error("deveria falhar"); } catch (e) { expect((e as { status: number }).status).toBe(410); messages.add((e as Error).message); }
    }
    tables.board_invitations = [];
    try { await findUsableInvitation(TOKEN); } catch (e) { expect((e as { status: number }).status).toBe(410); messages.add((e as Error).message); }
    expect(messages.size).toBe(1);
  });
  it("o token em texto puro nunca é consultado: só o hash", async () => {
    tables.board_invitations = [{ ...invitation(), token_hash: TOKEN }];
    expect(await statusOf((await lib()).findUsableInvitation(TOKEN))).toBe(410);
  });
});

describe("escopo do avaliador convidado", () => {
  const auth = (role: string) => ({ user: { id: USER }, institutionId: INST, role }) as never;
  it("convidado só enxerga o projeto e a banca do convite", async () => {
    tables.institutional_memberships = [{ institution_id: INST, user_id: USER, role: "evaluator", status: "approved", scope_board_id: BOARD, scope_project_id: PROJECT }];
    const v = await import("./services/visibility.js");
    expect(await v.visibleProjectIds(auth("evaluator"))).toEqual([PROJECT]);
    expect(await v.visibleBoardIds(auth("evaluator"))).toEqual([BOARD]);
  });
  it("gestores não têm restrição", async () => {
    const v = await import("./services/visibility.js");
    expect(await v.visibleProjectIds(auth("institution_admin"))).toBe(null);
    expect(await v.visibleBoardIds(auth("coordinator"))).toBe(null);
  });
  it("inList nunca gera lista vazia (que viraria 'sem filtro')", async () => {
    const { inList } = await import("./services/visibility.js");
    expect(inList([], "x")).toEqual(["00000000-0000-0000-0000-000000000000"]); expect(inList(null, "x")).toEqual(["x"]); expect(inList(["a"], "x")).toEqual(["a"]);
  });
});

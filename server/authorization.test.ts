import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({ createClient: () => (globalThis as Record<string, unknown>).__fakeSupabase }));

type Row = Record<string, unknown>;
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const U_EVAL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", U_ADMIN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", U_SUPER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
let tables: Record<string, Row[]>;
let users: Record<string, { id: string; app_metadata?: Row }>;

function fakeSupabase() {
  return {
    auth: { getUser: async (token: string) => (users[token] ? { data: { user: users[token] }, error: null } : { data: { user: null }, error: { message: "bad jwt" } }) },
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      const chain = { select: () => chain, eq: (c: string, v: unknown) => (filters.push([c, v]), chain),
        maybeSingle: async () => ({ data: (tables[table] ?? []).find((r) => filters.every(([c, v]) => r[c] === v)) ?? null, error: null }) };
      return chain;
    },
  };
}

const req = (token: string | undefined, inst?: string) => ({ header: (n: string) => ({ authorization: token ? `Bearer ${token}` : undefined, "x-institution-id": inst })[n.toLowerCase()] }) as any;
async function run(mw: any, r: any) { await mw(r, {}, () => undefined); return r; }
async function status(p: Promise<unknown>) { try { await p; return 200; } catch (e) { return (e as { status: number }).status; } }

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_ANON_KEY = "anon-key-with-at-least-twenty-characters"; process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-with-at-least-twenty-characters";
  users = { "t-eval": { id: U_EVAL }, "t-adminB": { id: U_ADMIN_B }, "t-super": { id: U_SUPER, app_metadata: { system_role: "superadmin" } } };
  tables = {
    institutions: [{ id: A, status: "active" }, { id: B, status: "active" }],
    institutional_memberships: [{ institution_id: A, user_id: U_EVAL, role: "evaluator", status: "approved" }, { institution_id: B, user_id: U_ADMIN_B, role: "institution_admin", status: "approved" }],
  };
  (globalThis as Record<string, unknown>).__fakeSupabase = fakeSupabase();
});

async function mw() { return import("./middleware/auth.contract.js"); }
async function enter(token: string, inst: string | undefined, ...roles: string[]) { const m = await mw(); const r = await run(m.authenticate, req(token, inst)); return run(m.requireInstitution(...(roles as never[])), r); }

describe("authenticate", () => {
  it("sem token → 401 UNAUTHENTICATED", async () => { const m = await mw(); expect(await status(run(m.authenticate, req(undefined)))).toBe(401); });
  it("token inválido → 401", async () => { const m = await mw(); expect(await status(run(m.authenticate, req("lixo")))).toBe(401); });
});

describe("requireInstitution (RN10/C2/C7)", () => {
  it("vínculo aprovado → papel vem do banco", async () => { const r = await enter("t-eval", A); expect(r.auth.role).toBe("evaluator"); expect(r.auth.institutionId).toBe(A); });
  it("papel insuficiente → 403", async () => expect(await status(enter("t-eval", A, "institution_admin", "coordinator"))).toBe(403));
  it("C2: trocar o id da instituição → 403, igual a instituição inexistente (nada vaza)", async () => {
    expect(await status(enter("t-eval", B))).toBe(403);
    expect(await status(enter("t-eval", "99999999-9999-4999-8999-999999999999"))).toBe(403);
  });
  it("cabeçalho ausente ou malformado → 400", async () => { expect(await status(enter("t-eval", undefined))).toBe(400); expect(await status(enter("t-eval", "1 OR 1=1"))).toBe(400); });
  it("RN02: pendente, recusado, bloqueado e revogado não entram", async () => {
    for (const s of ["pending", "rejected", "blocked", "revoked"]) { tables.institutional_memberships[0].status = s; expect(await status(enter("t-eval", A))).toBe(403); }
  });
  it("C7: mudança de permissão vale na requisição seguinte", async () => {
    expect(await status(enter("t-eval", A, "evaluator"))).toBe(200);
    tables.institutional_memberships[0].role = "student"; expect(await status(enter("t-eval", A, "evaluator"))).toBe(403);
    tables.institutional_memberships[0].status = "blocked"; expect(await status(enter("t-eval", A))).toBe(403);
  });
  it("instituição suspensa bloqueia todos os seus usuários", async () => { tables.institutions[0].status = "suspended"; expect(await status(enter("t-eval", A))).toBe(403); });
  it("superadmin supervisiona qualquer instituição existente como administrador", async () => {
    const r = await enter("t-super", B, "institution_admin"); expect(r.auth.role).toBe("institution_admin"); expect(r.auth.supervising).toBe(true);
    expect(await status(enter("t-super", "99999999-9999-4999-8999-999999999999"))).toBe(404);
  });
  it("requireSystemRole nega quem não é superadmin", async () => {
    const m = await mw(); const r = await run(m.authenticate, req("t-eval"));
    expect(await status(Promise.resolve().then(() => m.requireSystemRole("superadmin")(r, {} as never, () => undefined)))).toBe(403);
  });
});

describe("auditoria nunca grava segredos", () => {
  it("redact remove senha/token em qualquer nível", async () => {
    const { redact } = await import("./services/audit.contract.js");
    expect(redact({ name: "x", password: "123", nested: { accessToken: "t", ok: 1 }, list: [{ senha: "s", v: 2 }] })).toEqual({ name: "x", nested: { ok: 1 }, list: [{ v: 2 }] });
  });
});

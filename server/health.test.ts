import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/supabase.js", () => ({ getAdminSupabase: vi.fn() }));

import { createApp } from "./app.js";
import { getAdminSupabase } from "./lib/supabase.js";

function mockSupabase(result: { error: { code?: string } | null } | Error) {
  const limit = vi.fn().mockImplementation(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  const select = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ select }));
  vi.mocked(getAdminSupabase).mockReturnValue({ from } as unknown as ReturnType<typeof getAdminSupabase>);
}

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key-with-at-least-twenty-characters";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-with-at-least-twenty-characters";
  process.env.LOG_LEVEL = "silent";
});

beforeEach(() => vi.clearAllMocks());

describe("diagnóstico de prontidão", () => {
  it("confirma que API, Supabase e tabela do contrato respondem", async () => {
    mockSupabase({ error: null });
    const response = await request(createApp()).get("/api/v1/health/ready");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ready", checks: { api: "ok", supabase: "ok", schema: "ok" } });
  });

  it("distingue esquema não compatível de indisponibilidade de rede", async () => {
    mockSupabase({ error: { code: "PGRST205" } });
    const response = await request(createApp()).get("/api/v1/health/ready");
    expect(response.status).toBe(503);
    expect(response.body.checks.supabase).toBe("schema_mismatch");
  });

  it("retorna indisponível quando não consegue alcançar o Supabase", async () => {
    mockSupabase(new Error("network unavailable"));
    const response = await request(createApp()).get("/api/v1/health/ready");
    expect(response.status).toBe(503);
    expect(response.body.checks.supabase).toBe("unavailable");
    expect(JSON.stringify(response.body)).not.toContain("network unavailable");
  });
});

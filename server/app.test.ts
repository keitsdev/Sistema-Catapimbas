import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key-with-at-least-twenty-characters";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-with-at-least-twenty-characters";
  process.env.LOG_LEVEL = "silent";
});

describe("API", () => {
  it("expõe o health check sem autenticação", async () => {
    const { createApp } = await import("./app.js");
    const response = await request(createApp()).get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("não expõe o cabeçalho da tecnologia do servidor", async () => {
    const { createApp } = await import("./app.js");
    const response = await request(createApp()).get("/api/v1/health");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("protege rotas privadas sem token", async () => {
    const { createApp } = await import("./app.js");
    const response = await request(createApp()).get("/api/v1/projects");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });
});

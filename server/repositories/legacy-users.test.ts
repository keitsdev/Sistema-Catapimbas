import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/supabase.js", () => ({ getAdminSupabase: vi.fn() }));
import { getAdminSupabase } from "../lib/supabase.js";
import { carregarPerfilLegado } from "./legacy-users.js";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let injectedError: { code: string; message: string } | null;

function fakeSupabase() {
  return {
    from(table: string) {
      const filters: Array<[string, unknown, "eq" | "in"]> = [];
      const chain: Record<string, any> = {
        select: () => chain,
        eq: (column: string, value: unknown) => (filters.push([column, value, "eq"]), chain),
        in: (column: string, value: unknown[]) => (filters.push([column, value, "in"]), chain),
        maybeSingle: async () => {
          if (injectedError) return { data: null, error: injectedError };
          return { data: (tables[table] ?? []).find((row) => filters.every(([column, value]) => row[column] === value)) ?? null, error: null };
        },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
          if (injectedError) return Promise.resolve({ data: null, error: injectedError }).then(resolve, reject);
          const data = (tables[table] ?? []).filter((row) => filters.every(([column, value, op]) => op === "eq" ? row[column] === value : (value as unknown[]).includes(row[column])));
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

beforeEach(() => {
  injectedError = null;
  tables = {
    Usuario: [{ id: 42, nome: "Avaliadora Exemplo", email: "aval@example.com", status: "ativo", auth_user_id: "auth-uuid" }],
    VinculoInstitucional: [{ usuario_id: 42, instituicao_id: 7, papel: "avaliador", situacao: "aprovado" }],
    Instituicao: [{ id: 7, nome: "Instituição Teste", identificador: "teste", status: "ativa" }],
  };
  vi.mocked(getAdminSupabase).mockReturnValue(fakeSupabase() as never);
});

describe("repositório de usuários legados", () => {
  it("mapeia IDs inteiros e papéis portugueses para o DTO do app", async () => {
    const result = await carregarPerfilLegado("auth-uuid", "aval@example.com");
    expect(result.user).toMatchObject({
      id: 42,
      nome: "Avaliadora Exemplo",
      email: "aval@example.com",
      vinculos: [{ instituicaoId: 7, papel: "avaliador", situacao: "aprovado" }],
    });
    expect(result.instituicoes).toEqual([{ id: 7, nome: "Instituição Teste", identificador: "teste", status: "ativa" }]);
  });

  it("não concede papel administrativo com metadados Auth comuns", async () => {
    const result = await carregarPerfilLegado("auth-uuid", "aval@example.com", false);
    expect(result.user.vinculos.some((v) => v.papel === "superadmin")).toBe(false);
  });

  it("informa claramente que o vínculo Auth/perfil ainda não foi criado", async () => {
    tables.Usuario = [];
    await expect(carregarPerfilLegado("sem-vinculo", "novo@example.com")).rejects.toMatchObject({ status: 403, code: "PROFILE_NOT_LINKED" });
  });

  it("exige migration/mapeamento quando auth_user_id ou a tabela não existe", async () => {
    injectedError = { code: "PGRST204", message: "column auth_user_id missing" };
    await expect(carregarPerfilLegado("auth-uuid", "aval@example.com")).rejects.toMatchObject({ status: 503, code: "LEGACY_SCHEMA_NOT_READY" });
  });
});

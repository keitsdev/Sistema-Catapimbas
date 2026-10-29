import { describe, expect, it } from "vitest";
import { mapLegacyRole, mapLegacySituation } from "./legacy-institution.js";

describe("mapeamento do esquema legado português", () => {
  it("normaliza papéis armazenados em português e nomes legados comuns", () => {
    expect(mapLegacyRole("administrador")).toBe("admin");
    expect(mapLegacyRole("coordenador")).toBe("coordenador");
    expect(mapLegacyRole("avaliador")).toBe("avaliador");
    expect(mapLegacyRole("student")).toBe("aluno");
  });

  it("normaliza estados de vínculo sem tratar pendente como aprovado", () => {
    expect(mapLegacySituation("aprovado")).toBe("aprovado");
    expect(mapLegacySituation("pendente")).toBe("pendente");
    expect(mapLegacySituation("revogado")).toBe("revogado");
  });

  it("falha fechado diante de papel ou situação desconhecida", () => {
    expect(() => mapLegacyRole("root")).toThrowError(/sem mapeamento/);
    expect(() => mapLegacySituation("ativo")).toThrowError(/sem mapeamento/);
  });
});

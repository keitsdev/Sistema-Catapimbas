import { HttpError } from "../../src/lib/http-error.js";

export { HttpError };

export function assertDatabaseResult<D>(result: { data: D; error: { message: string; code?: string } | null }): D {
  if (result.error) {
    console.error("[database]", result.error.code, result.error.message);
    throw new HttpError(500, "DATABASE_ERROR", "Falha ao acessar o banco de dados");
  }
  return result.data;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "")

export interface ApiErrorBody { code?: string; message?: string; details?: unknown }
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public details?: unknown) {
    super(message)
    this.name = "ApiError"
  }
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  token?: string | null
  institutionId?: number | string | null
  signal?: AbortSignal
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers = new Headers({ Accept: "application/json" })
  if (options.body !== undefined) headers.set("Content-Type", "application/json")
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`)
  if (options.institutionId != null) headers.set("x-institution-id", String(options.institutionId))

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path.startsWith("/") ? path : `/${path}`}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch {
    throw new ApiError("Não foi possível conectar à API. Verifique se o backend está ativo.", 0, "API_UNREACHABLE")
  }

  const payload = await response.json().catch(() => null) as { error?: ApiErrorBody } | null
  if (!response.ok) {
    const error = payload?.error
    throw new ApiError(error?.message ?? `Erro HTTP ${response.status}`, response.status, error?.code, error?.details)
  }
  return payload as T
}

import type { Instituicao, Usuario } from "../types"
import { apiRequest } from "../lib/api-client"

export interface LoginApiResponse {
  user: Usuario
  instituicoes: Instituicao[]
  session: { accessToken: string; refreshToken: string; expiresAt: number }
}

export function entrarPelaApi(email: string, password: string) {
  return apiRequest<LoginApiResponse>("/auth/login", {
    method: "POST",
    body: { email: email.trim(), password },
  })
}

export function meuPerfilPelaApi(accessToken: string) {
  return apiRequest<Omit<LoginApiResponse, "session">>("/auth/me", { token: accessToken })
}

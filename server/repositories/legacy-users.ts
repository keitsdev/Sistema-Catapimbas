import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";

// Mantenha os nomes físicos do banco concentrados aqui. Confirme-os no Supabase antes de produção.
export const LEGACY_SCHEMA = {
  users: "Usuario",
  memberships: "VinculoInstitucional",
  institutions: "Instituicao",
} as const;

interface UsuarioRow {
  id: number;
  nome: string;
  email: string;
  status: string;
  auth_user_id: string | null;
}
interface VinculoRow {
  instituicao_id: number;
  papel: string;
  situacao: string;
}
interface InstituicaoRow {
  id: number;
  nome: string;
  identificador: string;
  status: string;
}

export interface PerfilLegado {
  user: {
    id: number;
    nome: string;
    email: string;
    vinculos: Array<{
      instituicaoId: number;
      papel: "superadmin" | "admin" | "coordenador" | "orientador" | "avaliador" | "aluno";
      situacao: "aprovado" | "pendente" | "recusado" | "bloqueado" | "revogado";
      justificativa?: string;
    }>;
  };
  instituicoes: Array<{
    id: number;
    nome: string;
    identificador: string;
    status: "ativa" | "suspensa";
    cor?: string;
    lema?: string;
  }>;
}

const papelMap: Record<string, PerfilLegado["user"]["vinculos"][number]["papel"]> = {
  superadmin: "superadmin", institution_admin: "admin", administrador: "admin", admin: "admin",
  coordinator: "coordenador", coordenador: "coordenador", advisor: "orientador", orientador: "orientador",
  evaluator: "avaliador", avaliador: "avaliador", student: "aluno", aluno: "aluno",
};
const situacaoMap: Record<string, PerfilLegado["user"]["vinculos"][number]["situacao"]> = {
  approved: "aprovado", aprovado: "aprovado", pending: "pendente", pendente: "pendente",
  rejected: "recusado", recusado: "recusado", blocked: "bloqueado", bloqueado: "bloqueado",
  revoked: "revogado", revogado: "revogado",
};

function numberId(value: unknown, field: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new HttpError(500, "LEGACY_SCHEMA_INVALID", `O campo ${field} não contém um ID inteiro válido`);
  return n;
}

function mapRole(value: string) {
  const papel = papelMap[value.trim().toLowerCase()];
  if (!papel) throw new HttpError(500, "LEGACY_ROLE_UNMAPPED", `Papel institucional sem mapeamento: ${value}`);
  return papel;
}
function mapSituation(value: string) {
  const situacao = situacaoMap[value.trim().toLowerCase()];
  if (!situacao) throw new HttpError(500, "LEGACY_STATUS_UNMAPPED", `Situação de vínculo sem mapeamento: ${value}`);
  return situacao;
}

export async function carregarPerfilLegado(authUserId: string, authEmail: string, authIsSuperadmin = false): Promise<PerfilLegado> {
  const db = getAdminSupabase();
  const userResult = await db.from(LEGACY_SCHEMA.users)
    .select("id,nome,email,status,auth_user_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (userResult.error && ["PGRST204", "PGRST205", "42703", "42P01"].includes(userResult.error.code ?? "")) {
    throw new HttpError(503, "LEGACY_SCHEMA_NOT_READY", "O esquema legado ainda não está pronto: confirme as tabelas/colunas mapeadas e aplique a associação auth_user_id.");
  }
  const rawUser = assertDatabaseResult(userResult) as unknown as UsuarioRow | null;

  if (!rawUser) {
    throw new HttpError(403, "PROFILE_NOT_LINKED", "A conta Auth não está vinculada a um perfil da tabela Usuario. Solicite a associação pelo administrador.");
  }
  if (!rawUser.status || !["ativo", "active", "aprovado", "approved"].includes(rawUser.status.toLowerCase())) {
    throw new HttpError(403, "PROFILE_INACTIVE", "A conta está inativa ou não foi aprovada.");
  }

  const id = numberId(rawUser.id, "Usuario.id");
  const rawMemberships = assertDatabaseResult(
    await db.from(LEGACY_SCHEMA.memberships)
      .select("instituicao_id,papel,situacao")
      .eq("usuario_id", id),
  ) as unknown as VinculoRow[];

  const vinculos = rawMemberships.map((row) => ({
    instituicaoId: numberId(row.instituicao_id, "VinculoInstitucional.instituicao_id"),
    papel: mapRole(row.papel),
    situacao: mapSituation(row.situacao),
  }));

  const superadmin = authIsSuperadmin;
  if (superadmin) vinculos.unshift({ instituicaoId: 0, papel: "superadmin", situacao: "aprovado" });

  const institutionIds = [...new Set(vinculos.filter((v) => v.instituicaoId !== 0).map((v) => v.instituicaoId))];
  const rawInstitutions = institutionIds.length
    ? (assertDatabaseResult(
        await db.from(LEGACY_SCHEMA.institutions)
          .select("id,nome,identificador,status")
          .in("id", institutionIds),
      ) as unknown as InstituicaoRow[])
    : [];
  const instituicoes = rawInstitutions.map((row) => ({
    id: numberId(row.id, "Instituicao.id"),
    nome: row.nome,
    identificador: row.identificador,
    status: ["suspensa", "suspended"].includes(row.status.toLowerCase()) ? "suspensa" as const : "ativa" as const,
  }));

  if (!superadmin && !vinculos.some((v) => v.situacao === "aprovado" && instituicoes.some((i) => i.id === v.instituicaoId && i.status === "ativa"))) {
    throw new HttpError(403, "NO_ACTIVE_MEMBERSHIP", "Não há vínculo aprovado em uma instituição ativa.");
  }

  return {
    user: { id, nome: rawUser.nome, email: rawUser.email || authEmail, vinculos },
    instituicoes,
  };
}

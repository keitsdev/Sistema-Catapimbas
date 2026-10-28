import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";
import { INVITATION_INVALID_MESSAGE, hashToken, invitationStatus } from "./invitations.js";

type One<T> = T | T[] | null;
const one = <T>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

interface InvitationJoin {
  id: string;
  institution_id: string;
  board_id: string;
  project_id: string;
  max_uses: number;
  uses: number;
  expires_at: string;
  revoked_at: string | null;
  boards: One<{ name: string; status: string; archived_at: string | null }>;
  projects: One<{ name: string; archived_at: string | null }>;
  institutions: One<{ name: string; status: string }>;
}

export async function findUsableInvitation(token: string) {
  const invalid = () => new HttpError(410, "INVITATION_INVALID", INVITATION_INVALID_MESSAGE);
  const result = await getAdminSupabase()
    .from("board_invitations")
    .select("id,institution_id,board_id,project_id,max_uses,uses,expires_at,revoked_at,boards!inner(name,status,archived_at),projects!inner(name,archived_at),institutions!inner(name,status)")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  const row = assertDatabaseResult(result) as unknown as InvitationJoin | null;
  if (!row) throw invalid();
  const board = one(row.boards), project = one(row.projects), institution = one(row.institutions);
  if (!board || !project || !institution) throw invalid();
  const usable = invitationStatus(row) === "active" && ["draft", "open"].includes(board.status) && !board.archived_at && !project.archived_at && institution.status === "active";
  if (!usable) throw invalid();
  return { id: row.id, institutionId: row.institution_id, boardId: row.board_id, projectId: row.project_id, expiresAt: row.expires_at, boardName: board.name, projectName: project.name, institutionName: institution.name };
}

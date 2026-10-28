import { Router } from "express";
import { z } from "zod";
import { authenticate, requireInstitution } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";
import { audit } from "../services/audit.js";
import { generateToken, hashToken, invitationStatus } from "../services/invitations.js";
import { loadUsers } from "../services/users.js";

export const invitationsRouter = Router();
invitationsRouter.use(authenticate, requireInstitution("institution_admin"));

interface BoardRow { id: string; status: string }
interface InvitationRow {
  id: string;
  board_id: string;
  project_id: string;
  max_uses: number;
  uses: number;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}
interface UsedByRow { user_id: string; invitation_id: string; created_at: string }

invitationsRouter.post(
  "/",
  validate({
    body: z.object({
      boardId: z.string().uuid(),
      projectId: z.string().uuid(),
      expiresInHours: z.number().int().min(1).max(168).default(24),
      maxUses: z.number().int().min(1).max(20).default(1),
    }),
  }),
  async (req, res) => {
    const db = getAdminSupabase();
    const institutionId = req.auth!.institutionId!;
    const { boardId, projectId, expiresInHours, maxUses } = req.body as { boardId: string; projectId: string; expiresInHours: number; maxUses: number };

    const board = assertDatabaseResult(
      await db.from("boards").select("id,status").eq("id", boardId).eq("institution_id", institutionId).is("archived_at", null).maybeSingle(),
    ) as unknown as BoardRow | null;
    if (!board) throw new HttpError(404, "BOARD_NOT_FOUND", "Banca não encontrada");
    if (!["draft", "open"].includes(board.status)) throw new HttpError(409, "BOARD_CLOSED", "Esta banca já foi encerrada: só é possível convidar enquanto ela está em rascunho ou aberta");

    const link = assertDatabaseResult(
      await db.from("board_projects").select("project_id,projects!inner(institution_id,archived_at)").eq("board_id", boardId).eq("project_id", projectId).eq("projects.institution_id", institutionId).is("projects.archived_at", null).maybeSingle(),
    );
    if (!link) throw new HttpError(422, "PROJECT_NOT_IN_BOARD", "Este projeto não participa da banca escolhida");

    const token = generateToken();
    const expiresAt = new Date(Date.now() + expiresInHours * 3_600_000).toISOString();
    const created = assertDatabaseResult(
      await db.from("board_invitations")
        .insert({ institution_id: institutionId, board_id: boardId, project_id: projectId, token_hash: hashToken(token), max_uses: maxUses, expires_at: expiresAt, created_by: req.auth!.user.id })
        .select("id")
        .single(),
    ) as unknown as { id: string };

    await audit(req, "invitation.create", "board_invitation", created.id, { boardId, projectId, maxUses, expiresAt });
    return res.status(201).json({ data: { id: created.id, token, expiresAt, maxUses } });
  },
);

invitationsRouter.get(
  "/",
  validate({ query: z.object({ boardId: z.string().uuid().optional(), projectId: z.string().uuid().optional() }) }),
  async (req, res) => {
    const db = getAdminSupabase();
    const { boardId, projectId } = req.query as { boardId?: string; projectId?: string };
    let q = db.from("board_invitations").select("id,board_id,project_id,max_uses,uses,expires_at,revoked_at,created_at").eq("institution_id", req.auth!.institutionId!);
    if (boardId) q = q.eq("board_id", boardId);
    if (projectId) q = q.eq("project_id", projectId);
    const rows = (assertDatabaseResult(await q.order("created_at", { ascending: false })) ?? []) as unknown as InvitationRow[];

    const used = rows.length
      ? ((assertDatabaseResult(
          await db.from("institutional_memberships").select("user_id,invitation_id,created_at").eq("institution_id", req.auth!.institutionId!).in("invitation_id", rows.map((r) => r.id)),
        ) ?? []) as unknown as UsedByRow[])
      : [];
    const users = await loadUsers(used.map((u) => u.user_id));

    return res.json({
      data: rows.map((r) => ({
        id: r.id, boardId: r.board_id, projectId: r.project_id, maxUses: r.max_uses, uses: r.uses,
        expiresAt: r.expires_at, revokedAt: r.revoked_at, createdAt: r.created_at, status: invitationStatus(r),
        usedBy: used.filter((u) => u.invitation_id === r.id).map((u) => ({ userId: u.user_id, name: users.get(u.user_id)?.name ?? "", at: u.created_at })),
      })),
    });
  },
);

invitationsRouter.delete("/:id", validate({ params: z.object({ id: z.string().uuid() }) }), async (req, res) => {
  const db = getAdminSupabase();
  const id = String(req.params.id);
  const row = assertDatabaseResult(
    await db.from("board_invitations").select("id,revoked_at").eq("id", id).eq("institution_id", req.auth!.institutionId!).maybeSingle(),
  ) as unknown as { id: string; revoked_at: string | null } | null;
  if (!row) throw new HttpError(404, "INVITATION_NOT_FOUND", "Convite não encontrado");
  if (row.revoked_at) throw new HttpError(409, "ALREADY_REVOKED", "Este convite já foi revogado");
  assertDatabaseResult(await db.from("board_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("institution_id", req.auth!.institutionId!));
  await audit(req, "invitation.revoke", "board_invitation", id);
  return res.status(204).end();
});

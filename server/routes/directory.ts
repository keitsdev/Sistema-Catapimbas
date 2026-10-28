import { Router } from "express";
import { z } from "zod";
import { authenticate, requireInstitution } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";
import { loadUsers } from "../services/users.js";

export const directoryRouter = Router();
directoryRouter.use(authenticate, requireInstitution("institution_admin", "coordinator"));

interface MemberRow {
  id: string;
  user_id: string;
  role: string;
  status: string;
  rejection_reason: string | null;
  status_reason: string | null;
  created_at: string;
  scope_project_id: string | null;
  scope_board_id: string | null;
  organization: string | null;
}

directoryRouter.get(
  "/members",
  validate({
    query: z.object({
      role: z.enum(["institution_admin", "coordinator", "advisor", "evaluator", "student"]).optional(),
      status: z.enum(["approved", "blocked", "revoked", "rejected", "pending"]).optional(),
    }),
  }),
  async (req, res) => {
    const { role, status } = req.query as { role?: string; status?: string };
    
    let q = getAdminSupabase()
      .from("institutional_memberships")
      .select("id,user_id,role,status,rejection_reason,status_reason,created_at,scope_project_id,scope_board_id,organization")
      .eq("institution_id", req.auth!.institutionId);

    if (role) q = q.eq("role", role);
    if (status) q = q.eq("status", status);
    
    if (req.auth!.role === "coordinator") q = q.neq("status", "pending");

    const rows = (assertDatabaseResult(await q.order("created_at", { ascending: false })) ?? []) as MemberRow[];

    const userIds = rows.map((r) => r.user_id);
    const users = await loadUsers(userIds);

    return res.json({
      data: rows.map((r) => ({
        membershipId: r.id,
        userId: r.user_id,
        name: users.get(r.user_id)?.name ?? "",
        email: users.get(r.user_id)?.email ?? "",
        role: r.role,
        status: r.status,
        reason: r.rejection_reason ?? r.status_reason,
        organization: r.organization,
        invitedFor: r.scope_project_id ? { boardId: r.scope_board_id, projectId: r.scope_project_id } : null,
      })),
    });
  },
);
import { Router } from "express";
import { z } from "zod";
import { authenticate, requireInstitution } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";
import { loadUsers } from "../services/users.js";

export const auditRouter = Router();

const query = z.object({
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  changes: Record<string, unknown> | null;
  created_at: string;
}

auditRouter.get("/", authenticate, requireInstitution("institution_admin"), validate({ query }), async (req, res) => {
  const q = req.query as unknown as z.infer<typeof query>;

  let queryBuilder = getAdminSupabase()
    .from("audit_logs")
    .select("id,actor_id,action,entity_type,entity_id,changes,created_at", { count: "exact" })
    .eq("institution_id", req.auth!.institutionId);

  if (q.action) {
    queryBuilder = queryBuilder.ilike("action", `${q.action.replace(/[%,]/g, "")}%`);
  }
  if (q.entityType) {
    queryBuilder = queryBuilder.eq("entity_type", q.entityType);
  }

  const result = await queryBuilder
    .order("created_at", { ascending: false })
    .range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1);

  const rows = assertDatabaseResult(result) as AuditLogRow[];

  const actorIds = rows.map((r) => r.actor_id).filter((id): id is string => Boolean(id));
  const users = await loadUsers(actorIds);

  return res.json({
    data: rows.map((r) => ({
      ...r,
      actorName: r.actor_id ? users.get(r.actor_id)?.name ?? null : null,
    })),
    pagination: {
      page: q.page,
      pageSize: q.pageSize,
      total: result.count ?? 0,
    },
  });
});
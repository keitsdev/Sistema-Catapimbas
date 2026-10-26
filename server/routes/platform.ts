import { Router } from "express";
import { z } from "zod";
import { authenticate, requireSystemRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";
import { audit } from "../services/audit.js";
import { findUserByEmail, loadUsers } from "../services/users.js";

export const platformRouter = Router();
platformRouter.use(authenticate, requireSystemRole("superadmin"));

interface InstitutionRow {
  id: string;
  name: string;
  status: string;
}

interface MembershipRow {
  id: string;
  institution_id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
  institutions: { name: string } | Array<{ name: string }> | null;
}

platformRouter.get("/overview", async (_req, res) => {
  const db = getAdminSupabase();

  const institutions = (assertDatabaseResult(
    await db.from("institutions").select("id,name,status").order("name")
  ) ?? []) as InstitutionRow[];

  const count = async (table: string, f?: (q: any) => any) => {
    const r = await (f ?? ((q: unknown) => q))(db.from(table).select("*", { count: "exact", head: true }));
    return r.count ?? 0;
  };

  const perInstitution = await Promise.all(
    institutions.map(async (i) => ({
      ...i,
      people: await count("institutional_memberships", (q) =>
        q.eq("institution_id", i.id).eq("status", "approved")
      ),
      projects: await count("projects", (q) =>
        q.eq("institution_id", i.id).is("archived_at", null)
      ),
    }))
  );

  return res.json({
    data: {
      institutions: institutions.length,
      active: institutions.filter((i) => i.status === "active").length,
      projects: await count("projects", (q) => q.is("archived_at", null)),
      boards: await count("boards", (q) => q.is("archived_at", null)),
      pendingMemberships: await count("institutional_memberships", (q) => q.eq("status", "pending")),
      perInstitution,
    },
  });
});

platformRouter.get(
  "/memberships",
  validate({
    query: z.object({
      status: z.enum(["pending", "approved", "rejected", "blocked", "revoked"]).default("pending"),
    }),
  }),
  async (req, res) => {
    const statusQuery = (req.query as { status: string }).status;

    const rows = (assertDatabaseResult(
      await getAdminSupabase()
        .from("institutional_memberships")
        .select("id,institution_id,user_id,role,status,created_at,institutions(name)")
        .eq("status", statusQuery)
        .order("created_at")
    ) ?? []) as MembershipRow[];

    const userIds = rows.map((r) => r.user_id);
    const users = await loadUsers(userIds);

    return res.json({
      data: rows.map((r) => ({
        ...r,
        name: users.get(r.user_id)?.name ?? "",
        email: users.get(r.user_id)?.email ?? "",
      })),
    });
  }
);

platformRouter.get(
  "/audit-logs",
  validate({
    query: z.object({
      institutionId: z.string().uuid().optional(),
      action: z.string().trim().max(60).optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(30),
    }),
  }),
  async (req, res) => {
    const q = req.query as unknown as { institutionId?: string; action?: string; page: number; pageSize: number };
    let db = getAdminSupabase().from("audit_logs").select("*", { count: "exact" });

    if (q.institutionId) db = db.eq("institution_id", q.institutionId);
    if (q.action) db = db.ilike("action", `${q.action.replace(/[%,]/g, "")}%`);

    const result = await db
      .order("created_at", { ascending: false })
      .range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1);

    return res.json({
      data: assertDatabaseResult(result),
      pagination: { page: q.page, pageSize: q.pageSize, total: result.count ?? 0 },
    });
  }
);

platformRouter.post(
  "/institutions/:id/admins",
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ email: z.string().trim().toLowerCase().email() }),
  }),
  async (req, res) => {
    const institutionId = req.params.id as string;
    const db = getAdminSupabase();

    const inst = assertDatabaseResult(
      await db.from("institutions").select("id").eq("id", institutionId).maybeSingle()
    ) as { id: string } | null;

    if (!inst) throw new HttpError(404, "NOT_FOUND", "Instituição não encontrada");

    const user = await findUserByEmail(req.body.email);
    if (!user) throw new HttpError(404, "USER_NOT_FOUND", "Nenhum usuário com este e-mail. Peça que ele crie a conta primeiro.");

    const now = new Date().toISOString();

    const m = assertDatabaseResult(
      await db
        .from("institutional_memberships")
        .upsert(
          {
            institution_id: inst.id,
            user_id: user.id,
            role: "institution_admin",
            status: "approved",
            rejection_reason: null,
            status_reason: null,
            approved_by: req.auth!.user.id,
            approved_at: now,
            updated_by: req.auth!.user.id,
            updated_at: now,
          },
          { onConflict: "institution_id,user_id" }
        )
        .select("id")
        .single()
    ) as { id: string };

    await audit(req, "membership.designate_admin", "institutional_membership", m.id, { email: req.body.email }, inst.id);
    return res.status(201).json({ data: { membershipId: m.id } });
  }
);
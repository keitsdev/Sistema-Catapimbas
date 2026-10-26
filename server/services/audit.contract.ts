import type { Request } from "express";
import { getAdminSupabase } from "../lib/supabase.js";

const SENSITIVE = /pass(word)?|senha|token|secret|authorization|api[-_]?key/i;
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !SENSITIVE.test(k)).map(([k, v]) => [k, redact(v)]));
  return value;
}

export async function audit(req: Request, action: string, entityType: string, entityId: string, changes?: unknown, institutionId?: string | null) {
  const { error } = await getAdminSupabase().from("audit_logs").insert({
    institution_id: institutionId === undefined ? (req.auth?.institutionId ?? null) : institutionId,
    actor_id: req.auth?.user.id ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    changes: changes === undefined ? null : redact(changes),
    ip_address: req.ip ?? null,
    user_agent: req.header("user-agent")?.slice(0, 300) ?? null,
  });
  if (error) console.error("[audit] falha ao gravar", error.message);
}

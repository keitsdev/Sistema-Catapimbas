import { getAdminSupabase } from "../lib/supabase.js";

export interface UserCard { id: string; name: string; email: string }

export async function loadUsers(ids: string[]): Promise<Map<string, UserCard>> {
  const unique = [...new Set(ids)];
  const out = new Map<string, UserCard>();
  const db = getAdminSupabase();
  for (let i = 0; i < unique.length; i += 10) {
    await Promise.all(unique.slice(i, i + 10).map(async (id) => {
      const { data } = await db.auth.admin.getUserById(id);
      if (data.user) out.set(id, { id, email: data.user.email ?? "", name: String(data.user.user_metadata?.name ?? data.user.email ?? "") });
    }));
  }
  return out;
}

export async function findUserByEmail(email: string) {
  const db = getAdminSupabase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) return undefined;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return undefined;
  }
  return undefined;
}

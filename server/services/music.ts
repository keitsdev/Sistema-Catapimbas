import { getAdminSupabase } from "../lib/supabase.js";

export const MUSIC_BUCKET = "winner-music";
export const STORAGE_PREFIX = `storage:${MUSIC_BUCKET}/`;
const SIGNED_URL_SECONDS = 3600;

export const isStoredMusic = (url: string | null | undefined): url is string => !!url && url.startsWith(STORAGE_PREFIX);

export async function playableMusicUrl(url: string | null): Promise<string | null> {
  if (!isStoredMusic(url)) return url;
  const { data } = await getAdminSupabase().storage.from(MUSIC_BUCKET).createSignedUrl(url.slice(STORAGE_PREFIX.length), SIGNED_URL_SECONDS);
  return data?.signedUrl ?? null;
}

export async function removeStoredMusic(url: string | null | undefined) {
  if (!isStoredMusic(url)) return;
  const { error } = await getAdminSupabase().storage.from(MUSIC_BUCKET).remove([url.slice(STORAGE_PREFIX.length)]);
  if (error) console.error("[music] falha ao remover arquivo antigo", error.message);
}

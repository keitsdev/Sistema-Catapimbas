import { randomUUID } from "node:crypto";
import express, { Router } from "express";
import { z } from "zod";
import { authenticate, requireInstitution } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";
import { audit } from "../services/audit.js";
import { detectAudio } from "../services/audio-signature.js";
import { MUSIC_BUCKET, STORAGE_PREFIX, playableMusicUrl, removeStoredMusic } from "../services/music.js";

export const presentationMusicRouter = Router();
const guard = [authenticate, requireInstitution("institution_admin", "coordinator")];
const params = validate({ params: z.object({ id: z.string().uuid() }) });
const MAX_BYTES = 20 * 1024 * 1024;

interface SettingsRow { music_url: string | null }

async function ownBoard(institutionId: string, boardId: string) {
  const board = assertDatabaseResult(await getAdminSupabase().from("boards").select("id").eq("id", boardId).eq("institution_id", institutionId).is("archived_at", null).maybeSingle());
  if (!board) throw new HttpError(404, "BOARD_NOT_FOUND", "Banca não encontrada");
}

presentationMusicRouter.put(
  "/:id/presentation/music",
  ...guard,
  params,
  express.raw({ type: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "application/ogg"], limit: MAX_BYTES }),
  async (req, res) => {
    const boardId = String(req.params.id);
    const institutionId = req.auth!.institutionId!;
    await ownBoard(institutionId, boardId);

    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Envie um arquivo MP3, WAV ou OGG");
    const detected = detectAudio(body);
    if (!detected) throw new HttpError(422, "INVALID_AUDIO", "O conteúdo do arquivo não é um áudio MP3, WAV ou OGG válido");

    const db = getAdminSupabase();
    const previous = assertDatabaseResult(await db.from("presentation_settings").select("music_url").eq("board_id", boardId).eq("institution_id", institutionId).maybeSingle()) as unknown as SettingsRow | null;

    const path = `${institutionId}/${boardId}/${randomUUID()}.${detected.ext}`;
    const upload = await db.storage.from(MUSIC_BUCKET).upload(path, body, { contentType: detected.mime, upsert: false });
    if (upload.error) throw new HttpError(502, "STORAGE_ERROR", "Não foi possível guardar o arquivo de áudio");

    const rawName = String(req.header("x-file-name") ?? "").replace(/[\u0000-\u001f]/g, "").slice(0, 180);
    const title = rawName.replace(/\.[^.]+$/, "") || "Música do pódio";
    try {
      assertDatabaseResult(
        await db.from("presentation_settings").upsert(
          { board_id: boardId, institution_id: institutionId, music_enabled: true, music_title: title, music_url: `${STORAGE_PREFIX}${path}`, updated_by: req.auth!.user.id },
          { onConflict: "board_id" },
        ),
      );
    } catch (error) {
      await db.storage.from(MUSIC_BUCKET).remove([path]);
      throw error;
    }
    await removeStoredMusic(previous?.music_url);
    await audit(req, "presentation.music_upload", "board", boardId, { title, bytes: body.length, type: detected.mime });
    return res.json({ data: { musicTitle: title, musicUrl: await playableMusicUrl(`${STORAGE_PREFIX}${path}`), musicIsFile: true } });
  },
);

presentationMusicRouter.delete("/:id/presentation/music", ...guard, params, async (req, res) => {
  const boardId = String(req.params.id);
  const institutionId = req.auth!.institutionId!;
  await ownBoard(institutionId, boardId);
  const db = getAdminSupabase();
  const previous = assertDatabaseResult(await db.from("presentation_settings").select("music_url").eq("board_id", boardId).eq("institution_id", institutionId).maybeSingle()) as unknown as SettingsRow | null;
  assertDatabaseResult(await db.from("presentation_settings").update({ music_enabled: false, music_url: null, music_title: null, updated_by: req.auth!.user.id }).eq("board_id", boardId).eq("institution_id", institutionId));
  await removeStoredMusic(previous?.music_url);
  await audit(req, "presentation.music_remove", "board", boardId);
  return res.status(204).end();
});

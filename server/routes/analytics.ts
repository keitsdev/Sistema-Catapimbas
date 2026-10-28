import { Router } from "express";
import { z } from "zod";
import { authenticate, requireInstitution } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";
import { exportProjects, exportRanking } from "../services/export.js";
import { isStoredMusic, playableMusicUrl } from "../services/music.js";
import { calculateRanking } from "../services/ranking.js";

export const analyticsRouter = Router();
analyticsRouter.use(authenticate, requireInstitution());

analyticsRouter.get("/dashboard", async (req, res) => {
  const data = assertDatabaseResult(
    await getAdminSupabase().rpc("institution_dashboard", {
      p_institution_id: req.auth!.institutionId,
      p_year: req.query.year ? Number(req.query.year) : null,
      p_semester: req.query.semester ? Number(req.query.semester) : null,
    }),
  );
  return res.json({ data });
});

analyticsRouter.get(
  "/boards/:id/ranking",
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const data = await calculateRanking(req.auth!.institutionId!, String(req.params.id));
    if (
      data.board.resultsStatus !== "published" &&
      !["institution_admin", "coordinator"].includes(req.auth!.role!)
    ) {
      throw new HttpError(403, "RESULTS_NOT_PUBLISHED", "Os resultados ainda não foram publicados");
    }
    return res.json({ data });
  },
);

const storedUrl = (settings: unknown) => (settings as { music_url: string | null }).music_url;

analyticsRouter.get(
  "/boards/:id/presentation",
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const ranking = await calculateRanking(req.auth!.institutionId!, String(req.params.id));
    if (
      ranking.board.resultsStatus !== "published" &&
      !["institution_admin", "coordinator"].includes(req.auth!.role!)
    ) {
      throw new HttpError(403, "RESULTS_NOT_PUBLISHED", "Os resultados ainda não foram publicados");
    }
    const settings = assertDatabaseResult(
      await getAdminSupabase()
        .from("presentation_settings")
        .select("music_enabled,music_title,music_url,volume,reveal_delay_ms,confetti_enabled")
        .eq("board_id", req.params.id)
        .eq("institution_id", req.auth!.institutionId)
        .maybeSingle(),
    );
    return res.json({
      data: {
        ranking,
        podium: ranking.entries.filter((entry) => entry.rank <= 3),
        presentation: settings ? { ...settings, music_url: await playableMusicUrl(storedUrl(settings)), music_is_file: isStoredMusic(storedUrl(settings)) } : {
          music_enabled: false,
          music_title: null,
          music_url: null,
          volume: 0.8,
          reveal_delay_ms: 1000,
          confetti_enabled: true,
        },
      },
    });
  },
);

analyticsRouter.get("/reports/projects.xlsx", async (req, res) => {
  const buffer = await exportProjects(req.auth!.institutionId!, req.query, req.auth!);
  res
    .status(200)
    .set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="projetos.xlsx"',
    })
    .send(Buffer.from(buffer));
});

analyticsRouter.get(
  "/reports/boards/:id/ranking.xlsx",
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const buffer = await exportRanking(req.auth!.institutionId!, String(req.params.id), req.auth!);
    res
      .status(200)
      .set({
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="ranking.xlsx"',
      })
      .send(Buffer.from(buffer));
  },
);

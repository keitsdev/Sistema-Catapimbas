import { Router } from "express";
import { z } from "zod";
import { authenticate, requireInstitution } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { HttpError, assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase } from "../lib/supabase.js";
import { audit } from "../services/audit.js";

export const boardsRouter = Router();

const boardFields = z.object({
  name: z.string().trim().min(3).max(180),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  status: z.enum(["draft", "open", "closed", "archived"]).default("draft"),
  results_status: z.enum(["draft", "published"]).default("draft"),
  tie_policy: z.enum(["competition", "dense"]).default("competition"),
  score_precision: z.number().int().min(0).max(4).default(2),
});

const boardSchema = boardFields.refine(
  (value) => new Date(value.ends_at) > new Date(value.starts_at),
  {
    message: "O término deve ser posterior ao início",
    path: ["ends_at"],
  },
);

boardsRouter.use(authenticate, requireInstitution());

boardsRouter.get("/", async (req, res) => {
  const data = assertDatabaseResult(
    await getAdminSupabase()
      .from("boards")
      .select("*,board_projects(count),board_evaluators(count),criteria(count)")
      .eq("institution_id", req.auth!.institutionId)
      .is("archived_at", null)
      .order("starts_at", { ascending: false }),
  );
  return res.json({ data });
});

boardsRouter.post(
  "/",
  requireInstitution("institution_admin", "coordinator"),
  validate({ body: boardSchema }),
  async (req, res) => {
    const board = assertDatabaseResult(
      await getAdminSupabase()
        .from("boards")
        .insert({ ...req.body, institution_id: req.auth!.institutionId })
        .select()
        .single(),
    );
    await audit(req, "create", "board", board.id, req.body);
    return res.status(201).json({ data: board });
  },
);

boardsRouter.get(
  "/:id",
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const board = assertDatabaseResult(
      await getAdminSupabase()
        .from("boards")
        .select("*,board_projects(*,projects(id,name)),board_evaluators(*),criteria(*,rubrics(*))")
        .eq("id", req.params.id)
        .eq("institution_id", req.auth!.institutionId)
        .maybeSingle(),
    );
    if (!board) throw new HttpError(404, "BOARD_NOT_FOUND", "Banca não encontrada");
    return res.json({ data: board });
  },
);

boardsRouter.patch(
  "/:id",
  requireInstitution("institution_admin", "coordinator"),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: boardFields.partial().refine((value) => Object.keys(value).length > 0),
  }),
  async (req, res) => {
    const board = assertDatabaseResult(
      await getAdminSupabase()
        .from("boards")
        .update(req.body)
        .eq("id", req.params.id)
        .eq("institution_id", req.auth!.institutionId)
        .select()
        .maybeSingle(),
    );
    if (!board) throw new HttpError(404, "BOARD_NOT_FOUND", "Banca não encontrada");
    await audit(req, "update", "board", board.id, req.body);
    return res.json({ data: board });
  },
);

boardsRouter.put(
  "/:id/participants",
  requireInstitution("institution_admin", "coordinator"),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      projectIds: z.array(z.string().uuid()).max(200),
      evaluatorIds: z.array(z.string().uuid()).max(100),
    }),
  }),
  async (req, res) => {
    const data = assertDatabaseResult(
      await getAdminSupabase().rpc("replace_board_participants", {
        p_institution_id: req.auth!.institutionId,
        p_board_id: req.params.id,
        p_project_ids: req.body.projectIds,
        p_evaluator_ids: req.body.evaluatorIds,
        p_actor_id: req.auth!.user.id,
      }),
      "Não foi possível atualizar os participantes",
    );
    await audit(req, "participants.replace", "board", String(req.params.id), req.body);
    return res.json({ data });
  },
);

boardsRouter.put(
  "/:id/criteria",
  requireInstitution("institution_admin", "coordinator"),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      criteria: z
        .array(
          z
            .object({
              id: z.string().uuid().optional(),
              title: z.string().trim().min(3).max(180),
              description: z.string().trim().max(2000),
              weight: z.number().positive().max(1000),
              minimumScore: z.number().int(),
              maximumScore: z.number().int(),
              rubrics: z
                .array(
                  z.object({
                    score: z.number().int(),
                    descriptor: z.string().trim().min(3).max(2000),
                  }),
                )
                .min(1),
            })
            .refine((value) => value.maximumScore > value.minimumScore, {
              message: "A nota máxima deve ser maior que a mínima",
            }),
        )
        .min(1)
        .max(50),
    }),
  }),
  async (req, res) => {
    const data = assertDatabaseResult(
      await getAdminSupabase().rpc("replace_board_criteria", {
        p_institution_id: req.auth!.institutionId,
        p_board_id: req.params.id,
        p_criteria: req.body.criteria,
        p_actor_id: req.auth!.user.id,
      }),
      "Não foi possível atualizar os critérios",
    );
    await audit(req, "criteria.replace", "board", String(req.params.id), req.body);
    return res.json({ data });
  },
);

boardsRouter.put(
  "/:id/presentation",
  requireInstitution("institution_admin", "coordinator"),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      musicEnabled: z.boolean(),
      musicTitle: z.string().trim().max(180).nullable(),
      musicUrl: z.string().url().max(2000).nullable(),
      volume: z.number().min(0).max(1).default(0.8),
      revealDelayMs: z.number().int().min(0).max(60_000).default(1000),
      confettiEnabled: z.boolean().default(true),
    }),
  }),
  async (req, res) => {
    if (req.body.musicEnabled && !req.body.musicUrl) {
      throw new HttpError(422, "MUSIC_URL_REQUIRED", "Informe a URL da música habilitada");
    }
    const data = assertDatabaseResult(
      await getAdminSupabase()
        .from("presentation_settings")
        .upsert(
          {
            board_id: req.params.id,
            institution_id: req.auth!.institutionId,
            music_enabled: req.body.musicEnabled,
            music_title: req.body.musicTitle,
            music_url: req.body.musicUrl,
            volume: req.body.volume,
            reveal_delay_ms: req.body.revealDelayMs,
            confetti_enabled: req.body.confettiEnabled,
            updated_by: req.auth!.user.id,
          },
          { onConflict: "board_id" },
        )
        .select()
        .single(),
    );
    await audit(req, "presentation.update", "board", String(req.params.id), req.body);
    return res.json({ data });
  },
);

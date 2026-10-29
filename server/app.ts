import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";
import { getEnv } from "./config/env.js";
import { getAdminSupabase } from "./lib/supabase.js";
import { LEGACY_SCHEMA } from "./repositories/legacy-users.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { openApiDocument } from "./openapi.js";
import { analyticsRouter } from "./routes/analytics.js";
import { authRouter } from "./routes/auth.js";
import { boardsRouter } from "./routes/boards.js";
import { evaluationsRouter } from "./routes/evaluations.js";
import { institutionsRouter } from "./routes/institutions.js";
import { membersRouter } from "./routes/members.js";
import { projectsRouter } from "./routes/projects.js";
import { auditRouter } from "./routes/audit-logs.js";
import { boardsExtraRouter } from "./routes/boards-extra.js";
import { directoryRouter } from "./routes/directory.js";
import { platformRouter } from "./routes/platform.js";
import { invitationsRouter } from "./routes/invitations.js";
import { presentationMusicRouter } from "./routes/presentation-music.js";
import { projectsExtraRouter } from "./routes/projects-extra.js";
import { publicRouter } from "./routes/public.js";
import { sessionRouter } from "./routes/session.js";
import { legacyAccountsRouter } from "./routes/legacy-accounts.js";

export function createApp() {
  const env = getEnv();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(
    pinoHttp({
      level: env.LOG_LEVEL,
      redact: ["req.headers.authorization", "req.body.password"],
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(",").map((origin) => origin.trim()),
      credentials: false,
      allowedHeaders: ["authorization", "content-type", "x-institution-id", "x-request-id"],
      exposedHeaders: ["content-disposition", "x-request-id"],
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );

  const api = express.Router();
  api.get("/health", (_req, res) =>
    res.json({ status: "ok", timestamp: new Date().toISOString() }),
  );
  api.get("/health/ready", async (_req, res) => {
    try {
      const db = getAdminSupabase();
      const checks = await Promise.all([
        db.from(LEGACY_SCHEMA.users).select("id,nome,email,status,auth_user_id", { head: true }).limit(1),
        db.from(LEGACY_SCHEMA.memberships).select("usuario_id,instituicao_id,papel,situacao,justificativa", { head: true }).limit(1),
        db.from(LEGACY_SCHEMA.institutions).select("id,nome,identificador,status", { head: true }).limit(1),
        db.from("AuditoriaIntegracaoContas").select("id,acao,criado_em", { head: true }).limit(1),
        db.from("SolicitacaoExclusaoConta").select("id,auth_user_id,motivo,situacao", { head: true }).limit(1),
      ]);
      const error = checks.find((check) => check.error)?.error;
      if (error) {
        const schemaMismatch = ["PGRST204", "PGRST205", "42703", "42P01"].includes(error.code ?? "");
        return res.status(503).json({
          status: "not_ready",
          checks: { api: "ok", supabase: schemaMismatch ? "schema_mismatch" : "unavailable" },
          message: schemaMismatch
            ? "Supabase respondeu, mas faltam tabelas/colunas portuguesas necessárias para o fluxo de contas. Confira a migration legada."
            : "Não foi possível validar o acesso do backend ao Supabase.",
        });
      }
      return res.json({ status: "ready", checks: { api: "ok", supabase: "ok", schema: "ok" } });
    } catch {
      return res.status(503).json({
        status: "not_ready",
        checks: { api: "ok", supabase: "unavailable" },
        message: "Não foi possível validar o acesso do backend ao Supabase. Confira a configuração do servidor.",
      });
    }
  });
  api.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
  api.use("/public", publicRouter);
  api.use("/legacy", legacyAccountsRouter);
  api.use("/auth", authRouter);
  api.use("/auth", sessionRouter);
  api.use("/institutions", institutionsRouter);
  api.use("/members", membersRouter);
  api.use("/projects", projectsRouter);
  api.use("/projects", projectsExtraRouter);
  api.use("/boards", boardsRouter);
  api.use("/boards", boardsExtraRouter);
  api.use("/boards", presentationMusicRouter);
  api.use("/invitations", invitationsRouter);
  api.use("/directory", directoryRouter);
  api.use("/platform", platformRouter);
  api.use("/audit-logs", auditRouter);
  api.use("/evaluations", evaluationsRouter);
  api.use(analyticsRouter);

  app.use(env.API_BASE_PATH, api);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

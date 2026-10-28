import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { getEnv } from "../config/env.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { HttpError } from "../lib/http-error.js";
import { getPublicSupabase } from "../lib/supabase.js";
import { carregarPerfilLegado } from "../repositories/legacy-users.js";

export const authRouter = Router();

const credentialsLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

authRouter.post(
  "/register",
  credentialsLimiter,
  validate({
    body: z.object({
      name: z.string().trim().min(3).max(120),
      email: z.string().email().max(254),
      password: z.string().min(8).max(72),
    }),
  }),
  async (req, res) => {
    const { name, email, password } = req.body;
    const { data, error } = await getPublicSupabase().auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) {
      return res.status(400).json({
        error: { code: "REGISTRATION_FAILED", message: error.message },
      });
    }
    return res.status(201).json({
      user: data.user ? { id: data.user.id, email: data.user.email, name } : null,
      emailConfirmationRequired: !data.session,
    });
  },
);

authRouter.post(
  "/login",
  credentialsLimiter,
  validate({
    body: z.object({
      email: z.string().email(),
      password: z.string().min(1).max(72),
    }),
  }),
  async (req, res) => {
    const { data, error } = await getPublicSupabase().auth.signInWithPassword(req.body);
    if (error) {
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "E-mail ou senha inválidos",
        },
      });
    }
    if (!data.user || !data.session) {
      throw new HttpError(401, "SESSION_UNAVAILABLE", "A autenticação não retornou uma sessão ativa");
    }
    const profile = await carregarPerfilLegado(
      data.user.id,
      data.user.email ?? req.body.email,
      data.user.app_metadata?.system_role === "superadmin",
    );
    return res.json({
      ...profile,
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
      },
    });
  },
);

authRouter.post(
  "/password/reset",
  credentialsLimiter,
  validate({ body: z.object({ email: z.string().email() }) }),
  async (req, res) => {
    await getPublicSupabase().auth.resetPasswordForEmail(req.body.email, {
      redirectTo: getEnv().CORS_ORIGINS.split(",")[0]?.trim(),
    });
    return res.status(202).json({
      message: "Se o e-mail existir, as instruções de recuperação serão enviadas.",
    });
  },
);

authRouter.get("/me", authenticate, async (req, res) => {
  const profile = await carregarPerfilLegado(
    req.auth!.user.id,
    req.auth!.user.email ?? "",
    req.auth!.systemRole === "superadmin",
  );
  return res.json(profile);
});

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { getEnv } from "../config/env.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { assertDatabaseResult } from "../lib/http-error.js";
import { getAdminSupabase, getPublicSupabase } from "../lib/supabase.js";

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
    return res.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name,
      },
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
  const memberships = assertDatabaseResult(
    await getAdminSupabase()
      .from("institutional_memberships")
      .select("institution_id,role,status,institutions(id,name,slug,status)")
      .eq("user_id", req.auth!.user.id),
  );
  return res.json({
    user: {
      id: req.auth!.user.id,
      email: req.auth!.user.email,
      name: req.auth!.user.user_metadata?.name,
      systemRole: req.auth!.systemRole,
    },
    memberships,
  });
});

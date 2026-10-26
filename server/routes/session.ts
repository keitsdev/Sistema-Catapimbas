import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { HttpError } from "../lib/http-error.js";
import { getAdminSupabase, getPublicSupabase } from "../lib/supabase.js";
import { audit } from "../services/audit.js";

export const sessionRouter = Router();
const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });

sessionRouter.post("/logout", authenticate, async (req, res) => {
  const token = req.header("authorization")!.split(" ")[1];
  await getAdminSupabase().auth.admin.signOut(token);
  return res.status(204).end();
});

sessionRouter.post(
  "/password/change",
  limiter,
  authenticate,
  validate({ body: z.object({ currentPassword: z.string().min(1).max(72), newPassword: z.string().min(8).max(72) }) }),
  async (req, res) => {
    const email = req.auth!.user.email;
    const check = email ? await getPublicSupabase().auth.signInWithPassword({ email, password: req.body.currentPassword }) : undefined;
    if (!check || check.error) throw new HttpError(401, "INVALID_CREDENTIALS", "A senha atual está incorreta");
    const { error } = await getAdminSupabase().auth.admin.updateUserById(req.auth!.user.id, { password: req.body.newPassword });
    if (error) throw new HttpError(422, "WEAK_PASSWORD", "A nova senha não foi aceita");
    await audit(req, "password.change", "user", req.auth!.user.id, undefined, null);
    return res.status(204).end();
  },
);

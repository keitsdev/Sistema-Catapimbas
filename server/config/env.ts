import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().optional(),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_BASE_PATH: z.string().startsWith("/").default("/api/v1"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20).optional(),
  SUPABASE_ANON_KEY: z.string().min(20).optional(),
  SUPABASE_SECRET_KEY: z.string().min(20).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("winner-music"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
}).superRefine((env, context) => {
  if (!env.SUPABASE_PUBLISHABLE_KEY && !env.SUPABASE_ANON_KEY) {
    context.addIssue({ code: "custom", path: ["SUPABASE_PUBLISHABLE_KEY"], message: "Configure SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_ANON_KEY legado)" });
  }
  if (!env.SUPABASE_SECRET_KEY && !env.SUPABASE_SERVICE_ROLE_KEY) {
    context.addIssue({ code: "custom", path: ["SUPABASE_SECRET_KEY"], message: "Configure SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY legado)" });
  }
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      throw new Error(`Variáveis de ambiente inválidas: ${result.error.message}`);
    }
    cached = result.data;
  }
  return cached;
}

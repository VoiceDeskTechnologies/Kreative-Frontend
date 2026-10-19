import { z } from "zod";

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);
const optionalUrl = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined)
  .pipe(z.string().url().optional());

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HOST: z.string().min(1).default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    CORS_ALLOWED_ORIGINS: z
      .string()
      .default("http://localhost:5173,http://localhost:3000")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    APP_VERSION: z.string().min(1).default("0.1.0"),
    SUPABASE_URL: optionalUrl,
    SUPABASE_ANON_KEY: optionalSecret,
    SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
    ADMIN_EMAILS: z
      .string()
      .default("")
      .transform((value) =>
        new Set(
          value
            .split(",")
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
        ),
      ),
    AI_PROVIDER: z.enum(["none", "openai", "gemini"]).default("none"),
    OPENAI_API_KEY: optionalSecret,
    OPENAI_MODEL: optionalSecret,
    OPENAI_AUDIO_MODEL: optionalSecret,
    GEMINI_API_KEY: optionalSecret,
    GEMINI_MODEL: optionalSecret,
    GEMINI_AUDIO_MODEL: optionalSecret,
    RESEND_API_KEY: optionalSecret,
    SUPPORT_EMAIL_FROM: optionalSecret,
    PAYPAL_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    PAYPAL_ENVIRONMENT: z.enum(["sandbox", "live"]).default("sandbox"),
    PAYPAL_CLIENT_ID: optionalSecret,
    PAYPAL_CLIENT_SECRET: optionalSecret,
    PAYPAL_WEBHOOK_ID: optionalSecret,
  })
  .superRefine((config, context) => {
    if (
      config.NODE_ENV === "production" &&
      config.CORS_ALLOWED_ORIGINS.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message:
          "CORS_ALLOWED_ORIGINS must include the exact deployed frontend origin.",
        path: ["CORS_ALLOWED_ORIGINS"],
      });
    }
    const supabaseConfigured = Boolean(
      config.SUPABASE_URL || config.SUPABASE_ANON_KEY,
    );
    if (
      supabaseConfigured &&
      (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "SUPABASE_URL and SUPABASE_ANON_KEY must be configured together.",
        path: ["SUPABASE_URL"],
      });
    }
    if (config.SUPABASE_SERVICE_ROLE_KEY && !config.SUPABASE_URL) {
      context.addIssue({
        code: "custom",
        message: "SUPABASE_SERVICE_ROLE_KEY requires SUPABASE_URL.",
        path: ["SUPABASE_SERVICE_ROLE_KEY"],
      });
    }
    if (config.AI_PROVIDER === "openai" && !config.OPENAI_API_KEY) {
      context.addIssue({
        code: "custom",
        message: "OPENAI_API_KEY is required when AI_PROVIDER=openai.",
        path: ["OPENAI_API_KEY"],
      });
    }
    if (config.AI_PROVIDER === "gemini" && !config.GEMINI_API_KEY) {
      context.addIssue({
        code: "custom",
        message: "GEMINI_API_KEY is required when AI_PROVIDER=gemini.",
        path: ["GEMINI_API_KEY"],
      });
    }
    if (Boolean(config.RESEND_API_KEY) !== Boolean(config.SUPPORT_EMAIL_FROM)) {
      context.addIssue({
        code: "custom",
        message: "RESEND_API_KEY and SUPPORT_EMAIL_FROM must be configured together for support email replies.",
        path: ["RESEND_API_KEY"],
      });
    }
    if (
      config.PAYPAL_ENABLED &&
      (!config.PAYPAL_CLIENT_ID ||
        !config.PAYPAL_CLIENT_SECRET ||
        !config.PAYPAL_WEBHOOK_ID)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, and PAYPAL_WEBHOOK_ID are required when PAYPAL_ENABLED=true.",
        path: ["PAYPAL_ENABLED"],
      });
    }
    if (
      config.NODE_ENV === "production" &&
      config.CORS_ALLOWED_ORIGINS.some((origin) =>
        origin.startsWith("http://localhost"),
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Set CORS_ALLOWED_ORIGINS to the exact deployed frontend origin in production.",
        path: ["CORS_ALLOWED_ORIGINS"],
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const result = envSchema.safeParse(environment);
  if (!result.success) {
    const details = result.error.issues.map((issue) => issue.message).join(" ");
    throw new Error(`Invalid backend environment configuration: ${details}`);
  }
  return result.data;
}

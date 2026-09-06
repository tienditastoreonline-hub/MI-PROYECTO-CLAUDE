import 'server-only';

import { z } from 'zod';

/**
 * Variables de entorno de servidor.
 *
 * `server-only` hace que el build falle si este módulo acaba en un bundle de
 * cliente: es la red de seguridad que impide filtrar la service_role, la clave
 * de Vapi o la clave de cifrado al navegador.
 *
 * El parseo es perezoso para que un `.env` incompleto no rompa páginas que no
 * necesitan estas variables (p. ej. el login antes de configurar Google).
 */
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'Falta SUPABASE_SERVICE_ROLE_KEY'),

  VAPI_API_KEY: z.string().min(1, 'Falta VAPI_API_KEY'),
  VAPI_WEBHOOK_SECRET: z.string().min(16, 'VAPI_WEBHOOK_SECRET debe tener al menos 16 caracteres'),

  VAPI_DEFAULT_MODEL: z.string().default('gpt-4o'),
  VAPI_DEFAULT_MODEL_PROVIDER: z.string().default('openai'),
  VAPI_DEFAULT_VOICE_PROVIDER: z.string().default('azure'),
  VAPI_DEFAULT_VOICE_ID: z.string().default('es-MX-DaliaNeural'),
  VAPI_DEFAULT_TRANSCRIBER: z.string().default('deepgram'),
  VAPI_FALLBACK_VOICE_PROVIDER: z.string().default('vapi'),
  VAPI_FALLBACK_VOICE_ID: z.string().default('Elliot'),

  GOOGLE_CLIENT_ID: z.string().min(1, 'Falta GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'Falta GOOGLE_CLIENT_SECRET'),
  GOOGLE_REDIRECT_URI: z.string().url('GOOGLE_REDIRECT_URI debe ser una URL absoluta'),

  APP_URL: z.string().url('APP_URL debe ser una URL absoluta'),

  // 32 bytes en hexadecimal → AES-256.
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY debe ser hexadecimal de 64 caracteres (32 bytes)'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const detalles = parsed.error.issues.map((i) => `  · ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variables de entorno de servidor inválidas:\n${detalles}`);
  }

  cached = parsed.data;
  return cached;
}

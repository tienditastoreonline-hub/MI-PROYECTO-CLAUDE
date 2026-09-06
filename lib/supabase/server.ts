import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

import { getPublicEnv } from '@/lib/env';
import type { Database } from '@/lib/supabase/database.types';

/**
 * Cliente para Server Components, Server Actions y Route Handlers autenticados.
 *
 * Usa la clave pública y la cookie de sesión, así que TODAS las consultas pasan
 * por RLS: el aislamiento entre clínicas lo impone Postgres, no este código.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient<Database>(env.supabaseUrl, env.supabasePublicKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, _headers) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Un Server Component no puede escribir cookies. Es esperado: el proxy
          // refresca la sesión en cada petición, así que se puede ignorar.
        }
      },
    },
  });
}

import { createBrowserClient } from '@supabase/ssr';

import { getPublicEnv } from '@/lib/env';
import type { Database } from '@/lib/supabase/database.types';

/**
 * Cliente para componentes de cliente. `createBrowserClient` ya es un singleton
 * internamente, así que llamarlo varias veces no crea instancias nuevas.
 */
export function createClient() {
  const env = getPublicEnv();
  return createBrowserClient<Database>(env.supabaseUrl, env.supabasePublicKey);
}

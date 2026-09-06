import 'server-only';

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

import { getPublicEnv } from '@/lib/env';
import { serverEnv } from '@/lib/env.server';
import type { Database } from '@/lib/supabase/database.types';

export type AdminClient = SupabaseClient<Database>;

let cached: AdminClient | null = null;

/**
 * Cliente con `service_role`. IGNORA LA RLS POR COMPLETO.
 *
 * Existe por una sola razón: el webhook de Vapi llega sin cookie de sesión, así
 * que no hay usuario del que derivar el tenant y las políticas no pueden
 * aplicarse. Nunca debe usarse desde una vista ni desde una Server Action —
 * ahí está `lib/supabase/server.ts`, que sí pasa por RLS.
 *
 * Para no perder el aislamiento, todo acceso del webhook debe ir a través de
 * `scopedRepo()` (abajo), que fuerza el filtro por clínica.
 */
export function createAdminClient(): AdminClient {
  if (cached) return cached;

  cached = createSupabaseClient<Database>(getPublicEnv().supabaseUrl, serverEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}

/** Tablas que llevan la columna `clinic_id` y por tanto pueden acotarse por tenant. */
type TablaDeClinica =
  | 'profiles'
  | 'agent_configs'
  | 'google_credentials'
  | 'calls'
  | 'transcripts'
  | 'appointments';

/**
 * Acceso acotado a una clínica cuando se trabaja con service_role.
 *
 * Con la RLS fuera de juego, el aislamiento pasa a depender del código. En vez de
 * repartir esa responsabilidad por todos los handlers, se concentra aquí: este
 * es el único sitio que hay que auditar para saber que el webhook no cruza datos
 * entre clínicas.
 */
export function scopedRepo(clinicId: number) {
  const db = createAdminClient();

  return {
    clinicId,
    raw: db,

    /** SELECT ya filtrado por la clínica. */
    from(tabla: TablaDeClinica) {
      return db.from(tabla).select('*').eq('clinic_id', clinicId);
    },

    /** La fila de la propia clínica, que se filtra por `id` y no por `clinic_id`. */
    clinica() {
      return db.from('clinics').select('*').eq('id', clinicId).maybeSingle();
    },

    /**
     * INSERT con `clinic_id` forzado: aunque quien llame pase otro valor en el
     * payload, se sobrescribe con el de la clínica resuelta.
     */
    insert<T extends Record<string, unknown>>(tabla: TablaDeClinica, valores: T) {
      return db
        .from(tabla)
        .insert({ ...valores, clinic_id: clinicId } as never)
        .select()
        .single();
    },

    /** UPDATE acotado por clínica más el filtro que se pase. */
    update<T extends Record<string, unknown>>(tabla: TablaDeClinica, valores: T) {
      return db
        .from(tabla)
        .update(valores as never)
        .eq('clinic_id', clinicId);
    },
  };
}

export type ScopedRepo = ReturnType<typeof scopedRepo>;

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import type { AgentConfig, Clinic, Profile } from '@/lib/supabase/database.types';

export interface ContextoClinica {
  clinic: Clinic;
  profile: Profile;
  esOwner: boolean;
}

/**
 * Resuelve la clínica del usuario autenticado, o redirige.
 *
 * Se usa `getClaims()` y no `getSession()`: en servidor `getSession()` no
 * revalida el token, mientras que `getClaims()` verifica la firma del JWT contra
 * las claves públicas del proyecto.
 *
 * Las consultas de abajo pasan por RLS, así que un usuario solo puede recuperar
 * su propio perfil y su propia clínica aunque este código tuviera un fallo.
 */
export async function requireClinic(): Promise<ContextoClinica> {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (!userId) {
    redirect('/login');
  }

  const { data: profile, error: errorPerfil } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (errorPerfil) {
    throw new Error(`No se pudo cargar el perfil: ${errorPerfil.message}`);
  }

  // Un usuario autenticado sin perfil significa que el trigger de alta no llegó
  // a ejecutarse. Es un estado roto, no una sesión inválida.
  if (!profile) {
    redirect('/login?error=perfil-no-encontrado');
  }

  const { data: clinic, error: errorClinica } = await supabase
    .from('clinics')
    .select('*')
    .eq('id', profile.clinic_id)
    .maybeSingle();

  if (errorClinica || !clinic) {
    throw new Error(`No se pudo cargar la clínica: ${errorClinica?.message ?? 'no encontrada'}`);
  }

  return { clinic, profile, esOwner: profile.role === 'owner' };
}

/** Configuración del agente de la clínica activa. */
export async function getAgentConfig(clinicId: number): Promise<AgentConfig | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('agent_configs')
    .select('*')
    .eq('clinic_id', clinicId)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar la configuración del agente: ${error.message}`);
  }

  return data;
}

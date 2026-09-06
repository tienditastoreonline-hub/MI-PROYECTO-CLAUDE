'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireClinic } from '@/lib/auth/tenant';
import { createClient } from '@/lib/supabase/server';

export interface EstadoNumero {
  ok?: boolean;
  error?: string;
}

/**
 * El identificador que Vapi asigna al número es un UUID, no el `+52…`.
 * Confundirlos es el error más común al configurar esto, así que se valida la
 * forma y se rechaza explícitamente un teléfono en formato E.164.
 */
const numeroSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    'Debe ser el identificador UUID del número en Vapi, no el número de teléfono.',
  );

/**
 * Guarda el ID del número de Vapi de la clínica.
 *
 * Sin este dato, publicar crea el asistente pero no lo vincula a ningún número,
 * así que el agente no recibe llamadas entrantes. La escritura pasa por la
 * política `clinics_update`, que exige rol owner de esa misma clínica.
 */
export async function guardarNumeroVapi(
  _prev: EstadoNumero,
  formData: FormData,
): Promise<EstadoNumero> {
  const { clinic, esOwner } = await requireClinic();

  if (!esOwner) {
    return { error: 'Solo el dueño de la clínica puede asignar el número.' };
  }

  const entrada = String(formData.get('vapi_phone_number_id') ?? '').trim();

  // Vaciar el campo desvincula el número, que es una operación legítima.
  if (entrada === '') {
    const supabase = await createClient();
    const { error } = await supabase
      .from('clinics')
      .update({ vapi_phone_number_id: null })
      .eq('id', clinic.id);

    if (error) return { error: `No se pudo desvincular: ${error.message}` };

    revalidatePath('/integraciones');
    revalidatePath('/dashboard');
    return { ok: true };
  }

  const parseo = numeroSchema.safeParse(entrada);
  if (!parseo.success) {
    return { error: parseo.error.issues[0]?.message ?? 'Identificador inválido.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('clinics')
    .update({ vapi_phone_number_id: parseo.data })
    .eq('id', clinic.id);

  if (error) {
    // La columna es UNIQUE: dos clínicas no pueden compartir número, porque el
    // webhook lo usa para resolver el tenant y sería ambiguo.
    if (error.code === '23505') {
      return { error: 'Ese número ya está asignado a otra clínica.' };
    }
    return { error: `No se pudo guardar: ${error.message}` };
  }

  revalidatePath('/integraciones');
  revalidatePath('/dashboard');

  return { ok: true };
}

'use server';

import { revalidatePath } from 'next/cache';

import { configSchema } from '@/lib/agent/config-schema';
import { requireClinic } from '@/lib/auth/tenant';
import { createClient } from '@/lib/supabase/server';

export interface EstadoGuardado {
  ok?: boolean;
  error?: string;
  camposConError?: string[];
}

/**
 * Guarda la configuración del agente.
 *
 * Escribe con el cliente de cookies, así que la política RLS `agent_configs_update`
 * (que exige rol owner de esa clínica) es la que decide de verdad si el cambio se
 * aplica. La comprobación de `esOwner` de aquí solo sirve para dar un mensaje
 * legible en vez de un error de base de datos.
 */
export async function guardarConfig(
  _prev: EstadoGuardado,
  formData: FormData,
): Promise<EstadoGuardado> {
  const { clinic, esOwner } = await requireClinic();

  if (!esOwner) {
    return { error: 'Solo el dueño de la clínica puede cambiar la configuración del agente.' };
  }

  let services: unknown;
  let business_hours: unknown;

  try {
    services = JSON.parse(String(formData.get('services') ?? '[]'));
    business_hours = JSON.parse(String(formData.get('business_hours') ?? '{}'));
  } catch {
    return { error: 'No se pudieron leer los tratamientos u horarios. Recarga la página e inténtalo de nuevo.' };
  }

  const parseo = configSchema.safeParse({
    first_message: formData.get('first_message'),
    tone: formData.get('tone'),
    handoff_message: formData.get('handoff_message'),
    system_prompt_extra: formData.get('system_prompt_extra') || undefined,
    address: formData.get('address') || undefined,
    phone_e164: formData.get('phone_e164') || '',
    payment_methods: formData.get('payment_methods') || undefined,
    policies: formData.get('policies') || undefined,
    services,
    business_hours,
    voice_provider: formData.get('voice_provider'),
    voice_id: formData.get('voice_id'),
    language: formData.get('language'),
    model_provider: formData.get('model_provider'),
    model_name: formData.get('model_name'),
    slot_minutes: Number(formData.get('slot_minutes')),
    min_lead_minutes: Number(formData.get('min_lead_minutes')),
    max_advance_days: Number(formData.get('max_advance_days')),
    hipaa_enabled: formData.get('hipaa_enabled') === 'on',
  });

  if (!parseo.success) {
    const problema = parseo.error.issues[0];
    return {
      error: problema ? `${problema.path.join('.') || 'Formulario'}: ${problema.message}` : 'Datos inválidos.',
      camposConError: parseo.error.issues.map((i) => String(i.path[0] ?? '')),
    };
  }

  const datos = parseo.data;
  const supabase = await createClient();

  const { error: errorConfig } = await supabase
    .from('agent_configs')
    .update({
      first_message: datos.first_message,
      tone: datos.tone,
      handoff_message: datos.handoff_message,
      system_prompt_extra: datos.system_prompt_extra ?? null,
      clinic_info: {
        payment_methods: datos.payment_methods,
        policies: datos.policies,
      },
      services: datos.services,
      business_hours: datos.business_hours,
      voice_provider: datos.voice_provider,
      voice_id: datos.voice_id,
      language: datos.language,
      model_provider: datos.model_provider,
      model_name: datos.model_name,
      slot_minutes: datos.slot_minutes,
      min_lead_minutes: datos.min_lead_minutes,
      max_advance_days: datos.max_advance_days,
      hipaa_enabled: datos.hipaa_enabled,
    })
    .eq('clinic_id', clinic.id);

  if (errorConfig) {
    return { error: `No se pudo guardar: ${errorConfig.message}` };
  }

  // La dirección y el teléfono viven en la clínica, no en la configuración del
  // agente: el teléfono es además el destino de las transferencias a recepción.
  const { error: errorClinica } = await supabase
    .from('clinics')
    .update({
      address: datos.address ?? null,
      phone_e164: datos.phone_e164 ? datos.phone_e164 : null,
    })
    .eq('id', clinic.id);

  if (errorClinica) {
    return { error: `No se pudieron guardar los datos de la clínica: ${errorClinica.message}` };
  }

  revalidatePath('/personalizacion');
  revalidatePath('/integraciones');
  revalidatePath('/dashboard');

  return { ok: true };
}

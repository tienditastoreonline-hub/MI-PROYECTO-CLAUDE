import { createClient } from '@/lib/supabase/server';
import type { Call, Transcript } from '@/lib/supabase/database.types';

export interface FiltrosLlamadas {
  busqueda?: string;
  soloConCita?: boolean;
  /** Ventana hacia atrás en días. Se resuelve aquí y no en el componente:
      llamar a Date.now() durante el render es impuro. */
  diasAtras?: number;
  /** Cursor de paginación por keyset: `started_at` de la última fila mostrada. */
  cursor?: string;
  limite?: number;
}

export interface LlamadaConCita extends Call {
  citas: Array<{ id: number; reference_code: string; treatment: string; starts_at: string; status: string }>;
}

export interface PaginaLlamadas {
  llamadas: LlamadaConCita[];
  siguienteCursor: string | null;
}

/**
 * Lista de llamadas con su cita asociada, si la hubo.
 *
 * Pagina por keyset (`started_at < cursor`) y no por OFFSET: el coste de una
 * página no crece con lo profundo que se navegue.
 */
export async function listarLlamadas(
  clinicId: number,
  filtros: FiltrosLlamadas = {},
): Promise<PaginaLlamadas> {
  const supabase = await createClient();
  const limite = filtros.limite ?? 20;

  let consulta = supabase
    .from('calls')
    .select(
      'id, clinic_id, vapi_call_id, vapi_assistant_id, customer_number, direction, status, ended_reason, started_at, ended_at, duration_seconds, cost, recording_url, summary, created_at, citas:appointments(id, reference_code, treatment, starts_at, status)',
    )
    .eq('clinic_id', clinicId)
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(limite + 1);

  if (filtros.cursor) {
    consulta = consulta.lt('started_at', filtros.cursor);
  }

  if (filtros.diasAtras && filtros.diasAtras > 0) {
    const desde = new Date(Date.now() - filtros.diasAtras * 24 * 60 * 60 * 1000);
    consulta = consulta.gte('started_at', desde.toISOString());
  }

  if (filtros.busqueda?.trim()) {
    const termino = `%${filtros.busqueda.trim()}%`;
    consulta = consulta.or(`summary.ilike.${termino},customer_number.ilike.${termino}`);
  }

  const { data, error } = await consulta;

  if (error) {
    throw new Error(`No se pudieron cargar las llamadas: ${error.message}`);
  }

  let filas = (data ?? []) as unknown as LlamadaConCita[];

  if (filtros.soloConCita) {
    filas = filas.filter((l) => l.citas.some((c) => c.status !== 'cancelled'));
  }

  const hayMas = filas.length > limite;
  const pagina = hayMas ? filas.slice(0, limite) : filas;

  return {
    llamadas: pagina,
    siguienteCursor: hayMas ? (pagina[pagina.length - 1]?.started_at ?? null) : null,
  };
}

export interface DetalleLlamada {
  llamada: LlamadaConCita;
  transcripcion: Transcript | null;
}

export async function obtenerLlamada(clinicId: number, callId: number): Promise<DetalleLlamada | null> {
  const supabase = await createClient();

  const { data: llamada } = await supabase
    .from('calls')
    .select(
      'id, clinic_id, vapi_call_id, vapi_assistant_id, customer_number, direction, status, ended_reason, started_at, ended_at, duration_seconds, cost, recording_url, summary, created_at, citas:appointments(id, reference_code, treatment, starts_at, status)',
    )
    .eq('clinic_id', clinicId)
    .eq('id', callId)
    .maybeSingle();

  if (!llamada) return null;

  const { data: transcripcion } = await supabase
    .from('transcripts')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('call_id', callId)
    .maybeSingle();

  return { llamada: llamada as unknown as LlamadaConCita, transcripcion: transcripcion ?? null };
}

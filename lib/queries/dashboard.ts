import { subDays } from 'date-fns';

import { fechaISOLocal } from '@/lib/format/es';
import { createClient } from '@/lib/supabase/server';
import type { Appointment, Call } from '@/lib/supabase/database.types';

export interface PuntoDiario {
  fechaISO: string;
  llamadas: number;
  citas: number;
}

export interface ResumenDashboard {
  llamadas7d: number;
  citas7d: number;
  duracionMediaSegundos: number | null;
  tasaAgendado: number | null;
  serie: PuntoDiario[];
  ultimasLlamadas: Array<Pick<Call, 'id' | 'started_at' | 'customer_number' | 'duration_seconds' | 'summary' | 'status'>>;
}

/**
 * Métricas de los últimos 7 días.
 *
 * Todas las consultas pasan por RLS: aunque este código tuviera un fallo, no
 * puede devolver filas de otra clínica.
 */
export async function obtenerResumen(clinicId: number, timezone: string): Promise<ResumenDashboard> {
  const supabase = await createClient();
  const desde = subDays(new Date(), 7);
  const desdeISO = desde.toISOString();

  const [llamadasRes, citasRes, ultimasRes] = await Promise.all([
    supabase
      .from('calls')
      .select('id, started_at, duration_seconds')
      .eq('clinic_id', clinicId)
      .gte('started_at', desdeISO),
    supabase
      .from('appointments')
      .select('id, created_at, status')
      .eq('clinic_id', clinicId)
      .gte('created_at', desdeISO),
    supabase
      .from('calls')
      .select('id, started_at, customer_number, duration_seconds, summary, status')
      .eq('clinic_id', clinicId)
      .order('started_at', { ascending: false, nullsFirst: false })
      .limit(8),
  ]);

  const llamadas = llamadasRes.data ?? [];
  const citas = citasRes.data ?? [];

  const conDuracion = llamadas.filter((l) => typeof l.duration_seconds === 'number');
  const duracionMediaSegundos =
    conDuracion.length > 0
      ? Math.round(conDuracion.reduce((suma, l) => suma + (l.duration_seconds ?? 0), 0) / conDuracion.length)
      : null;

  // Se cuentan solo las citas vivas: incluir las canceladas inflaría la tasa.
  const citasVivas = citas.filter((c) => c.status !== 'cancelled');

  return {
    llamadas7d: llamadas.length,
    citas7d: citasVivas.length,
    duracionMediaSegundos,
    tasaAgendado: llamadas.length > 0 ? citasVivas.length / llamadas.length : null,
    serie: construirSerie(llamadas, citas, timezone),
    ultimasLlamadas: ultimasRes.data ?? [],
  };
}

/** Agrupa por día local de la clínica, no por día UTC. */
function construirSerie(
  llamadas: Array<Pick<Call, 'started_at'>>,
  citas: Array<Pick<Appointment, 'created_at' | 'status'>>,
  timezone: string,
): PuntoDiario[] {
  const dias: PuntoDiario[] = [];
  const hoy = new Date();

  for (let i = 6; i >= 0; i -= 1) {
    dias.push({ fechaISO: fechaISOLocal(subDays(hoy, i), timezone), llamadas: 0, citas: 0 });
  }

  const indice = new Map(dias.map((d) => [d.fechaISO, d]));

  for (const llamada of llamadas) {
    if (!llamada.started_at) continue;
    const punto = indice.get(fechaISOLocal(llamada.started_at, timezone));
    if (punto) punto.llamadas += 1;
  }

  for (const cita of citas) {
    if (cita.status === 'cancelled') continue;
    const punto = indice.get(fechaISOLocal(cita.created_at, timezone));
    if (punto) punto.citas += 1;
  }

  return dias;
}

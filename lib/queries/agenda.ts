import { addDays, startOfWeek } from 'date-fns';
import { TZDate } from '@date-fns/tz';

import { listarEventos, type EventoCalendario } from '@/lib/google/calendar';
import { GoogleDesconectadoError } from '@/lib/google/client';
import { createClient } from '@/lib/supabase/server';
import type { Appointment } from '@/lib/supabase/database.types';

/** Una entrada del calendario: cita del agente, o evento externo de Google. */
export interface EntradaAgenda {
  clave: string;
  titulo: string;
  inicio: string;
  fin: string;
  origen: 'cita' | 'google';
  cita: Appointment | null;
  enlaceGoogle: string | null;
  esTodoElDia: boolean;
}

export interface Agenda {
  inicioSemana: Date;
  finSemana: Date;
  entradas: EntradaAgenda[];
  googleConectado: boolean;
  errorGoogle: string | null;
}

/**
 * Agenda de una semana, mezclando las citas del agente con Google Calendar.
 *
 * La lectura de Google es en vivo (`events.list` al pintar) en vez de una
 * sincronización incremental con `syncToken` y canales `watch`: cumple el
 * requisito de que un evento creado a mano en Google aparezca aquí, sin canales
 * que caducan cada semana ni un camino de recuperación por token expirado. La
 * disponibilidad que ve el agente ya se calcula con `freebusy` en vivo, así que
 * un evento externo nunca puede provocar una doble reserva.
 */
export async function obtenerAgenda(
  clinicId: number,
  timezone: string,
  semanaDe?: Date,
): Promise<Agenda> {
  const enZona = new TZDate(semanaDe ?? new Date(), timezone);
  const inicioSemana = new Date(startOfWeek(enZona, { weekStartsOn: 1 }).getTime());
  const finSemana = addDays(inicioSemana, 7);

  const supabase = await createClient();

  const { data: citas } = await supabase
    .from('appointments')
    .select('*')
    .eq('clinic_id', clinicId)
    .neq('status', 'cancelled')
    .gte('starts_at', inicioSemana.toISOString())
    .lt('starts_at', finSemana.toISOString())
    .order('starts_at', { ascending: true });

  const entradas: EntradaAgenda[] = (citas ?? []).map((cita) => ({
    clave: `cita-${cita.id}`,
    titulo: `${cita.treatment} — ${cita.patient_name}`,
    inicio: cita.starts_at,
    fin: cita.ends_at,
    origen: 'cita',
    cita,
    enlaceGoogle: null,
    esTodoElDia: false,
  }));

  const idsDeEventoConocidos = new Set(
    (citas ?? []).map((c) => c.google_event_id).filter((id): id is string => Boolean(id)),
  );

  let googleConectado = true;
  let errorGoogle: string | null = null;
  let eventos: EventoCalendario[] = [];

  try {
    eventos = await listarEventos(clinicId, inicioSemana, finSemana, timezone);
  } catch (error) {
    googleConectado = false;
    errorGoogle =
      error instanceof GoogleDesconectadoError
        ? error.message
        : 'No se pudo leer Google Calendar en este momento.';
  }

  for (const evento of eventos) {
    // Un evento que ya conocemos es la misma reunión vista dos veces: se muestra
    // una sola vez, con los datos de la cita.
    if (idsDeEventoConocidos.has(evento.id)) continue;

    entradas.push({
      clave: `google-${evento.id}`,
      titulo: evento.titulo,
      inicio: evento.inicio,
      fin: evento.fin,
      origen: 'google',
      cita: null,
      enlaceGoogle: evento.enlace,
      esTodoElDia: evento.esTodoElDia,
    });
  }

  entradas.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());

  return { inicioSemana, finSemana, entradas, googleConectado, errorGoogle };
}

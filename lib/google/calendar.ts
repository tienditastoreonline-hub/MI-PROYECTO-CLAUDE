import 'server-only';

import type { Ocupado } from '@/lib/google/availability';
import { getCalendarClient } from '@/lib/google/client';

/** Un evento del calendario tal como lo necesita el panel. */
export interface EventoCalendario {
  id: string;
  titulo: string;
  inicio: string;
  fin: string;
  descripcion: string | null;
  enlace: string | null;
  esTodoElDia: boolean;
}

/**
 * Intervalos ocupados en la ventana dada.
 *
 * Es lo que impide reservar sobre algo que ya existe en el calendario, lo haya
 * creado el agente o una persona directamente en Google.
 */
export async function consultarOcupados(
  clinicId: number,
  desde: Date,
  hasta: Date,
  timezone: string,
): Promise<Ocupado[]> {
  const { calendar, calendarId } = await getCalendarClient(clinicId);

  const respuesta = await calendar.freebusy.query({
    requestBody: {
      timeMin: desde.toISOString(),
      timeMax: hasta.toISOString(),
      timeZone: timezone,
      items: [{ id: calendarId }],
    },
  });

  const tramos = respuesta.data.calendars?.[calendarId]?.busy ?? [];

  return tramos.flatMap((tramo) =>
    tramo.start && tramo.end ? [{ inicio: new Date(tramo.start), fin: new Date(tramo.end) }] : [],
  );
}

/**
 * Eventos de la ventana pedida.
 *
 * `singleEvents: true` expande las series recurrentes en instancias concretas;
 * sin él, una cita semanal aparecería una sola vez y bloquearía mal la agenda.
 */
export async function listarEventos(
  clinicId: number,
  desde: Date,
  hasta: Date,
  timezone: string,
): Promise<EventoCalendario[]> {
  const { calendar, calendarId } = await getCalendarClient(clinicId);

  const respuesta = await calendar.events.list({
    calendarId,
    timeMin: desde.toISOString(),
    timeMax: hasta.toISOString(),
    timeZone: timezone,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  });

  return (respuesta.data.items ?? []).flatMap((evento) => {
    const inicio = evento.start?.dateTime ?? evento.start?.date;
    const fin = evento.end?.dateTime ?? evento.end?.date;
    if (!evento.id || !inicio || !fin) return [];

    return [
      {
        id: evento.id,
        titulo: evento.summary ?? '(sin título)',
        inicio,
        fin,
        descripcion: evento.description ?? null,
        enlace: evento.htmlLink ?? null,
        esTodoElDia: Boolean(evento.start?.date),
      },
    ];
  });
}

export interface DatosEvento {
  titulo: string;
  descripcion: string;
  inicio: Date;
  fin: Date;
  timezone: string;
  emailInvitado?: string | null;
}

/** Crea el evento de una cita. Devuelve el id de Google para poder cancelarla. */
export async function crearEvento(
  clinicId: number,
  datos: DatosEvento,
): Promise<{ eventId: string; calendarId: string; enlace: string | null }> {
  const { calendar, calendarId } = await getCalendarClient(clinicId);

  const respuesta = await calendar.events.insert({
    calendarId,
    // Solo se notifica si hay a quién: `all` sin invitados no hace nada útil.
    sendUpdates: datos.emailInvitado ? 'all' : 'none',
    requestBody: {
      summary: datos.titulo,
      description: datos.descripcion,
      start: { dateTime: datos.inicio.toISOString(), timeZone: datos.timezone },
      end: { dateTime: datos.fin.toISOString(), timeZone: datos.timezone },
      attendees: datos.emailInvitado ? [{ email: datos.emailInvitado }] : undefined,
    },
  });

  const eventId = respuesta.data.id;
  if (!eventId) {
    throw new Error('Google Calendar creó el evento pero no devolvió su identificador.');
  }

  return { eventId, calendarId, enlace: respuesta.data.htmlLink ?? null };
}

/**
 * Borra el evento de una cita cancelada.
 *
 * Un 404/410 se trata como éxito: el evento ya no está, que es justo el estado
 * que se buscaba. Fallar aquí dejaría la cita marcada como activa en la base de
 * datos por un motivo que no importa.
 */
export async function borrarEvento(clinicId: number, eventId: string): Promise<void> {
  const { calendar, calendarId } = await getCalendarClient(clinicId);

  try {
    await calendar.events.delete({ calendarId, eventId, sendUpdates: 'all' });
  } catch (error) {
    const codigo = extraerCodigo(error);
    if (codigo === 404 || codigo === 410) return;
    throw error;
  }
}

function extraerCodigo(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const codigo = (error as { code: unknown }).code;
    if (typeof codigo === 'number') return codigo;
    if (typeof codigo === 'string' && /^\d+$/.test(codigo)) return Number(codigo);
  }
  return null;
}

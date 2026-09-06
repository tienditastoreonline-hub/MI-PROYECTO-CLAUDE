import 'server-only';

import type { z } from 'zod';

import { bookAppointment } from '@/lib/tools/book-appointment';
import { cancelAppointment } from '@/lib/tools/cancel-appointment';
import { checkAvailability } from '@/lib/tools/check-availability';
import { findAppointments } from '@/lib/tools/find-appointments';
import { getClinicInfo } from '@/lib/tools/get-clinic-info';
import {
  bookAppointmentSchema,
  cancelAppointmentSchema,
  checkAvailabilitySchema,
  findAppointmentsSchema,
  getClinicInfoSchema,
} from '@/lib/tools/schemas';
import type { ManejadorTool } from '@/lib/tools/types';

export interface DefinicionTool {
  nombre: string;
  descripcion: string;
  schema: z.ZodType;
  manejador: ManejadorTool;
}

/**
 * Lista blanca de herramientas.
 *
 * Es una allowlist explícita a propósito: el webhook solo ejecuta lo que está
 * aquí. Un nombre de función que llegue del modelo y no figure en esta tabla se
 * rechaza sin tocar la base de datos ni Google.
 *
 * Los nombres cumplen `^[a-zA-Z0-9_-]+$`, que es lo que exige la API de Vapi.
 */
export const TOOLS: readonly DefinicionTool[] = [
  {
    nombre: 'checkAvailability',
    descripcion:
      'Consulta los horarios libres reales de la clinica. Usala SIEMPRE antes de proponer cualquier hora. Nunca inventes horarios ni calcules fechas por tu cuenta.',
    schema: checkAvailabilitySchema,
    manejador: checkAvailability,
  },
  {
    nombre: 'bookAppointment',
    descripcion:
      'Agenda la cita. Llamala solo despues de que el paciente haya confirmado en voz alta su nombre, el tratamiento, el dia y la hora exacta que eligio de los horarios disponibles.',
    schema: bookAppointmentSchema,
    manejador: bookAppointment,
  },
  {
    nombre: 'findAppointments',
    descripcion:
      'Busca las citas futuras del paciente que esta llamando. Usala antes de cancelar o reagendar. Por defecto busca por el numero desde el que llama.',
    schema: findAppointmentsSchema,
    manejador: findAppointments,
  },
  {
    nombre: 'cancelAppointment',
    descripcion:
      'Cancela una cita ya localizada con findAppointments. Confirma con el paciente cual es antes de llamarla.',
    schema: cancelAppointmentSchema,
    manejador: cancelAppointment,
  },
  {
    nombre: 'getClinicInfo',
    descripcion:
      'Devuelve informacion de la clinica: direccion, horarios, formas de pago y tratamientos. Usala para responder preguntas frecuentes.',
    schema: getClinicInfoSchema,
    manejador: getClinicInfo,
  },
] as const;

const POR_NOMBRE = new Map(TOOLS.map((tool) => [tool.nombre, tool]));

export function buscarTool(nombre: string): DefinicionTool | null {
  return POR_NOMBRE.get(nombre) ?? null;
}

import { z } from 'zod';

/**
 * Argumentos de cada herramienta: una sola fuente de verdad.
 *
 * El mismo esquema Zod valida lo que llega del modelo y genera el JSON Schema
 * que se publica en el asistente. Así no pueden divergir.
 *
 * Reglas que vienen de la guía oficial de Vapi:
 *   · El nombre de función debe cumplir `^[a-zA-Z0-9_-]+$`.
 *   · Solo se declaran los parámetros que el modelo debe rellenar. El `clinicId`
 *     NO aparece: se deriva en el servidor del asistente que hizo la llamada. Un
 *     tenant que el modelo pudiera escribir sería un agujero de aislamiento.
 *   · Los `enum` van sin acentos: el texto viaja por síntesis y reconocimiento de
 *     voz, y un acento sobrevive mal a ese viaje de ida y vuelta.
 */

export const checkAvailabilitySchema = z.object({
  service_name: z
    .string()
    .describe('Tratamiento solicitado, tal como aparece en la lista de servicios de la clinica.'),
  preferred_date: z
    .string()
    .describe(
      'Fecha deseada en formato YYYY-MM-DD. Si el paciente usa una expresion relativa como "manana" o "el proximo martes", enviala tal cual en espanol: el servidor la resuelve.',
    ),
  preferred_period: z
    .enum(['manana', 'tarde', 'cualquiera'])
    .optional()
    .describe('Franja del dia que prefiere el paciente.'),
});

export const bookAppointmentSchema = z.object({
  patient_name: z.string().min(2).describe('Nombre completo del paciente.'),
  patient_phone: z
    .string()
    .optional()
    .describe(
      'Telefono de contacto. Si el paciente indica que use el numero desde el que llama, omite este campo.',
    ),
  patient_email: z.string().optional().describe('Correo del paciente, si lo proporciona.'),
  service_name: z.string().describe('Tratamiento, exactamente como aparece en la lista de servicios.'),
  start_time: z
    .string()
    .describe(
      'Inicio de la cita en formato YYYY-MM-DDTHH:MM en hora local de la clinica. Debe ser uno de los horarios devueltos por checkAvailability.',
    ),
  is_new_patient: z.boolean().optional().describe('True si es la primera vez que acude a la clinica.'),
  notes: z.string().optional().describe('Motivo de consulta o notas relevantes.'),
});

export const findAppointmentsSchema = z.object({
  patient_phone: z
    .string()
    .optional()
    .describe('Telefono a buscar, solo si es distinto del numero desde el que llama.'),
  patient_name: z
    .string()
    .optional()
    .describe('Nombre del paciente, util si el telefono no coincide con el registrado.'),
});

export const cancelAppointmentSchema = z.object({
  reference_code: z
    .string()
    .describe('Codigo de 6 caracteres devuelto por findAppointments o por bookAppointment.'),
  reason: z.string().optional().describe('Motivo de la cancelacion, si el paciente lo menciona.'),
});

export const getClinicInfoSchema = z.object({
  topic: z
    .enum(['direccion', 'horarios', 'pagos', 'servicios', 'general'])
    .optional()
    .describe('Tema concreto sobre el que pregunta el paciente.'),
});

export type CheckAvailabilityArgs = z.infer<typeof checkAvailabilitySchema>;
export type BookAppointmentArgs = z.infer<typeof bookAppointmentSchema>;
export type FindAppointmentsArgs = z.infer<typeof findAppointmentsSchema>;
export type CancelAppointmentArgs = z.infer<typeof cancelAppointmentSchema>;
export type GetClinicInfoArgs = z.infer<typeof getClinicInfoSchema>;

/** Convierte un esquema Zod al JSON Schema que espera la definición de la tool. */
export function aJSONSchema(schema: z.ZodType): Record<string, unknown> {
  const generado = z.toJSONSchema(schema) as Record<string, unknown>;
  // `$schema` no aporta nada en la definición de una función y algunos
  // proveedores de modelo lo rechazan.
  delete generado.$schema;
  return generado;
}

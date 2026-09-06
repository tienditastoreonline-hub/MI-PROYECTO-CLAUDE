import { z } from 'zod';

/** Validación de lo que el dueño edita en Personalización. */

export const servicioSchema = z.object({
  name: z.string().trim().min(2, 'El nombre del tratamiento es demasiado corto').max(80),
  duration_minutes: z
    .number()
    .int()
    .min(5, 'La duración mínima es de 5 minutos')
    .max(480, 'La duración máxima es de 8 horas'),
  description: z.string().trim().max(300).optional(),
});

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const tramoSchema = z
  .object({
    start: z.string().regex(HORA, 'Usa el formato HH:MM'),
    end: z.string().regex(HORA, 'Usa el formato HH:MM'),
  })
  .refine((tramo) => tramo.end > tramo.start, {
    message: 'La hora de cierre debe ser posterior a la de apertura',
  });

export const DIAS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export const horariosSchema = z.object({
  mon: z.array(tramoSchema).default([]),
  tue: z.array(tramoSchema).default([]),
  wed: z.array(tramoSchema).default([]),
  thu: z.array(tramoSchema).default([]),
  fri: z.array(tramoSchema).default([]),
  sat: z.array(tramoSchema).default([]),
  sun: z.array(tramoSchema).default([]),
});

export const configSchema = z.object({
  first_message: z.string().trim().min(10, 'El saludo es demasiado corto').max(500),
  tone: z.string().trim().min(3).max(120),
  handoff_message: z.string().trim().min(5).max(300),
  system_prompt_extra: z.string().trim().max(2000).optional(),

  address: z.string().trim().max(300).optional(),
  phone_e164: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,14}$/, 'Usa formato internacional, por ejemplo +525512345678')
    .optional()
    .or(z.literal('')),
  payment_methods: z.string().trim().max(300).optional(),
  policies: z.string().trim().max(500).optional(),

  services: z.array(servicioSchema).min(1, 'Añade al menos un tratamiento'),
  business_hours: horariosSchema,

  voice_provider: z.string().trim().min(1),
  voice_id: z.string().trim().min(1),
  language: z.string().trim().min(2).max(10),
  model_provider: z.string().trim().min(1),
  model_name: z.string().trim().min(1),

  slot_minutes: z.number().int().min(15).max(120),
  min_lead_minutes: z.number().int().min(0).max(10080),
  max_advance_days: z.number().int().min(1).max(365),
  hipaa_enabled: z.boolean(),
});

export type ConfigValidada = z.infer<typeof configSchema>;

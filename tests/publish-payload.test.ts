import { describe, expect, it } from 'vitest';

import { construirPayload, hashPayload } from '@/lib/vapi/publish';
import { TOOLS } from '@/lib/tools/registry';
import type { AgentConfig, Clinic } from '@/lib/supabase/database.types';

const CLINICA: Clinic = {
  id: 7,
  slug: 'clinica-demo',
  name: 'Clínica Demo',
  timezone: 'America/Mexico_City',
  phone_e164: '+525512345678',
  address: 'Calle Falsa 123',
  vapi_assistant_id: null,
  vapi_phone_number_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const CONFIG = {
  clinic_id: 7,
  first_message: 'Gracias por llamar.',
  tone: 'profesional y cálido',
  system_prompt_extra: null,
  handoff_message: 'Le paso con recepción.',
  clinic_info: {},
  services: [{ name: 'Limpieza dental', duration_minutes: 45 }],
  business_hours: { mon: [{ start: '09:00', end: '14:00' }] },
  closed_dates: [],
  voice_provider: 'azure',
  voice_id: 'es-MX-DaliaNeural',
  language: 'es',
  model_provider: 'openai',
  model_name: 'gpt-4o',
  slot_minutes: 30,
  min_lead_minutes: 60,
  max_advance_days: 60,
  hipaa_enabled: false,
  published_at: null,
  published_hash: null,
  last_publish_error: null,
} as unknown as AgentConfig;

const VOZ = { provider: 'azure', voiceId: 'es-MX-DaliaNeural' };

describe('payload del asistente: forma verificada contra el SDK', () => {
  const payload = construirPayload(CLINICA, CONFIG, VOZ);

  it('usa el objeto `server`, no `serverUrl`/`serverUrlSecret`', () => {
    // Esos campos no existen en CreateAssistantDto.
    expect(payload).not.toHaveProperty('serverUrl');
    expect(payload).not.toHaveProperty('serverUrlSecret');
    expect(payload.server.url).toMatch(/\/api\/vapi\/webhook$/);
  });

  it('lleva el secreto en headers, porque `server.secret` no existe', () => {
    expect(payload.server).not.toHaveProperty('secret');
    const headers = payload.server.headers as Record<string, string>;
    expect(headers['x-vapi-secret']).toBe(process.env.VAPI_WEBHOOK_SECRET);
  });

  it('suscribe los eventos que el webhook sabe manejar', () => {
    expect(payload.serverMessages).toContain('tool-calls');
    expect(payload.serverMessages).toContain('end-of-call-report');
    expect(payload.serverMessages).toContain('status-update');
  });

  it('pone hipaaEnabled bajo compliancePlan, no en la raíz', () => {
    expect(payload).not.toHaveProperty('hipaaEnabled');
    expect(payload.compliancePlan).toEqual({ hipaaEnabled: false });
  });

  it('recorta el nombre al límite de 40 caracteres de la API', () => {
    const largo = construirPayload(
      { ...CLINICA, name: 'Clínica Dental Sonrisa Perfecta del Valle Sur de la Ciudad' },
      CONFIG,
      VOZ,
    );
    expect(largo.name.length).toBeLessThanOrEqual(40);
  });

  it('configura el transcriber en el idioma de la clínica', () => {
    expect(payload.transcriber).toMatchObject({ provider: 'deepgram', model: 'nova-3', language: 'es' });
  });

  it('mete el system prompt como mensaje de sistema del modelo', () => {
    const mensajes = payload.model.messages as Array<{ role: string; content: string }>;
    expect(mensajes[0]?.role).toBe('system');
    expect(mensajes[0]?.content).toContain('Clínica Demo');
  });

  it('no fija la fecha de hoy en el prompt, que quedaría obsoleto al día siguiente', () => {
    const mensajes = payload.model.messages as Array<{ content: string }>;
    expect(mensajes[0]?.content ?? '').not.toMatch(/\b20\d{2}-\d{2}-\d{2}\b/);
  });
});

describe('herramientas del asistente', () => {
  const payload = construirPayload(CLINICA, CONFIG, VOZ);
  const tools = payload.model.tools as Array<{ type: string; function?: { name: string; parameters: unknown } }>;

  it('incluye las cinco funciones del registro', () => {
    const nombres = tools.filter((t) => t.type === 'function').map((t) => t.function?.name);
    expect(nombres).toEqual(TOOLS.map((t) => t.nombre));
  });

  it('todos los nombres cumplen el regex que exige la API', () => {
    for (const tool of tools) {
      if (tool.function) {
        expect(tool.function.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      }
    }
  });

  it('adjunta la herramienta nativa endCall', () => {
    expect(tools.some((t) => t.type === 'endCall')).toBe(true);
  });

  it('adjunta transferCall solo si la clínica tiene teléfono', () => {
    expect(tools.some((t) => t.type === 'transferCall')).toBe(true);

    const sinTelefono = construirPayload({ ...CLINICA, phone_e164: null }, CONFIG, VOZ);
    const toolsSinTelefono = sinTelefono.model.tools as Array<{ type: string }>;
    expect(toolsSinTelefono.some((t) => t.type === 'transferCall')).toBe(false);
  });

  it('no expone clinicId como parámetro que el modelo pueda rellenar', () => {
    // Se comprueban los NOMBRES de propiedad, no el JSON serializado: las
    // descripciones están en español y mencionan «la clinica» con toda
    // naturalidad. Lo que no puede existir es un parámetro de tenant.
    for (const tool of tools) {
      const esquema = tool.function?.parameters as { properties?: Record<string, unknown> } | undefined;
      for (const propiedad of Object.keys(esquema?.properties ?? {})) {
        expect(propiedad).not.toMatch(/clinic/i);
      }
    }
  });

  it('genera JSON Schema con propiedades y requeridos', () => {
    const check = tools.find((t) => t.function?.name === 'checkAvailability');
    const esquema = check?.function?.parameters as { properties?: Record<string, unknown>; required?: string[] };

    expect(Object.keys(esquema.properties ?? {})).toContain('service_name');
    expect(esquema.required).toContain('preferred_date');
  });
});

describe('huella de publicación', () => {
  it('es estable para la misma configuración', () => {
    expect(hashPayload(construirPayload(CLINICA, CONFIG, VOZ))).toBe(
      hashPayload(construirPayload(CLINICA, CONFIG, VOZ)),
    );
  });

  it('cambia cuando cambia la configuración', () => {
    const otro = construirPayload(CLINICA, { ...CONFIG, first_message: 'Otro saludo.' }, VOZ);
    expect(hashPayload(otro)).not.toBe(hashPayload(construirPayload(CLINICA, CONFIG, VOZ)));
  });

  it('cambia al cambiar la voz', () => {
    const otraVoz = construirPayload(CLINICA, CONFIG, { provider: 'vapi', voiceId: 'Elliot' });
    expect(hashPayload(otraVoz)).not.toBe(hashPayload(construirPayload(CLINICA, CONFIG, VOZ)));
  });
});

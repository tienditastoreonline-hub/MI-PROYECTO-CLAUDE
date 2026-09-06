import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Clinic } from '@/lib/supabase/database.types';

const CLINICA: Clinic = {
  id: 7,
  slug: 'clinica-demo',
  name: 'Clínica Demo',
  timezone: 'America/Mexico_City',
  phone_e164: '+525512345678',
  address: 'Calle Falsa 123',
  vapi_assistant_id: 'asst_demo',
  vapi_phone_number_id: 'pn_demo',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const resolverClinica = vi.fn<() => Promise<Clinic | null>>();
const manejarToolCalls = vi.fn();
const manejarFinDeLlamada = vi.fn();
const manejarActualizacionEstado = vi.fn();

vi.mock('@/lib/vapi/tenant', () => ({ resolverClinica: () => resolverClinica() }));
vi.mock('@/lib/vapi/handlers/tool-calls', () => ({
  manejarToolCalls: (...args: unknown[]) => manejarToolCalls(...args),
}));
vi.mock('@/lib/vapi/handlers/end-of-call-report', () => ({
  manejarFinDeLlamada: (...args: unknown[]) => manejarFinDeLlamada(...args),
}));
vi.mock('@/lib/vapi/handlers/status-update', () => ({
  manejarActualizacionEstado: (...args: unknown[]) => manejarActualizacionEstado(...args),
}));

const { POST } = await import('@/app/api/vapi/webhook/route');

const SECRETO = process.env.VAPI_WEBHOOK_SECRET as string;

function peticion(cuerpo: unknown, secreto: string | null = SECRETO): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secreto !== null) headers['x-vapi-secret'] = secreto;

  return new Request('https://app.test/api/vapi/webhook', {
    method: 'POST',
    headers,
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  });
}

const toolCallsPayload = {
  message: {
    type: 'tool-calls',
    call: { id: 'call_1', assistantId: 'asst_demo', customer: { number: '+525599998888' } },
    toolCallList: [
      {
        id: 'tc_1',
        type: 'function',
        // `arguments` viaja como STRING JSON, no como objeto.
        function: { name: 'checkAvailability', arguments: '{"service_name":"Limpieza dental","preferred_date":"manana"}' },
      },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  resolverClinica.mockResolvedValue(CLINICA);
  manejarToolCalls.mockResolvedValue({
    results: [{ toolCallId: 'tc_1', name: 'checkAvailability', result: 'Hay horarios libres.' }],
  });
});

describe('autenticación del webhook', () => {
  it('rechaza una petición sin secreto con 401', async () => {
    const respuesta = await POST(peticion(toolCallsPayload, null));
    expect(respuesta.status).toBe(401);
  });

  it('rechaza un secreto incorrecto con 401', async () => {
    const respuesta = await POST(peticion(toolCallsPayload, 'secreto-equivocado'));
    expect(respuesta.status).toBe(401);
  });

  it('no llega a procesar nada cuando el secreto es inválido', async () => {
    await POST(peticion(toolCallsPayload, 'secreto-equivocado'));
    expect(resolverClinica).not.toHaveBeenCalled();
    expect(manejarToolCalls).not.toHaveBeenCalled();
  });

  it('acepta el secreto correcto', async () => {
    const respuesta = await POST(peticion(toolCallsPayload));
    expect(respuesta.status).toBe(200);
  });
});

describe('validación del cuerpo', () => {
  it('devuelve 400 con JSON malformado', async () => {
    const respuesta = await POST(peticion('{esto no es json'));
    expect(respuesta.status).toBe(400);
  });

  it('devuelve 400 si el mensaje no trae tipo', async () => {
    const respuesta = await POST(peticion({ message: { call: { id: 'x' } } }));
    expect(respuesta.status).toBe(400);
  });

  it('devuelve 413 si el cuerpo es excesivo', async () => {
    const respuesta = await POST(peticion({ message: { type: 'transcript', relleno: 'x'.repeat(1_000_001) } }));
    expect(respuesta.status).toBe(413);
  });

  it('acepta e ignora los tipos que no maneja', async () => {
    const respuesta = await POST(peticion({ message: { type: 'speech-update' } }));
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({});
    expect(resolverClinica).not.toHaveBeenCalled();
  });
});

describe('resolución de clínica', () => {
  it('devuelve un resultado por tool call aunque la clínica no exista', async () => {
    resolverClinica.mockResolvedValue(null);

    const respuesta = await POST(peticion(toolCallsPayload));
    const cuerpo = (await respuesta.json()) as { results: Array<{ toolCallId: string; name: string; error?: string }> };

    expect(respuesta.status).toBe(200);
    // Sin un resultado por cada tool call, el agente se queda mudo.
    expect(cuerpo.results).toHaveLength(1);
    expect(cuerpo.results[0]?.toolCallId).toBe('tc_1');
    expect(cuerpo.results[0]?.name).toBe('checkAvailability');
    expect(cuerpo.results[0]?.error).toBeTruthy();
  });

  it('no responde 5xx cuando la clínica no existe', async () => {
    resolverClinica.mockResolvedValue(null);
    const respuesta = await POST(peticion({ message: { type: 'end-of-call-report', call: { id: 'c1' } } }));
    expect(respuesta.status).toBe(200);
  });
});

describe('despacho de eventos', () => {
  it('pasa los tool calls al manejador con la clínica resuelta', async () => {
    await POST(peticion(toolCallsPayload));

    expect(manejarToolCalls).toHaveBeenCalledTimes(1);
    const [mensaje, clinica] = manejarToolCalls.mock.calls[0] as [{ type: string }, Clinic];
    expect(mensaje.type).toBe('tool-calls');
    expect(clinica.id).toBe(7);
  });

  it('devuelve los resultados con toolCallId y name', async () => {
    const respuesta = await POST(peticion(toolCallsPayload));
    const cuerpo = (await respuesta.json()) as { results: Array<Record<string, unknown>> };

    expect(cuerpo.results[0]).toMatchObject({
      toolCallId: 'tc_1',
      name: 'checkAvailability',
      result: 'Hay horarios libres.',
    });
  });

  it('persiste el reporte de fin de llamada', async () => {
    const respuesta = await POST(
      peticion({
        message: {
          type: 'end-of-call-report',
          call: { id: 'call_9', assistantId: 'asst_demo' },
          artifact: { transcript: 'Asistente: hola' },
          analysis: { summary: 'Agendó una limpieza.' },
        },
      }),
    );

    expect(respuesta.status).toBe(200);
    expect(manejarFinDeLlamada).toHaveBeenCalledTimes(1);
  });

  it('procesa las actualizaciones de estado', async () => {
    await POST(peticion({ message: { type: 'status-update', status: 'in-progress', call: { id: 'c2' } } }));
    expect(manejarActualizacionEstado).toHaveBeenCalledTimes(1);
  });

  it('si el manejador lanza, responde 200 con error por tool call y no 5xx', async () => {
    // Un 5xx haría que Vapi reintentara y la herramienta se ejecutaría dos veces.
    manejarToolCalls.mockRejectedValue(new Error('fallo interno'));

    const respuesta = await POST(peticion(toolCallsPayload));
    const cuerpo = (await respuesta.json()) as { results: Array<{ toolCallId: string; error?: string }> };

    expect(respuesta.status).toBe(200);
    expect(cuerpo.results[0]?.toolCallId).toBe('tc_1');
    expect(cuerpo.results[0]?.error).toBeTruthy();
  });
});

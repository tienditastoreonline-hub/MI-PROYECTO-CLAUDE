import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentConfig, Clinic } from '@/lib/supabase/database.types';
import type { ContextoTool } from '@/lib/tools/types';

const CLINICA = { id: 7, name: 'Clínica Demo', timezone: 'America/Mexico_City' } as Clinic;
const CONFIG = { clinic_id: 7, services: [], business_hours: {} } as unknown as AgentConfig;

const manejadorFalso = vi.fn<(c: ContextoTool, a: unknown) => Promise<{ result: string }>>();
const buscarTool = vi.fn();

// El cliente admin solo se usa aquí para cargar la configuración del agente.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: CONFIG, error: null }) }),
      }),
    }),
  }),
}));

vi.mock('@/lib/tools/registry', () => ({
  buscarTool: (nombre: string) => buscarTool(nombre),
}));

const { manejarToolCalls } = await import('@/lib/vapi/handlers/tool-calls');

function toolCall(id: string, name: string, argumentos: string) {
  return { id, type: 'function', function: { name, arguments: argumentos } };
}

beforeEach(() => {
  vi.clearAllMocks();
  manejadorFalso.mockResolvedValue({ result: 'listo' });
  buscarTool.mockImplementation((nombre: string) =>
    nombre === 'checkAvailability'
      ? { nombre, descripcion: '', schema: {}, manejador: manejadorFalso }
      : null,
  );
});

describe('invariante: un resultado por cada tool call', () => {
  it('devuelve tantos resultados como llamadas recibidas', async () => {
    const { results } = await manejarToolCalls(
      {
        type: 'tool-calls',
        toolCallList: [
          toolCall('tc_1', 'checkAvailability', '{}'),
          toolCall('tc_2', 'checkAvailability', '{}'),
          toolCall('tc_3', 'checkAvailability', '{}'),
        ],
      },
      CLINICA,
    );

    expect(results.map((r) => r.toolCallId)).toEqual(['tc_1', 'tc_2', 'tc_3']);
  });

  it('incluye siempre el campo name, que la API exige', async () => {
    const { results } = await manejarToolCalls(
      { type: 'tool-calls', toolCallList: [toolCall('tc_1', 'checkAvailability', '{}')] },
      CLINICA,
    );

    expect(results[0]?.name).toBe('checkAvailability');
  });

  it('devuelve un resultado incluso si el manejador lanza', async () => {
    manejadorFalso.mockRejectedValue(new Error('boom'));

    const { results } = await manejarToolCalls(
      { type: 'tool-calls', toolCallList: [toolCall('tc_1', 'checkAvailability', '{}')] },
      CLINICA,
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ toolCallId: 'tc_1', name: 'checkAvailability' });
    expect(results[0]?.error).toBeTruthy();
  });

  it('un fallo en una herramienta no tumba el resto', async () => {
    manejadorFalso
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ result: 'la segunda sí' });

    const { results } = await manejarToolCalls(
      {
        type: 'tool-calls',
        toolCallList: [
          toolCall('tc_1', 'checkAvailability', '{}'),
          toolCall('tc_2', 'checkAvailability', '{}'),
        ],
      },
      CLINICA,
    );

    expect(results[0]?.error).toBeTruthy();
    expect(results[1]?.result).toBe('la segunda sí');
  });
});

describe('argumentos: llegan como string JSON', () => {
  it('los parsea antes de pasarlos a la herramienta', async () => {
    await manejarToolCalls(
      {
        type: 'tool-calls',
        toolCallList: [
          toolCall('tc_1', 'checkAvailability', '{"service_name":"Limpieza","preferred_date":"manana"}'),
        ],
      },
      CLINICA,
    );

    const [, argumentos] = manejadorFalso.mock.calls[0] as [ContextoTool, unknown];
    expect(argumentos).toEqual({ service_name: 'Limpieza', preferred_date: 'manana' });
  });

  it('no revienta si el JSON viene corrupto', async () => {
    const { results } = await manejarToolCalls(
      { type: 'tool-calls', toolCallList: [toolCall('tc_1', 'checkAvailability', '{roto')] },
      CLINICA,
    );

    expect(results[0]?.toolCallId).toBe('tc_1');
    expect(results[0]?.result).toBeTruthy();
    expect(manejadorFalso).not.toHaveBeenCalled();
  });

  it('trata unos argumentos vacíos como objeto vacío', async () => {
    await manejarToolCalls(
      { type: 'tool-calls', toolCallList: [toolCall('tc_1', 'checkAvailability', '')] },
      CLINICA,
    );

    const [, argumentos] = manejadorFalso.mock.calls[0] as [ContextoTool, unknown];
    expect(argumentos).toEqual({});
  });
});

describe('allowlist de herramientas', () => {
  it('rechaza un nombre que no está registrado, sin ejecutar nada', async () => {
    const { results } = await manejarToolCalls(
      { type: 'tool-calls', toolCallList: [toolCall('tc_1', 'borrarTodo', '{}')] },
      CLINICA,
    );

    expect(results[0]).toMatchObject({ toolCallId: 'tc_1', name: 'borrarTodo' });
    expect(results[0]?.error).toBeTruthy();
    expect(manejadorFalso).not.toHaveBeenCalled();
  });
});

describe('contexto del servidor', () => {
  it('el número del paciente sale del evento, no de los argumentos del modelo', async () => {
    await manejarToolCalls(
      {
        type: 'tool-calls',
        call: { id: 'call_1', customer: { number: '+525599998888' } },
        toolCallList: [toolCall('tc_1', 'checkAvailability', '{"patient_phone":"+520000000000"}')],
      },
      CLINICA,
    );

    const [contexto] = manejadorFalso.mock.calls[0] as [ContextoTool, unknown];
    expect(contexto.callerNumber).toBe('+525599998888');
    expect(contexto.clinic.id).toBe(7);
    expect(contexto.toolCallId).toBe('tc_1');
  });

  it('descarta las entradas mal formadas de la lista', async () => {
    const { results } = await manejarToolCalls(
      {
        type: 'tool-calls',
        toolCallList: [
          toolCall('tc_1', 'checkAvailability', '{}'),
          { id: 'tc_2' } as never,
          { function: { name: 'checkAvailability', arguments: '{}' } } as never,
        ],
      },
      CLINICA,
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.toolCallId).toBe('tc_1');
  });
});

import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Clinic } from '@/lib/supabase/database.types';
import { buscarTool } from '@/lib/tools/registry';
import type { ContextoTool } from '@/lib/tools/types';
import { extraerToolCalls, type VapiServerMessage, type VapiToolCall, type VapiToolCallResult } from '@/lib/vapi/types';

/** Vapi corta la espera alrededor de los 20 s; se responde bastante antes. */
const TIMEOUT_MS = 12_000;

/**
 * Ejecuta las herramientas pedidas por el modelo.
 *
 * Invariante: se devuelve **exactamente un resultado por cada tool call
 * recibido**, con `name` incluido. Si falta alguno, el turno del agente se corta
 * y el paciente escucha silencio; por eso todos los caminos de error terminan en
 * un resultado y no en una excepción que se propague.
 */
export async function manejarToolCalls(
  mensaje: VapiServerMessage,
  clinic: Clinic,
): Promise<{ results: VapiToolCallResult[] }> {
  const llamadas = extraerToolCalls(mensaje);

  if (llamadas.length === 0) {
    return { results: [] };
  }

  const config = await cargarConfig(clinic.id);

  if (!config) {
    return {
      results: llamadas.map((llamada) => ({
        toolCallId: llamada.id,
        name: llamada.function.name,
        error: 'La clínica no tiene configuración del agente.',
      })),
    };
  }

  const contextoBase = {
    clinic,
    config,
    callerNumber: mensaje.call?.customer?.number ?? mensaje.customer?.number ?? null,
    vapiCallId: mensaje.call?.id ?? null,
  };

  const resultados = await Promise.allSettled(
    llamadas.map((llamada) => ejecutar(llamada, { ...contextoBase, toolCallId: llamada.id })),
  );

  return {
    results: resultados.map((resultado, indice) => {
      const llamada = llamadas[indice] as VapiToolCall;

      if (resultado.status === 'fulfilled') {
        return resultado.value;
      }

      console.error(`[vapi] la herramienta ${llamada.function.name} lanzó`, resultado.reason);
      return {
        toolCallId: llamada.id,
        name: llamada.function.name,
        error: 'No pude completar la operación. Discúlpate brevemente y ofrece pasar con recepción.',
      };
    }),
  };
}

async function ejecutar(llamada: VapiToolCall, contexto: ContextoTool): Promise<VapiToolCallResult> {
  const nombre = llamada.function.name;
  const definicion = buscarTool(nombre);

  // Allowlist: un nombre desconocido no llega a tocar nada.
  if (!definicion) {
    console.warn(`[vapi] herramienta no reconocida: ${nombre}`);
    return {
      toolCallId: llamada.id,
      name: nombre,
      error: 'Esa operación no está disponible.',
    };
  }

  // `arguments` viaja como string JSON, no como objeto.
  let argumentos: unknown = {};
  try {
    argumentos = llamada.function.arguments ? JSON.parse(llamada.function.arguments) : {};
  } catch {
    return {
      toolCallId: llamada.id,
      name: nombre,
      result: 'No entendí los datos. Vuelve a preguntar al paciente con calma.',
    };
  }

  const resultado = await Promise.race([
    definicion.manejador(contexto, argumentos),
    esperarTimeout(),
  ]);

  return { toolCallId: llamada.id, name: nombre, ...resultado };
}

/**
 * Si una herramienta tarda demasiado se responde algo conversacional en vez de
 * dejar que Vapi corte: el paciente oye una frase natural, no un silencio.
 */
function esperarTimeout(): Promise<{ result: string }> {
  return new Promise((resolve) => {
    setTimeout(
      () =>
        resolve({
          result:
            'La consulta está tardando. Dile al paciente que le confirmas en un momento y ofrécele tomar sus datos.',
        }),
      TIMEOUT_MS,
    );
  });
}

async function cargarConfig(clinicId: number) {
  const { data } = await createAdminClient()
    .from('agent_configs')
    .select('*')
    .eq('clinic_id', clinicId)
    .maybeSingle();

  return data;
}

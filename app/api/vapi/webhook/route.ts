import { NextResponse } from 'next/server';

import { resolverClinica } from '@/lib/vapi/tenant';
import { manejarActualizacionEstado } from '@/lib/vapi/handlers/status-update';
import { manejarFinDeLlamada } from '@/lib/vapi/handlers/end-of-call-report';
import { manejarToolCalls } from '@/lib/vapi/handlers/tool-calls';
import { extraerMensaje, TIPOS_SOPORTADOS } from '@/lib/vapi/types';
import { verificarSecretoVapi } from '@/lib/vapi/verify';

// `crypto.timingSafeEqual`, AES-GCM y `googleapis` necesitan runtime de Node.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Cota del cuerpo: un payload legítimo de Vapi está muy por debajo. */
const MAX_BYTES = 1_000_000;

/**
 * Webhook de Vapi. Un único endpoint para todas las clínicas.
 *
 * Orden de operaciones, que importa:
 *   1. Leer el cuerpo en crudo ANTES de parsearlo.
 *   2. Verificar el secreto compartido en tiempo constante.
 *   3. Parsear y quedarse solo con los tipos que sabemos manejar.
 *   4. Resolver a qué clínica pertenece el evento.
 *   5. Despachar.
 *
 * Sobre los códigos de estado: Vapi reintenta ante respuestas que no son 2xx.
 *
 *   · Secreto inválido → **401**. Un 200 silencioso convertiría una rotación mal
 *     aplicada del secreto en pérdida invisible de transcripciones y de tool
 *     calls: el agente seguiría hablando y nadie se enteraría. Con 401 el fallo
 *     es visible y, al corregir el secreto, el reintento entrega el evento.
 *   · Fallos de negocio (hueco ocupado, Google desconectado, argumentos
 *     inválidos) → **200** con el detalle dentro de `results[]`. Un reintento no
 *     los arreglaría y podría duplicar reservas.
 *   · Tipo desconocido o clínica no resuelta → **200**: son estados que no
 *     cambian por reintentar.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const crudo = await request.text();

  if (crudo.length > MAX_BYTES) {
    return NextResponse.json({ error: 'cuerpo demasiado grande' }, { status: 413 });
  }

  if (!verificarSecretoVapi(request.headers)) {
    console.warn('[vapi] webhook rechazado: secreto inválido o ausente');
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    return NextResponse.json({ error: 'json inválido' }, { status: 400 });
  }

  const mensaje = extraerMensaje(cuerpo);
  if (!mensaje?.type) {
    return NextResponse.json({ error: 'mensaje sin tipo' }, { status: 400 });
  }

  if (!TIPOS_SOPORTADOS.has(mensaje.type)) {
    // Vapi envía más eventos de los que esta app necesita. Aceptarlos sin
    // procesarlos evita reintentos inútiles.
    return NextResponse.json({});
  }

  const clinic = await resolverClinica(mensaje);

  if (!clinic) {
    console.warn(
      `[vapi] evento ${mensaje.type} sin clínica: assistantId=${mensaje.call?.assistantId ?? '—'} phoneNumberId=${mensaje.call?.phoneNumberId ?? '—'}`,
    );

    // Aun así hay que devolver un resultado por cada tool call, o el agente
    // se queda mudo esperando.
    if (mensaje.type === 'tool-calls') {
      return NextResponse.json({
        results: (mensaje.toolCallList ?? []).map((llamada) => ({
          toolCallId: llamada.id,
          name: llamada.function?.name ?? 'unknown',
          error: 'Configuración no encontrada para este asistente.',
        })),
      });
    }

    return NextResponse.json({});
  }

  try {
    switch (mensaje.type) {
      case 'tool-calls':
        return NextResponse.json(await manejarToolCalls(mensaje, clinic));

      case 'end-of-call-report':
        await manejarFinDeLlamada(mensaje, clinic);
        return NextResponse.json({});

      case 'status-update':
        await manejarActualizacionEstado(mensaje, clinic);
        return NextResponse.json({});

      default:
        return NextResponse.json({});
    }
  } catch (error) {
    console.error(`[vapi] fallo procesando ${mensaje.type}`, error);

    // Un 500 haría que Vapi reintentara. Para `tool-calls` eso significaría
    // ejecutar la herramienta otra vez, así que se responde 200 con el error
    // dentro del resultado.
    if (mensaje.type === 'tool-calls') {
      return NextResponse.json({
        results: (mensaje.toolCallList ?? []).map((llamada) => ({
          toolCallId: llamada.id,
          name: llamada.function?.name ?? 'unknown',
          error: 'No pude completar la operación.',
        })),
      });
    }

    return NextResponse.json({ error: 'fallo interno' }, { status: 500 });
  }
}

/** Comprobación de salud para verificar que la URL es alcanzable. */
export function GET(): NextResponse {
  return NextResponse.json({ ok: true, endpoint: 'vapi-webhook' });
}

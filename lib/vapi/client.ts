import 'server-only';

import { VapiClient } from '@vapi-ai/server-sdk';

import { serverEnv } from '@/lib/env.server';

let cached: VapiClient | null = null;

/**
 * Cliente de servidor de Vapi.
 *
 * La `VAPI_API_KEY` es una clave privada: nunca debe salir de este proceso ni
 * acabar en una variable `NEXT_PUBLIC_`.
 */
export function vapiClient(): VapiClient {
  if (!cached) {
    cached = new VapiClient({ token: serverEnv().VAPI_API_KEY });
  }
  return cached;
}

/** Código HTTP de un error de la API, si se puede determinar. */
export function codigoHttp(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;

  for (const clave of ['statusCode', 'status']) {
    const valor = (error as Record<string, unknown>)[clave];
    if (typeof valor === 'number') return valor;
  }

  return null;
}

/** Mensaje legible de un error de la API de Vapi. */
export function mensajeDeError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const cuerpo = (error as { body?: unknown }).body;
    if (typeof cuerpo === 'string') return cuerpo;
    if (typeof cuerpo === 'object' && cuerpo !== null) {
      const mensaje = (cuerpo as { message?: unknown }).message;
      if (typeof mensaje === 'string') return mensaje;
      if (Array.isArray(mensaje)) return mensaje.join('; ');
      return JSON.stringify(cuerpo);
    }
  }

  return error instanceof Error ? error.message : String(error);
}

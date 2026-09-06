import 'server-only';

import { secretosIguales } from '@/lib/crypto/aes';
import { serverEnv } from '@/lib/env.server';

/** Cabecera en la que viaja el secreto compartido que publicamos en el asistente. */
export const CABECERA_SECRETO = 'x-vapi-secret';

/**
 * Verifica que la petición viene de nuestro asistente.
 *
 * `Server` en la API de Vapi no tiene campo `secret`: la autenticación se
 * configura con `server.headers` (o con una credencial guardada). Por eso el
 * mecanismo es un secreto compartido en cabecera propia y no una firma HMAC con
 * formato fijo — la documentación oficial advierte explícitamente de que el
 * nombre de cabecera, el algoritmo y el formato de una credencial HMAC son
 * configurables y no deben darse por supuestos.
 *
 * La comparación es en tiempo constante sobre digests, así que no filtra ni el
 * contenido ni la longitud del secreto real.
 */
export function verificarSecretoVapi(cabeceras: Headers): boolean {
  return secretosIguales(cabeceras.get(CABECERA_SECRETO), serverEnv().VAPI_WEBHOOK_SECRET);
}

import 'server-only';

import { createHash } from 'node:crypto';

import { construirSystemPrompt } from '@/lib/agent/prompt';
import { serverEnv } from '@/lib/env.server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { AgentConfig, Clinic } from '@/lib/supabase/database.types';
import { codigoHttp, mensajeDeError, vapiClient } from '@/lib/vapi/client';
import { construirTools } from '@/lib/vapi/tools';
import { esErrorDeVoz } from '@/lib/vapi/voices';

/** Límite duro de la API: un nombre más largo se rechaza. */
const MAX_NOMBRE = 40;

export interface ResultadoPublicacion {
  assistantId: string;
  hash: string;
  aviso: string | null;
}

interface PayloadAsistente extends Record<string, unknown> {
  name: string;
  firstMessage: string;
  model: Record<string, unknown>;
  voice: { provider: string; voiceId: string };
  transcriber: Record<string, unknown>;
  server: Record<string, unknown>;
  serverMessages: string[];
  compliancePlan: { hipaaEnabled: boolean };
}

/**
 * Construye el payload del asistente a partir de la configuración de la clínica.
 *
 * Detalles verificados contra los tipos del SDK que se equivocan a menudo:
 *   · No existen `serverUrl` ni `serverUrlSecret`; se usa el objeto `server`.
 *   · `Server` tampoco tiene `secret`: el secreto compartido viaja en `headers`.
 *   · `hipaaEnabled` vive bajo `compliancePlan`, no en la raíz.
 */
export function construirPayload(
  clinic: Clinic,
  config: AgentConfig,
  voz: { provider: string; voiceId: string },
): PayloadAsistente {
  const env = serverEnv();

  return {
    name: clinic.name.trim().slice(0, MAX_NOMBRE),
    firstMessage: config.first_message,
    model: {
      provider: config.model_provider,
      model: config.model_name,
      temperature: 0.3,
      messages: [{ role: 'system', content: construirSystemPrompt(clinic, config) }],
      tools: construirTools(clinic),
    },
    voice: voz,
    transcriber: {
      provider: 'deepgram',
      model: 'nova-3',
      language: config.language,
    },
    server: {
      url: `${env.APP_URL.replace(/\/$/, '')}/api/vapi/webhook`,
      headers: { 'x-vapi-secret': env.VAPI_WEBHOOK_SECRET },
      timeoutSeconds: 20,
    },
    serverMessages: ['tool-calls', 'end-of-call-report', 'status-update'],
    compliancePlan: { hipaaEnabled: config.hipaa_enabled },
  };
}

/** Huella del payload para detectar cambios sin publicar. */
export function hashPayload(payload: PayloadAsistente): string {
  return createHash('sha256').update(jsonCanonico(payload)).digest('hex');
}

function jsonCanonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(',')}]`;
  if (valor && typeof valor === 'object') {
    const entradas = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entradas.map(([k, v]) => `${JSON.stringify(k)}:${jsonCanonico(v)}`).join(',')}}`;
  }
  return JSON.stringify(valor ?? null);
}

/**
 * Crea o actualiza el asistente de la clínica y le asigna su número.
 *
 * Si Vapi rechaza la voz con un 400, se reintenta **una sola vez** con la voz de
 * respaldo. La regla de la guía oficial es corregir un problema de validación
 * como mucho una vez y nunca repetir una petición sin cambios: reintentar en
 * bucle solo consume cuota y oculta el problema real.
 */
export async function publicarAsistente(
  clinic: Clinic,
  config: AgentConfig,
): Promise<ResultadoPublicacion> {
  const env = serverEnv();
  const db = createAdminClient();

  const vozPreferida = { provider: config.voice_provider, voiceId: config.voice_id };
  const vozRespaldo = {
    provider: env.VAPI_FALLBACK_VOICE_PROVIDER,
    voiceId: env.VAPI_FALLBACK_VOICE_ID,
  };

  let aviso: string | null = null;
  let payload = construirPayload(clinic, config, vozPreferida);
  let assistantId: string;

  try {
    assistantId = await crearOActualizar(clinic, payload);
  } catch (error) {
    const codigo = codigoHttp(error);
    const mensaje = mensajeDeError(error);

    // Un único reintento, y solo si el fallo es inequívocamente de la voz.
    if (codigo === 400 && esErrorDeVoz(mensaje)) {
      payload = construirPayload(clinic, config, vozRespaldo);

      try {
        assistantId = await crearOActualizar(clinic, payload);
      } catch (segundoError) {
        await registrarFallo(clinic.id, mensajeDeError(segundoError));
        throw new Error(`Vapi rechazó la publicación: ${mensajeDeError(segundoError)}`);
      }

      aviso = `Vapi no aceptó la voz ${vozPreferida.voiceId}, así que se publicó con ${vozRespaldo.voiceId}. Elige otra voz en Personalización si quieres cambiarla.`;

      await db
        .from('agent_configs')
        .update({ voice_provider: vozRespaldo.provider, voice_id: vozRespaldo.voiceId })
        .eq('clinic_id', clinic.id);
    } else {
      await registrarFallo(clinic.id, mensaje);
      // 401/403: credenciales. 404: dependencia inexistente. 5xx: fallo del
      // servicio. Ninguno se arregla reintentando.
      throw new Error(`Vapi rechazó la publicación${codigo ? ` (${codigo})` : ''}: ${mensaje}`);
    }
  }

  // El asistente existe, pero eso no significa que reciba llamadas: hay que
  // asignarlo al número.
  if (clinic.vapi_phone_number_id) {
    await vincularNumero(clinic.vapi_phone_number_id, assistantId);
  }

  const hash = hashPayload(payload);

  await db.from('clinics').update({ vapi_assistant_id: assistantId }).eq('id', clinic.id);
  await db
    .from('agent_configs')
    .update({
      published_at: new Date().toISOString(),
      published_hash: hash,
      last_publish_error: null,
    })
    .eq('clinic_id', clinic.id);

  return { assistantId, hash, aviso };
}

/**
 * Crea el asistente o lo actualiza preservando lo que no gestionamos.
 *
 * En la actualización se hace GET y se mezcla el `model` COMPLETO. Enviar un
 * `model` parcial escrito a mano borraría campos como `knowledgeBaseId`,
 * `maxTokens` o ajustes de razonamiento que no tocamos: la API reemplaza el
 * objeto anidado, no lo fusiona.
 */
async function crearOActualizar(clinic: Clinic, payload: PayloadAsistente): Promise<string> {
  const cliente = vapiClient();

  if (!clinic.vapi_assistant_id) {
    // El SDK tipa `voice` y `model` como uniones discriminadas por proveedor;
    // aquí los valores vienen de la base de datos, así que la comprobación es en
    // tiempo de ejecución (Vapi responde 400 si no le cuadran).
    const creado = await cliente.assistants.create(payload as never);
    const id = (creado as { id?: string }).id;
    if (!id) throw new Error('Vapi creó el asistente pero no devolvió su identificador.');
    return id;
  }

  // El SDK usa objetos de petición, no argumentos posicionales: `get({ id })`,
  // y en `update` el id viaja DENTRO del DTO.
  const actual = (await cliente.assistants.get({ id: clinic.vapi_assistant_id })) as {
    model?: Record<string, unknown>;
  };

  const modeloMezclado = {
    ...(actual.model ?? {}),
    ...payload.model,
    // Los arrays se reemplazan enteros: mezclarlos duplicaría herramientas y
    // mensajes de sistema.
    messages: payload.model.messages,
    tools: payload.model.tools,
  };

  await cliente.assistants.update({
    id: clinic.vapi_assistant_id,
    ...payload,
    model: modeloMezclado,
  } as never);

  return clinic.vapi_assistant_id;
}

/**
 * Asigna el asistente al número.
 *
 * Se lee el número antes de actualizarlo para reenviar su `provider`: es el
 * discriminador del tipo y, sin él, la API responde 400.
 */
async function vincularNumero(phoneNumberId: string, assistantId: string): Promise<void> {
  const cliente = vapiClient();

  const numero = (await cliente.phoneNumbers.get({ id: phoneNumberId })) as { provider?: string };

  // `update` toma `{ id, body }`: los campos NO van al mismo nivel que el id.
  await cliente.phoneNumbers.update({
    id: phoneNumberId,
    body: { provider: numero.provider, assistantId },
  } as never);
}

async function registrarFallo(clinicId: number, mensaje: string): Promise<void> {
  await createAdminClient()
    .from('agent_configs')
    .update({ last_publish_error: mensaje.slice(0, 1000) })
    .eq('clinic_id', clinicId);
}

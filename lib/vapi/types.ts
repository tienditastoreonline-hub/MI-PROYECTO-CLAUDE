/**
 * Formas del webhook de Vapi, acotadas a lo que esta aplicación usa.
 *
 * Están verificadas contra los tipos de `@vapi-ai/server-sdk`. Dos detalles que
 * se equivocan con frecuencia y que aquí quedan fijados por el sistema de tipos:
 *
 *   1. La lista de llamadas a herramienta es `toolCallList`, no `toolCalls`.
 *   2. `function.arguments` es un **string JSON**, no un objeto. Tratarlo como
 *      objeto deja todos los campos en `undefined` sin lanzar ningún error.
 */

/** Una invocación de herramienta pedida por el modelo. */
export interface VapiToolCall {
  id: string;
  type?: string;
  function: {
    name: string;
    /** JSON serializado. Hay que parsearlo y validarlo antes de usarlo. */
    arguments: string;
  };
}

/**
 * Resultado que se devuelve por cada tool call.
 *
 * `name` es obligatorio en el tipo de la API: omitirlo corta el turno y el
 * agente se queda mudo en mitad de la llamada.
 */
export interface VapiToolCallResult {
  toolCallId: string;
  name: string;
  result?: string;
  error?: string;
}

export interface VapiRespuestaToolCalls {
  results: VapiToolCallResult[];
}

export interface VapiCall {
  id?: string;
  assistantId?: string;
  phoneNumberId?: string;
  type?: string;
  status?: string;
  customer?: { number?: string; name?: string; email?: string };
}

export interface VapiArtifact {
  transcript?: string;
  recordingUrl?: string;
  stereoRecordingUrl?: string;
  messages?: Array<{ role?: string; message?: string; secondsFromStart?: number }>;
}

export interface VapiAnalysis {
  summary?: string;
  successEvaluation?: string;
}

export type VapiMessageType =
  | 'tool-calls'
  | 'end-of-call-report'
  | 'status-update'
  | 'transcript'
  | 'conversation-update'
  | 'hang'
  | 'speech-update'
  | 'assistant-request';

export interface VapiServerMessage {
  type?: VapiMessageType | string;
  toolCallList?: VapiToolCall[];
  call?: VapiCall;
  phoneNumber?: { id?: string; number?: string };
  assistant?: { id?: string; name?: string };
  customer?: { number?: string };
  artifact?: VapiArtifact;
  analysis?: VapiAnalysis;
  status?: string;
  endedReason?: string;
  cost?: number;
  startedAt?: string;
  endedAt?: string;
  timestamp?: number;
}

export interface VapiWebhookBody {
  message?: VapiServerMessage;
}

/** Tipos que este servidor procesa. El resto se acepta y se ignora. */
export const TIPOS_SOPORTADOS = new Set<string>([
  'tool-calls',
  'end-of-call-report',
  'status-update',
]);

/**
 * Comprobación estructural mínima del cuerpo recibido.
 *
 * No se valida el mensaje entero contra un esquema estricto a propósito: Vapi
 * añade campos con frecuencia y rechazar un payload por traer algo nuevo
 * significaría perder transcripciones. Lo que sí se valida con rigor son los
 * argumentos de cada tool, en `lib/tools/schemas.ts`.
 */
export function extraerMensaje(cuerpo: unknown): VapiServerMessage | null {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null;

  const mensaje = (cuerpo as VapiWebhookBody).message;
  if (typeof mensaje !== 'object' || mensaje === null) return null;
  if (typeof mensaje.type !== 'string') return null;

  return mensaje;
}

/** Normaliza la lista de tool calls descartando las que no son utilizables. */
export function extraerToolCalls(mensaje: VapiServerMessage): VapiToolCall[] {
  return (mensaje.toolCallList ?? []).filter(
    (llamada): llamada is VapiToolCall =>
      typeof llamada?.id === 'string' && typeof llamada.function?.name === 'string',
  );
}

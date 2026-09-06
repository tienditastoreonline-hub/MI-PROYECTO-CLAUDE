import type { AgentConfig, Clinic } from '@/lib/supabase/database.types';

/**
 * Contexto con el que se ejecuta una herramienta.
 *
 * `clinic` y `callerNumber` los resuelve el servidor a partir del evento del
 * webhook: nunca vienen de los argumentos del modelo.
 */
export interface ContextoTool {
  clinic: Clinic;
  config: AgentConfig;
  /** Número desde el que llama el paciente, si Vapi lo entrega. */
  callerNumber: string | null;
  /** Identificador de la llamada en Vapi, para vincular la cita con su grabación. */
  vapiCallId: string | null;
  /** Clave de idempotencia: el id de esta invocación concreta. */
  toolCallId: string;
}

/**
 * Lo que devuelve una herramienta.
 *
 * `result` es texto que el agente verbaliza; `error` señala un fallo real de
 * infraestructura. Un problema de negocio (el hueco se acaba de ocupar) va en
 * `result` con las alternativas, no en `error`: el agente debe poder seguir la
 * conversación en vez de disculparse.
 */
export type ResultadoTool = { result: string } | { error: string };

export type ManejadorTool = (contexto: ContextoTool, argumentos: unknown) => Promise<ResultadoTool>;

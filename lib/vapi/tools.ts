import 'server-only';

import { aJSONSchema } from '@/lib/tools/schemas';
import { TOOLS } from '@/lib/tools/registry';
import type { Clinic } from '@/lib/supabase/database.types';

/** Definición de herramienta tal como la espera el asistente. */
export interface ToolDeAsistente {
  type: string;
  function?: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
  destinations?: Array<Record<string, unknown>>;
}

/**
 * Construye las herramientas del asistente.
 *
 * Se usan herramientas *transient* (inline en `model.tools`) en vez de
 * herramientas guardadas con `toolIds`. Con N clínicas, las guardadas obligarían
 * a mantener N×5 objetos remotos sincronizados, con el riesgo de dejar huérfanos
 * si una publicación falla a medias y de que editar una herramienta compartida
 * afecte a todas las clínicas. Con transient, publicar es una sola llamada
 * atómica y la fuente de verdad vive en este repositorio.
 *
 * El `server` (URL y secreto) se declara a nivel de asistente, que tiene la
 * precedencia más alta, y no en cada herramienta.
 */
export function construirTools(clinic: Clinic): ToolDeAsistente[] {
  const tools: ToolDeAsistente[] = TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.nombre,
      description: tool.descripcion,
      parameters: aJSONSchema(tool.schema),
    },
  }));

  // Herramienta nativa: sin ella el asistente no sabe colgar y la llamada se
  // alarga hasta que el paciente cuelga.
  tools.push({ type: 'endCall' });

  // Transferir a recepción solo tiene sentido si hay un número al que transferir.
  if (clinic.phone_e164) {
    tools.push({
      type: 'transferCall',
      destinations: [
        {
          type: 'number',
          number: clinic.phone_e164,
          message: 'Le comunico con recepción, un momento por favor.',
        },
      ],
    });
  }

  return tools;
}

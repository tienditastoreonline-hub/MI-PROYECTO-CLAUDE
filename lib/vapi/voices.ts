/**
 * Voces disponibles en el panel.
 *
 * `verificada` marca las que están respaldadas por el enum de tipos del SDK. Las
 * voces de Azure en español compilan porque `voiceId` acepta cualquier string,
 * pero el enum del SDK solo garantiza un puñado de nombres: si Vapi rechaza una
 * al publicar, `publish.ts` reintenta una única vez con la voz de respaldo y deja
 * constancia en `last_publish_error`.
 */
export interface VozDisponible {
  provider: string;
  voiceId: string;
  etiqueta: string;
  verificada: boolean;
}

export const VOCES: readonly VozDisponible[] = [
  { provider: 'azure', voiceId: 'es-MX-DaliaNeural', etiqueta: 'Dalia — español de México (femenina)', verificada: false },
  { provider: 'azure', voiceId: 'es-MX-JorgeNeural', etiqueta: 'Jorge — español de México (masculina)', verificada: false },
  { provider: 'azure', voiceId: 'es-ES-ElviraNeural', etiqueta: 'Elvira — español de España (femenina)', verificada: false },
  { provider: 'vapi', voiceId: 'Elliot', etiqueta: 'Elliot — voz de Vapi (multilingüe)', verificada: true },
] as const;

export function buscarVoz(provider: string, voiceId: string): VozDisponible | null {
  return VOCES.find((v) => v.provider === provider && v.voiceId === voiceId) ?? null;
}

/** ¿El error 400 de Vapi se refiere a la voz? */
export function esErrorDeVoz(mensaje: string): boolean {
  return /voice|voiceId/i.test(mensaje);
}

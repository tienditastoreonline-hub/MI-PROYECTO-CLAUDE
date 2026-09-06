import { NextResponse } from 'next/server';

import { requireClinic } from '@/lib/auth/tenant';
import { urlDeConsentimiento } from '@/lib/google/oauth';

export const runtime = 'nodejs';

/**
 * Inicia el consentimiento de Google para la clínica del usuario autenticado.
 *
 * La clínica sale de la sesión, nunca de la query: el `state` firmado la lleva
 * de vuelta en el callback para que nadie pueda conectar su cuenta de Google a
 * la clínica de otro.
 */
export async function GET(): Promise<NextResponse> {
  const { clinic, esOwner } = await requireClinic();

  if (!esOwner) {
    return NextResponse.json(
      { error: 'Solo el dueño de la clínica puede conectar Google Calendar.' },
      { status: 403 },
    );
  }

  return NextResponse.redirect(urlDeConsentimiento(clinic.id));
}

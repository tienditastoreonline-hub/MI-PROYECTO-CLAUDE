import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/proxy';

/**
 * En Next.js 16 el middleware pasó a llamarse "proxy" (`proxy.ts`, runtime
 * nodejs). Un `middleware.ts` heredado aquí no se ejecutaría y la sesión no se
 * refrescaría nunca.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Todas las rutas excepto estáticos e imágenes. El webhook de Vapi vive bajo
     * /api/vapi y se trata como ruta pública dentro de `updateSession`: se
     * autentica con su propio secreto compartido, no con cookies.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};

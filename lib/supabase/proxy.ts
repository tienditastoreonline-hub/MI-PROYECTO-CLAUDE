import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { getPublicEnv } from '@/lib/env';
import type { Database } from '@/lib/supabase/database.types';

/** Rutas alcanzables sin sesión. */
const RUTAS_PUBLICAS = ['/login', '/signup', '/auth', '/api/vapi'];

function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`));
}

/**
 * Refresca el token de sesión y protege las rutas privadas.
 *
 * Sigue el patrón oficial de Supabase para Next.js. Dos detalles que no son
 * opcionales:
 *
 *  1. Se llama a `getClaims()`, nunca a `getSession()`: `getSession()` no
 *     revalida el token en servidor. `getClaims()` verifica la firma del JWT
 *     contra las claves públicas del proyecto en cada llamada.
 *  2. No debe ejecutarse NADA entre `createServerClient` y `getClaims()`, o se
 *     provocan cierres de sesión aleatorios difíciles de depurar.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const env = getPublicEnv();

  const supabase = createServerClient<Database>(
    env.supabaseUrl,
    env.supabasePublicKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
          // Cabeceras de caché que evitan que un CDN sirva la sesión de un
          // usuario a otro.
          for (const [clave, valor] of Object.entries(headers)) {
            supabaseResponse.headers.set(clave, valor);
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const { pathname } = request.nextUrl;

  if (!claims && !esRutaPublica(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if (claims && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Debe devolverse este objeto tal cual: si se construye otra respuesta sin
  // copiar sus cookies, el navegador y el servidor se desincronizan.
  return supabaseResponse;
}

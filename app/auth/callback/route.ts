import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** Canjea el código PKCE por una sesión (confirmación de correo, magic link). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=codigo-ausente`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=enlace-invalido`);
  }

  // Solo destinos internos: `next` viene de la URL y no es de fiar.
  return NextResponse.redirect(`${origin}${next.startsWith('/') ? next : '/dashboard'}`);
}

import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** Verifica los enlaces de confirmación y recuperación por OTP. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/dashboard';

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/login?error=enlace-incompleto`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=enlace-expirado`);
  }

  return NextResponse.redirect(`${origin}${next.startsWith('/') ? next : '/dashboard'}`);
}

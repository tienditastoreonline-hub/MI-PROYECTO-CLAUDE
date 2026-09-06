'use server';

import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

export interface EstadoAuth {
  error?: string;
  mensaje?: string;
}

/**
 * Los mensajes de error de Supabase Auth se traducen a algo que un recepcionista
 * entienda, sin revelar si un correo existe o no.
 */
function traducirError(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Confirma tu correo antes de iniciar sesión.';
  if (m.includes('user already registered')) return 'Ya existe una cuenta con ese correo.';
  if (m.includes('password')) return 'La contraseña debe tener al menos 8 caracteres.';
  if (m.includes('rate limit')) return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
  return 'No se pudo completar la operación. Inténtalo de nuevo.';
}

export async function signIn(_prev: EstadoAuth, formData: FormData): Promise<EstadoAuth> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const redirectTo = String(formData.get('redirect') ?? '/dashboard');

  if (!email || !password) {
    return { error: 'Escribe tu correo y tu contraseña.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: traducirError(error.message) };
  }

  revalidatePath('/', 'layout');
  // Solo se permiten destinos internos: un `redirect` tomado del formulario sin
  // validar sería un open redirect. El destino es dinámico, así que `typedRoutes`
  // no puede comprobarlo en compilación y hace falta la aserción.
  const destino = (redirectTo.startsWith('/') ? redirectTo : '/dashboard') as Route;
  redirect(destino);
}

export async function signUp(_prev: EstadoAuth, formData: FormData): Promise<EstadoAuth> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const clinicName = String(formData.get('clinic_name') ?? '').trim();
  const fullName = String(formData.get('full_name') ?? '').trim();

  if (!email || !password || !clinicName) {
    return { error: 'Completa el nombre de la clínica, tu correo y una contraseña.' };
  }

  if (password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres.' };
  }

  const supabase = await createClient();

  // `clinic_name` viaja en el metadata del usuario: el trigger
  // `handle_new_user()` lo lee para crear la clínica, el perfil de dueño y la
  // configuración inicial del agente, todo en la misma transacción.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { clinic_name: clinicName, full_name: fullName || null } },
  });

  if (error) {
    return { error: traducirError(error.message) };
  }

  // Si el proyecto exige confirmación por correo, no hay sesión todavía.
  if (!data.session) {
    return { mensaje: 'Revisa tu correo para confirmar la cuenta y luego inicia sesión.' };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath('/', 'layout');
  redirect('/login');
}

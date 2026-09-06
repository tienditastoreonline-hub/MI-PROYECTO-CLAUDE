/**
 * Variables de entorno públicas (las que sí pueden llegar al navegador).
 *
 * Next.js sustituye `process.env.NEXT_PUBLIC_*` en tiempo de compilación solo si
 * se accede de forma literal, por eso no se indexa dinámicamente.
 *
 * La validación es perezosa a propósito: si se hiciera al importar el módulo,
 * `next build` fallaría en una máquina sin `.env`, aunque el build en sí no
 * necesite conectarse a nada.
 */
export interface PublicEnv {
  supabaseUrl: string;
  supabasePublicKey: string;
}

export function getPublicEnv(): PublicEnv {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  // Se acepta la clave publishable (preferida) o la anon legacy: los proyectos
  // creados antes del cambio de nomenclatura siguen emitiendo `anon`.
  const supabasePublicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL. Copia .env.example a .env.local.');
  }

  if (!supabasePublicKey) {
    throw new Error(
      'Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o NEXT_PUBLIC_SUPABASE_ANON_KEY). Copia .env.example a .env.local.',
    );
  }

  return { supabaseUrl, supabasePublicKey };
}

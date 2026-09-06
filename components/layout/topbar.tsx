import { SignOut } from '@phosphor-icons/react/dist/ssr';

import { signOut } from '@/app/(auth)/actions';

export function Topbar({ email, role }: { email: string | null; role: string }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-borde bg-superficie px-6 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm text-tinta">{email ?? 'Sesión activa'}</p>
        <p className="text-xs text-tinta-tenue">{role === 'owner' ? 'Dueño' : 'Personal'}</p>
      </div>

      <form action={signOut}>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-panel px-3 py-1.5 text-sm font-medium text-tinta-suave transition-colors hover:bg-lienzo hover:text-tinta"
        >
          <SignOut size={16} />
          Salir
        </button>
      </form>
    </header>
  );
}

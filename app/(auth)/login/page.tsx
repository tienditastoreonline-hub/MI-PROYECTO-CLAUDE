'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useActionState } from 'react';

import { signIn, type EstadoAuth } from '@/app/(auth)/actions';
import { Button, Card, CardBody, ErrorNote, Field, Input } from '@/components/ui';

const ESTADO_INICIAL: EstadoAuth = {};

function FormularioLogin() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/dashboard';
  const [estado, formAction, pendiente] = useActionState(signIn, ESTADO_INICIAL);

  return (
    <Card>
      <CardBody className="flex flex-col gap-5 py-6">
        <div>
          <h1 className="text-lg font-semibold text-tinta">Entrar al panel</h1>
          <p className="mt-1 text-sm text-tinta-suave">
            Administra el agente de voz de tu clínica.
          </p>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="redirect" value={redirectTo} />

          <Field label="Correo" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>

          <Field label="Contraseña" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>

          {estado.error ? <ErrorNote>{estado.error}</ErrorNote> : null}

          <Button type="submit" disabled={pendiente}>
            {pendiente ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>

        <p className="text-sm text-tinta-suave">
          ¿Aún no tienes cuenta?{' '}
          <Link href="/signup" className="font-medium text-marca hover:underline">
            Registra tu clínica
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <FormularioLogin />
    </Suspense>
  );
}

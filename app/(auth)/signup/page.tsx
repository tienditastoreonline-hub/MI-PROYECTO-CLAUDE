'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { signUp, type EstadoAuth } from '@/app/(auth)/actions';
import { Button, Card, CardBody, ErrorNote, Field, Input } from '@/components/ui';

const ESTADO_INICIAL: EstadoAuth = {};

export default function SignupPage() {
  const [estado, formAction, pendiente] = useActionState(signUp, ESTADO_INICIAL);

  return (
    <Card>
      <CardBody className="flex flex-col gap-5 py-6">
        <div>
          <h1 className="text-lg font-semibold text-tinta">Registra tu clínica</h1>
          <p className="mt-1 text-sm text-tinta-suave">
            Se creará tu clínica con un agente configurado para atención dental.
          </p>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <Field label="Nombre de la clínica" htmlFor="clinic_name">
            <Input
              id="clinic_name"
              name="clinic_name"
              required
              maxLength={120}
              placeholder="Clínica Dental Sonrisa"
            />
          </Field>

          <Field label="Tu nombre" htmlFor="full_name">
            <Input id="full_name" name="full_name" autoComplete="name" />
          </Field>

          <Field label="Correo" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>

          <Field label="Contraseña" htmlFor="password" hint="Mínimo 8 caracteres.">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>

          {estado.error ? <ErrorNote>{estado.error}</ErrorNote> : null}
          {estado.mensaje ? (
            <p className="rounded-panel border border-marca/20 bg-marca-suave px-3 py-2 text-sm text-marca-oscura">
              {estado.mensaje}
            </p>
          ) : null}

          <Button type="submit" disabled={pendiente}>
            {pendiente ? 'Creando…' : 'Crear cuenta'}
          </Button>
        </form>

        <p className="text-sm text-tinta-suave">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="font-medium text-marca hover:underline">
            Entrar
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}

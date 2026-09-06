'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui';

/** Desconecta Google. Pide confirmación porque el agente deja de poder agendar. */
export function DesconectarGoogle() {
  const router = useRouter();
  const [enCurso, setEnCurso] = useState(false);

  async function desconectar() {
    if (!confirm('Al desconectar Google Calendar el agente dejará de consultar disponibilidad y de crear citas. ¿Continuar?')) {
      return;
    }

    setEnCurso(true);
    try {
      await fetch('/api/google/disconnect', { method: 'POST' });
      router.refresh();
    } finally {
      setEnCurso(false);
    }
  }

  return (
    <Button type="button" variante="secundario" onClick={desconectar} disabled={enCurso}>
      {enCurso ? 'Desconectando…' : 'Desconectar'}
    </Button>
  );
}

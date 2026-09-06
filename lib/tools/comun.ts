import 'server-only';

import { randomBytes } from 'node:crypto';

import type { AgentConfig, Service } from '@/lib/supabase/database.types';

/**
 * Busca un tratamiento por nombre tolerando cómo lo transcribe el reconocimiento
 * de voz: sin acentos, con mayúsculas distintas o con palabras de más.
 */
export function encontrarServicio(config: AgentConfig, nombre: string): Service | null {
  const buscado = normalizar(nombre);
  if (!buscado) return null;

  const servicios = config.services;

  const exacto = servicios.find((s) => normalizar(s.name) === buscado);
  if (exacto) return exacto;

  const parcial = servicios.find(
    (s) => normalizar(s.name).includes(buscado) || buscado.includes(normalizar(s.name)),
  );

  return parcial ?? null;
}

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function nombresDeServicios(config: AgentConfig): string[] {
  return config.services.map((s) => s.name);
}

/**
 * Código corto que el agente dicta por teléfono.
 *
 * Sin I, O, 0 ni 1: por teléfono se confunden constantemente.
 */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generarCodigoReferencia(): string {
  const bytes = randomBytes(6);
  let codigo = '';
  for (let i = 0; i < 6; i += 1) {
    codigo += ALFABETO[(bytes[i] as number) % ALFABETO.length];
  }
  return codigo;
}

/** Deletrea el código para que se entienda al oírlo: "A7K2M9" → "A, 7, K, 2, M, 9". */
export function deletrear(codigo: string): string {
  return codigo.split('').join(', ');
}

/** Normaliza un teléfono a solo dígitos para poder compararlo. */
export function soloDigitos(telefono: string | null | undefined): string {
  return (telefono ?? '').replace(/\D/g, '');
}

/**
 * Compara dos teléfonos por sus últimos 10 dígitos.
 *
 * El número que entrega Vapi viene en E.164 (+52...) y el que dicta el paciente
 * casi nunca: comparar las cadenas completas fallaría siempre.
 */
export function mismoTelefono(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = soloDigitos(a).slice(-10);
  const db = soloDigitos(b).slice(-10);
  return da.length === 10 && da === db;
}

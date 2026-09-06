import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

import { serverEnv } from '@/lib/env.server';

const ALGORITMO = 'aes-256-gcm';
const IV_BYTES = 12; // 96 bits, el tamaño recomendado para GCM
const VERSION = 'v1';

function claveMaestra(): Buffer {
  return Buffer.from(serverEnv().ENCRYPTION_KEY, 'hex');
}

/**
 * Cifra un secreto con AES-256-GCM.
 *
 * El `aad` (additional authenticated data) ata el texto cifrado a su contexto:
 * se pasa algo como `clinic:12:refresh_token`. Si alguien copiara el valor
 * cifrado a la fila de otra clínica, el descifrado fallaría en la verificación
 * de autenticidad en vez de entregar el token de otro tenant.
 *
 * Formato: "v1.<iv>.<tag>.<ciphertext>", todo en base64url.
 */
export function encryptSecret(textoPlano: string, aad: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITMO, claveMaestra(), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));

  const cifrado = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), cifrado.toString('base64url')].join('.');
}

/** Descifra un valor producido por `encryptSecret`. Lanza si el `aad` no coincide. */
export function decryptSecret(sobre: string, aad: string): string {
  const partes = sobre.split('.');
  if (partes.length !== 4) {
    throw new Error('Formato de secreto cifrado inválido');
  }

  const [version, ivB64, tagB64, cifradoB64] = partes as [string, string, string, string];
  if (version !== VERSION) {
    throw new Error(`Versión de cifrado no soportada: ${version}`);
  }

  const decipher = createDecipheriv(ALGORITMO, claveMaestra(), Buffer.from(ivB64, 'base64url'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));

  return Buffer.concat([decipher.update(Buffer.from(cifradoB64, 'base64url')), decipher.final()]).toString('utf8');
}

/** AAD canónico para los tokens de Google de una clínica. */
export function aadTokenGoogle(clinicId: number, tipo: 'access_token' | 'refresh_token'): string {
  return `clinic:${clinicId}:${tipo}`;
}

/**
 * Comparación de secretos en tiempo constante.
 *
 * Se comparan los digests SHA-256 y no las cadenas: así ambos operandos miden
 * siempre 32 bytes y `timingSafeEqual` nunca lanza por longitudes distintas
 * (que además filtraría la longitud del secreto real).
 */
export function secretosIguales(a: string | null | undefined, b: string): boolean {
  const ha = createHash('sha256').update(a ?? '', 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

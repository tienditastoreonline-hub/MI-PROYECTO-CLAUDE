import { describe, expect, it } from 'vitest';

import { aadTokenGoogle, decryptSecret, encryptSecret, secretosIguales } from '@/lib/crypto/aes';

describe('cifrado de secretos (AES-256-GCM)', () => {
  it('descifra lo que cifró', () => {
    const token = '1//0aBcDeFgHiJkLmNoPqRsTuVwXyZ-refresh-token';
    const aad = aadTokenGoogle(42, 'refresh_token');

    expect(decryptSecret(encryptSecret(token, aad), aad)).toBe(token);
  });

  it('produce un texto cifrado distinto cada vez (IV aleatorio)', () => {
    const aad = aadTokenGoogle(1, 'access_token');
    expect(encryptSecret('mismo-valor', aad)).not.toBe(encryptSecret('mismo-valor', aad));
  });

  it('rechaza un texto cifrado movido a otra clínica', () => {
    // Este es el punto del AAD: copiar el valor de una fila a otra no debe
    // permitir leer el token de otro tenant.
    const sobre = encryptSecret('token-de-la-clinica-7', aadTokenGoogle(7, 'refresh_token'));

    expect(() => decryptSecret(sobre, aadTokenGoogle(8, 'refresh_token'))).toThrow();
  });

  it('rechaza un texto cifrado usado para el tipo de token equivocado', () => {
    const sobre = encryptSecret('token', aadTokenGoogle(7, 'refresh_token'));

    expect(() => decryptSecret(sobre, aadTokenGoogle(7, 'access_token'))).toThrow();
  });

  it('rechaza un texto cifrado manipulado', () => {
    const aad = aadTokenGoogle(3, 'access_token');
    const sobre = encryptSecret('token-intacto', aad);
    const partes = sobre.split('.');
    const cifrado = Buffer.from(partes[3] as string, 'base64url');
    cifrado[0] = (cifrado[0] as number) ^ 0xff;
    const manipulado = [partes[0], partes[1], partes[2], cifrado.toString('base64url')].join('.');

    expect(() => decryptSecret(manipulado, aad)).toThrow();
  });

  it('rechaza un sobre con formato inválido', () => {
    expect(() => decryptSecret('no-es-un-sobre', aadTokenGoogle(1, 'access_token'))).toThrow(
      /formato/i,
    );
  });
});

describe('comparación de secretos en tiempo constante', () => {
  it('acepta el secreto correcto', () => {
    expect(secretosIguales('abc123', 'abc123')).toBe(true);
  });

  it('rechaza un secreto distinto', () => {
    expect(secretosIguales('abc123', 'abc124')).toBe(false);
  });

  it('rechaza null y undefined sin lanzar', () => {
    expect(secretosIguales(null, 'abc123')).toBe(false);
    expect(secretosIguales(undefined, 'abc123')).toBe(false);
  });

  it('no lanza cuando las longitudes difieren', () => {
    // Se comparan digests SHA-256, así que ambos lados miden siempre 32 bytes.
    expect(() => secretosIguales('a', 'una-cadena-mucho-mas-larga')).not.toThrow();
    expect(secretosIguales('a', 'una-cadena-mucho-mas-larga')).toBe(false);
  });
});

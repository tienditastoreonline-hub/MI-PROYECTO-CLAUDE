import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // `googleapis` es un paquete Node pesado: se deja fuera del bundle del servidor
  // para que Turbopack no intente empaquetar sus dependencias nativas.
  serverExternalPackages: ['googleapis'],
  typedRoutes: true,
};

export default nextConfig;

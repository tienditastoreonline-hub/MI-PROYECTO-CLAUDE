import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Recepción de voz · Panel de la clínica',
  description:
    'Panel para administrar el agente de voz que atiende llamadas y agenda citas dentales.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

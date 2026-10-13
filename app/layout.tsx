import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PulseHub | Performance + Estoque',
  description: 'Dashboard de performance, vendas e estoque multicanal'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

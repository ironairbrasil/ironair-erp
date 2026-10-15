import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Iron Air ERP | Gestão multicanal',
  description: 'Gestão de vendas, estoque e desempenho multicanal'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

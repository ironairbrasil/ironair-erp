import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Iron Seller | Gestão multicanal',
  description: 'Gestão de vendas, estoque e desempenho multicanal',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Iron Seller', statusBarStyle: 'black-translucent' },
  icons: { apple: '/iron-seller-icon.png', icon: '/iron-seller-icon.png' }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

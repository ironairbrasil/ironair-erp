import './globals.css';
import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = { themeColor: '#0B3D2E' };

export const metadata: Metadata = {
  title: 'Iron Seller | Gestão multicanal',
  description: 'Gestão de vendas, estoque e desempenho multicanal',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Iron Seller', statusBarStyle: 'black-translucent' },
  icons: { apple: '/iron-seller-app-icon-v2.png', icon: '/iron-seller-app-icon-v2.png' }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

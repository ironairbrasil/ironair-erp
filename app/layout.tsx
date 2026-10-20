import './globals.css';
import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = { themeColor: '#0B3D2E' };

export const metadata: Metadata = {
  title: 'Iron Air Seller | Gestão multicanal',
  description: 'Gestão de vendas, estoque e desempenho multicanal',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Iron Air Seller', statusBarStyle: 'black-translucent' },
  icons: { apple: '/apple-icon.png', icon: '/icon.png' }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

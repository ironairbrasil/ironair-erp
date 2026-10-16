import { NextResponse, type NextRequest } from 'next/server';

const publicApi = [
  '/api/auth/', '/api/webhooks/', '/api/cron/', '/api/ingest/', '/api/tracking',
  '/api/integrations/shopify/callback', '/api/integrations/mercadolivre/callback',
  '/api/integrations/meta/callback', '/api/integrations/meta/connect', '/api/integrations/meta/sync', '/api/integrations/meta/disconnect'
];

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.get('origin');
    if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ ok: false, error: 'invalid_origin' }, { status: 403 });
  }
  if (['/privacidade', '/termos', '/exclusao-de-dados', '/forgot-password', '/reset-password', '/sw.js', '/manifest.webmanifest', '/iron-seller-icon.png'].includes(path) || path === '/login' || path === '/onboarding' || (path.startsWith('/api/') && publicApi.some(prefix => path.startsWith(prefix)))) return NextResponse.next();
  if (req.cookies.has('ironair_access') || req.cookies.has('ironair_refresh')) return NextResponse.next();
  if (path.startsWith('/api/')) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|integration-logos).*)'] };

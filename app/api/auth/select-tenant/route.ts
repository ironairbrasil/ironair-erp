import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/tenant';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const requested = String(body.tenantId || '');
    if (!requested) return NextResponse.json({ ok: false, error: 'tenantId obrigatório' }, { status: 400 });
    const headers = new Headers(req.headers);
    headers.set('x-tenant-id', requested);
    const tenantId = await getTenantId(new Request(req.url, { headers }));
    const response = NextResponse.json({ ok: true, tenantId });
    response.cookies.set('ironair_tenant', tenantId, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 30 * 86400 });
    return response;
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'forbidden' }, { status: 403 });
  }
}

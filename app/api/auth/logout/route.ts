import { NextResponse } from 'next/server';
import { clearAuthCookies, revokeAuthSession } from '@/lib/supabase-auth';

export async function POST(req: Request) {
  await revokeAuthSession(req);
  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  response.cookies.set('ironair_tenant', '', { path: '/', maxAge: 0 });
  return response;
}

import { NextResponse } from 'next/server';
import { setAuthCookies, supabasePasswordSignIn } from '@/lib/supabase-auth';
import { enforceBodyLimit, enforceDistributedRateLimit, guardStatus } from '@/lib/request-guard';

export async function POST(req: Request) {
  try {
    enforceBodyLimit(req, 8 * 1024); await enforceDistributedRateLimit(req, 'auth-login', 10, 15 * 60_000);
    const { email, password } = await req.json();
    if (typeof email !== 'string' || typeof password !== 'string') return NextResponse.json({ ok: false, error: 'E-mail e senha obrigatórios' }, { status: 400 });
    const tokens = await supabasePasswordSignIn(email.trim().toLowerCase(), password);
    const response = NextResponse.json({ ok: true });
    setAuthCookies(response, tokens);
    return response;
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Falha no login' }, { status: ['rate_limited','payload_too_large'].includes(error?.message) ? guardStatus(error) : 401 });
  }
}

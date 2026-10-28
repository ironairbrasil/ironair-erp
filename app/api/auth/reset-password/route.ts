import { NextResponse } from 'next/server';
import { updatePasswordWithRecoveryToken } from '@/lib/supabase-auth';
import { enforceBodyLimit, enforceDistributedRateLimit, guardStatus } from '@/lib/request-guard';
export async function POST(req: Request) {
  try { enforceBodyLimit(req, 16 * 1024); await enforceDistributedRateLimit(req, 'auth-reset', 5, 60 * 60_000); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'invalid_request' }, { status: guardStatus(error) }); }
  const { token, password } = await req.json().catch(() => ({}));
  if (typeof token !== 'string' || !token || typeof password !== 'string' || password.length < 12) return NextResponse.json({ ok: false, error: 'Use uma nova senha com pelo menos 12 caracteres' }, { status: 400 });
  try { await updatePasswordWithRecoveryToken(token, password); return NextResponse.json({ ok: true }); }
  catch (error: any) { return NextResponse.json({ ok: false, error: error?.message || 'Link inválido' }, { status: 400 }); }
}

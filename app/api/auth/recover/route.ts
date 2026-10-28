import { NextResponse } from 'next/server';
import { requestPasswordReset } from '@/lib/supabase-auth';
import { enforceBodyLimit, enforceDistributedRateLimit, guardStatus } from '@/lib/request-guard';
export async function POST(req: Request) {
  try { enforceBodyLimit(req, 4 * 1024); await enforceDistributedRateLimit(req, 'auth-recover', 5, 60 * 60_000); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'invalid_request' }, { status: guardStatus(error) }); }
  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: false, error: 'Informe um e-mail válido' }, { status: 400 });
  try { await requestPasswordReset(email.trim().toLowerCase()); } catch { /* same response avoids revealing registered emails */ }
  return NextResponse.json({ ok: true, message: 'Se este e-mail estiver cadastrado, enviaremos um link de redefinição.' });
}

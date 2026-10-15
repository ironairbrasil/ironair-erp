import { NextResponse } from 'next/server';
import { requestPasswordReset } from '@/lib/supabase-auth';
export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: false, error: 'Informe um e-mail válido' }, { status: 400 });
  try { await requestPasswordReset(email.trim().toLowerCase()); } catch { /* same response avoids revealing registered emails */ }
  return NextResponse.json({ ok: true, message: 'Se este e-mail estiver cadastrado, enviaremos um link de redefinição.' });
}

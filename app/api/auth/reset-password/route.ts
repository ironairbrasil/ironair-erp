import { NextResponse } from 'next/server';
import { updatePasswordWithRecoveryToken } from '@/lib/supabase-auth';
export async function POST(req: Request) {
  const { token, password } = await req.json().catch(() => ({}));
  if (typeof token !== 'string' || !token || typeof password !== 'string' || password.length < 12) return NextResponse.json({ ok: false, error: 'Use uma nova senha com pelo menos 12 caracteres' }, { status: 400 });
  try { await updatePasswordWithRecoveryToken(token, password); return NextResponse.json({ ok: true }); }
  catch (error: any) { return NextResponse.json({ ok: false, error: error?.message || 'Link inválido' }, { status: 400 }); }
}

import { NextResponse } from 'next/server';
import { supabaseSignUp } from '@/lib/supabase-auth';

export async function POST(req: Request) {
  try {
    const { email, password, confirmPassword, companyName } = await req.json();
    if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ ok: false, error: 'Informe um e-mail válido e uma senha de pelo menos 8 caracteres' }, { status: 400 });
    }
    if (password !== confirmPassword) return NextResponse.json({ ok: false, error: 'As senhas não coincidem' }, { status: 400 });
    const name = typeof companyName === 'string' ? companyName.trim() : '';
    if (name.length < 2 || name.length > 100) return NextResponse.json({ ok: false, error: 'Informe o nome da empresa (2 a 100 caracteres)' }, { status: 400 });
    await supabaseSignUp(email.trim().toLowerCase(), password, name);
    return NextResponse.json({ ok: true, message: 'Confira seu e-mail para confirmar a conta' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Falha ao criar conta' }, { status: 400 });
  }
}

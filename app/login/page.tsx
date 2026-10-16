"use client";
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      if (mode === 'signup' && password !== confirmPassword) throw new Error('As senhas não coincidem');
      const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, ...(mode === 'signup' ? { companyName, confirmPassword } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha na autenticação');
      if (mode === 'signup') { setMessage('Confira seu e-mail para confirmar a conta. Depois entre aqui.'); setMode('login'); return; }
      const sessionResponse = await fetch('/api/auth/session', { cache: 'no-store' });
      const session = await sessionResponse.json();
      if (!sessionResponse.ok) throw new Error('Confirme seu e-mail antes de entrar');
      location.href = session.tenants?.length ? '/' : '/onboarding';
    } catch (error: any) { setMessage(error?.message || 'Falha na autenticação'); }
    finally { setBusy(false); }
  };
  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#08121a', color: '#e8f0f3', padding: 20 }}>
    <form onSubmit={submit} style={{ width: 'min(100%, 390px)', background: '#101d27', border: '1px solid #2b404d', borderRadius: 16, padding: 28, display: 'grid', gap: 14 }}>
      <h1 style={{ margin: 0 }}><img src="/iron-seller-white.png" alt="Iron Seller" style={{ display: 'block', width: 260, maxWidth: '100%', height: 'auto' }} /></h1>
      <p style={{ margin: 0, color: '#a9bdc7' }}>{mode === 'login' ? 'Entre na sua empresa' : 'Crie sua conta'}</p>
      {mode === 'signup' && <label style={{ display: 'grid', gap: 6 }}>Nome da empresa<input autoComplete="organization" required minLength={2} maxLength={100} value={companyName} onChange={event => setCompanyName(event.target.value)} style={{ padding: 12, borderRadius: 8, border: '1px solid #3a5664', background: '#07131b', color: 'white' }} /></label>}
      <label style={{ display: 'grid', gap: 6 }}>E-mail<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} style={{ padding: 12, borderRadius: 8, border: '1px solid #3a5664', background: '#07131b', color: 'white' }} /></label>
      <label style={{ display: 'grid', gap: 6 }}>Senha<span style={{ position: 'relative', display: 'block' }}><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={event => setPassword(event.target.value)} style={{ padding: '12px 46px 12px 12px', width: '100%', borderRadius: 8, border: '1px solid #3a5664', background: '#07131b', color: 'white' }} /><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'grid', placeItems: 'center', width: 32, height: 32, border: 0, background: 'transparent', color: '#a9bdc7', cursor: 'pointer' }}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></span></label>
      {mode === 'signup' && <label style={{ display: 'grid', gap: 6 }}>Confirme a senha<span style={{ position: 'relative', display: 'block' }}><input type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} style={{ padding: '12px 46px 12px 12px', width: '100%', borderRadius: 8, border: '1px solid #3a5664', background: '#07131b', color: 'white' }} /><button type="button" aria-label={showConfirmation ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'} aria-pressed={showConfirmation} onClick={() => setShowConfirmation(!showConfirmation)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'grid', placeItems: 'center', width: 32, height: 32, border: 0, background: 'transparent', color: '#a9bdc7', cursor: 'pointer' }}>{showConfirmation ? <EyeOff size={19} /> : <Eye size={19} />}</button></span></label>}
      {mode === 'login' && <a href="/forgot-password" style={{ justifySelf: 'end', color: '#92cbb7', fontSize: 13 }}>Esqueci minha senha</a>}
      <button type="submit" disabled={busy} style={{ padding: 12, border: 0, borderRadius: 8, background: '#62d9a7', color: '#07131b', fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
      {message && <p role="status" style={{ margin: 0, color: '#f2bf8f' }}>{message}</p>}
      <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }} style={{ border: 0, background: 'transparent', color: '#92cbb7', cursor: 'pointer' }}>{mode === 'login' ? 'Criar uma conta' : 'Já tenho uma conta'}</button>
      <p style={{ margin: 0, color: '#a9bdc7', fontSize: 12, textAlign: 'center' }}>Ao usar o ERP, consulte a <a href="/privacidade" style={{ color: '#92cbb7' }}>Privacidade</a>, os <a href="/termos" style={{ color: '#92cbb7' }}>Termos</a> e a <a href="/exclusao-de-dados" style={{ color: '#92cbb7' }}>exclusão de dados</a>.</p>
    </form>
  </main>;
}

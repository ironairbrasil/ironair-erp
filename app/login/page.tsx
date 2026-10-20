"use client";
import { useEffect, useState } from 'react';
import { Eye, EyeOff, Moon, Sun } from 'lucide-react';

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
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    if (localStorage.getItem('ironair-theme') === 'light') setTheme('light');
  }, []);
  const toggleTheme = () => setTheme(current => {
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('ironair-theme', next);
    return next;
  });
  const light = theme === 'light';
  const text = light ? '#17242b' : '#e8f0f3';
  const muted = light ? '#5e727e' : '#a9bdc7';
  const input = light ? '#ffffff' : '#07131b';
  const border = light ? '#cbdbe2' : '#3a5664';
  const link = light ? '#087a4c' : '#92cbb7';
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
  return <main className={`theme-${theme}`} style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', position: 'relative', background: light ? '#f3f6f8' : '#08121a', color: text, padding: 20 }}>
    <button type="button" className="themeToggle" onClick={toggleTheme} title="Alternar tema" aria-label="Alternar tema" style={{ position: 'absolute', top: 20, right: 20, marginLeft: 0 }}>
      <Sun size={16} className={light ? 'active' : ''} />
      <Moon size={16} className={!light ? 'active' : ''} />
    </button>
    <form onSubmit={submit} style={{ width: 'min(100%, 390px)', background: light ? '#ffffff' : '#101d27', border: `1px solid ${light ? '#dbe4ea' : '#2b404d'}`, borderRadius: 16, padding: 28, display: 'grid', gap: 14 }}>
      <h1 style={{ margin: 0, display: 'flex', justifyContent: 'center' }}><img src={light ? '/iron-seller-black.png' : '/iron-seller-white.png'} alt="Iron Seller" style={{ display: 'block', width: 140, maxWidth: '100%', height: 'auto', filter: 'drop-shadow(0 8px 6px rgba(0, 175, 91, .55))' }} /></h1>
      {mode === 'signup' && <p style={{ margin: 0, color: muted }}>Crie sua conta</p>}
      {mode === 'signup' && <label style={{ display: 'grid', gap: 6 }}>Nome da empresa<input autoComplete="organization" required minLength={2} maxLength={100} value={companyName} onChange={event => setCompanyName(event.target.value)} style={{ padding: 12, borderRadius: 8, border: `1px solid ${border}`, background: input, color: text }} /></label>}
      <label style={{ display: 'grid', gap: 6 }}>E-mail<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} style={{ padding: 12, borderRadius: 8, border: `1px solid ${border}`, background: input, color: text }} /></label>
      <label style={{ display: 'grid', gap: 6 }}>Senha<span style={{ position: 'relative', display: 'block' }}><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={event => setPassword(event.target.value)} style={{ padding: '12px 46px 12px 12px', width: '100%', borderRadius: 8, border: `1px solid ${border}`, background: input, color: text }} /><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'grid', placeItems: 'center', width: 32, height: 32, border: 0, background: 'transparent', color: muted, cursor: 'pointer' }}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></span></label>
      {mode === 'signup' && <label style={{ display: 'grid', gap: 6 }}>Confirme a senha<span style={{ position: 'relative', display: 'block' }}><input type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} style={{ padding: '12px 46px 12px 12px', width: '100%', borderRadius: 8, border: `1px solid ${border}`, background: input, color: text }} /><button type="button" aria-label={showConfirmation ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'} aria-pressed={showConfirmation} onClick={() => setShowConfirmation(!showConfirmation)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'grid', placeItems: 'center', width: 32, height: 32, border: 0, background: 'transparent', color: muted, cursor: 'pointer' }}>{showConfirmation ? <EyeOff size={19} /> : <Eye size={19} />}</button></span></label>}
      {mode === 'login' && <a href="/forgot-password" style={{ justifySelf: 'end', color: light ? '#c63545' : '#ff8f8f', fontSize: 13 }}>Esqueci minha senha</a>}
      <button type="submit" disabled={busy} style={{ padding: 12, border: 0, borderRadius: 8, background: '#62d9a7', color: '#07131b', fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
      {message && <p role="status" style={{ margin: 0, color: '#f2bf8f' }}>{message}</p>}
      <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }} style={{ border: 0, background: 'transparent', color: link, cursor: 'pointer' }}>{mode === 'login' ? 'Criar uma conta' : 'Já tenho uma conta'}</button>
      <p style={{ margin: 0, color: muted, fontSize: 12, textAlign: 'center' }}>Ao usar o ERP, consulte a <a href="/privacidade" target="_blank" rel="noopener noreferrer" style={{ color: link }}>Privacidade</a>, os <a href="/termos" target="_blank" rel="noopener noreferrer" style={{ color: link }}>Termos</a> e a <a href="/exclusao-de-dados" target="_blank" rel="noopener noreferrer" style={{ color: link }}>exclusão de dados</a>.</p>
    </form>
  </main>;
}

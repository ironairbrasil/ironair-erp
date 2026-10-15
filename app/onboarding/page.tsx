"use client";
import { useEffect, useState } from 'react';

export default function OnboardingPage() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { fetch('/api/auth/session', { cache: 'no-store' }).then(async response => {
    if (!response.ok) { location.href = '/login'; return; }
    const session = await response.json();
    if (session.tenants?.length) location.href = '/';
    if (session.companyName) setName(String(session.companyName).slice(0, 100));
  }).catch(() => { location.href = '/login'; }); }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/tenants', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha ao criar empresa');
      location.href = '/';
    } catch (error: any) { setMessage(error?.message || 'Falha ao criar empresa'); setBusy(false); }
  };
  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#08121a', color: '#e8f0f3', padding: 20 }}>
    <form onSubmit={submit} style={{ width: 'min(100%, 390px)', background: '#101d27', border: '1px solid #2b404d', borderRadius: 16, padding: 28, display: 'grid', gap: 14 }}>
      <h1 style={{ margin: 0, fontSize: 24 }}>Sua empresa</h1>
      <p style={{ margin: 0, color: '#a9bdc7' }}>Informe o nome da empresa para criar seu espaço no ERP.</p>
      <label style={{ display: 'grid', gap: 6 }}>Nome da empresa<input required minLength={2} maxLength={100} value={name} onChange={event => setName(event.target.value)} style={{ padding: 12, borderRadius: 8, border: '1px solid #3a5664', background: '#07131b', color: 'white' }} /></label>
      <button type="submit" disabled={busy} style={{ padding: 12, border: 0, borderRadius: 8, background: '#62d9a7', color: '#07131b', fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Criando...' : 'Criar empresa'}</button>
      {message && <p role="status" style={{ margin: 0, color: '#f2bf8f' }}>{message}</p>}
    </form>
  </main>;
}

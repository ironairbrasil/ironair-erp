'use client';
import { useEffect, useState } from 'react';
export default function SelectMetaAccount() {
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const initial = new URLSearchParams(location.search).get('error');
    if (initial) { setError(initial); return; }
    fetch('/api/integrations/meta/accounts').then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error); setAccounts(value.accounts || []); }).catch(cause => setError(cause?.message || 'Falha ao carregar contas'));
  }, []);
  const select = async (accountId: string) => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/integrations/meta/accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountId }) });
      const value = await response.json(); if (!response.ok) throw new Error(value.error);
      location.href = '/?integration=meta-connected';
    } catch (cause: any) { setError(cause?.message || 'Falha ao conectar'); setBusy(false); }
  };
  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#08121a', color: '#e8f0f3' }}><section style={{ width: 'min(100%, 500px)', background: '#101d27', padding: 28, borderRadius: 16 }}><h1>Escolha a conta Meta Ads</h1><p>A empresa atual verá somente os dados da conta escolhida.</p>{accounts.map(account => <button key={account.id} disabled={busy} onClick={() => select(account.id)} style={{ display: 'block', width: '100%', margin: '10px 0', padding: 14, textAlign: 'left', cursor: 'pointer' }}>{account.name} ({account.id})</button>)}{error && <p role="alert">{error}</p>}<a href="/">Voltar ao ERP</a></section></main>;
}

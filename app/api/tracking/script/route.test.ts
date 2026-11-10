import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { GET } from './route';

it('persists session IDs and landing page in the cart even for a direct visitor without UTMs', async () => {
  const script = await (await GET(new Request('https://erp.example/api/tracking/script'))).text();
  const requests: { url: string; body: any }[] = [];
  const storage = () => { const data = new Map(); return { getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => data.set(key, value) }; };
  runInNewContext(script, {
    URL, URLSearchParams, Date, Math, JSON, Blob,
    location: { search: '', hostname: 'ironair.com.br', href: 'https://ironair.com.br/products/iron-air' },
    document: { cookie: '', referrer: '', addEventListener: () => {} },
    localStorage: storage(), sessionStorage: storage(), navigator: {},
    fetch: (url: string, init: { body: string }) => { requests.push({ url, body: JSON.parse(init.body) }); return Promise.resolve({ ok: true }); },
  });
  const pageView = requests.find(item => item.body.type === 'PAGE_VIEW')!;
  const cart = requests.find(item => item.url === '/cart/update.js')!;
  expect(cart.body.attributes.sessionId).toBe(pageView.body.sessionId);
  expect(cart.body.attributes.visitorId).toBe(pageView.body.visitorId);
  expect(cart.body.attributes.landingPage).toBe('https://ironair.com.br/products/iron-air');
  expect(cart.body.attributes.utm_source).toBe('');
  expect(requests.some(item => item.body.type === 'INITIATE_CHECKOUT')).toBe(false);
});

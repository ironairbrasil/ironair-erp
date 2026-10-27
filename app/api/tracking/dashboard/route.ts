import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';

function domainOf(value?: string | null){ try { return new URL(value || '').hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } }
function startDate(days: number){ const date = new Date(); date.setHours(0,0,0,0); date.setDate(date.getDate() - Math.max(0, days - 1)); return date; }

export async function GET(req: Request){
  const tenantId = await getTenantId(req);
  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 30, 1), 3650);
  const fromParam = String(url.searchParams.get('from') || '');
  const toParam = String(url.searchParams.get('to') || '');
  const site = String(url.searchParams.get('site') || '').replace(/^www\./, '').toLowerCase();
  const source = String(url.searchParams.get('source') || '').toLowerCase();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? new Date(`${fromParam}T00:00:00.000-03:00`) : (!fromParam && !toParam ? undefined : startDate(days));
  const to = /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? new Date(`${toParam}T23:59:59.999-03:00`) : undefined;
  const occurredAt = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
  const [trackingIntegration, shopifyIntegration, events, orders] = await Promise.all([
    db.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'Tracking' } } }),
    db.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'Shopify' } } }),
    db.trackingEvent.findMany({ where: { tenantId, ...(occurredAt ? { occurredAt } : {}) }, orderBy: { occurredAt: 'desc' }, take: 5000 }),
    db.order.findMany({ where: { tenantId, channel: 'SHOPIFY', status: 'PAID', ...(occurredAt ? { paidAt: occurredAt } : {}) }, include: { attribution: true, customer: { select: { name: true } } }, orderBy: { paidAt: 'desc' } })
  ]);
  const savedSites = Array.isArray((trackingIntegration?.config as any)?.sites) ? (trackingIntegration?.config as any).sites : [];
  const inferredDomains = [...new Set(events.map(event => domainOf(event.url)).filter(Boolean))];
  const shopifyDomain = String(shopifyIntegration?.shopDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  const storefrontDomain = savedSites.find((item: any) => item.domain === 'ironair.com.br')?.domain || inferredDomains.find(domain => domain === 'ironair.com.br');
  const storefrontSites = [
    ...(storefrontDomain ? [{ id: 'shopify:ironair.com.br', name: 'Loja Iron Air', domain: storefrontDomain, source: 'Shopify' }] : []),
    { id: 'offer:oferta.ironair.com.br', name: 'Oferta Iron Air', domain: 'oferta.ironair.com.br', source: 'Site' }
  ];
  const configuredSites = [...storefrontSites, ...savedSites.filter((item: any) => item.domain !== shopifyDomain && item.domain !== storefrontDomain && item.domain !== 'oferta.ironair.com.br')];
  const sites = [...configuredSites, ...inferredDomains.filter(domain => !configuredSites.some((item: any) => item.domain === domain)).map(domain => ({ id: domain, name: domain, domain }))];
  const filteredEvents = events.filter(event => (!site || domainOf(event.url) === site) && (!source || String(event.utmSource || '').toLowerCase() === source));
  const sessionMap = new Map<string, any>();
  for(const event of filteredEvents){
    const key = event.sessionId || event.visitorId || event.eventId;
    const row = sessionMap.get(key) || { id: key, visitorId: event.visitorId, startedAt: event.occurredAt, lastAt: event.occurredAt, pages: 0, buyClicks: 0, source: event.utmSource || 'Direto', campaign: event.utmCampaign || event.utmContent || event.campaignId || '—', landingPage: event.url || '—' };
    if(event.occurredAt < row.startedAt) row.startedAt = event.occurredAt;
    if(event.occurredAt > row.lastAt) row.lastAt = event.occurredAt;
    if(event.type === 'PAGE_VIEW') row.pages++;
    if(event.type === 'INITIATE_CHECKOUT') row.buyClicks++;
    sessionMap.set(key, row);
  }
  const filteredOrders = orders.filter(order => {
    // The connected Shopify orders are created by the offer checkout. New orders
    // can carry an explicit landing page; legacy orders predate that capture.
    const landingDomain = domainOf(order.attribution?.landingPage) || 'oferta.ironair.com.br';
    return (!site || landingDomain === site) && (!source || String(order.attribution?.source || '').toLowerCase() === source);
  });
  const sessions = [...sessionMap.values()].sort((a,b) => +b.lastAt - +a.lastAt).slice(0, 200);
  const visitors = new Set(filteredEvents.map(event => event.visitorId).filter(Boolean)).size;
  const buyClicks = filteredEvents.filter(event => event.type === 'INITIATE_CHECKOUT').length;
  const revenue = filteredOrders.reduce((sum, order) => sum + Number(order.grossAmount) - Number(order.discountAmount), 0);
  const sources = [...new Set([...events.map(event => event.utmSource), ...orders.map(order => order.attribution?.source)].filter((value): value is string => Boolean(value)))].sort();
  return NextResponse.json({ sites, shopify: { connected: shopifyIntegration?.status === 'CONNECTED', shopDomain: shopifyDomain || null }, sources, periodDays: days, metrics: { visits: sessions.length, visitors, pageViews: filteredEvents.filter(event => event.type === 'PAGE_VIEW').length, buyClicks, sales: filteredOrders.length, revenue, clickRate: sessions.length ? buyClicks / sessions.length * 100 : 0, conversionRate: sessions.length ? filteredOrders.length / sessions.length * 100 : 0 }, sessions, sales: filteredOrders.map(order => ({ id: order.id, order: (order.sourceSnapshot as any)?.displayId || order.externalId, customer: order.customer?.name || 'Cliente', value: Number(order.grossAmount) - Number(order.discountAmount), occurredAt: order.paidAt, source: order.attribution?.source || 'Direto', campaign: order.attribution?.campaign || order.attribution?.content || order.attribution?.campaignId || '—', sessionId: order.attribution?.sessionId })) });
}

export async function POST(req: Request){
  try{
    const tenantId = await getTenantId(req);
    const body = await req.json();
    const raw = String(body.domain || '').trim();
    const domain = domainOf(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if(!domain) throw new Error('Domínio inválido');
    const current = await db.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'Tracking' } } });
    const currentSites = Array.isArray((current?.config as any)?.sites) ? (current?.config as any).sites : [];
    const site = { id: domain, domain, name: String(body.name || domain).trim() || domain };
    const sites = [...currentSites.filter((item: any) => item.domain !== domain), site];
    await db.integration.upsert({ where: { tenantId_provider: { tenantId, provider: 'Tracking' } }, create: { tenantId, provider: 'Tracking', status: 'CONNECTED', connectedAt: new Date(), config: { sites } }, update: { status: 'CONNECTED', config: { sites } } });
    return NextResponse.json({ ok: true, site });
  }catch(error: any){ return NextResponse.json({ ok: false, error: error?.message || 'tracking_site_error' }, { status: 400 }); }
}

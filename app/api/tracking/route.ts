import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { DEFAULT_TENANT_ID } from '@/lib/tenant';
import { enforceBodyLimit, enforceDistributedRateLimit, guardStatus } from '@/lib/request-guard';

const browserEvents = new Set(['PAGE_VIEW', 'VIEW_CONTENT', 'INITIATE_CHECKOUT']);
const schema = z.object({
  eventId: z.string().min(8).max(160), type: z.string(), occurredAt: z.string().datetime().optional(),
  visitorId: z.string().max(160).optional().nullable(), sessionId: z.string().max(160).optional().nullable(),
  url: z.string().url().max(2048).optional().nullable(), referrer: z.string().max(2048).optional().nullable(),
  utm_source: z.string().max(255).optional().nullable(), utm_medium: z.string().max(255).optional().nullable(),
  utm_campaign: z.string().max(255).optional().nullable(), utm_content: z.string().max(255).optional().nullable(),
  utm_term: z.string().max(255).optional().nullable(), fbclid: z.string().max(512).optional().nullable(),
  fbp: z.string().max(512).optional().nullable(), fbc: z.string().max(512).optional().nullable(),
  gclid: z.string().max(512).optional().nullable(), campaign_id: z.string().max(255).optional().nullable(),
  adset_id: z.string().max(255).optional().nullable(), ad_id: z.string().max(255).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

function allowedOrigins(req: Request) {
  const configured = (process.env.TRACKING_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  return new Set([new URL(req.url).origin, ...configured]);
}
function cors(req: Request) {
  const origin = req.headers.get('origin');
  const allowed = origin && allowedOrigins(req).has(origin) ? origin : new URL(req.url).origin;
  return { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST,OPTIONS', Vary: 'Origin' };
}
export async function OPTIONS(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && !allowedOrigins(req).has(origin)) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: cors(req) });
}
export async function POST(req: Request) {
  try {
    enforceBodyLimit(req, 16 * 1024);
    await enforceDistributedRateLimit(req, 'tracking', 120);
    const origin = req.headers.get('origin');
    if (origin && !allowedOrigins(req).has(origin)) return NextResponse.json({ ok: false, error: 'invalid_origin' }, { status: 403 });
    const body = schema.parse(await req.json());
    if (!browserEvents.has(body.type)) return NextResponse.json({ ok: false, error: 'event_not_allowed' }, { status: 400, headers: cors(req) });
    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
    if (Math.abs(Date.now() - occurredAt.getTime()) > 7 * 86400_000) return NextResponse.json({ ok: false, error: 'invalid_date' }, { status: 400, headers: cors(req) });
    await db.trackingEvent.upsert({
      where: { tenantId_eventId: { tenantId: DEFAULT_TENANT_ID, eventId: body.eventId } },
      create: { tenantId: DEFAULT_TENANT_ID, eventId: body.eventId, type: body.type as 'PAGE_VIEW'|'VIEW_CONTENT'|'INITIATE_CHECKOUT', occurredAt, visitorId: body.visitorId, sessionId: body.sessionId, url: body.url, referrer: body.referrer, utmSource: body.utm_source, utmMedium: body.utm_medium, utmCampaign: body.utm_campaign, utmContent: body.utm_content, utmTerm: body.utm_term, fbclid: body.fbclid, fbp: body.fbp, fbc: body.fbc, gclid: body.gclid, campaignId: body.campaign_id, adsetId: body.adset_id, adId: body.ad_id, metadata: body.metadata as never },
      update: {},
    });
    return NextResponse.json({ ok: true }, { headers: cors(req) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'invalid_request' }, { status: guardStatus(error), headers: cors(req) });
  }
}

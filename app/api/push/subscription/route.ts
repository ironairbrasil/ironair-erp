import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';
import { getAuthUser } from '@/lib/supabase-auth';

export async function GET(req: Request) {
  try {
    const tenantId = await getTenantId(req);
    const user = await getAuthUser(req);
    const endpoint = new URL(req.url).searchParams.get('endpoint');
    if (!endpoint) return NextResponse.json({ enabled: false, publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '' });
    const subscription = await db.pushSubscription.findFirst({ where: { tenantId, userId: user!.id, endpoint }, select: { id: true } });
    return NextResponse.json({ enabled: !!subscription, publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '' });
  } catch { return NextResponse.json({ error: 'unauthorized' }, { status: 401 }); }
}

export async function POST(req: Request) {
  try {
    const tenantId = await getTenantId(req);
    const user = await getAuthUser(req);
    const body = await req.json();
    const endpoint = String(body?.endpoint || '');
    const p256dh = String(body?.keys?.p256dh || '');
    const auth = String(body?.keys?.auth || '');
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return NextResponse.json({ error: 'Push não configurado no servidor' }, { status: 503 });
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 2048 || !p256dh || !auth) return NextResponse.json({ error: 'Inscrição inválida' }, { status: 400 });
    await db.pushSubscription.upsert({ where: { endpoint }, create: { tenantId, userId: user!.id, endpoint, p256dh, auth }, update: { tenantId, userId: user!.id, p256dh, auth } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Não foi possível ativar as notificações' }, { status: 400 }); }
}

export async function DELETE(req: Request) {
  try {
    const tenantId = await getTenantId(req);
    const user = await getAuthUser(req);
    const endpoint = String((await req.json())?.endpoint || '');
    await db.pushSubscription.deleteMany({ where: { tenantId, userId: user!.id, endpoint } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Não foi possível desativar as notificações' }, { status: 400 }); }
}

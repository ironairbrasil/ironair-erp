import { NextResponse } from 'next/server';
import { findMercadoLivreTenant, finishMercadoLivreWebhook, mercadoLivreEventId, processMercadoLivreNotification, registerMercadoLivreWebhookReceipt } from '@/lib/mercadolivre';

export const runtime = 'nodejs';

export async function POST(req: Request){
  let payload: any;
  try{
    payload = await req.json();
  }catch{
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const { tenantId, integrationId } = await findMercadoLivreTenant(payload);
  const topic = String(payload?.topic || payload?.resource || 'notifications');
  const eventId = mercadoLivreEventId(payload, req.headers.get('x-request-id'));
  const receipt = await registerMercadoLivreWebhookReceipt({ tenantId, integrationId, eventId, topic, payload });
  if(!receipt) return NextResponse.json({ ok: true, duplicate: true });
  try{
    const result = await processMercadoLivreNotification(payload, tenantId);
    await finishMercadoLivreWebhook(receipt.id, 'PROCESSED');
    return NextResponse.json({ ok: true, ...result });
  }catch(e: any){
    await finishMercadoLivreWebhook(receipt.id, 'FAILED', e?.message || 'processing_failed');
    return NextResponse.json({ ok: false, error: 'processing_failed' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { findMercadoLivreTenant, finishMercadoLivreWebhook, mercadoLivreEventId, processMercadoLivreNotification, registerMercadoLivreWebhookReceipt, verifyMercadoLivreWebhook } from '@/lib/mercadolivre';
import { enforceBodyLimit, enforceDistributedRateLimit, guardStatus } from '@/lib/request-guard';

export const runtime = 'nodejs';

export async function POST(req: Request){
  try{enforceBodyLimit(req, 64 * 1024);await enforceDistributedRateLimit(req,'webhook-mercadolivre',120)}catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:'invalid_request'},{status:guardStatus(error)})}
  let payload: any;
  try{
    payload = await req.json();
  }catch{
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  let tenantId:string, integrationId:string|undefined;
  try{({tenantId,integrationId}=await findMercadoLivreTenant(payload))}catch{return NextResponse.json({ok:false,error:'account_not_found'},{status:404})}
  if(!verifyMercadoLivreWebhook(req,payload)) return NextResponse.json({ok:false,error:'invalid_signature'},{status:401});
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

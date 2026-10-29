import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { trustMercadoLivreWebhook, verifyMercadoLivreSignature } from './mercadolivre-webhook';

describe('verifyMercadoLivreSignature',()=>{
  it('accepts a current valid signature',()=>{
    const now=1_800_000_000_000, ts=String(now), secret='test-secret', requestId='request-1', dataId='ABC';
    const manifest=`id:abc;request-id:${requestId};ts:${ts};`;
    const signature=`ts=${ts},v1=${crypto.createHmac('sha256',secret).update(manifest).digest('hex')}`;
    expect(verifyMercadoLivreSignature({signature,requestId,dataId,secret,now})).toBe(true);
  });
  it('rejects invalid and expired signatures',()=>{
    const now=1_800_000_000_000;
    expect(verifyMercadoLivreSignature({signature:`ts=${now},v1=bad`,requestId:'r',dataId:'1',secret:'s',now})).toBe(false);
    expect(verifyMercadoLivreSignature({signature:'ts=1,v1=bad',requestId:'r',dataId:'1',secret:'s',now})).toBe(false);
  });
  it('supports notifications without data.id',()=>{
    const now=1_800_000_000_000, ts=String(now), secret='test-secret', requestId='request-2';
    const signature=`ts=${ts},v1=${crypto.createHmac('sha256',secret).update(`request-id:${requestId};ts:${ts};`).digest('hex')}`;
    expect(verifyMercadoLivreSignature({signature,requestId,secret,now})).toBe(true);
  });
});

describe('trustMercadoLivreWebhook',()=>{
  it('accepts an unsigned legacy notification only for the configured application',()=>{
    expect(trustMercadoLivreWebhook({signature:'',requestId:'',secret:'secret',userId:'seller-1',applicationId:'app-1',clientId:'app-1'})).toBe(true);
    expect(trustMercadoLivreWebhook({signature:'',requestId:'',secret:'secret',userId:'seller-1',applicationId:'other-app',clientId:'app-1'})).toBe(false);
    expect(trustMercadoLivreWebhook({signature:'',requestId:'',secret:'secret',applicationId:'app-1',clientId:'app-1'})).toBe(false);
  });
  it('never falls back when signature headers are present but invalid',()=>{
    expect(trustMercadoLivreWebhook({signature:'ts=1,v1=bad',requestId:'request-1',secret:'secret',userId:'seller-1',applicationId:'app-1',clientId:'app-1'})).toBe(false);
    expect(trustMercadoLivreWebhook({signature:'',requestId:'request-1',secret:'secret',userId:'seller-1',applicationId:'app-1',clientId:'app-1'})).toBe(false);
  });
});

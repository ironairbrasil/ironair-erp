import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyMercadoLivreSignature } from './mercadolivre-webhook';

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

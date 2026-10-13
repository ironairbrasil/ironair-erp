import crypto from 'crypto';
export function sha256(value:string){return crypto.createHash('sha256').update(value).digest('hex')}
export function safeEqual(a:string,b:string){const A=Buffer.from(a);const B=Buffer.from(b);return A.length===B.length&&crypto.timingSafeEqual(A,B)}
export function requireIngestSecret(req:Request){const expected=process.env.ERP_INGEST_SECRET;if(!expected) throw new Error('ERP_INGEST_SECRET missing');const got=req.headers.get('x-erp-secret')||'';if(!safeEqual(got,expected)) throw new Error('unauthorized')}
export function payloadHash(payload:unknown){return sha256(JSON.stringify(payload))}

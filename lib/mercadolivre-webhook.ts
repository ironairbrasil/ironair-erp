import crypto from 'node:crypto';

export function verifyMercadoLivreSignature(input:{signature:string;requestId:string;dataId?:string|number|null;secret:string;now?:number}){
  const entries=Object.fromEntries(input.signature.split(',').map(part=>part.trim().split('=',2)).filter(pair=>pair.length===2));
  const ts=entries.ts, received=entries.v1;
  if(!input.secret||!input.requestId||!ts||!received)return false;
  const rawTimestamp=Number(ts), timestamp=rawTimestamp<10_000_000_000?rawTimestamp*1000:rawTimestamp;
  if(!Number.isFinite(timestamp)||Math.abs((input.now??Date.now())-timestamp)>5*60_000)return false;
  const idPart=input.dataId===undefined||input.dataId===null||input.dataId===''?'':`id:${String(input.dataId).toLowerCase()};`;
  const manifest=`${idPart}request-id:${input.requestId};ts:${ts};`;
  const expected=crypto.createHmac('sha256',input.secret).update(manifest).digest('hex');
  try{return expected.length===received.length&&crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(received))}catch{return false}
}

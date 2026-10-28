import crypto from 'crypto';

function signingSecret(){
  const value=process.env.SHOPIFY_CLIENT_SECRET || process.env.ERP_INGEST_SECRET;
  if(!value) throw new Error('Segredo OAuth Shopify ausente no servidor');
  return value;
}

export function normalizeShopDomain(shop:string){
  return shop.replace(/^https?:\/\//,'').replace(/\/$/,'').trim().toLowerCase();
}

export function isValidShopDomain(shop:string){
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalizeShopDomain(shop));
}

export function signState(payload:{tenantId:string;nonce:string;createdAt:number}){
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig=crypto.createHmac('sha256',signingSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function readSignedState(value:string|null){
  if(!value) throw new Error('state ausente');
  const [body,sig]=value.split('.');
  if(!body||!sig) throw new Error('state inválido');
  const expected=crypto.createHmac('sha256',signingSecret()).update(body).digest('base64url');
  try{
    if(!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(sig))) throw new Error('state inválido');
  }catch{
    throw new Error('state inválido');
  }
  const parsed=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
  if(!parsed.tenantId||Date.now()-Number(parsed.createdAt||0)>10*60*1000) throw new Error('state expirado');
  return parsed as {tenantId:string;nonce:string;createdAt:number};
}

import crypto from 'crypto';

function key(){
  const raw=process.env.SECRET_ENCRYPTION_KEY;
  if(!raw) throw new Error('SECRET_ENCRYPTION_KEY is required for OAuth secrets');
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptSecret(value:string){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(value:string){
  if(!value.startsWith('v1:')) return value;
  const [,ivRaw,tagRaw,payloadRaw]=value.split(':');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(ivRaw,'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(payloadRaw,'base64')),decipher.final()]).toString('utf8');
}

import { PrismaClient } from '@prisma/client';
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
function databaseUrl(){
  const raw = process.env.DATABASE_URL;
  if(!raw) return undefined;
  try{
    const url = new URL(raw);
    if(!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit','1');
    if(!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout','20');
    return url.toString();
  }catch{
    return raw;
  }
}
export const db = globalForPrisma.prisma ?? new PrismaClient({ datasources: databaseUrl()?{db:{url:databaseUrl()!}}:undefined, log: process.env.NODE_ENV==='development'?['warn','error']:['error'] });
if(process.env.NODE_ENV!=='production') globalForPrisma.prisma=db;

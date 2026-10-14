import { db } from './db';

export async function auditLog(input:{
  tenantId:string;
  entityType:string;
  entityId:string;
  action:string;
  before?:unknown;
  after?:unknown;
  metadata?:unknown;
  source?:string;
}){
  await db.auditLog.create({
    data:{
      tenantId:input.tenantId,
      entityType:input.entityType,
      entityId:input.entityId,
      action:input.action,
      source:input.source||'MANUAL',
      before:input.before as any,
      after:input.after as any,
      metadata:input.metadata as any
    }
  });
}

export function mergeManualOverrides(current:unknown, fields:string[]){
  const base=current&&typeof current==='object'&&!Array.isArray(current)?current as Record<string,unknown>:{};
  return {...base,fields:Array.from(new Set([...(Array.isArray(base.fields)?base.fields.map(String):[]),...fields]))};
}

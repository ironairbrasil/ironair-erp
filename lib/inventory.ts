import { db } from './db';
import { getTenantId } from './tenant';
import type { InventoryMovementType } from '@prisma/client';
import { sendTenantPush } from './push';
export async function moveStock(input:{tenantId?:string;sku:string;warehouseCode:string;quantity:number;type:InventoryMovementType;reference?:string;orderId?:string;note?:string;idempotencyKey?:string;createdAt?:Date|string}){
 if(!Number.isInteger(input.quantity)||input.quantity===0) throw new Error('quantity must be a non-zero integer');
 const tenantId=input.tenantId||await getTenantId();
 const result=await db.$transaction(async tx=>{
  if(input.idempotencyKey){const prior=await tx.inventoryMovement.findUnique({where:{tenantId_idempotencyKey:{tenantId,idempotencyKey:input.idempotencyKey}}});if(prior)return {movement:prior,alert:null}}
  const variant=await tx.productVariant.findUnique({where:{tenantId_sku:{tenantId,sku:input.sku}}});if(!variant)throw new Error(`Unknown SKU ${input.sku}`);
  const warehouse=await tx.warehouse.findUnique({where:{tenantId_code:{tenantId,code:input.warehouseCode}}});if(!warehouse)throw new Error(`Unknown warehouse ${input.warehouseCode}`);
  const bal=await tx.inventoryBalance.upsert({where:{tenantId_variantId_warehouseId:{tenantId,variantId:variant.id,warehouseId:warehouse.id}},create:{tenantId,variantId:variant.id,warehouseId:warehouse.id,onHand:0,reserved:0},update:{}});
  const reserveDelta=input.type==='RESERVE'?Math.abs(input.quantity):input.type==='RELEASE'?-Math.abs(input.quantity):0;
  const onHandDelta=['RESERVE','RELEASE'].includes(input.type)?0:input.quantity;
  const nextOnHand=bal.onHand+onHandDelta, nextReserved=bal.reserved+reserveDelta;
  if(nextOnHand<0)throw new Error(`Insufficient stock for ${input.sku}`);if(nextReserved<0||nextReserved>nextOnHand)throw new Error(`Invalid reservation for ${input.sku}`);
  await tx.inventoryBalance.update({where:{id:bal.id},data:{onHand:nextOnHand,reserved:nextReserved}});
  const movement=await tx.inventoryMovement.create({data:{tenantId,variantId:variant.id,warehouseId:warehouse.id,type:input.type,quantity:input.quantity,reference:input.reference,orderId:input.orderId,note:input.note,idempotencyKey:input.idempotencyKey,source:String(input.idempotencyKey||'').startsWith('manual')?'MANUAL':'SYNC',createdAt:input.createdAt?new Date(input.createdAt):undefined}});
  return {movement,alert:bal.onHand-bal.reserved>variant.safetyStock && nextOnHand-nextReserved<=variant.safetyStock?{sku:variant.sku,name:variant.name,available:nextOnHand-nextReserved}:null};
 });
 if(result.alert) await sendTenantPush(tenantId,{title:'Estoque de atenção',body:`${result.alert.name} (${result.alert.sku}): ${result.alert.available} disponíveis`,tag:`stock:${result.alert.sku}`,url:'/'}).catch(error=>console.error('Push stock failed',error));
 return result.movement;
}
export async function transferStock(input:{tenantId:string;sku:string;toWarehouseCode:string;quantity:number;reference?:string;createdAt?:Date|string;idempotencyKey:string}){
 if(!Number.isInteger(input.quantity)||input.quantity<=0||input.toWarehouseCode==='CENTRAL') throw new Error('Transferência inválida');
 return db.$transaction(async tx=>{
  const prior=await tx.inventoryMovement.findUnique({where:{tenantId_idempotencyKey:{tenantId:input.tenantId,idempotencyKey:input.idempotencyKey}}});
  if(prior) return prior;
  const variant=await tx.productVariant.findUnique({where:{tenantId_sku:{tenantId:input.tenantId,sku:input.sku}}});
  const from=await tx.warehouse.findUnique({where:{tenantId_code:{tenantId:input.tenantId,code:'CENTRAL'}}});
  const to=await tx.warehouse.findUnique({where:{tenantId_code:{tenantId:input.tenantId,code:input.toWarehouseCode}}});
  if(!variant||!from||!to) throw new Error('Produto ou destino não encontrado');
  const central=await tx.inventoryBalance.findUnique({where:{tenantId_variantId_warehouseId:{tenantId:input.tenantId,variantId:variant.id,warehouseId:from.id}}});
  if(!central||central.onHand-central.reserved<input.quantity) throw new Error(`Estoque central insuficiente para ${input.sku}`);
  await tx.inventoryBalance.update({where:{id:central.id},data:{onHand:{decrement:input.quantity}}});
  await tx.inventoryBalance.upsert({where:{tenantId_variantId_warehouseId:{tenantId:input.tenantId,variantId:variant.id,warehouseId:to.id}},create:{tenantId:input.tenantId,variantId:variant.id,warehouseId:to.id,onHand:input.quantity,reserved:0},update:{onHand:{increment:input.quantity}}});
  const createdAt=input.createdAt?new Date(input.createdAt):undefined;
  await tx.inventoryMovement.create({data:{tenantId:input.tenantId,variantId:variant.id,warehouseId:from.id,type:'TRANSFER_OUT',quantity:-input.quantity,reference:input.reference,note:`Destino: ${to.name}`,idempotencyKey:input.idempotencyKey,source:'MANUAL',createdAt}});
  return tx.inventoryMovement.create({data:{tenantId:input.tenantId,variantId:variant.id,warehouseId:to.id,type:'TRANSFER_IN',quantity:input.quantity,reference:input.reference,note:'Origem: Estoque Central',idempotencyKey:`${input.idempotencyKey}:in`,source:'MANUAL',createdAt}});
 });
}

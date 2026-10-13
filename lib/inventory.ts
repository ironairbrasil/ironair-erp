import { db } from './db';
import { getTenantId } from './tenant';
import type { InventoryMovementType } from '@prisma/client';
export async function moveStock(input:{tenantId?:string;sku:string;warehouseCode:string;quantity:number;type:InventoryMovementType;reference?:string;orderId?:string;note?:string;idempotencyKey?:string}){
 if(!Number.isInteger(input.quantity)||input.quantity===0) throw new Error('quantity must be a non-zero integer');
 const tenantId=input.tenantId||await getTenantId();
 return db.$transaction(async tx=>{
  if(input.idempotencyKey){const prior=await tx.inventoryMovement.findUnique({where:{tenantId_idempotencyKey:{tenantId,idempotencyKey:input.idempotencyKey}}});if(prior)return prior}
  const variant=await tx.productVariant.findUnique({where:{tenantId_sku:{tenantId,sku:input.sku}}});if(!variant)throw new Error(`Unknown SKU ${input.sku}`);
  const warehouse=await tx.warehouse.findUnique({where:{tenantId_code:{tenantId,code:input.warehouseCode}}});if(!warehouse)throw new Error(`Unknown warehouse ${input.warehouseCode}`);
  const bal=await tx.inventoryBalance.upsert({where:{tenantId_variantId_warehouseId:{tenantId,variantId:variant.id,warehouseId:warehouse.id}},create:{tenantId,variantId:variant.id,warehouseId:warehouse.id,onHand:0,reserved:0},update:{}});
  const reserveDelta=input.type==='RESERVE'?Math.abs(input.quantity):input.type==='RELEASE'?-Math.abs(input.quantity):0;
  const onHandDelta=['RESERVE','RELEASE'].includes(input.type)?0:input.quantity;
  const nextOnHand=bal.onHand+onHandDelta, nextReserved=bal.reserved+reserveDelta;
  if(nextOnHand<0)throw new Error(`Insufficient stock for ${input.sku}`);if(nextReserved<0||nextReserved>nextOnHand)throw new Error(`Invalid reservation for ${input.sku}`);
  await tx.inventoryBalance.update({where:{id:bal.id},data:{onHand:nextOnHand,reserved:nextReserved}});
  return tx.inventoryMovement.create({data:{tenantId,variantId:variant.id,warehouseId:warehouse.id,type:input.type,quantity:input.quantity,reference:input.reference,orderId:input.orderId,note:input.note,idempotencyKey:input.idempotencyKey}})
 })
}

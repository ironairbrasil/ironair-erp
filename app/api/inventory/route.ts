import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';

export async function GET(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const [centralWarehouse,activeVariants]=await Promise.all([
      db.warehouse.findUnique({where:{tenantId_code:{tenantId,code:'CENTRAL'}},select:{id:true}}),
      db.productVariant.findMany({where:{tenantId,active:true,product:{active:true}},select:{id:true}})
    ]);
    if(centralWarehouse&&activeVariants.length){
      const existing=await db.inventoryBalance.findMany({where:{tenantId,warehouseId:centralWarehouse.id,variantId:{in:activeVariants.map(variant=>variant.id)}},select:{variantId:true}});
      const existingIds=new Set(existing.map(balance=>balance.variantId));
      const missing=activeVariants.filter(variant=>!existingIds.has(variant.id));
      if(missing.length) await db.inventoryBalance.createMany({data:missing.map(variant=>({tenantId,variantId:variant.id,warehouseId:centralWarehouse.id,onHand:0,reserved:0})),skipDuplicates:true});
    }
    const [balances,folders,paidItems]=await Promise.all([
      db.inventoryBalance.findMany({where:{tenantId,variant:{active:true,product:{active:true}}},include:{variant:{include:{product:{include:{variants:{where:{active:false},select:{sku:true,source:true}},_count:{select:{variants:{where:{active:true}}}}}},inventoryFolder:true}},warehouse:true},orderBy:[{variant:{sku:'asc'}},{warehouse:{code:'asc'}}]}),
      db.inventoryFolder.findMany({where:{tenantId},orderBy:{name:'asc'}}),
      db.orderItem.findMany({where:{tenantId,variantId:{not:null},order:{status:'PAID'}},select:{variantId:true,quantity:true}})
    ]);
    const officialSales=new Map<string,number>();
    for(const item of paidItems) if(item.variantId) officialSales.set(item.variantId,(officialSales.get(item.variantId)||0)+Number(item.quantity||0));
    const movements=await db.inventoryMovement.findMany({where:{tenantId},take:1000,orderBy:{createdAt:'desc'},include:{variant:{include:{inventoryFolder:true}},warehouse:true,order:{select:{channel:true}}}});
    const trackedMovements=folders.length?await db.inventoryMovement.findMany({where:{tenantId,variant:{inventoryFolderId:{not:null}}},select:{quantity:true,type:true,createdAt:true,variantId:true,metadata:true,idempotencyKey:true,variant:{select:{inventoryFolderId:true}},order:{select:{channel:true}}}}):[];
    const productMovements=await db.inventoryMovement.findMany({where:{tenantId,type:{in:['ADJUSTMENT','SALE','PURCHASE','RETURN','DAMAGE']}},select:{quantity:true,type:true,createdAt:true,variantId:true,variant:{select:{inventoryFolderId:true}}}});
    const folderBalances=new Map(folders.map(folder=>[folder.id,{physical:0,reserved:0}]));
    const folderSales=new Map(folders.map(folder=>[folder.id,{shopify:0,ml:0,amazon:0,shopee:0,manual:0,totalSales:0}]));
    const folderAdjustmentsByVariant=new Map<string,number>();
    const variantSales=new Map<string,{shopify:number,ml:number,amazon:number,shopee:number,manual:number,totalSales:number}>();
    const variantStock=new Map<string,{adjustments:number,sales:number}>();
    for(const movement of productMovements){
      const folder=movement.variant.inventoryFolderId?folders.find(item=>item.id===movement.variant.inventoryFolderId):null;
      if(folder?.trackingStartDate&&movement.createdAt<folder.trackingStartDate) continue;
      const stock=variantStock.get(movement.variantId)||{adjustments:0,sales:0};
      if(movement.type!=='SALE') stock.adjustments+=Number(movement.quantity||0);
      else if(movement.type==='SALE') stock.sales+=Math.abs(Number(movement.quantity||0));
      variantStock.set(movement.variantId,stock);
    }
    for(const movement of trackedMovements){
      const folder=folders.find(item=>item.id===movement.variant.inventoryFolderId);
      if(!folder||folder.trackingStartDate&&movement.createdAt<folder.trackingStartDate) continue;
      const balance=folderBalances.get(folder.id)!;
      const metadata=movement.metadata&&typeof movement.metadata==='object'&&!Array.isArray(movement.metadata)?movement.metadata as Record<string,unknown>:{};
      const folderMovement=metadata.scope==='FOLDER'||String(movement.idempotencyKey||'').startsWith('manual:folder-')||(Boolean(metadata.manuallyEditedAt)&&movement.type==='ADJUSTMENT'&&metadata.scope!=='PRODUCT');
      if(folderMovement&&movement.type==='ADJUSTMENT') folderAdjustmentsByVariant.set(movement.variantId,(folderAdjustmentsByVariant.get(movement.variantId)||0)+Number(movement.quantity||0));
      if(movement.type==='RESERVE') balance.reserved+=Math.abs(movement.quantity);
      else if(movement.type==='RELEASE') balance.reserved=Math.max(0,balance.reserved-Math.abs(movement.quantity));
      else if(['ADJUSTMENT','SALE','PURCHASE','RETURN','DAMAGE'].includes(movement.type)) balance.physical+=movement.quantity;
      if(movement.type==='SALE'){
        const sales=folderSales.get(folder.id)!;
        const productSales=variantSales.get(movement.variantId)||{shopify:0,ml:0,amazon:0,shopee:0,manual:0,totalSales:0};
        const quantity=Math.abs(Number(movement.quantity||0));
        if(movement.order?.channel==='SHOPIFY'){sales.shopify+=quantity;productSales.shopify+=quantity;}
        else if(movement.order?.channel==='MERCADO_LIVRE'){sales.ml+=quantity;productSales.ml+=quantity;}
        else if(movement.order?.channel==='AMAZON'){sales.amazon+=quantity;productSales.amazon+=quantity;}
        else if(movement.order?.channel==='SHOPEE'){sales.shopee+=quantity;productSales.shopee+=quantity;}
        else {sales.manual+=quantity;productSales.manual+=quantity;}
        sales.totalSales+=quantity;
        productSales.totalSales+=quantity;
        variantSales.set(movement.variantId,productSales);
      }
    }
    return NextResponse.json({
      balances:balances.map(r=>{const folderId=r.variant.inventoryFolderId;const folder=folderId?folderBalances.get(folderId):null;const sales=variantSales.get(r.variantId);const stock=variantStock.get(r.variantId)||{adjustments:0,sales:0};const platformManaged=r.variant.fulfillment==='Amazon FBA';const officialOnHand=stock.adjustments-(officialSales.get(r.variantId)||0);const platformAvailable=r.onHand-r.reserved-(folderAdjustmentsByVariant.get(r.variantId)||0);const available=platformManaged?platformAvailable:folder?folder.physical-folder.reserved:officialOnHand;return {...r,available,officialOnHand:!platformManaged&&!folder?officialOnHand:null,platformManaged,folderPhysical:folder?.physical??null,folderAvailable:folder?folder.physical-folder.reserved:null,trackedSales:sales||null}}),
      movements:movements.map(m=>{const metadata=m.metadata&&typeof m.metadata==='object'&&!Array.isArray(m.metadata)?m.metadata as Record<string,unknown>:{};const editedFolderAdjustment=Boolean(metadata.manuallyEditedAt)&&m.type==='ADJUSTMENT'&&Boolean(m.variant.inventoryFolder?.id)&&metadata.scope!=='PRODUCT';const folderMovement=metadata.scope==='FOLDER'||String(m.idempotencyKey||'').startsWith('manual:folder-')||editedFolderAdjustment;return {...m,sku:folderMovement?'—':m.variant.sku,folderId:folderMovement?String(metadata.folderId||m.variant.inventoryFolder?.id||''):null,folderName:m.variant.inventoryFolder?.name||'Sem pasta',warehouseCode:m.warehouse.code,orderChannel:m.order?.channel||null,folderMovement}}),
      folders:folders.map(folder=>{const balance=folderBalances.get(folder.id)!;return {...folder,...balance,...folderSales.get(folder.id),available:balance.physical-balance.reserved}})
    });
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'inventory_error'},{status:500});
  }
}

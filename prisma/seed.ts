import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const tenantId = 'tenant_ironair_dev';

async function main(){
  await db.tenant.upsert({
    where:{slug:'iron-air-dev'},
    create:{id:tenantId,slug:'iron-air-dev',name:'Iron Air Brasil'},
    update:{name:'Iron Air Brasil'}
  });
  await db.organization.upsert({
    where:{tenantId},
    create:{id:'org_ironair_dev',tenantId,name:'Iron Air Brasil'},
    update:{name:'Iron Air Brasil'}
  });
  const product=await db.product.upsert({
    where:{id:'ironair'},
    create:{id:'ironair',tenantId,name:'Iron Air'},
    update:{tenantId,name:'Iron Air'}
  });
  for(const variant of [{sku:'IRON-AIR-127V',name:'Iron Air 127V',voltage:'127V',salePrice:1499,unitCost:550,safetyStock:12},{sku:'IRON-AIR-220V',name:'Iron Air 220V',voltage:'220V',salePrice:1499,unitCost:550,safetyStock:7}]){
    await db.productVariant.upsert({
      where:{tenantId_sku:{tenantId,sku:variant.sku}},
      create:{...variant,tenantId,productId:product.id},
      update:variant
    });
  }
  for(const warehouse of [{code:'CENTRAL',name:'Estoque Central'},{code:'AMAZON_FBA',name:'Amazon FBA',channel:'AMAZON' as const},{code:'ML_FULL',name:'Mercado Livre Full',channel:'MERCADO_LIVRE' as const},{code:'SHOPEE',name:'Shopee',channel:'SHOPEE' as const}]){
    await db.warehouse.upsert({
      where:{tenantId_code:{tenantId,code:warehouse.code}},
      create:{...warehouse,tenantId},
      update:warehouse
    });
  }
  console.log('seed ok');
}

main().finally(()=>db.$disconnect());

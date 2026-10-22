import { db } from './db';

async function publicationPlans(tenantId:string){
  const warehouse=await db.warehouse.findUnique({where:{tenantId_code:{tenantId,code:'CENTRAL'}}});
  if(!warehouse) return [];
  const [variants,folders,movements]=await Promise.all([
    db.productVariant.findMany({where:{tenantId,active:true},include:{inventoryFolder:true}}),
    db.inventoryFolder.findMany({where:{tenantId},orderBy:{name:'asc'}}),
    db.inventoryMovement.findMany({where:{tenantId,warehouseId:warehouse.id},select:{variantId:true,type:true,quantity:true,createdAt:true}})
  ]);
  const totals=new Map<string,{physical:number,reserved:number}>();
  for(const movement of movements){
    const variant=variants.find(item=>item.id===movement.variantId);
    if(!variant) continue;
    const folder=variant.inventoryFolder;
    if(folder?.trackingStartDate&&movement.createdAt<folder.trackingStartDate) continue;
    const key=folder?.id||variant.id;
    const total=totals.get(key)||{physical:0,reserved:0};
    if(!['RESERVE','RELEASE'].includes(movement.type)) total.physical+=movement.quantity;
    else if(movement.type==='RESERVE') total.reserved+=Math.abs(movement.quantity);
    else if(movement.type==='RELEASE') total.reserved=Math.max(0,total.reserved-Math.abs(movement.quantity));
    totals.set(key,total);
  }
  const folderAvailable=new Map<string,number>();
  for(const folder of folders){
    const total=totals.get(folder.id)||{physical:0,reserved:0};
    folderAvailable.set(folder.id,Math.max(0,total.physical-total.reserved));
  }
  return variants.map(variant=>{
    const total=totals.get(variant.id)||{physical:0,reserved:0};
    const quantity=variant.inventoryFolderId
      ? folderAvailable.get(variant.inventoryFolderId)||0
      : Math.max(0,total.physical-total.reserved);
    return {variant,quantity,key:variant.inventoryFolderId||variant.id};
  });
}

async function publishShopify(tenantId:string, variants:any[], quantity:number){
  if(!variants.length) return 0;
  const { getShopifyConnection, shopifyGraphQL } = await import('./shopify');
  const connection=await getShopifyConnection(tenantId);
  const locationData:any=await shopifyGraphQL(`query InventoryPublishLocation { locations(first:1,query:"active:true"){nodes{id}} }`,{},connection);
  const locationId=locationData.locations?.nodes?.[0]?.id;
  if(!locationId) throw new Error('Shopify sem local de estoque ativo');
  let updated=0;
  for(const variant of variants){
    try {
      if(!variant.shopifyId) continue;
      const data:any=await shopifyGraphQL(`query InventoryItem($id:ID!,$locationId:ID!){productVariant(id:$id){requiresComponents inventoryItem{id inventoryLevel(locationId:$locationId){quantities(names:["available"]){name quantity}}}}}`,{id:variant.shopifyId,locationId},connection);
      if(data.productVariant?.requiresComponents) continue;
      const inventoryItemId=data.productVariant?.inventoryItem?.id;
      if(!inventoryItemId) continue;
      const currentQuantity=Number(data.productVariant?.inventoryItem?.inventoryLevel?.quantities?.find((entry:any)=>entry.name==='available')?.quantity||0);
      const result:any=await shopifyGraphQL(`mutation PublishInventory($input:InventorySetQuantitiesInput!,$key:String!){inventorySetQuantities(input:$input) @idempotent(key:$key){userErrors{field message}}}`,{input:{name:'available',reason:'correction',quantities:[{inventoryItemId,locationId,quantity,changeFromQuantity:currentQuantity}]},key:crypto.randomUUID()},connection);
      const errors=result.inventorySetQuantities?.userErrors||[];
      if(errors.length) throw new Error(errors.map((error:any)=>error.message).join('; '));
      updated++;
    } catch(error) {
      console.error(`Shopify inventory publish failed for ${variant.sku}`,error);
    }
  }
  return updated;
}

async function publishMercadoLivre(tenantId:string, variants:any[], quantity:number){
  if(!variants.length) return 0;
  const { getMercadoLivreConnection, mercadoLivreApi } = await import('./mercadolivre');
  const connection=await getMercadoLivreConnection(tenantId);
  if(!connection.externalAccountId) throw new Error('Mercado Livre sem conta vinculada');
  const user:any=await mercadoLivreApi(`/users/${connection.externalAccountId}?attributes=tags`,{},tenantId);
  const usesWarehouseManagement=Array.isArray(user.tags)&&user.tags.includes('warehouse_management');
  const search:any=await mercadoLivreApi(`/users/${connection.externalAccountId}/items/search?status=active&limit=100`,{},tenantId);
  const ids:string[]=search.results||[];
  if(!ids.length) return 0;
  const responses:any[]=await mercadoLivreApi(`/items?ids=${ids.join(',')}&attributes=id,seller_custom_field,attributes,variations,user_product_id,inventory_id,shipping`,{},tenantId);
  const wanted=new Set(variants.map(variant=>String(variant.sku).toUpperCase()));
  const updateUserProductStock=async(userProductId:string)=>{
    const stockUrl=`https://api.mercadolibre.com/user-products/${encodeURIComponent(userProductId)}/stock`;
    const stockResponse=await fetch(stockUrl,{headers:{authorization:`Bearer ${connection.accessToken}`},cache:'no-store'});
    const stock:any=await stockResponse.json().catch(()=>({}));
    if(!stockResponse.ok) throw new Error(stock.message||stock.error||'mercado_livre_stock_read_failed');
    const version=stockResponse.headers.get('x-version');
    if(!version) throw new Error('Mercado Livre não informou a versão do estoque');
    const sellerWarehouses=(stock.locations||[]).filter((location:any)=>location.type==='seller_warehouse');
    const type=sellerWarehouses.length?'seller_warehouse':'selling_address';
    const body=sellerWarehouses.length
      ? {locations:sellerWarehouses.map((location:any,index:number)=>({store_id:location.store_id,network_node_id:location.network_node_id,quantity:index===0?quantity:0}))}
      : {quantity};
    const updateResponse=await fetch(`${stockUrl}/type/${type}`,{method:'PUT',headers:{authorization:`Bearer ${connection.accessToken}`,'content-type':'application/json','x-version':version},body:JSON.stringify(body),cache:'no-store'});
    if(!updateResponse.ok){
      const error:any=await updateResponse.json().catch(()=>({}));
      throw new Error(error.message||error.error||'mercado_livre_stock_update_failed');
    }
  };
  let updated=0;
  for(const response of responses){
    const item=response?.body;
    if(!item||response.code!==200) continue;
    try {
      const attributeSku=(attributes:any[]=[])=>String(attributes.find((attribute:any)=>attribute.id==='SELLER_SKU')?.value_name||'').trim();
      if(item.variations?.length){
        const matching=item.variations.filter((variation:any)=>wanted.has(String(variation.seller_custom_field||attributeSku(variation.attributes)||'').toUpperCase()));
        if(!matching.length) continue;
        for(const variation of matching){
          if(usesWarehouseManagement&&variation.user_product_id) await updateUserProductStock(variation.user_product_id);
          else await mercadoLivreApi(`/items/${encodeURIComponent(item.id)}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({variations:[{id:variation.id,available_quantity:quantity}]})},tenantId);
        }
        updated+=matching.length;
      }else{
        const itemSku=String(item.seller_custom_field||attributeSku(item.attributes)||'').toUpperCase();
        if(!wanted.has(itemSku)) continue;
        if(usesWarehouseManagement&&item.user_product_id){
          try { await updateUserProductStock(item.user_product_id); }
          catch(error) {
            if(item.inventory_id) throw error;
            await mercadoLivreApi(`/items/${encodeURIComponent(item.id)}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({available_quantity:quantity})},tenantId);
          }
        } else await mercadoLivreApi(`/items/${encodeURIComponent(item.id)}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({available_quantity:quantity})},tenantId);
        updated++;
      }
    } catch(error) {
      console.error(`Mercado Livre inventory publish failed for ${item.id}`,error);
    }
  }
  return updated;
}

export async function publishAvailableStock(tenantId:string, sku:string){
  const plans=await publicationPlans(tenantId);
  if(!plans.length) return {quantity:0,shopify:0,mercadoLivre:0};
  const groups=new Map<string,typeof plans>();
  for(const plan of plans) groups.set(plan.key,[...(groups.get(plan.key)||[]),plan]);
  let shopify=0,mercadoLivre=0;
  for(const group of groups.values()){
    const quantity=group[0]?.quantity||0;
    const results=await Promise.allSettled([
      publishShopify(tenantId,group.filter(item=>item.variant.source==='SHOPIFY').map(item=>item.variant),quantity),
      publishMercadoLivre(tenantId,group.filter(item=>item.variant.source==='MERCADO_LIVRE'&&!/FULL/i.test(String(item.variant.fulfillment||''))).map(item=>item.variant),quantity)
    ]);
    if(results[0].status==='fulfilled') shopify+=results[0].value; else console.error('Shopify inventory publish failed',results[0].reason);
    if(results[1].status==='fulfilled') mercadoLivre+=results[1].value; else console.error('Mercado Livre inventory publish failed',results[1].reason);
  }
  const requested=plans.find(plan=>plan.variant.sku===sku);
  return {quantity:requested?.quantity||0,shopify,mercadoLivre};
}

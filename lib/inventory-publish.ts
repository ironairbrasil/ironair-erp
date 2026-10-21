import { db } from './db';

async function sharedAvailable(tenantId:string, sku:string){
  const variant=await db.productVariant.findUnique({where:{tenantId_sku:{tenantId,sku}},include:{inventoryFolder:true}});
  if(!variant) return null;
  const warehouse=await db.warehouse.findUnique({where:{tenantId_code:{tenantId,code:'CENTRAL'}}});
  if(!warehouse) return null;
  if(!variant.inventoryFolderId){
    const balance=await db.inventoryBalance.findUnique({where:{tenantId_variantId_warehouseId:{tenantId,variantId:variant.id,warehouseId:warehouse.id}}});
    return {available:Math.max(0,(balance?.onHand||0)-(balance?.reserved||0)),folderId:null,variant};
  }
  const members=await db.productVariant.findMany({where:{tenantId,inventoryFolderId:variant.inventoryFolderId,active:true},select:{id:true}});
  const memberIds=members.map(member=>member.id);
  const movements=await db.inventoryMovement.findMany({where:{tenantId,variantId:{in:memberIds},warehouseId:warehouse.id,...(variant.inventoryFolder?.trackingStartDate?{createdAt:{gte:variant.inventoryFolder.trackingStartDate}}:{})},select:{type:true,quantity:true}});
  let physical=0,reserved=0;
  for(const movement of movements){
    if(movement.type==='ADJUSTMENT'||movement.type==='SALE') physical+=movement.quantity;
    else if(movement.type==='RESERVE') reserved+=Math.abs(movement.quantity);
    else if(movement.type==='RELEASE') reserved=Math.max(0,reserved-Math.abs(movement.quantity));
  }
  return {available:Math.max(0,physical-reserved),folderId:variant.inventoryFolderId,variant};
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
          if(variation.user_product_id) await updateUserProductStock(variation.user_product_id);
          else await mercadoLivreApi(`/items/${encodeURIComponent(item.id)}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({variations:[{id:variation.id,available_quantity:quantity}]})},tenantId);
        }
        updated+=matching.length;
      }else{
        const itemSku=String(item.seller_custom_field||attributeSku(item.attributes)||'').toUpperCase();
        if(!wanted.has(itemSku)) continue;
        if(item.user_product_id){
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
  const stock=await sharedAvailable(tenantId,sku);
  if(!stock) return {quantity:0,shopify:0,mercadoLivre:0};
  const targets=await db.productVariant.findMany({where:{tenantId,active:true,...(stock.folderId?{inventoryFolderId:stock.folderId}:{id:stock.variant.id})}});
  const shopifyTargets=targets.filter(target=>target.source==='SHOPIFY');
  const mercadoLivreTargets=targets.filter(target=>target.source==='MERCADO_LIVRE'&&!/FULL/i.test(String(target.fulfillment||'')));
  const results=await Promise.allSettled([
    publishShopify(tenantId,shopifyTargets,stock.available),
    publishMercadoLivre(tenantId,mercadoLivreTargets,stock.available)
  ]);
  for(const result of results) if(result.status==='rejected') console.error('Inventory publish failed',result.reason);
  return {quantity:stock.available,shopify:results[0].status==='fulfilled'?results[0].value:0,mercadoLivre:results[1].status==='fulfilled'?results[1].value:0};
}

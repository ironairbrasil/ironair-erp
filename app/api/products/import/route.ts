import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';
import { syncShopifyProducts } from '@/lib/shopify';
import { getMercadoLivreConnection, mercadoLivreApi } from '@/lib/mercadolivre';
import { amazonRequest, getAmazonConnection } from '@/lib/amazon';
import { gunzipSync } from 'node:zlib';

type ImportRow={sku:string;product?:string;name?:string;price?:number;cost?:number;quantity?:number;imageUrl?:string|null;fulfillment?:string;externalUrl?:string;source?:'SHOPIFY'|'MERCADO_LIVRE'|'AMAZON'|'SHOPEE'|'MANUAL'};

async function saveRows(tenantId:string, rows:ImportRow[]){
  let imported=0;
  for(const row of rows){
    const sku=String(row.sku||'').trim();
    if(!sku) continue;
    const productName=String(row.product||row.name||'Produto').trim();
    const existing=await db.productVariant.findUnique({where:{tenantId_sku:{tenantId,sku}},include:{product:true}});
    const product=existing?.product||(await db.product.findFirst({where:{tenantId,name:productName}}))||await db.product.create({data:{tenantId,name:productName,imageUrl:row.imageUrl||null}});
    if(row.imageUrl || product.name !== productName) await db.product.update({where:{id:product.id},data:{name:productName,...(row.imageUrl?{imageUrl:row.imageUrl}:{})}});
    const variant=await db.productVariant.upsert({
      where:{tenantId_sku:{tenantId,sku}},
      create:{tenantId,productId:product.id,sku,name:String(row.name||productName),source:row.source,availableQuantity:row.quantity===undefined?null:Math.max(0,Math.trunc(Number(row.quantity||0))),fulfillment:row.fulfillment,externalUrl:row.externalUrl,salePrice:Number(row.price||0),unitCost:Number(row.cost||0),active:true},
      update:{active:true,source:existing?.shopifyId?'SHOPIFY':row.source||existing?.source,availableQuantity:row.quantity===undefined||Boolean(existing?.shopifyId)?existing?.availableQuantity:Math.max(0,Math.trunc(Number(row.quantity||0))),fulfillment:existing?.shopifyId?'Shopify':row.fulfillment||existing?.fulfillment,externalUrl:existing?.shopifyId?existing.externalUrl:row.externalUrl||existing?.externalUrl,...(!existing?.manualOverrides&&!existing?.shopifyId?{productId:product.id,name:String(row.name||productName),salePrice:Number(row.price||existing?.salePrice||0)}:{})}
    });
    if(!variant.inventoryFolderId){
      const voltage=/127(?:V|\b)/i.test(`${sku} ${productName}`)?'127V':/220(?:V|\b)/i.test(`${sku} ${productName}`)?'220V':'';
      if(voltage){
        const folder=await db.inventoryFolder.findUnique({where:{tenantId_name:{tenantId,name:voltage}},select:{id:true}});
        if(folder) await db.productVariant.update({where:{id:variant.id},data:{inventoryFolderId:folder.id}});
      }
    }
    const warehouse=await db.warehouse.findUnique({where:{tenantId_code:{tenantId,code:'CENTRAL'}}});
    if(warehouse) await db.inventoryBalance.upsert({where:{tenantId_variantId_warehouseId:{tenantId,variantId:variant.id,warehouseId:warehouse.id}},create:{tenantId,variantId:variant.id,warehouseId:warehouse.id,onHand:0,reserved:0},update:{}});
    imported++;
  }
  return imported;
}

async function syncMercadoLivreProducts(tenantId:string){
  const connection=await getMercadoLivreConnection(tenantId);
  const search:any=await mercadoLivreApi(`/users/${connection.externalAccountId}/items/search?status=active&limit=100`,{},tenantId);
  const ids:string[]=search.results||[];
  if(!ids.length) return 0;
  const responses:any[]=await mercadoLivreApi(`/items?ids=${ids.join(',')}&attributes=id,title,permalink,thumbnail,price,available_quantity,seller_custom_field,attributes,variations`,{},tenantId);
  const rows:ImportRow[]=[];
  for(const response of responses){
    const item=response?.body;
    if(!item||response.code!==200) continue;
    const image=String(item.thumbnail||'').replace(/^http:/,'https:').replace(/-I\.(jpg|webp)$/i,'-O.$1');
    const attributeSku=(attributes:any[]=[])=>String(attributes.find((attribute:any)=>attribute.id==='SELLER_SKU')?.value_name||'').trim();
    if(item.variations?.length){
      for(const variation of item.variations){
        const label=(variation.attribute_combinations||[]).map((a:any)=>a.value_name).join(' ');
        const sku=String(variation.seller_custom_field||attributeSku(variation.attributes)||attributeSku(item.attributes)||`${item.id}-${variation.id}`).trim();
        rows.push({sku,product:sku==='IRON-AIR-127V'||sku==='IRON-AIR-220V'?'Passador De Roupas Automático Iron Air 5 Em 1':item.title,name:label||item.title,price:Number(variation.price||item.price||0),quantity:Number(variation.available_quantity||0),imageUrl:image,fulfillment:'Mercado Livre',externalUrl:item.permalink,source:'MERCADO_LIVRE'});
      }
    }else {
      const sku=String(item.seller_custom_field||attributeSku(item.attributes)||item.id).trim();
      rows.push({sku,product:sku==='IRON-AIR-127V'||sku==='IRON-AIR-220V'?'Passador De Roupas Automático Iron Air 5 Em 1':item.title,name:item.title,price:Number(item.price||0),quantity:Number(item.available_quantity||0),imageUrl:image,fulfillment:'Mercado Livre',externalUrl:item.permalink,source:'MERCADO_LIVRE'});
    }
  }
  const imported=await saveRows(tenantId,rows);
  await db.productVariant.updateMany({where:{tenantId,source:'MERCADO_LIVRE',sku:{notIn:rows.map(row=>row.sku)}},data:{active:false}});
  return imported;
}

async function syncAmazonProducts(tenantId:string){
  const connection=await getAmazonConnection(tenantId);
  const report:any=await amazonRequest('/reports/2021-06-30/reports',{method:'POST',body:{reportType:'GET_MERCHANT_LISTINGS_ALL_DATA',marketplaceIds:[connection.marketplaceId]}},tenantId);
  let reportDocumentId='';
  for(let attempt=0;attempt<20;attempt++){
    const status:any=await amazonRequest(`/reports/2021-06-30/reports/${report.reportId}`,{},tenantId);
    if(status.processingStatus==='DONE'){reportDocumentId=String(status.reportDocumentId||'');break;}
    if(status.processingStatus==='CANCELLED'||status.processingStatus==='FATAL') throw new Error(`Relatório de produtos Amazon: ${status.processingStatus}`);
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
  if(!reportDocumentId) throw new Error('A Amazon ainda está preparando a lista de produtos. Tente sincronizar novamente.');
  const document:any=await amazonRequest(`/reports/2021-06-30/documents/${reportDocumentId}`,{},tenantId);
  const download=await fetch(String(document.url),{cache:'no-store'});
  if(!download.ok) throw new Error('Não foi possível baixar a lista de produtos Amazon');
  const raw=Buffer.from(await download.arrayBuffer());
  const text=(document.compressionAlgorithm==='GZIP'?gunzipSync(raw):raw).toString('utf8').replace(/^\uFEFF/,'');
  const lines=text.split(/\r?\n/).filter(Boolean);
  const headers=(lines.shift()||'').split('\t').map(header=>header.trim().toLowerCase());
  const read=(values:string[],names:string[])=>{for(const name of names){const index=headers.indexOf(name);if(index>=0&&values[index]!==undefined)return values[index].trim();}return '';};
  const reportRows:ImportRow[]=lines.map(line=>{
    const values=line.split('\t');
    const sku=read(values,['seller-sku','sku do vendedor','sku']);
    const title=read(values,['item-name','nome do item','title'])||sku;
    const asin=read(values,['asin1','asin']);
    const quantity=Number(read(values,['quantity','quantidade'])||0);
    const price=Number(String(read(values,['price','preço','preco'])||0).replace(',','.'));
    return {sku,product:title,name:title,price,quantity,imageUrl:null,fulfillment:'Amazon',externalUrl:asin?`https://www.amazon.com.br/dp/${asin}`:undefined,source:'AMAZON' as const};
  }).filter(row=>row.sku&&(Number(row.price||0)>0||Number(row.quantity||0)>0));
  const inventory:any=await amazonRequest('/fba/inventory/v1/summaries',{query:{granularityType:'Marketplace',granularityId:connection.marketplaceId,marketplaceIds:connection.marketplaceId,details:'true'}},tenantId);
  const summaries:any[]=inventory?.payload?.inventorySummaries||[];
  const rows:ImportRow[]=[];
  for(const item of summaries){
    let imageUrl:string|null=null;
    let title=String(item.productName||item.sellerSku||item.asin);
    try{
      const catalog:any=await amazonRequest(`/catalog/2022-04-01/items/${item.asin}`,{query:{marketplaceIds:connection.marketplaceId,includedData:'images,summaries'}},tenantId);
      const images=catalog?.images?.[0]?.images||[];
      imageUrl=images.find((image:any)=>image.variant==='MAIN'&&image.width>=500)?.link||images.find((image:any)=>image.variant==='MAIN')?.link||null;
      title=catalog?.summaries?.[0]?.itemName||title;
    }catch{}
    const available=Number(item.inventoryDetails?.fulfillableQuantity||0);
    const sku=String(item.sellerSku||item.asin);
    rows.push({sku,product:title,name:title,quantity:available,imageUrl,fulfillment:/^FBA-/i.test(sku)?'Amazon FBA':'Amazon',externalUrl:`https://www.amazon.com.br/dp/${item.asin}`,source:'AMAZON'});
  }
  const merged=new Map<string,ImportRow>();
  for(const row of reportRows) merged.set(row.sku,row);
  for(const row of rows) merged.set(row.sku,{...(merged.get(row.sku)||{}),...row,quantity:row.quantity});
  return saveRows(tenantId,[...merged.values()]);
}

export async function POST(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const body=await req.json();
    if(Array.isArray(body.rows)) return NextResponse.json({ok:true,imported:await saveRows(tenantId,body.rows)});
    const platforms=Array.isArray(body.platforms)?body.platforms.map(String):[];
    let imported=0;
    if(platforms.includes('Shopify')) imported+=await syncShopifyProducts(tenantId);
    if(platforms.includes('Mercado Livre')) imported+=await syncMercadoLivreProducts(tenantId);
    if(platforms.includes('Amazon')) imported+=await syncAmazonProducts(tenantId);
    const channels:any[]=[];
    if(platforms.includes('Shopee')) channels.push('SHOPEE');
    if(channels.length){
      const items=await db.orderItem.findMany({where:{tenantId,order:{channel:{in:channels}}},select:{sku:true,name:true,unitPrice:true,order:{select:{channel:true}}}});
      const unique=[...new Map(items.map(item=>[item.sku,{sku:item.sku,product:item.name,name:item.name,price:Number(item.unitPrice),source:item.order.channel as ImportRow['source']}])).values()];
      imported+=await saveRows(tenantId,unique);
    }
    return NextResponse.json({ok:true,imported});
  }catch(error:any){return NextResponse.json({ok:false,error:error?.message||'Não foi possível importar produtos'},{status:400});}
}

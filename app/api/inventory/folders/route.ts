import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';
import { publishAvailableStock } from '@/lib/inventory-publish';

export async function GET(req:Request){
  const tenantId=await getTenantId(req);
  return NextResponse.json(await db.inventoryFolder.findMany({where:{tenantId},orderBy:{name:'asc'},include:{_count:{select:{variants:true}}}}));
}

export async function POST(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const body=await req.json();
    const name=String(body.name||'').trim();
    if(!name) return NextResponse.json({error:'Informe o nome da pasta.'},{status:400});
    const folder=await db.inventoryFolder.upsert({where:{tenantId_name:{tenantId,name}},create:{tenantId,name},update:{}});
    const skus=Array.isArray(body.skus)?body.skus.map(String).filter(Boolean):[];
    if(skus.length) await db.productVariant.updateMany({where:{tenantId,sku:{in:skus}},data:{inventoryFolderId:folder.id}});
    const publication=skus[0]?await publishAvailableStock(tenantId,skus[0]):null;
    return NextResponse.json({...folder,publication});
  }catch(error:any){return NextResponse.json({error:error?.message||'Não foi possível criar a pasta.'},{status:400});}
}

export async function PATCH(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const body=await req.json();
    const sku=String(body.sku||'');
    const folderId=body.folderId?String(body.folderId):null;
    if(!sku) return NextResponse.json({error:'Produto inválido.'},{status:400});
    if(folderId){
      const folder=await db.inventoryFolder.findFirst({where:{id:folderId,tenantId},select:{id:true}});
      if(!folder) return NextResponse.json({error:'Pasta não encontrada.'},{status:404});
    }
    await db.productVariant.update({where:{tenantId_sku:{tenantId,sku}},data:{inventoryFolderId:folderId}});
    const publication=await publishAvailableStock(tenantId,sku);
    return NextResponse.json({ok:true,publication});
  }catch(error:any){return NextResponse.json({error:error?.message||'Não foi possível mover o produto.'},{status:400});}
}

export async function DELETE(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const id=new URL(req.url).searchParams.get('id')||'';
    await db.inventoryFolder.delete({where:{id,tenantId}});
    return NextResponse.json({ok:true});
  }catch(error:any){return NextResponse.json({error:error?.message||'Não foi possível excluir a pasta.'},{status:400});}
}

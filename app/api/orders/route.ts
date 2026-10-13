import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ingestOrder } from '@/lib/orders';
import { moveStock } from '@/lib/inventory';
import { getTenantId } from '@/lib/tenant';

export async function GET(req:Request){
  const tenantId=await getTenantId(req);
  const rows=await db.order.findMany({where:{tenantId},take:100,orderBy:[{paidAt:'desc'},{createdAt:'desc'}],include:{items:true,attribution:true,customer:true}});
  return NextResponse.json(rows);
}

export async function POST(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const b=await req.json();
    const product=await db.productVariant.findUnique({where:{tenantId_sku:{tenantId,sku:String(b.sku||'')}}});
    const quantity=Math.max(1,Math.trunc(Number(b.quantity||1)));
    const grossAmount=Number(b.value||b.grossAmount||product?.salePrice||0);
    const order=await ingestOrder({
      tenantId,
      externalId:String(b.externalId||`MANUAL-${Date.now()}`),
      channel:'MANUAL',
      status:b.status||'PAID',
      grossAmount,
      currency:'BRL',
      paymentMethod:b.paymentMethod||'Manual',
      paidAt:new Date().toISOString(),
      customer:{name:b.customer||'Cliente manual',externalId:b.email||undefined},
      items:[{
        sku:String(b.sku||product?.sku||''),
        name:String(b.product||product?.name||'Item manual'),
        quantity,
        unitPrice:grossAmount/quantity,
        unitCost:Number(product?.unitCost||0)
      }],
      attribution:b.attribution||{source:b.source||'Manual',campaign:b.campaign||undefined}
    });
    return NextResponse.json({ok:true,id:order.id});
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'error'},{status:400});
  }
}

export async function PATCH(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const b=await req.json();
    const id=String(b.id||'');
    if(!id) return NextResponse.json({ok:false,error:'id obrigatório'},{status:400});
    const order=await db.order.updateMany({
      where:{id,tenantId},
      data:{
        feeAmount:Number(b.feeAmount||b.fee||0),
        shippingAmount:Number(b.shippingAmount||b.freight||0)
      }
    });
    if(!order.count) return NextResponse.json({ok:false,error:'Pedido não encontrado'},{status:404});
    return NextResponse.json({ok:true});
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'error'},{status:400});
  }
}

export async function DELETE(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const u=new URL(req.url);
    const id=u.searchParams.get('id');
    if(!id) return NextResponse.json({ok:false,error:'id obrigatório'},{status:400});
    const order=await db.order.findFirst({where:{id,tenantId},include:{movements:{where:{tenantId},include:{variant:true,warehouse:true}}}});
    if(!order) return NextResponse.json({ok:false,error:'Pedido não encontrado'},{status:404});
    for(const m of order.movements){
      if(m.type==='SALE'&&m.quantity<0){
        await moveStock({
          tenantId,
          sku:m.variant.sku,
          warehouseCode:m.warehouse.code,
          quantity:Math.abs(m.quantity),
          type:'RETURN',
          reference:`delete:${order.externalId}`,
          note:'Reversão automática por exclusão de venda',
          idempotencyKey:`delete-order:${order.id}:${m.id}`
        });
      }
    }
    await db.order.delete({where:{id}});
    return NextResponse.json({ok:true});
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'error'},{status:400});
  }
}

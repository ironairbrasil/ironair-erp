import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';

export async function GET(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const rows=await db.customer.findMany({
      where:{tenantId},
      take:100,
      orderBy:{createdAt:'desc'},
      include:{orders:{select:{id:true,status:true,grossAmount:true,createdAt:true,channel:true},orderBy:{createdAt:'desc'}}}
    });
    return NextResponse.json(rows.map(c=>({
      id:c.id,
      name:c.name,
      city:c.city,
      state:c.state,
      zip:c.zip,
      externalId:c.externalId,
      createdAt:c.createdAt,
      orders:c.orders.length,
      paidOrders:c.orders.filter(o=>o.status==='PAID').length,
      revenue:c.orders.filter(o=>o.status==='PAID').reduce((sum,o)=>sum+Number(o.grossAmount),0),
      lastOrderAt:c.orders[0]?.createdAt,
      lastChannel:c.orders[0]?.channel
    })));
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'customers_error'},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const b=await req.json();
    const customer=await db.customer.create({data:{
      tenantId,
      sourceKey:b.sourceKey||undefined,
      externalId:b.externalId||undefined,
      name:b.name||undefined,
      city:b.city||undefined,
      state:b.state||undefined,
      zip:b.zip||undefined
    }});
    return NextResponse.json({ok:true,id:customer.id});
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'error'},{status:400});
  }
}

export async function PATCH(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const b=await req.json();
    if(!b.id) return NextResponse.json({ok:false,error:'id obrigatório'},{status:400});
    const data:Record<string,string|null>={};
    for(const key of ['externalId','name','city','state','zip']){
      if(Object.prototype.hasOwnProperty.call(b,key)) data[key]=b[key]||null;
    }
    if(!Object.keys(data).length) return NextResponse.json({ok:false,error:'nenhum campo para atualizar'},{status:400});
    const customer=await db.customer.updateMany({where:{id:b.id,tenantId},data});
    if(!customer.count) return NextResponse.json({ok:false,error:'cliente não encontrado'},{status:404});
    return NextResponse.json({ok:true,id:b.id});
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'error'},{status:400});
  }
}

export async function DELETE(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const id=new URL(req.url).searchParams.get('id');
    if(!id) return NextResponse.json({ok:false,error:'id obrigatório'},{status:400});
    await db.customer.deleteMany({where:{id,tenantId}});
    return NextResponse.json({ok:true});
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'error'},{status:400});
  }
}

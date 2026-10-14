import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';
import { auditLog, mergeManualOverrides } from '@/lib/audit';

export async function GET(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const rows=await db.customer.findMany({
      where:{tenantId,orders:{some:{}}},
      take:250,
      orderBy:{createdAt:'desc'},
      include:{orders:{select:{id:true,status:true,grossAmount:true,createdAt:true,paidAt:true,channel:true},orderBy:[{paidAt:'desc'},{createdAt:'desc'}]}}
    });
    const mapped=rows.map(c=>{
      const last=c.orders[0];
      return {
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
        lastOrderAt:last?.paidAt||last?.createdAt||c.createdAt,
        lastChannel:last?.channel
      };
    });
    mapped.sort((a,b)=>new Date(b.lastOrderAt||0).getTime()-new Date(a.lastOrderAt||0).getTime());
    return NextResponse.json(mapped.slice(0,100));
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
      zip:b.zip||undefined,
      manualOverrides:mergeManualOverrides(null,['externalId','name','city','state','zip']) as any
    }});
    await auditLog({tenantId,entityType:'Customer',entityId:customer.id,action:'create_manual_customer',after:{externalId:b.externalId,name:b.name,city:b.city,state:b.state,zip:b.zip}});
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
    const current=await db.customer.findFirst({where:{id:b.id,tenantId}});
    if(!current) return NextResponse.json({ok:false,error:'cliente não encontrado'},{status:404});
    const data:Record<string,any>={};
    const fields:string[]=[];
    for(const key of ['externalId','name','city','state','zip']){
      if(Object.prototype.hasOwnProperty.call(b,key)){data[key]=b[key]||null;fields.push(key)}
    }
    if(!Object.keys(data).length) return NextResponse.json({ok:false,error:'nenhum campo para atualizar'},{status:400});
    data.manualOverrides=mergeManualOverrides(current.manualOverrides,fields);
    await db.customer.update({where:{id:b.id},data});
    await auditLog({tenantId,entityType:'Customer',entityId:b.id,action:'update_manual_customer',before:{externalId:current.externalId,name:current.name,city:current.city,state:current.state,zip:current.zip},after:data,metadata:{fields}});
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

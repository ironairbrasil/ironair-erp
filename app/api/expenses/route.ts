import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';

export async function GET(req:Request){
  const tenantId=await getTenantId(req);
  const rows=await db.expense.findMany({where:{tenantId},take:100,orderBy:{date:'desc'}});
  return NextResponse.json(rows.map(e=>({...e,amount:Number(e.amount)})));
}

export async function POST(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const b=await req.json();
    const expense=await db.expense.create({data:{
      tenantId,
      date:b.date?new Date(b.date):new Date(),
      category:b.category||'Outro',
      description:b.desc||b.description||'Despesa',
      amount:Number(b.value||b.amount||0),
      channel:b.channel||undefined
    }});
    return NextResponse.json({ok:true,id:expense.id});
  }catch(e:any){return NextResponse.json({ok:false,error:e?.message||'error'},{status:400})}
}

export async function DELETE(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const id=new URL(req.url).searchParams.get('id');
    if(!id)return NextResponse.json({ok:false,error:'id obrigatório'},{status:400});
    await db.expense.deleteMany({where:{id,tenantId}});
    return NextResponse.json({ok:true});
  }catch(e:any){return NextResponse.json({ok:false,error:e?.message||'error'},{status:400})}
}

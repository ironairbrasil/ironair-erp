import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';

export async function GET(req:Request){
  const tenantId=await getTenantId(req);
  const rows=await db.expense.findMany({where:{tenantId},take:500,orderBy:{date:'desc'}});
  return NextResponse.json(rows.map(e=>({...e,amount:Number(e.amount),rate:e.rate===null?null:Number(e.rate)})));
}

export async function POST(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const b=await req.json();
    const kind=b.kind==='PERCENT'?'PERCENT':'FIXED';
    let schedule=['FIXED','MONTHLY','QUARTERLY','SEMIANNUAL','YEARLY','CUSTOM'].includes(b.schedule)?b.schedule:'FIXED';
    const amount=Number(b.value??b.amount??0);
    const rate=Number(b.rate??0);
    const category=['Imposto','Operacional','Outro'].includes(String(b.category))?String(b.category):'Outro';
    const isFixed=category==='Imposto'?false:Boolean(b.isFixed);
    const installments=!isFixed&&category!=='Imposto'?Math.min(60,Math.max(1,Math.trunc(Number(b.installments)||1))):1;
    if(!isFixed&&category!=='Imposto') schedule='FIXED';
    if(!String(b.desc||b.description||'').trim()) return NextResponse.json({ok:false,error:'Descrição obrigatória'},{status:400});
    if(kind==='FIXED'&&(!Number.isFinite(amount)||amount<=0)) return NextResponse.json({ok:false,error:'Informe um valor fixo maior que zero'},{status:400});
    if(kind==='PERCENT'&&(!Number.isFinite(rate)||rate<=0||rate>100)) return NextResponse.json({ok:false,error:'Informe um percentual entre 0 e 100'},{status:400});
    if(['FIXED','CUSTOM'].includes(schedule)&&!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date||''))) return NextResponse.json({ok:false,error:'Escolha a data da despesa única'},{status:400});
    const expense=await db.expense.create({data:{
      tenantId,
      date:b.date?new Date(`${b.date}T12:00:00.000-03:00`):new Date(),
      category,
      description:b.desc||b.description||'Despesa',
      amount:kind==='FIXED'?amount:0,
      kind,
      isFixed,
      installments,
      rate:kind==='PERCENT'?rate:null,
      schedule,
      channel:b.channel||undefined
    }});
    return NextResponse.json({ok:true,id:expense.id});
  }catch(e:any){return NextResponse.json({ok:false,error:e?.message||'error'},{status:400})}
}

export async function PATCH(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const b=await req.json();
    const id=String(b.id||'');
    if(!id)return NextResponse.json({ok:false,error:'id obrigatório'},{status:400});
    const existing=await db.expense.findFirst({where:{id,tenantId},select:{isFixed:true}});
    if(!existing)return NextResponse.json({ok:false,error:'Despesa não encontrada'},{status:404});
    const kind=b.kind==='PERCENT'?'PERCENT':'FIXED';
    let schedule=['FIXED','MONTHLY','QUARTERLY','SEMIANNUAL','YEARLY','CUSTOM'].includes(b.schedule)?b.schedule:'FIXED';
    const amount=Number(b.value??b.amount??0);
    const rate=Number(b.rate??0);
    const description=String(b.desc??b.description??'').trim();
    const category=['Imposto','Operacional','Outro'].includes(String(b.category))?String(b.category):'Outro';
    const isFixed=category==='Imposto'?false:b.isFixed===undefined?existing.isFixed:Boolean(b.isFixed);
    const installments=!isFixed&&category!=='Imposto'?Math.min(60,Math.max(1,Math.trunc(Number(b.installments)||1))):1;
    if(!isFixed&&category!=='Imposto') schedule='FIXED';
    if(!description)return NextResponse.json({ok:false,error:'Descrição obrigatória'},{status:400});
    if(kind==='FIXED'&&(!Number.isFinite(amount)||amount<=0))return NextResponse.json({ok:false,error:'Informe um valor fixo maior que zero'},{status:400});
    if(kind==='PERCENT'&&(!Number.isFinite(rate)||rate<=0||rate>100))return NextResponse.json({ok:false,error:'Informe um percentual entre 0 e 100'},{status:400});
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date||'')))return NextResponse.json({ok:false,error:'Escolha uma data válida'},{status:400});
    const updated=await db.expense.updateMany({where:{id,tenantId},data:{
      date:new Date(`${b.date}T12:00:00.000-03:00`),
      category,
      description,
      amount:kind==='FIXED'?amount:0,
      kind,
      isFixed,
      installments,
      rate:kind==='PERCENT'?rate:null,
      schedule,
    }});
    if(!updated.count)return NextResponse.json({ok:false,error:'Despesa não encontrada'},{status:404});
    return NextResponse.json({ok:true});
  }catch(e:any){return NextResponse.json({ok:false,error:e?.message||'error'},{status:400})}
}

export async function DELETE(req:Request){
  try{
    const tenantId=await getTenantId(req);
    if(req.headers.get('content-type')?.includes('application/json')){
      const body=await req.json();
      const ids=Array.isArray(body.ids)?body.ids.filter((id:unknown):id is string=>typeof id==='string'&&id.length>0):[];
      if(!ids.length) return NextResponse.json({ok:false,error:'Selecione despesas para excluir'},{status:400});
      const result=await db.expense.deleteMany({where:{tenantId,id:{in:ids}}});
      return NextResponse.json({ok:true,deleted:result.count});
    }
    const id=new URL(req.url).searchParams.get('id');
    if(!id)return NextResponse.json({ok:false,error:'id obrigatório'},{status:400});
    await db.expense.deleteMany({where:{id,tenantId}});
    return NextResponse.json({ok:true});
  }catch(e:any){return NextResponse.json({ok:false,error:e?.message||'error'},{status:400})}
}

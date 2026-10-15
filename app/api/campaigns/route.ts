import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';

export async function GET(req:Request){
  const tenantId=await getTenantId(req);
  const spend=await db.adSpendDaily.groupBy({where:{tenantId},by:['platform','accountId','campaignId','campaignName'],_sum:{spend:true,clicks:true,impressions:true}});
  const attrs=await db.attribution.findMany({where:{tenantId,campaignId:{not:null}},include:{order:true}});
  const map=new Map<string,{sales:number,revenue:number}>();
  for(const a of attrs){if(a.order.status!=='PAID'||!a.campaignId)continue;const x=map.get(a.campaignId)||{sales:0,revenue:0};x.sales++;x.revenue+=Number(a.order.grossAmount)-Number(a.order.discountAmount)+Number(a.order.shippingAmount);map.set(a.campaignId,x)}
  return NextResponse.json(spend.map(s=>{const x=map.get(s.campaignId)||{sales:0,revenue:0},sp=Number(s._sum.spend||0);return{...s,spend:sp,clicks:s._sum.clicks||0,impressions:s._sum.impressions||0,...x,cpa:x.sales?sp/x.sales:null,roas:sp?x.revenue/sp:null}}));
}

export async function POST(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const b=await req.json();
    const campaignId=String(b.campaignId||`manual-${Date.now()}`);
    const row=await db.adSpendDaily.upsert({
      where:{tenantId_platform_date_accountId_campaignId_adsetId_adId:{tenantId,platform:b.platform||'Meta',date:new Date(),accountId:'manual',campaignId,adsetId:'',adId:''}},
      create:{tenantId,platform:b.platform||'Meta',date:new Date(),accountId:'manual',campaignId,campaignName:b.name||campaignId,spend:Number(b.budget||0),adsetId:'',adId:''},
      update:{campaignName:b.name||campaignId,spend:Number(b.budget||0)}
    });
    return NextResponse.json({ok:true,id:row.id});
  }catch(e:any){return NextResponse.json({ok:false,error:e?.message||'error'},{status:400})}
}

export async function DELETE(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const campaignId=new URL(req.url).searchParams.get('campaignId');
    const platform=new URL(req.url).searchParams.get('platform');
    if(!campaignId)return NextResponse.json({ok:false,error:'campaignId obrigatório'},{status:400});
    if(!platform)return NextResponse.json({ok:false,error:'platform obrigatório'},{status:400});
    const deleted=await db.adSpendDaily.deleteMany({where:{tenantId,campaignId,platform,accountId:'manual'}});
    if(!deleted.count)return NextResponse.json({ok:false,error:'Apenas campanhas manuais podem ser excluídas'},{status:403});
    return NextResponse.json({ok:true});
  }catch(e:any){return NextResponse.json({ok:false,error:e?.message||'error'},{status:400})}
}

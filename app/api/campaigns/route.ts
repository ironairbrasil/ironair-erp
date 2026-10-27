import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';
import { adDateRange } from '@/lib/ad-date-range';

export async function GET(req:Request){
  const tenantId=await getTenantId(req);
  const dateRange=adDateRange(req);
  const rows=await db.adSpendDaily.findMany({where:{tenantId},select:{date:true,platform:true,accountId:true,campaignId:true,campaignName:true,adsetId:true,adsetName:true,adId:true,adName:true,spend:true,clicks:true,impressions:true}});
  const [attrs,metaIntegration]=await Promise.all([db.attribution.findMany({where:{tenantId,...(dateRange?{order:{status:'PAID' as const,paidAt:{gte:new Date(`${dateRange.from}T00:00:00.000-03:00`),lte:new Date(`${dateRange.to}T23:59:59.999-03:00`)}}}:{})},include:{order:true}}),db.integration.findUnique({where:{tenantId_provider:{tenantId,provider:'Meta Ads'}},select:{metadata:true}})]);
  const metaMetadata=metaIntegration?.metadata&&typeof metaIntegration.metadata==='object'&&!Array.isArray(metaIntegration.metadata)?metaIntegration.metadata as Record<string,unknown>:{};
  const statuses=metaMetadata.entityStatuses&&typeof metaMetadata.entityStatuses==='object'&&!Array.isArray(metaMetadata.entityStatuses)?metaMetadata.entityStatuses as Record<string,string>:{};
  type Summary={platform:string;accountId:string;campaignId:string;campaignName:string;adsetId?:string;adsetName?:string;adId?:string;adName?:string;spend:number;recentSpend:number;clicks:number;impressions:number;sales:number;revenue:number;cpa:number|null;roas:number|null};
  const recentSince=new Date(Date.now()-7*864e5);
  const totals=(level:'campaign'|'adset'|'ad')=>{
    const grouped=new Map<string,Summary>();
    for(const row of rows){
      if(level==='adset'&&!row.adsetId||level==='ad'&&!row.adId)continue;
      const key=[row.platform,row.accountId,row.campaignId,level==='campaign'?'':row.adsetId||'',level==='ad'?row.adId||'':''].join('::');
      const current=grouped.get(key)||{platform:row.platform,accountId:row.accountId,campaignId:row.campaignId,campaignName:row.campaignName,adsetId:row.adsetId||undefined,adsetName:row.adsetName||undefined,adId:row.adId||undefined,adName:row.adName||undefined,spend:0,recentSpend:0,clicks:0,impressions:0,sales:0,revenue:0,cpa:null,roas:null};
      if(!dateRange||row.date>=dateRange.start&&row.date<=dateRange.end){current.spend+=Number(row.spend);current.clicks+=row.clicks;current.impressions+=row.impressions;}
      if(row.date>=recentSince)current.recentSpend+=Number(row.spend);
      grouped.set(key,current);
    }
    const byId=new Map<string,Summary>();
    for(const item of grouped.values())byId.set(level==='campaign'?item.campaignId:level==='adset'?item.adsetId||'':item.adId||'',item);
    for(const attr of attrs){
      if(attr.order.status!=='PAID')continue;
      const id=level==='campaign'?(attr.campaignId||attr.campaign):level==='adset'?attr.adsetId:attr.adId;
      if(!id)continue;
      const revenue=Number(attr.order.grossAmount)-Number(attr.order.discountAmount)+Number(attr.order.shippingAmount);
      const item=byId.get(id);
      if(item){item.sales++;item.revenue+=revenue;}
    }
    return [...grouped.values()].map(item=>({...item,status:statuses[level==='campaign'?item.campaignId:level==='adset'?item.adsetId||'':item.adId||'']||null,cpa:item.sales?item.spend/item.sales:null,roas:item.spend?item.revenue/item.spend:null}));
  };
  const campaigns=totals('campaign');
  if(new URL(req.url).searchParams.get('hierarchy')==='1')return NextResponse.json({campaigns,adsets:totals('adset'),ads:totals('ad')});
  return NextResponse.json(campaigns);
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

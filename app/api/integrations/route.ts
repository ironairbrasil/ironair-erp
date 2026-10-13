import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';

type IntegrationRow={
  provider:string;
  status:string;
  configured:boolean;
  missingFields:string[];
  lastSyncAt:Date|null|undefined;
  lastError:string|null|undefined;
  fields:readonly string[];
  mode?:string;
  shopDomain?:string|null;
  connectedAt?:Date|null;
  webhooks?:Array<Record<string,unknown>>;
};

const catalog:[string,readonly string[]][]=[
  ['Shopify',[]]
];

export async function GET(req:Request){
  const tenantId=await getTenantId(req);
  const saved=await db.integration.findMany({where:{tenantId},include:{webhooks:true}});
  const savedMap=new Map(saved.map(i=>[i.provider,i]));
  const rows:IntegrationRow[]=catalog.map(([provider,fields])=>{
    const configured=provider==='Shopify'
      ? Boolean(process.env.SHOPIFY_SHOP_DOMAIN&&process.env.SHOPIFY_ADMIN_ACCESS_TOKEN&&process.env.SHOPIFY_WEBHOOK_SECRET)
      : fields.every(f=>Boolean(process.env[f]));
    const row=savedMap.get(provider);
    savedMap.delete(provider);
    if((row?.config as any)?.hidden) return null;
    return {
      provider,
      status:row?.status||(configured?'CONNECTED':'DISCONNECTED'),
      configured,
      missingFields:fields.filter(f=>!process.env[f]),
      lastSyncAt:row?.lastSyncAt,
      lastError:row?.lastError,
      fields,
      mode:row?.mode||'DEV_MANUAL',
      shopDomain:row?.shopDomain,
      connectedAt:row?.connectedAt,
      webhooks:row?.webhooks?.map(w=>({topic:w.topic,status:w.status,callbackUrl:w.callbackUrl,lastRegisteredAt:w.lastRegisteredAt,lastError:w.lastError}))||[]
    };
  }).filter(Boolean) as IntegrationRow[];
  for(const row of savedMap.values()){
    if((row.config as any)?.hidden) continue;
    rows.push({
      provider:row.provider,
      status:row.status,
      configured:false,
      missingFields:[],
      lastSyncAt:row.lastSyncAt,
      lastError:row.lastError,
      fields:Array.isArray((row.config as any)?.fields)?(row.config as any).fields:[]
    });
  }
  return NextResponse.json(rows);
}

export async function POST(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const b=await req.json();
    if(!b.provider&&!b.name) return NextResponse.json({ok:false,error:'provider obrigatório'},{status:400});
    const provider=String(b.provider||b.name);
    const mode=provider==='Shopify'||provider==='Mercado Livre'?'OAUTH':'DEV_MANUAL';
    const config={category:b.cat,webhook:b.webhook,fields:b.fields||[],hidden:false};
    const integration=await db.integration.upsert({
      where:{tenantId_provider:{tenantId,provider}},
      create:{tenantId,provider,status:'DISCONNECTED',mode,config},
      update:{
        status:'DISCONNECTED',
        mode,
        externalAccountId:null,
        shopDomain:null,
        accessTokenEncrypted:null,
        refreshTokenEncrypted:null,
        webhookSecretEncrypted:null,
        scopes:null,
        metadata:{},
        lastError:null,
        lastSyncAt:null,
        connectedAt:null,
        disconnectedAt:new Date(),
        config
      }
    });
    return NextResponse.json({ok:true,id:integration.id});
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'error'},{status:400});
  }
}

export async function DELETE(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const provider=new URL(req.url).searchParams.get('provider');
    if(!provider) return NextResponse.json({ok:false,error:'provider obrigatório'},{status:400});
    await db.integration.upsert({
      where:{tenantId_provider:{tenantId,provider}},
      create:{tenantId,provider,status:'DISCONNECTED',mode:'DEV_MANUAL',config:{hidden:true}},
      update:{status:'DISCONNECTED',disconnectedAt:new Date(),config:{hidden:true}}
    });
    return NextResponse.json({ok:true});
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'error'},{status:400});
  }
}

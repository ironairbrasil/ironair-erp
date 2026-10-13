import { NextResponse } from 'next/server';
import { syncShopifyOrders, syncShopifyProducts } from '@/lib/shopify';
import { getTenantId } from '@/lib/tenant';
export const runtime='nodejs';
export async function POST(req:Request){try{const tenantId=await getTenantId(req);const body=await req.json().catch(()=>({}));const products=body.products===false?0:await syncShopifyProducts(tenantId);const orders=body.orders===false?0:await syncShopifyOrders(Math.min(Math.max(Number(body.days)||90,1),365),tenantId);return NextResponse.json({ok:true,products,orders})}catch(e:any){return NextResponse.json({ok:false,error:e?.message||'sync_failed'},{status:500})}}

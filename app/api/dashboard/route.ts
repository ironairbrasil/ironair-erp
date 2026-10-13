import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';

export async function GET(req:Request){
  const tenantId=await getTenantId(req);
  const u=new URL(req.url);
  const days=Math.min(Math.max(Number(u.searchParams.get('days')||30),1),365);
  const from=u.searchParams.get('from');
  const to=u.searchParams.get('to');
  const since=from?new Date(`${from}T00:00:00.000-03:00`):new Date(Date.now()-days*864e5);
  const until=to?new Date(`${to}T23:59:59.999-03:00`):undefined;
  const range=until?{gte:since,lte:until}:{gte:since};
  const [paid,spend,inventory,tracking,expenses]=await Promise.all([
    db.order.findMany({where:{tenantId,status:'PAID',paidAt:range},include:{items:true,attribution:true}}),
    db.adSpendDaily.findMany({where:{tenantId,date:range}}),
    db.inventoryBalance.findMany({where:{tenantId},include:{variant:true}}),
    db.trackingEvent.groupBy({by:['type'],_count:{_all:true},where:{tenantId,occurredAt:range}}),
    db.expense.findMany({where:{tenantId,date:range}})
  ]);
  let revenue=0,cogs=0,fees=0;
  const daily=new Map<string,{date:string;revenue:number;profit:number;orders:number}>();
  const channels=new Map<string,{name:string;invested:number;sales:number;revenue:number;cogs:number;fees:number}>();
  for(const o of paid){
    const orderRevenue=Number(o.grossAmount)-Number(o.discountAmount)+Number(o.shippingAmount);
    const orderFees=Number(o.feeAmount)+Number(o.taxAmount);
    const orderCogs=o.items.reduce((sum,i)=>sum+Number(i.unitCost)*i.quantity,0);
    revenue+=orderRevenue; cogs+=orderCogs; fees+=orderFees;
    const key=(o.paidAt||o.createdAt).toISOString().slice(0,10);
    const d=daily.get(key)||{date:key,revenue:0,profit:0,orders:0};
    d.revenue+=orderRevenue; d.profit+=orderRevenue-orderCogs-orderFees; d.orders++;
    daily.set(key,d);
    const channel=o.channel;
    const c=channels.get(channel)||{name:channel,invested:0,sales:0,revenue:0,cogs:0,fees:0};
    c.sales++; c.revenue+=orderRevenue; c.cogs+=orderCogs; c.fees+=orderFees;
    channels.set(channel,c);
  }
  for(const s of spend){
    const invested=Number(s.spend);
    const name=s.platform;
    const c=channels.get(name)||{name,invested:0,sales:0,revenue:0,cogs:0,fees:0};
    c.invested+=invested;
    channels.set(name,c);
  }
  const media=spend.reduce((sum,s)=>sum+Number(s.spend),0);
  const expenseTotal=expenses.reduce((sum,e)=>sum+Number(e.amount),0);
  const profit=revenue-cogs-fees-media-expenseTotal;
  const available=inventory.reduce((sum,b)=>sum+Math.max(0,b.onHand-b.reserved-b.variant.safetyStock),0);
  const trackingTotal=tracking.reduce((sum,t)=>sum+t._count._all,0);
  return NextResponse.json({
    periodDays:days,
    revenue,
    orders:paid.length,
    cogs,
    fees,
    media,
    profit,
    expenses:expenseTotal,
    margin:revenue?profit/revenue:0,
    roas:media?revenue/media:null,
    ticket:paid.length?revenue/paid.length:0,
    available,
    trackingEvents:trackingTotal,
    daily:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)),
    channels:[...channels.values()].map(c=>({name:c.name,invested:c.invested,sales:c.sales,revenue:c.revenue,cpa:c.sales?c.invested/c.sales:null,roas:c.invested?c.revenue/c.invested:null,profit:c.revenue-c.cogs-c.fees-c.invested}))
  });
}

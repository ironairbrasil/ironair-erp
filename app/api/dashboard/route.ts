import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';
import { CALENDAR_SCHEDULE_MONTHS, calendarPeriods } from '@/lib/expense-schedule';

const localDay=(value:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);

export async function GET(req:Request){
  const tenantId=await getTenantId(req);
  const u=new URL(req.url);
  const days=Math.min(Math.max(Number(u.searchParams.get('days')||30),1),365);
  const allTime=u.searchParams.get('all')==='1';
  const from=u.searchParams.get('from');
  const to=u.searchParams.get('to');
  const platform=u.searchParams.get('platform');
  const product=u.searchParams.get('product');
  const firstSale=allTime?await db.order.findFirst({where:{tenantId,status:'PAID',paidAt:{not:null},...(platform?{channel:platform as any}:{}),...(product?{items:{some:{sku:product}}}:{})},orderBy:{paidAt:'asc'},select:{paidAt:true}}):null;
  const firstSaleDay=firstSale?.paidAt?localDay(firstSale.paidAt):localDay(new Date());
  const firstUniqueExpense=allTime&&!product?await db.expense.findFirst({where:{tenantId,schedule:{in:['FIXED','CUSTOM']},...(platform?{OR:[{channel:null},{channel:platform as any}]}:{})},orderBy:{date:'asc'},select:{date:true}}):null;
  const allTimeStart=firstUniqueExpense?firstSaleDay<localDay(firstUniqueExpense.date)?firstSaleDay:localDay(firstUniqueExpense.date):firstSaleDay;
  const since=allTime?new Date(`${allTimeStart}T00:00:00.000-03:00`):from?new Date(`${from}T00:00:00.000-03:00`):new Date(Date.now()-days*864e5);
  const until=allTime?new Date(`${localDay(new Date())}T23:59:59.999-03:00`):to?new Date(`${to}T23:59:59.999-03:00`):undefined;
  const range=until?{gte:since,lte:until}:{gte:since};
  const recurringSchedules=Object.keys(CALENDAR_SCHEDULE_MONTHS);
  const [paid,spend,inventory,tracking,expenses,variants]=await Promise.all([
    db.order.findMany({where:{tenantId,status:'PAID',paidAt:range,...(platform?{channel:platform as any}:{}),...(product?{items:{some:{sku:product}}}:{})},include:{items:true,attribution:true}}),
    product?Promise.resolve([]):db.adSpendDaily.findMany({where:{tenantId,date:range,...(platform?{platform:platform as any}:{})}}),
    db.inventoryBalance.findMany({where:{tenantId},include:{variant:true}}),
    db.trackingEvent.groupBy({by:['type'],_count:{_all:true},where:{tenantId,occurredAt:range}}),
    db.expense.findMany({where:{tenantId,AND:[{OR:[...(product?[]:[{kind:'FIXED',schedule:{in:['FIXED','CUSTOM']},date:range},{kind:'FIXED',schedule:{in:recurringSchedules}}]),{kind:'PERCENT',schedule:{in:['FIXED','CUSTOM']},date:range},{kind:'PERCENT',schedule:{in:recurringSchedules}}]},...(platform?[{OR:[{channel:null},{channel:platform as any}]}]:[])]}}),
    db.productVariant.findMany({where:{tenantId},select:{sku:true,unitCost:true}})
  ]);
  const costBySku=new Map(variants.map(v=>[v.sku,Number(v.unitCost)]));
  const ironAirCosts=variants.filter(v=>/^IRON-AIR-/i.test(v.sku)).map(v=>Number(v.unitCost)).filter(cost=>cost>0);
  const sharedIronAirCost=ironAirCosts.length&&ironAirCosts.every(cost=>cost===ironAirCosts[0])?ironAirCosts[0]:0;
  const itemUnitCost=(item:{sku:string;name:string;unitCost:unknown})=>Number(item.unitCost)>0?Number(item.unitCost):costBySku.get(item.sku)||(/\biron air\b/i.test(item.name||'')?sharedIronAirCost:0);
  let revenue=0,cogs=0,fees=0,unitCostTotal=0,unitsWithCost=0;
  const daily=new Map<string,{date:string;revenue:number;profit:number;salesProfit:number;orders:number}>();
  const channels=new Map<string,{name:string;invested:number;sales:number;revenue:number;cogs:number;fees:number}>();
  for(const o of paid){
    const allItemsValue=o.items.reduce((sum,i)=>sum+Number(i.unitPrice)*i.quantity,0);
    const selectedItems=product?o.items.filter(i=>i.sku===product):o.items;
    const selectedValue=selectedItems.reduce((sum,i)=>sum+Number(i.unitPrice)*i.quantity,0);
    const share=product?(allItemsValue?selectedValue/allItemsValue:1):1;
    const orderRevenue=(Number(o.grossAmount)-Number(o.discountAmount))*share;
    const orderFees=(Number(o.feeAmount)+Number(o.shippingAmount)+Number(o.taxAmount))*share;
    const orderCogs=selectedItems.reduce((sum,i)=>sum+itemUnitCost(i)*i.quantity,0);
    for(const item of selectedItems){
      const unitCost=itemUnitCost(item);
      if(unitCost && unitCost>0){unitCostTotal+=unitCost*item.quantity;unitsWithCost+=item.quantity;}
    }
    revenue+=orderRevenue; cogs+=orderCogs; fees+=orderFees;
    const salesProfit=orderRevenue-orderFees;
    const key=localDay(o.paidAt||o.createdAt);
    const d=daily.get(key)||{date:key,revenue:0,profit:0,salesProfit:0,orders:0};
    d.revenue+=orderRevenue; d.salesProfit+=salesProfit; d.profit+=salesProfit-orderCogs; d.orders++;
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
    const key=localDay(s.date);
    const d=daily.get(key)||{date:key,revenue:0,profit:0,salesProfit:0,orders:0};
    d.salesProfit-=invested; d.profit-=invested;
    daily.set(key,d);
  }
  const media=spend.reduce((sum,s)=>sum+Number(s.spend),0);
  const rangeFrom=localDay(since);
  const rangeTo=localDay(until||new Date());
  const periodsByExpense=new Map(expenses.filter(e=>CALENDAR_SCHEDULE_MONTHS[e.schedule]).map(e=>[
    e.id,calendarPeriods(rangeFrom,rangeTo,e.schedule)
  ] as const));
  const expenseBreakdown:{id:string;amount:number;basis?:number}[]=[];
  const expenseTotal=expenses.reduce((sum,e)=>{
    const periods=periodsByExpense.get(e.id);
    if(e.kind!=='PERCENT') {
      const amount=periods?periods.length*Number(e.amount):Number(e.amount);
      expenseBreakdown.push({id:e.id,amount});
      return sum+amount;
    }
    const effective=localDay(e.date);
    const basis=[...daily.values()].filter(d=>periods||d.date===effective).reduce((total,d)=>total+d.revenue,0);
    const amount=Math.round(basis*Number(e.rate||0))/100;
    expenseBreakdown.push({id:e.id,amount,basis});
    return sum+amount;
  },0);
  const salesProfit=revenue-fees-media;
  const grossProfit=salesProfit-cogs;
  const profit=grossProfit-expenseTotal;
  const taxes=Math.round(revenue*4)/100;
  const markupUnitCost=unitsWithCost?unitCostTotal/unitsWithCost:product?costBySku.get(product)||0:0;
  const metaAds=spend.reduce((sum,s)=>/meta|facebook|instagram/i.test(s.platform)?sum+Number(s.spend):sum,0);
  const googleAds=spend.reduce((sum,s)=>/google/i.test(s.platform)?sum+Number(s.spend):sum,0);
  const tiktokAds=spend.reduce((sum,s)=>/tiktok|tik tok/i.test(s.platform)?sum+Number(s.spend):sum,0);
  const available=inventory.reduce((sum,b)=>sum+Math.max(0,b.onHand-b.reserved),0);
  const trackingTotal=tracking.reduce((sum,t)=>sum+t._count._all,0);
  return NextResponse.json({
    periodMode:allTime?'all':null,
    periodFrom:rangeFrom,
    periodTo:rangeTo,
    periodDays:days,
    revenue,
    orders:paid.length,
    cogs,
    fees,
    taxes,
    markupUnitCost,
    metaAds,
    googleAds,
    tiktokAds,
    media,
    salesProfit,
    grossProfit,
    profit,
    expenses:expenseTotal,
    expenseBreakdown,
    margin:revenue?profit/revenue:0,
    roas:media?revenue/media:null,
    ticket:paid.length?revenue/paid.length:0,
    available,
    trackingEvents:trackingTotal,
    daily:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)),
    channels:[...channels.values()].map(c=>({name:c.name,invested:c.invested,sales:c.sales,revenue:c.revenue,cpa:c.sales?c.invested/c.sales:null,roas:c.invested?c.revenue/c.invested:null,salesProfit:c.revenue-c.fees-c.invested,profit:c.revenue-c.cogs-c.fees-c.invested}))
  });
}

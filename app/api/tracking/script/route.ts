import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const endpoint = `${new URL(req.url).origin}/api/tracking`;
  const source = `(function(){
  var endpoint=${JSON.stringify(endpoint)}, params=new URLSearchParams(location.search);
  function id(prefix){return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)}
  var visitor=localStorage.getItem('ironair_visitor_id')||id('v'); localStorage.setItem('ironair_visitor_id',visitor);
  var session=sessionStorage.getItem('ironair_session_id')||id('s'); sessionStorage.setItem('ironair_session_id',session);
  function payload(type,meta){return Object.assign({eventId:id('e'),type:type,occurredAt:new Date().toISOString(),visitorId:visitor,sessionId:session,url:location.href,referrer:document.referrer,utm_source:params.get('utm_source'),utm_medium:params.get('utm_medium'),utm_campaign:params.get('utm_campaign'),utm_content:params.get('utm_content'),utm_term:params.get('utm_term'),fbclid:params.get('fbclid'),gclid:params.get('gclid')},meta||{})}
  function send(type,meta){var data=JSON.stringify(payload(type,meta));if(navigator.sendBeacon){navigator.sendBeacon(endpoint,new Blob([data],{type:'application/json'}))}else{fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:data,keepalive:true}).catch(function(){})}}
  send('PAGE_VIEW');
  document.addEventListener('click',function(e){var el=e.target&&e.target.closest&&e.target.closest('button,a,input[type=submit]');if(!el)return;var text=((el.textContent||el.value||'')+' '+(el.id||'')+' '+(el.className||'')).toLowerCase();if(/comprar|buy.now|checkout|finalizar.compra|shopify-payment-button/.test(text)){send('INITIATE_CHECKOUT',{metadata:{label:(el.textContent||el.value||'').trim()}});var attributes={sessionId:session,visitorId:visitor,utm_source:params.get('utm_source')||'',utm_medium:params.get('utm_medium')||'',utm_campaign:params.get('utm_campaign')||''};fetch('/cart/update.js',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attributes:attributes}),keepalive:true}).catch(function(){})}},true);
})();`;
  return new NextResponse(source, { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}

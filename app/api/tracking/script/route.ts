import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const endpoint = `${new URL(req.url).origin}/api/tracking`;
  const source = `(function(){
  var endpoint=${JSON.stringify(endpoint)}, params=new URLSearchParams(location.search), attributionKey='ironair_attribution_v2';
  function id(prefix){return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)}
  function cookie(name){var hit=document.cookie.split('; ').find(function(item){return item.indexOf(name+'=')===0});return hit?decodeURIComponent(hit.slice(name.length+1)):''}
  function inferredSource(){var ref=(document.referrer||'').toLowerCase();if(params.get('fbclid')||/facebook|instagram|fb\.com/.test(ref))return 'facebook';if(params.get('gclid')||/google\./.test(ref))return 'google';return ''}
  function queryAttribution(){return {
    utm_source:params.get('utm_source')||inferredSource(),utm_medium:params.get('utm_medium')||'',utm_campaign:params.get('utm_campaign')||'',utm_content:params.get('utm_content')||'',utm_term:params.get('utm_term')||'',
    campaign_id:params.get('campaign_id')||params.get('utm_id')||'',adset_id:params.get('adset_id')||'',ad_id:params.get('ad_id')||'',
    fbclid:params.get('fbclid')||'',gclid:params.get('gclid')||'',_fbp:cookie('_fbp'),_fbc:cookie('_fbc'),landingPage:location.href,referrer:document.referrer||'',capturedAt:new Date().toISOString()
  }}
  function hasAttribution(value){return !!(value.utm_source||value.utm_campaign||value.campaign_id||value.fbclid||value.gclid)}
  var incoming=queryAttribution(), saved={};try{saved=JSON.parse(localStorage.getItem(attributionKey)||'{}')}catch(e){}
  if(hasAttribution(incoming)){saved.firstTouch=saved.firstTouch||incoming;saved.lastTouch=incoming;localStorage.setItem(attributionKey,JSON.stringify(saved))}
  var touch=saved.lastTouch||incoming;
  var visitor=localStorage.getItem('ironair_visitor_id')||id('v'); localStorage.setItem('ironair_visitor_id',visitor);
  var session=sessionStorage.getItem('ironair_session_id')||id('s'); sessionStorage.setItem('ironair_session_id',session);
  function payload(type,meta){return Object.assign({eventId:id('e'),type:type,occurredAt:new Date().toISOString(),visitorId:visitor,sessionId:session,url:location.href,referrer:document.referrer,utm_source:touch.utm_source||null,utm_medium:touch.utm_medium||null,utm_campaign:touch.utm_campaign||null,utm_content:touch.utm_content||null,utm_term:touch.utm_term||null,fbclid:touch.fbclid||null,gclid:touch.gclid||null,campaign_id:touch.campaign_id||null,adset_id:touch.adset_id||null,ad_id:touch.ad_id||null},meta||{})}
  function send(type,meta){var data=JSON.stringify(payload(type,meta));fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:data,keepalive:true,mode:'cors'}).catch(function(){if(navigator.sendBeacon)navigator.sendBeacon(endpoint,new Blob([data],{type:'application/json'}))})}
  function syncCartAttribution(){if(!hasAttribution(touch))return;var attributes={sessionId:session,visitorId:visitor,utm_source:touch.utm_source||'',utm_medium:touch.utm_medium||'',utm_campaign:touch.utm_campaign||'',utm_content:touch.utm_content||'',utm_term:touch.utm_term||'',campaign_id:touch.campaign_id||'',adset_id:touch.adset_id||'',ad_id:touch.ad_id||'',fbclid:touch.fbclid||'',gclid:touch.gclid||'',_fbp:touch._fbp||'',_fbc:touch._fbc||'',firstTouch:JSON.stringify(saved.firstTouch||touch),lastTouch:JSON.stringify(touch)};fetch('/cart/update.js',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attributes:attributes}),keepalive:true}).catch(function(){})}
  send('PAGE_VIEW');
  syncCartAttribution();
  document.addEventListener('click',function(e){var el=e.target&&e.target.closest&&e.target.closest('button,a,input[type=submit]');if(!el)return;var text=((el.textContent||el.value||'')+' '+(el.id||'')+' '+(el.className||'')).toLowerCase();if(/comprar|buy.now|checkout|finalizar.compra|shopify-payment-button/.test(text)){send('INITIATE_CHECKOUT',{metadata:{label:(el.textContent||el.value||'').trim()}});syncCartAttribution()}},true);
})();`;
  return new NextResponse(source, { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}

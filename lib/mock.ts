export const kpis=[
 {label:'Faturamento',value:'R$ 128.460',delta:'+18,4% vs. período anterior'},
 {label:'Pedidos pagos',value:'94',delta:'+12 pedidos'},
 {label:'Lucro estimado',value:'R$ 48.912',delta:'38,1% de margem'},
 {label:'ROAS',value:'4,82x',delta:'+0,63x'},
 {label:'CPA',value:'R$ 83,40',delta:'-9,2%'},
 {label:'Ticket médio',value:'R$ 1.366,60',delta:'+3,1%'},
 {label:'Estoque disponível',value:'176 un.',delta:'43 dias de cobertura'},
 {label:'CAPI / Pixel',value:'98,7%',delta:'Eventos conciliados'}
];
export const channels=[
 {name:'Meta Ads',invested:'R$ 7.840',sales:46,revenue:'R$ 62.870',cpa:'R$ 170,43',roas:'8,02x',profit:'R$ 25.410'},
 {name:'Google / Direto',invested:'R$ 1.420',sales:13,revenue:'R$ 17.537',cpa:'R$ 109,23',roas:'12,35x',profit:'R$ 7.091'},
 {name:'Mercado Livre',invested:'—',sales:18,revenue:'R$ 24.282',cpa:'—',roas:'—',profit:'R$ 7.832'},
 {name:'Amazon',invested:'—',sales:11,revenue:'R$ 14.839',cpa:'—',roas:'—',profit:'R$ 4.918'},
 {name:'Orgânico / Outros',invested:'—',sales:6,revenue:'R$ 8.932',cpa:'—',roas:'—',profit:'R$ 3.661'}
];
export const inventory=[
 {product:'Iron Air',sku:'IRON-AIR-127V',physical:162,reserved:8,committed:9,safety:12,available:133,shopify:133,ml:133,amazon:24,shopee:133,status:'Saudável'},
 {product:'Iron Air',sku:'IRON-AIR-220V',physical:58,reserved:5,committed:3,safety:7,available:43,shopify:43,ml:43,amazon:4,shopee:43,status:'Atenção'}
];
export const alerts=['Amazon FBA: 220V com apenas 4 unidades recebidas.','Iron Air 220V atingiu estoque de atenção.','3 pedidos aguardam conciliação de frete/taxa.','1 evento Meta CAPI está em retry.'];
export const sales=[
 {id:'#1058',date:'07/10 15:42',customer:'Marcos A.',product:'Iron Air 127V',source:'Meta Ads',campaign:'IA | Conversão | Outubro',value:'R$ 1.349,10',status:'Pago',tracking:'CAPI + Pixel'},
 {id:'#1057',date:'07/10 14:18',customer:'Fernanda M.',product:'Iron Air 220V',source:'Instagram',campaign:'Link in bio',value:'R$ 1.499,00',status:'Pago',tracking:'Pixel'},
 {id:'ML-8821',date:'07/10 13:55',customer:'Mercado Livre',product:'Iron Air 127V',source:'Mercado Livre',campaign:'Marketplace',value:'R$ 1.499,00',status:'Pago',tracking:'Marketplace'},
 {id:'AMZ-4109',date:'07/10 12:31',customer:'Amazon',product:'Iron Air 127V',source:'Amazon',campaign:'FBA',value:'R$ 1.499,00',status:'Pago',tracking:'Marketplace'},
 {id:'#1054',date:'07/10 11:06',customer:'Paulo R.',product:'Iron Air 127V',source:'Meta Ads',campaign:'Criativo Comparativo',value:'R$ 1.349,10',status:'Pago',tracking:'CAPI + Pixel'}
];
export const campaigns=[
 {name:'IA | Conversão | Outubro',platform:'Meta',spend:'R$ 3.420',sales:23,revenue:'R$ 31.029',cpa:'R$ 148,70',roas:'9,07x',profit:'R$ 13.214'},
 {name:'Criativo Comparativo',platform:'Meta',spend:'R$ 2.180',sales:12,revenue:'R$ 16.189',cpa:'R$ 181,67',roas:'7,43x',profit:'R$ 6.315'},
 {name:'Remarketing 7D',platform:'Meta',spend:'R$ 1.240',sales:7,revenue:'R$ 9.444',cpa:'R$ 177,14',roas:'7,62x',profit:'R$ 3.801'},
 {name:'Pesquisa Marca',platform:'Google',spend:'R$ 920',sales:9,revenue:'R$ 12.142',cpa:'R$ 102,22',roas:'13,20x',profit:'R$ 5.110'}
];
export const movements=[
 {date:'07/10 15:42',sku:'IRON-AIR-127V',type:'Venda Shopify',qty:-1,ref:'#1058',balance:162},
 {date:'07/10 13:55',sku:'IRON-AIR-127V',type:'Venda Mercado Livre',qty:-1,ref:'ML-8821',balance:163},
 {date:'07/10 10:20',sku:'IRON-AIR-220V',type:'Reserva',qty:-1,ref:'#1053',balance:58},
 {date:'06/10 17:12',sku:'IRON-AIR-127V',type:'Envio FBA',qty:-24,ref:'FBA-OUT-02',balance:164},
 {date:'06/10 17:12',sku:'IRON-AIR-220V',type:'Envio FBA',qty:-4,ref:'FBA-OUT-02',balance:59}
];

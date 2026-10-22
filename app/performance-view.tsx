"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, RefreshCw, TrendingUp } from "lucide-react";
import SalesChart, { ChartStyleToggle, type SalesChartMode, type SalesPoint } from "./sales-chart";
import LocationGlobe, { type LocationData } from "./location-globe";

type Dashboard = {
  periodFrom: string; periodTo: string; revenue: number; orders: number; cogs: number;
  fees: number; media: number; expenses: number; salesProfit: number; grossProfit: number;
  profit: number; margin: number; roas: number | null; ticket: number;
  daily: { date: string; revenue: number; profit: number; orders: number }[];
  channels: { name: string; invested: number; sales: number; revenue: number; cpa: number | null; roas: number | null; salesProfit: number; profit: number }[];
};
type Campaign = { campaignId: string; campaignName: string; platform: string; spend: number; sales: number; revenue: number; roas: number | null };
type MetaMetric = { purchases: number; purchaseValue: number };
type MetaMetrics = { accounts: Record<string, MetaMetric>; campaigns: Record<string, MetaMetric> };
const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const pct = (value: number) => `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const ratio = (value: number | null) => value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(2)}x`;
const day = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const dateLabel = (value: string) => value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : "—";
const channelLabel = (value: string) => ({ MERCADO_LIVRE: "Mercado Livre", SHOPIFY: "Shopify", AMAZON: "Amazon", META: "Meta Ads" }[value] || value);
const periodOptions = ["Hoje", "Ontem", "7 dias", "30 dias", "Este mês", "Mês passado", "Este ano", "Tempo todo"];
const shiftMonth = (month: string, offset: number) => { const [year, value] = month.split("-").map(Number); const date = new Date(Date.UTC(year, value - 1 + offset, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; };
const monthTitle = (month: string) => { const [year, value] = month.split("-").map(Number); const name = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, value - 1, 1))); return `${name[0].toUpperCase()}${name.slice(1)} ${year}`; };
const monthDays = (month: string) => { const [year, value] = month.split("-").map(Number); const blanks = (new Date(Date.UTC(year, value - 1, 1)).getUTCDay() + 6) % 7; const count = new Date(Date.UTC(year, value, 0)).getUTCDate(); return [...Array(blanks).fill(""), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)]; };

function datesFor(period: string, from: string, to: string) {
  const today = day(new Date());
  const past = (days: number) => { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - days + 1); return day(date); };
  if (period === "Personalizado") return { from, to };
  if (period === "Hoje") return { from: today, to: today };
  if (period === "Ontem") { const yesterday = past(2); return { from: yesterday, to: yesterday }; }
  if (period === "7 dias") return { from: past(7), to: today };
  if (period === "Este mês") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (period === "Mês passado") { const [year, month] = today.split("-").map(Number); const previous = new Date(Date.UTC(year, month - 2, 1)); const y = previous.getUTCFullYear(); const m = String(previous.getUTCMonth() + 1).padStart(2, "0"); const last = new Date(Date.UTC(year, month - 1, 0)).getUTCDate(); return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, "0")}` }; }
  if (period === "Este ano") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  if (period === "Tempo todo") return { from: today, to: today };
  return { from: past(30), to: today };
}

function trendPoints(rows: Dashboard["daily"], from: string, to: string): SalesPoint[] {
  const byDay = new Map(rows.map(row => [row.date, row]));
  const start = new Date(`${from}T12:00:00Z`).getTime();
  const end = new Date(`${to}T12:00:00Z`).getTime();
  const days = Math.max(1, Math.floor((end - start) / 86400000) + 1);
  const step = Math.max(1, Math.ceil(days / 30));
  const points: SalesPoint[] = [];
  for (let index = 0; index < days; index += step) {
    let revenue = 0, orders = 0, date = from;
    for (let offset = 0; offset < step && index + offset < days; offset++) {
      date = new Date(start + (index + offset) * 86400000).toISOString().slice(0, 10);
      const row = byDay.get(date);
      revenue += Number(row?.revenue || 0);
      orders += Number(row?.orders || 0);
    }
    points.push({ date, revenue, orders });
  }
  return points;
}

export default function PerformanceView() {
  const [period, setPeriod] = useState("30 dias");
  const [chartMode, setChartMode] = useState<SalesChartMode>("line");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Dashboard | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [locations, setLocations] = useState<LocationData | null>(null);
  const [metaMetrics, setMetaMetrics] = useState<MetaMetrics | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState("");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => day(new Date()).slice(0, 7));
  const [draftRange, setDraftRange] = useState({ from: "", to: "" });
  const [selectingEnd, setSelectingEnd] = useState(false);
  const periodRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const dates = useMemo(() => datesFor(period, from, to), [period, from, to]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!periodRef.current?.contains(event.target as Node)) setPeriodOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setPeriodOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, []);
  useEffect(() => {
    if (period === "Personalizado" && (!dates.from || !dates.to || dates.from > dates.to)) return;
    const controller = new AbortController();
    setLoading(true); setError(""); setMetaMetrics(null); setMetaError(""); setMetaLoading(true); setCampaigns([]); setLocations(null);
    const params = new URLSearchParams({ from: dates.from, to: dates.to });
    if (period === "Tempo todo") params.set("all", "1");
    if (refresh) params.set("fresh", "1");
    fetch(`/api/dashboard?${params}`, { signal: controller.signal, cache: "no-store" }).then(async response => { if (!response.ok) throw Error("Não foi possível carregar os indicadores"); return response.json() as Promise<Dashboard>; })
      .then(dashboard => {
        if (controller.signal.aborted) return;
        setData(dashboard);
        const range = new URLSearchParams({ from: dashboard.periodFrom, to: dashboard.periodTo });
        if (period === "Tempo todo") range.set("all", "1");
        fetch(`/api/campaigns?${range}`, { signal: controller.signal, cache: "no-store" }).then(async response => response.ok ? response.json() : []).then(campaignRows => { if (!controller.signal.aborted) setCampaigns(Array.isArray(campaignRows) ? campaignRows : []); }).catch(() => {});
        fetch(`/api/performance/locations?${range}`, { signal: controller.signal, cache: "no-store" }).then(async response => response.ok ? response.json() as Promise<LocationData> : null).then(locationData => { if (!controller.signal.aborted) setLocations(locationData); }).catch(() => {});
        fetch(`/api/campaigns/metrics?${range}`, { signal: controller.signal, cache: "no-store" }).then(async response => { const body = await response.json(); if (!response.ok) throw Error(body.error || "Falha ao carregar compras da Meta"); return body as { metrics: MetaMetrics }; }).then(body => { if (!controller.signal.aborted) setMetaMetrics(body.metrics); }).catch(err => { if (!controller.signal.aborted) setMetaError(err.message || "Compras Meta indisponíveis"); }).finally(() => { if (!controller.signal.aborted) setMetaLoading(false); });
      })
      .catch(err => { if (err.name !== "AbortError") setError(err.message || "Falha ao carregar performance"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period, dates.from, dates.to, refresh]);

  const chartPoints = useMemo(() => data ? trendPoints(data.daily, data.periodFrom, data.periodTo) : [], [data]);
  const grossResult = data ? data.revenue - data.fees - data.cogs : 0;
  const rows = data ? [
    { label: "Receita de vendas pagas", amount: data.revenue, strong: true },
    { label: "(-) Taxas, tributos e frete", amount: -data.fees },
    { label: "Receita após taxas e frete", amount: data.revenue - data.fees, strong: true },
    { label: "(-) Custo dos produtos vendidos", amount: -data.cogs },
    { label: "Lucro bruto gerencial", amount: grossResult, strong: true },
    { label: "(-) Investimento em anúncios", amount: -data.media },
    { label: "(-) Despesas operacionais", amount: -data.expenses },
    { label: "Resultado líquido gerencial", amount: data.profit, strong: true, final: true },
  ] : [];
  const ranked = [...campaigns].sort((a, b) => Number(b.spend) - Number(a.spend)).slice(0, 6);
  const metaPurchases = metaMetrics ? Object.values(metaMetrics.accounts).reduce((sum, metric) => sum + metric.purchases, 0) : null;
  const metaPurchaseValue = metaMetrics ? Object.values(metaMetrics.accounts).reduce((sum, metric) => sum + metric.purchaseValue, 0) : null;
  const exportDre = async () => {
    if (!data || loading) return;
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const width = 210;
    pdf.setFillColor(12, 27, 34); pdf.rect(0, 0, width, 46, "F");
    pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(21); pdf.text("IRON AIR HUB", 18, 22);
    pdf.setFontSize(11); pdf.setFont("helvetica", "normal"); pdf.text("DRE gerencial  |  Demonstrativo de resultado", 18, 32);
    pdf.setTextColor(40, 58, 68); pdf.setFontSize(10);
    pdf.text(`Periodo: ${dateLabel(data.periodFrom)} a ${dateLabel(data.periodTo)}`, 18, 58);
    pdf.text(`Pedidos pagos: ${data.orders}   |   Margem liquida: ${pct(data.margin)}   |   ROAS geral: ${ratio(data.roas)}`, 18, 65);
    let y = 82;
    rows.forEach((row) => {
      if (row.final) { pdf.setFillColor(224, 247, 236); pdf.rect(16, y - 6, 178, 11, "F"); }
      else if (row.strong) { pdf.setFillColor(242, 246, 248); pdf.rect(16, y - 6, 178, 10, "F"); }
      pdf.setFont("helvetica", row.strong ? "bold" : "normal"); pdf.setFontSize(row.final ? 12 : 10);
      pdf.setTextColor(row.final ? 13 : 40, row.final ? 103 : 58, row.final ? 69 : 68);
      pdf.text(row.label, 19, y);
      pdf.text(brl(row.amount), 190, y, { align: "right" });
      y += row.strong ? 15 : 13;
    });
    y += 9; pdf.setDrawColor(218, 229, 233); pdf.line(18, y, 192, y); y += 10;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.setTextColor(40, 58, 68); pdf.text("Resultado por canal", 18, y); y += 9;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
    data.channels.forEach((channel) => { if (y > 260) { pdf.addPage(); y = 22; } pdf.text(channelLabel(channel.name), 20, y); pdf.text(brl(channel.revenue), 98, y, { align: "right" }); pdf.text(brl(channel.profit), 190, y, { align: "right" }); y += 9; });
    pdf.setFontSize(8); pdf.setTextColor(105, 120, 130);
    pdf.text("DRE gerencial baseada em pedidos pagos, custos, midia e despesas cadastradas no ERP.", 18, 280);
    pdf.text("Tributos registrados integram as taxas; impostos estimados nao sao abatidos. Nao e DRE contabil.", 18, 285);
    pdf.save(`dre-gerencial-${data.periodFrom}-${data.periodTo}.pdf`);
  };

  return <div className="performanceView">
    <section className="performanceHero card">
      <div><span className="performanceEyebrow"><TrendingUp size={15} /> Análise de resultados</span><h2>Performance do negócio</h2><p>Vendas, mídia e resultado em uma visão. Os números seguem o período escolhido.</p></div>
      <div className="performanceActions">
        <div className="dashboardFilter exportMenu performancePeriodFilter" ref={periodRef}><span>Período</span><button type="button" className="filterTrigger" onClick={() => { setDraftRange(period === "Personalizado" ? { from, to } : { from: "", to: "" }); setCalendarMonth(day(new Date()).slice(0, 7)); setSelectingEnd(false); setPeriodOpen(value => !value); }} aria-expanded={periodOpen}>{period}<ChevronDown size={14} /></button>
          {periodOpen && <div className="exportOptions dashboardOptions periodOptions">{periodOptions.map(option => <button type="button" key={option} onClick={() => { setPeriod(option); setPeriodOpen(false); }}>{option}</button>)}<div className="filterCustomDates"><div className="calendarHeader"><button type="button" aria-label="Mês anterior" onClick={() => setCalendarMonth(shiftMonth(calendarMonth, -1))}>←</button><b>{monthTitle(calendarMonth)}</b><button type="button" aria-label="Próximo mês" onClick={() => setCalendarMonth(shiftMonth(calendarMonth, 1))}>→</button></div><div className="calendarGrid">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(name => <span key={name}>{name}</span>)}{monthDays(calendarMonth).map((value, index) => value ? <button type="button" key={value} className={`${value === draftRange.from || value === draftRange.to ? "selected" : ""} ${draftRange.from && draftRange.to && value > draftRange.from && value < draftRange.to ? "inRange" : ""}`} onClick={() => { if (!selectingEnd || (draftRange.from && value < draftRange.from)) { setDraftRange({ from: value, to: "" }); setSelectingEnd(true); } else { setDraftRange(range => ({ ...range, to: value })); setSelectingEnd(false); } }}>{Number(value.slice(-2))}</button> : <span key={`blank-${index}`} />)}</div><small>{draftRange.from ? `${dateLabel(draftRange.from)} → ${draftRange.to ? dateLabel(draftRange.to) : "selecione o fim"}` : "Selecione o início e o fim"}</small><button type="button" className="primary" disabled={!draftRange.from || !draftRange.to} onClick={() => { setFrom(draftRange.from); setTo(draftRange.to); setPeriod("Personalizado"); setPeriodOpen(false); }}>Aplicar</button></div></div>}
        </div>
        <button type="button" className="performanceRefresh" onClick={() => setRefresh(value => value + 1)} aria-label="Atualizar análise"><RefreshCw size={16} /></button>
        <button type="button" className="performanceExport" onClick={exportDre} disabled={!data || loading}><Download size={17} /> Exportar DRE em PDF</button>
      </div>
    </section>
    {error && <div className="performanceError" role="alert">{error} <button onClick={() => setRefresh(value => value + 1)}>Tentar novamente</button></div>}
    {loading && !data && <div className="performanceLoading">Carregando análise...</div>}
    {data && <>
      <div className="performancePeriodLabel">{dateLabel(data.periodFrom)} a {dateLabel(data.periodTo)} · {data.orders} pedidos pagos {loading ? "· Atualizando..." : ""}</div>
      <div className="performanceKpis">
        <article className="card"><span>Faturamento</span><strong>{brl(data.revenue)}</strong><small>{data.orders} pedidos pagos</small></article>
        <article className="card"><span>Lucro bruto</span><strong className={grossResult < 0 ? "negative" : undefined}>{brl(grossResult)}</strong><small>Após taxas e custo dos produtos</small></article>
        <article className="card"><span>Resultado líquido</span><strong className={data.profit < 0 ? "negative" : "positive"}>{brl(data.profit)}</strong><small>Lucro bruto − despesas</small></article>
        <article className="card"><span>Margem líquida</span><strong className={data.margin < 0 ? "negative" : "positive"}>{pct(data.margin)}</strong><small>Resultado líquido ÷ faturamento</small></article>
      </div>
      <div className="performanceMainGrid">
        <article className="card performancePanel"><div className="sectionHead"><div><h2>Receita ao longo do tempo</h2><p>Valor de pedidos pagos por dia</p></div><ChartStyleToggle mode={chartMode} onChange={setChartMode} /></div><SalesChart points={chartPoints} from={data.periodFrom} to={data.periodTo} mode={chartMode} /></article>
        <article className="card performancePanel performanceInsight"><div className="sectionHead"><div><h2>Indicadores do período</h2><p>Quanto cada custo representa do faturamento</p></div></div><div className="performanceInsightRow"><span>Ticket médio por pedido</span><b>{brl(data.ticket)}</b></div><div className="performanceInsightRow"><span>Gasto com anúncios sobre faturamento</span><b>{data.revenue ? pct(data.media / data.revenue) : "—"}</b></div><div className="performanceInsightRow"><span>Taxas e frete sobre faturamento</span><b>{data.revenue ? pct(data.fees / data.revenue) : "—"}</b></div><div className="performanceInsightRow"><span>Margem líquida</span><b className={data.profit < 0 ? "negative" : "positive"}>{pct(data.margin)}</b></div><p className="performanceFootnote">Ex.: 2,6% em anúncios = R$ 2,60 gastos a cada R$ 100 faturados.</p></article>
      </div>
      {locations && <LocationGlobe data={locations} />}
      <div className="performanceMainGrid">
        <article className="card performancePanel"><div className="sectionHead"><div><h2>DRE gerencial</h2><p>Receita até o resultado líquido</p></div></div><div className="performanceDre">{rows.map(row => <div key={row.label} className={`${row.strong ? "strong" : ""} ${row.final ? "final" : ""}`}><span>{row.label}</span><b className={row.amount < 0 ? "negative" : undefined}>{brl(row.amount)}</b></div>)}</div><p className="performanceFootnote">Tributos registrados integram as taxas. Impostos estimados não são abatidos neste resultado. Base gerencial; não substitui a DRE contábil.</p></article>
        <article className="card performancePanel"><div className="sectionHead"><div><h2>Resultado por canal</h2><p>Receita e resultado antes das despesas gerais</p></div></div><div className="performanceChannelList">{data.channels.length ? data.channels.map(channel => /meta/i.test(channel.name) ? <div className="performanceChannel" key={channel.name}><div><b>{channelLabel(channel.name)}</b><small>{metaLoading ? "Carregando compras Meta..." : metaError ? "Compras Meta indisponíveis" : `${metaPurchases ?? 0} compras Meta · ${ratio(metaPurchaseValue !== null && channel.invested ? metaPurchaseValue / channel.invested : null)} ROAS Meta`}</small></div><div><b>{metaPurchaseValue === null ? "—" : brl(metaPurchaseValue)}</b><small>Valor atribuído pela Meta</small></div></div> : <div className="performanceChannel" key={channel.name}><div><b>{channelLabel(channel.name)}</b><small>{channel.sales} vendas · {ratio(channel.roas)} ROAS</small></div><div><b>{brl(channel.revenue)}</b><small className={channel.profit < 0 ? "negative" : undefined}>Resultado {brl(channel.profit)}</small></div></div>) : <div className="performanceEmpty">Sem dados por canal neste período.</div>}</div><p className="performanceFootnote">Compras Meta são atribuições da plataforma e não são somadas novamente ao faturamento ou à DRE.</p></article>
      </div>
      <article className="card performancePanel performanceCampaignPanel"><div className="sectionHead"><div><h2>Campanhas com mais investimento</h2><p>Compras da Meta atribuídas pela plataforma; outros canais usam atribuição do ERP</p></div></div><div className="performanceTableWrap"><table><thead><tr><th>Campanha</th><th>Plataforma</th><th>Investimento</th><th>Vendas atribuídas</th><th>Receita atribuída</th><th>ROAS</th></tr></thead><tbody>{ranked.map(campaign => { const isMeta = /meta/i.test(campaign.platform); const metric = isMeta ? metaMetrics?.campaigns[campaign.campaignId] : null; const sales = isMeta ? metric?.purchases : campaign.sales; const revenue = isMeta ? metric?.purchaseValue : campaign.revenue; return <tr key={`${campaign.platform}:${campaign.campaignId}`}><td><b>{campaign.campaignName}</b></td><td>{campaign.platform}</td><td>{brl(Number(campaign.spend))}</td><td>{sales ?? "—"}</td><td>{revenue == null ? "—" : brl(Number(revenue))}</td><td>{ratio(revenue == null || !Number(campaign.spend) ? null : Number(revenue) / Number(campaign.spend))}</td></tr>; })}</tbody></table>{!ranked.length && <div className="performanceEmpty">Nenhuma campanha encontrada no período.</div>}</div></article>
    </>}
  </div>;
}

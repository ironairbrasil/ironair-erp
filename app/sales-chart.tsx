"use client";

import { useState } from "react";
import { BarChart3, ChartNoAxesCombined } from "lucide-react";

export type SalesPoint = { date: string; revenue: number; orders: number };
export type SalesChartMode = "line" | "bar";

export function ChartStyleToggle({ mode, onChange }: { mode: SalesChartMode; onChange: (mode: SalesChartMode) => void }) {
  return <div className="chartStyleToggle" role="group" aria-label="Estilo do gráfico"><button type="button" className={`chartStyleBar ${mode === "bar" ? "active" : ""}`} aria-label="Gráfico de barras" aria-pressed={mode === "bar"} title="Gráfico de barras" onClick={() => onChange("bar")}><BarChart3 size={18} /></button><button type="button" className={`chartStyleLine ${mode === "line" ? "active" : ""}`} aria-label="Gráfico de linha" aria-pressed={mode === "line"} title="Gráfico de linha" onClick={() => onChange("line")}><ChartNoAxesCombined size={18} /></button></div>;
}

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const fullDate = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
const shortDate = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}`;

export default function SalesChart({ points, mode, hidden = false, from, to }: { points: SalesPoint[]; mode: SalesChartMode; hidden?: boolean; from: string; to: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const values = points.length ? points : [{ date: to, revenue: 0, orders: 0 }];
  const totalOrders = values.reduce((sum, point) => sum + Number(point.orders || 0), 0);
  const totalRevenue = values.reduce((sum, point) => sum + Number(point.revenue || 0), 0);
  const max = Math.max(1, ...values.map(point => Number(point.revenue || 0))) * 1.3;
  const width = 1000, height = 210, padding = 18;
  const coordinates = values.map((point, index) => ({
    x: values.length === 1 ? width / 2 : padding + index / (values.length - 1) * (width - padding * 2),
    y: height - padding - Number(point.revenue || 0) / max * (height - padding * 2),
  }));
  const line = values.length === 1
    ? `M ${padding} ${coordinates[0].y} L ${width - padding} ${coordinates[0].y}`
    : coordinates.slice(1).reduce((path, current, index) => {
        const previous = coordinates[index];
        const before = coordinates[Math.max(0, index - 1)];
        const after = coordinates[Math.min(coordinates.length - 1, index + 2)];
        const dx = (current.x - previous.x) / 3;
        return `${path} C ${previous.x + dx} ${previous.y + (current.y - before.y) / 6}, ${current.x - dx} ${current.y - (after.y - previous.y) / 6}, ${current.x} ${current.y}`;
      }, `M ${coordinates[0].x} ${coordinates[0].y}`);
  const area = `${line} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`;
  const axis = values.length <= 14 ? values : [{ date: from }, values[Math.floor(values.length / 2)], { date: to }];
  return <div className={`lineChart salesChart salesChart-${mode}`}>
    <div className="chartTopMetric"><span>{hidden ? "—" : totalOrders} vendas</span><b>{hidden ? "—" : money(totalRevenue)}</b></div>
    {!hidden && hovered !== null && values[hovered] && <div className="chartTooltip" style={{ left: `${Math.max(10, Math.min(90, coordinates[hovered].x / width * 100))}%` }}><b>{fullDate(values[hovered].date)}</b><span>{values[hovered].orders} {values[hovered].orders === 1 ? "venda" : "vendas"} · {money(values[hovered].revenue)}</span></div>}
    {mode === "line" ? <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Vendas no período em gráfico de linha">
      <defs><linearGradient id="salesArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--accent2)" stopOpacity=".12" /><stop offset="100%" stopColor="var(--accent2)" stopOpacity="0" /></linearGradient></defs>
      <path className="lineArea" d={area} /><path className="linePath" d={line} />
      {values.map((point, index) => <g key={`${point.date}-${index}`} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} tabIndex={hidden ? -1 : 0} aria-label={hidden ? "Dados ocultos" : `${fullDate(point.date)}: ${point.orders} ${point.orders === 1 ? "venda" : "vendas"}, ${money(point.revenue)}`}><circle className="linePointHit" cx={coordinates[index].x} cy={coordinates[index].y} r={14} /><circle className="linePoint" cx={coordinates[index].x} cy={coordinates[index].y} r={hovered === index ? 3.5 : 2.5} /></g>)}
    </svg> : <div className="salesChartBars" role="group" aria-label="Vendas no período em gráfico de barras">{values.map((point, index) => <div key={`${point.date}-${index}`} className="salesChartBar" onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} tabIndex={hidden ? -1 : 0} aria-label={hidden ? "Dados ocultos" : `${fullDate(point.date)}: ${point.orders} ${point.orders === 1 ? "venda" : "vendas"}, ${money(point.revenue)}`}><span style={{ height: hidden ? "0%" : `${point.revenue ? Math.max(2, Number(point.revenue) / max * 100) : 0}%` }} /></div>)}</div>}
    <div className={`lineAxis ${axis.length <= 14 ? "lineAxisAll" : ""}`}>{axis.map((point, index) => <span key={`${point.date}-${index}`}>{shortDate(point.date)}</span>)}</div>
  </div>;
}

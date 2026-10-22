import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenantId } from "@/lib/tenant";

const localDay = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
const stateAliases: Record<string, string> = {
  ACRE: "AC", ALAGOAS: "AL", AMAPA: "AP", AMAZONAS: "AM", BAHIA: "BA", CEARA: "CE", "DISTRITO FEDERAL": "DF", "ESPIRITO SANTO": "ES", GOIAS: "GO", MARANHAO: "MA", "MATO GROSSO": "MT", "MATO GROSSO DO SUL": "MS", "MINAS GERAIS": "MG", PARA: "PA", PARAIBA: "PB", PARANA: "PR", PERNAMBUCO: "PE", PIAUI: "PI", "RIO DE JANEIRO": "RJ", "RIO GRANDE DO NORTE": "RN", "RIO GRANDE DO SUL": "RS", RONDONIA: "RO", RORAIMA: "RR", "SANTA CATARINA": "SC", "SAO PAULO": "SP", SERGIPE: "SE", TOCANTINS: "TO",
};
const normalize = (value: string | null | undefined) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
const stateCode = (value: string | null | undefined) => { const normalized = normalize(value).replace(/^BR[- ]/, ""); return normalized.length === 2 ? normalized : stateAliases[normalized] || ""; };
const brazilStates = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
let municipalityCache: { expires: number; rows: { state: string; city: string }[] } | null = null;
async function brazilMunicipalities() {
  if (municipalityCache && municipalityCache.expires > Date.now()) return municipalityCache.rows;
  const response = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome", { next: { revalidate: 86400 } });
  if (!response.ok) throw new Error("Não foi possível consultar os municípios do IBGE");
  const body = await response.json() as any[];
  const rows = body.map(item => ({
    city: String(item.nome || ""),
    state: String(item?.["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla || item?.microrregiao?.mesorregiao?.UF?.sigla || ""),
  })).filter(item => item.city && item.state);
  municipalityCache = { expires: Date.now() + 86400_000, rows };
  return rows;
}

export async function GET(req: Request) {
  const tenantId = await getTenantId(req);
  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "1";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const paidAt = all ? { not: null as null } : {
    gte: new Date(`${from || localDay(new Date())}T00:00:00.000-03:00`),
    lte: new Date(`${to || localDay(new Date())}T23:59:59.999-03:00`),
  };
  const [orders, knownCustomers] = await Promise.all([
    db.order.findMany({ where: { tenantId, status: "PAID", paidAt }, include: { customer: { select: { city: true, state: true } }, items: { select: { quantity: true, unitCost: true } } } }),
    db.customer.findMany({ where: { tenantId, state: { not: null } }, select: { city: true, state: true } }),
  ]);
  const places = new Map<string, { state: string; city: string; orders: number; revenue: number; result: number }>();
  let locatedOrders = 0;
  for (const order of orders) {
    const state = stateCode(order.customer?.state);
    if (!state) continue;
    locatedOrders++;
    const city = String(order.customer?.city || "Cidade não informada").trim();
    const key = `${state}:${normalize(city)}`;
    const current = places.get(key) || { state, city, orders: 0, revenue: 0, result: 0 };
    const revenue = Number(order.grossAmount) - Number(order.discountAmount);
    const fees = Number(order.feeAmount) + Number(order.shippingAmount) + Number(order.taxAmount);
    const cogs = order.items.reduce((sum, item) => sum + Number(item.unitCost || 0) * Number(item.quantity || 0), 0);
    current.orders++;
    current.revenue += revenue;
    current.result += revenue - fees - cogs;
    places.set(key, current);
  }
  const states = new Map<string, { state: string; orders: number; revenue: number; result: number; cities: number }>();
  for (const place of places.values()) {
    const current = states.get(place.state) || { state: place.state, orders: 0, revenue: 0, result: 0, cities: 0 };
    current.orders += place.orders; current.revenue += place.revenue; current.result += place.result; current.cities++;
    states.set(place.state, current);
  }
  const soldCityKeys = new Set([...places.values()].map(place => `${place.state}:${normalize(place.city)}`));
  let officialCities: { state: string; city: string }[] = [];
  try { officialCities = await brazilMunicipalities(); } catch { officialCities = knownCustomers.map(customer => ({ state: stateCode(customer.state), city: String(customer.city || "").trim() })).filter(item => item.state && item.city); }
  const missingCities = new Map<string, { state: string; city: string }>();
  for (const municipality of officialCities) {
    const state = municipality.state;
    const city = municipality.city;
    const key = `${state}:${normalize(city)}`;
    if (state && city && !soldCityKeys.has(key)) missingCities.set(key, { state, city });
  }
  return NextResponse.json({
    locatedOrders,
    totalOrders: orders.length,
    states: [...states.values()].sort((a, b) => b.revenue - a.revenue),
    cities: [...places.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 100),
    missingStates: brazilStates.filter(state => !states.has(state)),
    missingCities: [...missingCities.values()].sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city, "pt-BR")),
  });
}

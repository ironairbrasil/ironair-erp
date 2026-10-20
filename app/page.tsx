"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, Bell, Boxes, CircleDollarSign, LayoutDashboard, LogOut, Megaphone, PackageCheck, PlugZap, Settings, ShoppingCart, Tag, Users, WalletCards, Search, Download, Plus, RefreshCw, X, Menu, Save, Link2, Copy, CheckCircle2, PackagePlus, Pencil, Eye, EyeOff, Trash2, Upload, Filter, MoreHorizontal, Sun, Moon, ChevronDown, ChevronUp, CalendarDays, GripVertical, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import PerformanceView from "./performance-view";
import SalesChart, { ChartStyleToggle, type SalesChartMode } from "./sales-chart";
import { campaigns as seedCampaigns, channels, inventory as seedInventory, movements as seedMovements, sales as seedSales } from "@/lib/mock";
const menu = [
  ["Visão Geral", LayoutDashboard],
  ["Performance", BarChart3],
  ["Vendas", ShoppingCart],
  ["Devoluções", RefreshCw],
  ["Clientes", Users],
  ["Produtos", PackageCheck],
  ["Estoque", Boxes],
  ["Despesas", WalletCards],
  ["Campanhas", Megaphone],
  ["Criativos", Tag],
  ["Financeiro", CircleDollarSign],
  ["Integrações", PlugZap],
  ["Configurações", Settings],
] as const;
const money = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const isNegativeDisplay = (value: string | number) => typeof value === "number" ? value < 0 : /^\s*[-−]/.test(value);
const periodOptions = ["Hoje", "Ontem", "7 dias", "30 dias", "Este mês", "Mês passado", "Este ano", "Tempo todo"];
const integrationCategory = (name: string) => /ads|meta|pixel|tiktok/i.test(name) ? "ADS" : /shopify|mercado livre|amazon|shopee|kiwify/i.test(name) ? "Plataforma de vendas" : /banco|bank|nubank|inter|itaú|bradesco|santander|mercado pago|asaas/i.test(name) ? "Banco" : "Outros";
const salesAndStockOptions = (connected: Set<string>) => ["Manual", ...(connected.has("Shopify") ? ["Shopify"] : []), ...(connected.has("Mercado Livre") ? ["Mercado Livre", "Mercado Livre Full"] : []), ...(connected.has("Amazon") ? ["Amazon", "Amazon FBA"] : []), ...(connected.has("Shopee") ? ["Shopee"] : [])];
const maskDashboardNumbers = (value: string) => value.replace(/(?:R\$\s*)?\d+(?:[.,]\d+)*(?:%|x)?/g, "—");
const defaultDashboardLayout = [...Array.from({ length: 16 }, (_, index) => `kpi-${index}`), "timeline", "alerts", "channels", "inventory"];
const dashboardLayoutStorageKey = "ironair-dashboard-layout-v1";
const dashboardExpandedStorageKey = "ironair-dashboard-expanded-v1";
const dashboardLayoutDirtyKey = "ironair-dashboard-layout-pending-v1";
const apiJson = async (url: string, init?: RequestInit) => {
  const r = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || "Falha na operação");
  return j;
};
type ModalKind = "movement" | "movementEdit" | "sale" | "customer" | "product" | "campaign" | "creative" | "expense" | "integration" | "integrationDetail" | "settings" | "saleDetail" | null;
type Integration = {
  name: string;
  status: "Conectado" | "Preparado" | "Atenção";
  cat: string;
  desc: string;
  logo: string;
  accent: string;
  webhook: string;
  fields: string[];
  accountId?: string;
  lastSyncAt?: string;
  lastError?: string;
};
const integrationsSeed: Integration[] = [
  {
    name: "Meta Ads",
    status: "Conectado",
    cat: "ADS",
    desc: "Pixel, CAPI, campanhas, conjuntos e anúncios",
    logo: "∞",
    accent: "#1877F2",
    webhook: "/api/webhooks/meta",
    fields: ["META_PIXEL_ID", "META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
  },
  {
    name: "Google Ads",
    status: "Preparado",
    cat: "ADS",
    desc: "Campanhas, custo, cliques e ROAS",
    logo: "G",
    accent: "#4285F4",
    webhook: "/api/webhooks/google-ads",
    fields: ["GOOGLE_ADS_CUSTOMER_ID", "GOOGLE_ADS_DEVELOPER_TOKEN"],
  },
  {
    name: "TikTok Ads",
    status: "Preparado",
    cat: "ADS",
    desc: "Campanhas, criativos e atribuição",
    logo: "♪",
    accent: "#25F4EE",
    webhook: "/api/webhooks/tiktok",
    fields: ["TIKTOK_ADVERTISER_ID", "TIKTOK_ACCESS_TOKEN"],
  },
  {
    name: "Shopify",
    status: "Conectado",
    cat: "Plataforma de vendas",
    desc: "Pedidos, produtos, clientes e estoque",
    logo: "S",
    accent: "#95BF47",
    webhook: "/api/webhooks/shopify",
    fields: ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_ACCESS_TOKEN", "SHOPIFY_WEBHOOK_SECRET"],
  },
  {
    name: "Mercado Livre",
    status: "Preparado",
    cat: "Plataforma de vendas",
    desc: "Pedidos, anúncios, taxas e Full",
    logo: "ML",
    accent: "#FFE600",
    webhook: "/api/webhooks/mercadolivre",
    fields: ["MERCADO_LIVRE_CLIENT_ID", "MERCADO_LIVRE_CLIENT_SECRET"],
  },
  {
    name: "Amazon",
    status: "Preparado",
    cat: "Plataforma de vendas",
    desc: "Seller Central, pedidos e FBA",
    logo: "a",
    accent: "#FF9900",
    webhook: "/api/webhooks/amazon",
    fields: ["AMAZON_SPAPI_APP_ID", "AMAZON_SPAPI_CLIENT_ID", "AMAZON_SPAPI_CLIENT_SECRET", "AMAZON_SPAPI_REFRESH_TOKEN", "AMAZON_SPAPI_MARKETPLACE_ID"],
  },
  {
    name: "Asaas", status: "Preparado", cat: "Banco", desc: "Saques e transferências da Shopify", logo: "A", accent: "#006DFF", webhook: "/api/webhooks/asaas", fields: [],
  },
  {
    name: "Kiwify",
    status: "Preparado",
    cat: "Plataforma de vendas",
    desc: "Vendas e produtos digitais",
    logo: "K",
    accent: "#6D5DFB",
    webhook: "/api/webhooks/kiwify",
    fields: ["KIWIFY_WEBHOOK_TOKEN"],
  },
];
export default function Home() {
  const [sessionInfo, setSessionInfo] = useState<{ email: string; displayName?: string | null; companyName?: string | null; tenants: { id: string; name: string }[]; activeTenantId: string | null } | null>(null);
  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store' }).then(async response => {
      if (!response.ok) { location.href = '/login'; return; }
      const session = await response.json();
      if (!session.tenants?.length) location.href = '/onboarding';
      else setSessionInfo(session);
    }).catch(() => { location.href = '/login'; });
  }, []);
  const [view, setView] = useState("Visão Geral");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [period, setPeriod] = useState("Hoje");
  const [platform, setPlatform] = useState("");
  const [product, setProduct] = useState("");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<ModalKind>(null);
  const [selected, setSelected] = useState<any>(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    if (localStorage.getItem("ironair-theme") === "light") setTheme("light");
  }, []);
  const [dashboardEditing, setDashboardEditing] = useState(false);
  const [dashboardHidden, setDashboardHidden] = useState(false);
  const [dashboardExpanded, setDashboardExpanded] = useState(false);
  const [dashboardChartMode, setDashboardChartMode] = useState<SalesChartMode>("line");
  const [dashboardLayout, setDashboardLayout] = useState<string[]>(defaultDashboardLayout);
  const [dashboardLayoutReady, setDashboardLayoutReady] = useState(false);
  const [dashboardLayoutLoaded, setDashboardLayoutLoaded] = useState(false);
  const dashboardLayoutSkipSave = useRef(false);
  const dashboardLayoutSaveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const dashboardLayoutSaveRevision = useRef(0);
  const [dashboardDropTarget, setDashboardDropTarget] = useState<string | null>(null);
  const dashboardDragSource = useRef<string | null>(null);
  const [range, setRange] = useState(() => ({
    from: startOfYearISO(),
    to: todayISO(),
  }));
  const dashboardSelection = useRef({ period, range, platform, product });
  dashboardSelection.current = { period, range, platform, product };
  const [draftRange, setDraftRange] = useState(() => ({
    from: startOfYearISO(),
    to: todayISO(),
  }));
  const [filterModal, setFilterModal] = useState<"period" | "platform" | "product" | null>(null);
  useEffect(() => {
    if (!filterModal) return;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target as Element).closest(".dashboardFilter.exportMenu")) setFilterModal(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setFilterModal(null); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [filterModal]);
  const [calendarMonth, setCalendarMonth] = useState(() => todayISO().slice(0, 7));
  const [selectingRangeEnd, setSelectingRangeEnd] = useState(false);
  const dashboardCache = useRef(new Map<string, any>());
  const dashboardPending = useRef(new Map<string, Promise<any>>());
  const dashboardRequest = useRef(0);
  const syncingRef = useRef(false);
  const lastRangeKey = useRef<string | null>(null);
  const lastLoadedView = useRef<string | null>(null);
  const dataPending = useRef(new Map<string, Promise<any>>());
  const [orderRows, setOrderRows] = useState<any[]>([]);
  const [inventoryRows, setInventoryRows] = useState<any[]>([]);
  const [inventoryMovementRows, setInventoryMovementRows] = useState<any[]>([]);
  const [integrationsRefreshKey, setIntegrationsRefreshKey] = useState(0);
  const [integrationRows, setIntegrationRows] = useState<any[]>([]);
  const connectedProviders = new Set(integrationRows.filter((row) => row.status === "CONNECTED").map((row) => row.provider));
  useEffect(() => {
    if (view !== "Integrações" || modal) return;
    apiJson("/api/integrations").then((rows) => setIntegrationRows(Array.isArray(rows) ? rows : [])).catch(() => null);
  }, [view, modal, integrationsRefreshKey]);
  const [sales, setSales] = useState<any[]>([]);
  const [returnRows, setReturnRows] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationTab, setNotificationTab] = useState<"Vendas" | "Alertas">("Vendas");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sessionInfo || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    setPushSupported(true);
    navigator.serviceWorker.register('/sw.js').then(async registration => {
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;
      const response = await fetch(`/api/push/subscription?endpoint=${encodeURIComponent(subscription.endpoint)}`, { cache: 'no-store' });
      if (response.ok) setPushEnabled(Boolean((await response.json()).enabled));
    }).catch(() => undefined);
  }, [sessionInfo]);
  const [catalogRows, setCatalogRows] = useState<any[]>([]);
  const [expenseRows, setExpenseRows] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [adsets, setAdsets] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [channelRows, setChannelRows] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  useEffect(() => {
    let active = true;
    const normalize = (value: unknown) => {
      const known = Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && defaultDashboardLayout.includes(id)) : [];
      const next = [...new Set(known)];
      next.push(...defaultDashboardLayout.filter((id) => !next.includes(id)));
      return next;
    };
    const load = async () => {
      let localLayout: string[] = defaultDashboardLayout;
      let localExpanded = false;
      let pending = false;
      try {
        localLayout = normalize(JSON.parse(localStorage.getItem(dashboardLayoutStorageKey) || "[]"));
        localExpanded = localStorage.getItem(dashboardExpandedStorageKey) === "true";
        pending = localStorage.getItem(dashboardLayoutDirtyKey) === "true";
      } catch { /* Browser storage may be unavailable. */ }
      if (!active) return;
      setDashboardLayout(localLayout);
      setDashboardExpanded(localExpanded);
      setDashboardLayoutReady(true);
      let layout = localLayout;
      let expanded = localExpanded;
      let needsSave = pending;
      try {
        const saved = await apiJson("/api/dashboard/layout");
        if (!pending && Array.isArray(saved.layout)) {
          const remoteLayout = normalize(saved.layout);
          const localWasCustomized = localLayout.some((id, index) => id !== defaultDashboardLayout[index]);
          const remoteIsDefault = remoteLayout.every((id, index) => id === defaultDashboardLayout[index]);
          if (!(localWasCustomized && remoteIsDefault)) {
            layout = remoteLayout;
            expanded = Boolean(saved.expanded);
          } else {
            needsSave = true;
          }
        }
      } catch { /* Keep the browser layout while the API is unavailable. */ }
      if (!active) return;
      dashboardLayoutSkipSave.current = !needsSave;
      setDashboardLayout(layout);
      setDashboardExpanded(expanded);
      setDashboardLayoutLoaded(true);
    };
    void load();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!dashboardLayoutLoaded) return;
    if (dashboardLayoutSkipSave.current) { dashboardLayoutSkipSave.current = false; return; }
    try {
      localStorage.setItem(dashboardLayoutStorageKey, JSON.stringify(dashboardLayout));
      localStorage.setItem(dashboardExpandedStorageKey, String(dashboardExpanded));
      localStorage.setItem(dashboardLayoutDirtyKey, "true");
    } catch { /* The layout remains usable when browser storage is unavailable. */ }
    const revision = ++dashboardLayoutSaveRevision.current;
    dashboardLayoutSaveQueue.current = dashboardLayoutSaveQueue.current.catch(() => undefined).then(() => apiJson("/api/dashboard/layout", {
      method: "PUT",
      body: JSON.stringify({ layout: dashboardLayout, expanded: dashboardExpanded }),
    })).then(() => {
      if (revision === dashboardLayoutSaveRevision.current) {
        try { localStorage.setItem(dashboardLayoutDirtyKey, "false"); } catch { /* Browser storage may be unavailable. */ }
      }
    }).catch(() => undefined);
  }, [dashboardLayout, dashboardExpanded, dashboardLayoutLoaded]);
  const moveDashboardBlock = (source: string, target: string) => {
    if (source === target) return;
    setDashboardLayout((current) => {
      const next = [...current];
      const from = next.indexOf(source);
      const to = next.indexOf(target);
      if (from < 0 || to < 0) return current;
      next.splice(from, 1);
      next.splice(to, 0, source);
      try {
        localStorage.setItem(dashboardLayoutStorageKey, JSON.stringify(next));
        localStorage.setItem(dashboardLayoutDirtyKey, "true");
      } catch { /* The in-memory layout still works. */ }
      return next;
    });
  };
  const dashboardRowStep = () => typeof window === "undefined" ? 4 : window.innerWidth <= 650 ? 1 : window.innerWidth <= 1050 ? 2 : 4;
  const filtered = useMemo(() => sales.filter((s) => Object.values(s).join(" ").toLowerCase().includes(q.toLowerCase())), [q, sales]);
  const dashboardPlatforms = useMemo(() => [...new Set(orderRows.map((o) => String(o.channel || "")))].filter(Boolean).sort(), [orderRows]);
  const dashboardProducts = useMemo(() => catalogRows.map((p) => [p.sku, p.name || p.product || p.sku] as [string, string]).sort((a, b) => a[1].localeCompare(b[1])), [catalogRows]);
  const scopedOrders = (orders: any[]) => {
    const { platform: selectedPlatform, product: selectedProduct } = dashboardSelection.current;
    return orders.filter((o) => (!selectedPlatform || o.channel === selectedPlatform) && (!selectedProduct || (o.items || []).some((i: any) => i.sku === selectedProduct)));
  };
  const firstSaleDate = firstPaidSaleDay(scopedOrders(orderRows));
  const allTimeStart = period === "Tempo todo" && dashboard?.periodMode === "all" ? dashboard.periodFrom : firstSaleDate;
  const inventorySalesRange = period === "Tempo todo" ? null : periodRange(period, range, firstSaleDate);
  const periodInventoryProducts = formatInventory(inventoryRows, inventoryMovementRows, scopedOrders(orderRows), inventorySalesRange);
  const stockAlerts = products.filter((item) => Number(item.available || 0) <= Number(item.safety || 0)).map((item) => `${item.product} ${item.name || item.sku}: ${item.available} ${Number(item.available) === 1 ? "unidade disponível" : "unidades disponíveis"}.`);
  const recentSales = orderRows
    .filter((order) => order.status === "PAID")
    .sort((a, b) => new Date(b.paidAt || b.createdAt).getTime() - new Date(a.paidAt || a.createdAt).getTime());
  const title = view === "Visão Geral" ? "Dashboard Geral" : view;
  const dashboardCards = dashboardKpis(dashboard);
  const dashboardKpiIds = dashboardLayout.filter((id) => id.startsWith("kpi-"));
  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), m.length > 90 ? 8000 : 3000);
  };
  const togglePush = async () => {
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (pushEnabled) {
        if (existing) {
          await apiJson('/api/push/subscription', { method: 'DELETE', body: JSON.stringify({ endpoint: existing.endpoint }) });
          await existing.unsubscribe();
        }
        setPushEnabled(false);
        notify('Notificações do iPhone desativadas.');
      } else {
        if (Notification.permission === 'denied') throw new Error('Permissão bloqueada. Ative as notificações nos Ajustes do iPhone.');
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Permissão de notificações não concedida.');
        const config = await apiJson('/api/push/subscription');
        if (!config.publicKey) throw new Error('Notificações ainda não configuradas no servidor.');
        const key = Uint8Array.from(atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
        const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        await apiJson('/api/push/subscription', { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
        setPushEnabled(true);
        notify('Notificações ativadas neste aparelho.');
      }
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível configurar as notificações.'); }
    finally { setPushBusy(false); }
  };
  const api = apiJson;
  const dashboardKey = (p = dashboardSelection.current.period, r = dashboardSelection.current.range, selectedPlatform = dashboardSelection.current.platform, selectedProduct = dashboardSelection.current.product) => `${todayISO()}:${p === "Personalizado" ? `custom:${r.from}:${r.to}` : p}:${selectedPlatform}:${selectedProduct}`;
  const dashboardStorageKey = (key: string) => `ironair-dashboard-cache-v1:${sessionInfo?.activeTenantId}:${key}`;
  const applyDashboard = (dash: any) => {
    setDashboard(dash);
    setChannelRows(formatChannels(dash.channels || []));
  };
  useEffect(() => {
    if (!sessionInfo?.activeTenantId || dashboard) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(dashboardStorageKey(dashboardKey())) || "null");
      if (saved?.at && Date.now() - saved.at < 5 * 60_000 && saved.data) applyDashboard(saved.data);
    } catch { /* Ignore unavailable or invalid browser storage. */ }
  }, [sessionInfo?.activeTenantId]);
  const loadDashboardFromApi = async (p = dashboardSelection.current.period, r = dashboardSelection.current.range, fresh = false) => {
    const request = ++dashboardRequest.current;
    const { platform: selectedPlatform, product: selectedProduct } = dashboardSelection.current;
    const key = dashboardKey(p, r, selectedPlatform, selectedProduct);
    const pendingKey = fresh ? `${key}:fresh` : key;
    const pr = periodRange(p, r, firstSaleDate);
    let pending = dashboardPending.current.get(pendingKey);
    if (!pending) {
      pending = api(`/api/dashboard?from=${encodeURIComponent(pr.from)}&to=${encodeURIComponent(pr.to)}&platform=${encodeURIComponent(selectedPlatform)}&product=${encodeURIComponent(selectedProduct)}${p === "Tempo todo" ? "&all=1" : ""}${fresh ? "&fresh=1" : ""}`);
      dashboardPending.current.set(pendingKey, pending);
      void pending.finally(() => { if (dashboardPending.current.get(pendingKey) === pending) dashboardPending.current.delete(pendingKey); }).catch(() => undefined);
    }
    const dash = await pending;
    dashboardCache.current.set(key, dash);
    if (sessionInfo?.activeTenantId) try { sessionStorage.setItem(dashboardStorageKey(key), JSON.stringify({ at: Date.now(), data: dash })); } catch { /* Keep the in-memory dashboard. */ }
    if (request === dashboardRequest.current) applyDashboard(dash);
    return dash;
  };
  const loadData = async (showLoading = true, scope: "all" | "view" = "all", forceDashboard = false) => {
    const retry = async (url: string, fallback: any) => api(url).catch(() => new Promise((r) => setTimeout(r, 350)).then(() => api(url).catch(() => fallback)));
    const fetchOnce = (url: string, fallback: any) => {
      let pending = dataPending.current.get(url);
      if (!pending) {
        pending = retry(url, fallback);
        dataPending.current.set(url, pending);
        void pending.finally(() => { if (dataPending.current.get(url) === pending) dataPending.current.delete(url); }).catch(() => undefined);
      }
      return pending;
    };
    if (showLoading) setLoading(true);
    const routes: Record<string, { url: string; fallback: any; apply: (data: any) => void }> = {
      orders: { url: "/api/orders", fallback: [], apply: (data) => { setOrderRows(data || []); setSales(formatOrders(data)); } },
      inventory: { url: "/api/inventory", fallback: { balances: [], movements: [] }, apply: (data) => { setInventoryRows(data.balances || []); setInventoryMovementRows(data.movements || []); setProducts(formatInventory(data.balances || [], data.movements || [])); setMovements(formatMovements(data.movements || [], data.balances || [])); } },
      customers: { url: "/api/customers", fallback: [], apply: (data) => setCustomers(data || []) },
      campaigns: { url: "/api/campaigns?hierarchy=1", fallback: { campaigns: [], adsets: [], ads: [] }, apply: (data) => { setCampaigns(formatCampaigns(data.campaigns || [], "campaign")); setAdsets(formatCampaigns(data.adsets || [], "adset")); setAds(formatCampaigns(data.ads || [], "ad")); } },
      products: { url: "/api/products", fallback: [], apply: (data) => setCatalogRows(data || []) },
      expenses: { url: "/api/expenses", fallback: [], apply: (data) => setExpenseRows(data || []) },
      returns: { url: "/api/returns", fallback: [], apply: (data) => setReturnRows(data || []) },
      integrations: { url: "/api/integrations", fallback: [], apply: (data) => setIntegrationRows(Array.isArray(data) ? data : []) },
    };
    const byView: Record<string, string[]> = {
      "Visão Geral": ["orders", "inventory", "products", "integrations"],
      "Performance": ["campaigns"],
      "Vendas": ["orders", "inventory", "products", "customers", "integrations"],
      "Devoluções": ["returns", "orders"],
      "Clientes": ["customers"],
      "Produtos": ["products", "inventory"],
      "Estoque": ["inventory", "orders", "products", "integrations"],
      "Despesas": ["expenses"],
      "Campanhas": [],
      "Criativos": ["campaigns"],
      "Financeiro": ["expenses"],
      "Integrações": [],
      "Configurações": [],
    };
    try {
      // Render the dashboard before competing with secondary page data for DB connections.
      if (view === "Visão Geral" || view === "Financeiro" || view === "Performance") {
        await loadDashboardFromApi(undefined, undefined, forceDashboard || scope === "all").catch(() => null);
      }
      const keys = scope === "all" ? Object.keys(routes) : byView[view] || [];
      await Promise.all(keys.map(async (key) => {
        const route = routes[key];
        const data = await fetchOnce(route.url, route.fallback);
        route.apply(data);
      }));
    } catch (e: any) {
      if (view !== "Integrações" && showLoading) notify(`Banco indisponível: ${e.message}`);
    } finally {
      if (showLoading) setLoading(false);
    }
  };
  const refreshAll = async (manual = true) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (manual) setLoading(true);
    const sync = async (label: string, url: string, body: any) => {
      try {
        const result: any = await Promise.race([api(url, { method: "POST", body: JSON.stringify(body) }), new Promise((_, reject) => setTimeout(() => reject(new Error("tempo limite excedido")), 90000))]);
        return { label, ok: true, orders: Number(result?.orders || 0) };
      } catch (e: any) {
        return {
          label,
          ok: false,
          orders: 0,
          error: e?.message || "falha desconhecida",
        };
      }
    };
    try {
      const results = await Promise.all([
        sync("Shopify", "/api/integrations/shopify/sync", {
          products: true,
          orders: true,
          days: 7,
        }),
        sync("Mercado Livre", "/api/integrations/mercadolivre/sync", {
          days: 7,
        }),
        sync("Amazon", "/api/integrations/amazon/sync", { days: 7 }),
      ]);
      dashboardCache.current.clear();
      await loadData(false, "view", true);
      if (manual) {
        const failures = results.filter((r) => !r.ok);
        const successes = results
          .filter((r) => r.ok)
          .map((r) => `${r.label}: ${r.orders}`)
          .join(" | ");
        if (failures.length) notify(`Atualização parcial. ${successes}. Falhou: ${failures.map((r) => `${r.label} (${r.error})`).join(" | ")}`);
        else notify(`Atualizado com sucesso. Pedidos recebidos: ${successes}`);
      }
    } catch (e: any) {
      if (manual) notify(e.message || "Erro ao atualizar");
    } finally {
      syncingRef.current = false;
      if (manual) setLoading(false);
    }
  };
  const choosePeriod = (p: string) => {
    setFilterModal(null);
    setPeriod(p);
  };
  const remove = async (url: string) => {
    try {
      await apiJson(url, { method: "DELETE" });
      await loadData();
      notify("Excluído do banco");
      return true;
    } catch (e: any) {
      notify(e.message || "Erro ao excluir");
      return false;
    }
  };
  const removeMany = async (url: string, ids: string[], entity = "pedidos", field = "ids") => {
    try {
      await apiJson(url, { method: "DELETE", body: JSON.stringify({ [field]: ids }) });
      await loadData();
      notify(`${ids.length} ${entity} excluídos`);
      return true;
    } catch (e: any) {
      notify(e.message || "Erro ao excluir");
      return false;
    }
  };
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") loadData(false, "view"); }, 60_000);
    return () => window.clearInterval(timer);
  }, [view]);
  useEffect(() => {
    if (!notificationOpen) return;
    const mobile = window.matchMedia('(max-width: 650px)').matches;
    const previousOverflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = 'hidden';
    const dismiss = (event: PointerEvent) => { if (!notificationRef.current?.contains(event.target as Node)) setNotificationOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setNotificationOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [notificationOpen]);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileMenuOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", closeOnEscape); };
  }, [mobileMenuOpen]);
  useEffect(() => {
    if (lastLoadedView.current === view) return;
    lastLoadedView.current = view;
    loadData(false, "view");
  }, [view]);
  useEffect(() => {
    if (view !== "Vendas" && view !== "Devoluções") return;
    const refreshVisible = () => { if (document.visibilityState === "visible") loadData(false, "view"); };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [view]);
  useEffect(() => {
    const timer = window.setInterval(
      () => {
        if (document.visibilityState === "visible") refreshAll(false);
      },
      5 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const key = dashboardKey();
    if (lastRangeKey.current === null) {
      lastRangeKey.current = key;
      return;
    }
    if (lastRangeKey.current === key) return;
    lastRangeKey.current = key;
    const cached = dashboardCache.current.get(key);
    if (cached) applyDashboard(cached);
    loadDashboardFromApi(period, range).catch(() => notify("Não foi possível atualizar o dashboard"));
  }, [period, range.from, range.to, platform, product]);
  const open = (kind: ModalKind, data?: any) => {
    setSelected(data || null);
    setModal(kind);
  };
  const exportFile = (name: string, rows: any[], format: "csv" | "xml" = "csv") => {
    if (!rows.length) {
      notify("Nenhum registro para exportar");
      return;
    }
    const clean = rows.map(({ raw, ...rest }: any) => rest);
    const keys = Object.keys(clean[0] || {});
    const escapeXml = (value: any) =>
      String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
    const tag = (key: string) => key.replace(/[^A-Za-z0-9_-]/g, "_") || "campo";
    let body: string;
    let type: string;
    if (format === "xml") {
      const root = name === "clientes" ? "clientes" : "pedidos";
      const item = name === "clientes" ? "cliente" : "pedido";
      body = ['<?xml version="1.0" encoding="UTF-8"?>', `<${root}>`, ...clean.map((row) => [`  <${item}>`, ...keys.map((k) => `    <${tag(k)}>${escapeXml(row[k])}</${tag(k)}>`), `  </${item}>`].join("\n")), `</${root}>`].join("\n");
      type = "application/xml";
    } else {
      body = [keys.join(","), ...clean.map((r) => keys.map((k) => `"${String(r[k] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
      type = "text/csv";
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type }));
    a.download = `${name}.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify(`${format.toUpperCase()} exportado`);
  };
  const exportCsv = (name: string, rows: any[]) => exportFile(name, rows, "csv");
  const accountName = sessionInfo?.displayName || sessionInfo?.companyName || sessionInfo?.tenants.find(tenant => tenant.id === sessionInfo.activeTenantId)?.name || sessionInfo?.email.split('@')[0] || "Minha conta";
  const accountInitials = accountName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join("");
  return (
    <main className={`shell theme-${theme}`}>
      {mobileMenuOpen && <button className="mobileMenuBackdrop" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`sidebar ${mobileMenuOpen ? "mobileOpen" : ""}`} id="main-navigation">
        <div className="brand">
          <span className="brandLogo"><img src={theme === "light" ? "/iron-seller-black.png" : "/iron-seller-white.png"} alt="Iron Air Seller" /></span>
          <button className="mobileMenuClose" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}><X size={20} /></button>
        </div>
        <nav>
          {menu.map(([label, Icon]) => (
            <button onClick={() => { setView(label); setMobileMenuOpen(false); }} className={view === label ? "active" : ""} key={label}>
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="accountCard">
          <div className="accountCardHeader">
            <span className="accountAvatar" aria-hidden="true">{accountInitials || "IA"}</span>
            <div className="accountIdentity">
              <b title={accountName}>{accountName}</b>
              <small title={sessionInfo?.email}>{sessionInfo?.email || "Carregando conta..."}</small>
            </div>
          </div>
          {sessionInfo && sessionInfo.tenants.length > 1 && <select className="accountTenantSelect" aria-label="Empresa ativa" value={sessionInfo.activeTenantId || ''} onChange={async event => { await apiJson('/api/auth/select-tenant', { method: 'POST', body: JSON.stringify({ tenantId: event.target.value }) }); location.reload(); }}>
            {sessionInfo.tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
          </select>}
          <button type="button" className="accountLogout" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/login'; }}><LogOut size={15} />Sair da conta</button>
        </div>
      </aside>
      <section className="content">
        <header className="topbar">
          <button className="mobileMenuToggle" aria-label="Abrir menu" aria-expanded={mobileMenuOpen} aria-controls="main-navigation" onClick={() => setMobileMenuOpen(true)}><Menu size={22} /></button>
          <div className="desktopPageTitle">
            <h1>{title}</h1>
            {view === "Visão Geral" && <button type="button" className={`dashboardEditToggle ${dashboardEditing ? "active" : ""}`} onClick={() => setDashboardEditing((editing) => !editing)} aria-label={dashboardEditing ? "Concluir organização do dashboard" : "Organizar dashboard"} title={dashboardEditing ? "Concluir organização" : "Organizar dashboard"}><Pencil size={16} /></button>}
            {view === "Visão Geral" && <button type="button" className={`dashboardEditToggle ${dashboardHidden ? "active" : ""}`} onClick={() => setDashboardHidden((hidden) => !hidden)} aria-label={dashboardHidden ? "Mostrar dados do dashboard" : "Ocultar dados do dashboard"} aria-pressed={dashboardHidden} title={dashboardHidden ? "Mostrar dados" : "Ocultar dados"}>{dashboardHidden ? <EyeOff size={17} /> : <Eye size={17} />}</button>}
          </div>
          <div className="topbarActions">
            <div className="notificationMenu" ref={notificationRef}>
              <button type="button" className="notificationTrigger" aria-label="Notificações" aria-expanded={notificationOpen} onClick={() => setNotificationOpen((open) => !open)}><Bell size={17} />{stockAlerts.length > 0 && <span className="notificationCount">{stockAlerts.length}</span>}</button>
              {notificationOpen && <button type="button" className="notificationBackdrop" aria-label="Fechar notificações" onClick={() => setNotificationOpen(false)} />}
              {notificationOpen && <div className="notificationPopover">
                <div className="notificationHeading"><b>Notificações</b><button type="button" aria-label="Fechar notificações" onClick={() => setNotificationOpen(false)}><X size={16} /></button></div>
                <div className="pushControls">{pushSupported ? <button type="button" disabled={pushBusy} onClick={togglePush}>{pushBusy ? 'Aguarde...' : pushEnabled ? 'Desativar avisos neste aparelho' : 'Ativar avisos neste aparelho'}</button> : <small>Para receber avisos no iPhone, abra este site pelo atalho na Tela de Início (iOS 16.4 ou superior).</small>}</div>
                <div className="notificationTabs"><button type="button" className={notificationTab === "Vendas" ? "active" : ""} onClick={() => setNotificationTab("Vendas")}>Vendas</button><button type="button" className={notificationTab === "Alertas" ? "active" : ""} onClick={() => setNotificationTab("Alertas")}>Alertas {stockAlerts.length > 0 ? `(${stockAlerts.length})` : ""}</button></div>
                <div className="notificationList">{notificationTab === "Vendas" ? recentSales.length ? recentSales.map((order) => <div className="notificationItem" key={order.id}><ShoppingCart size={16} /><div><b>Venda aprovada · {money(Number(order.grossAmount || 0) - Number(order.discountAmount || 0))}</b><small>{order.customer?.name || order.externalId} · {fmtDate(order.paidAt || order.createdAt)}</small></div></div>) : <p className="notificationEmpty">Nenhuma venda aprovada.</p> : stockAlerts.length ? stockAlerts.map((alert) => <div className="notificationItem" key={alert}><Boxes size={16} /><div><b>Estoque de atenção</b><small>{alert}</small></div></div>) : <p className="notificationEmpty">Nenhum alerta de estoque.</p>}</div>
              </div>}
            </div>
            <button className="themeToggle" onClick={() => setTheme(current => { const next = current === "dark" ? "light" : "dark"; localStorage.setItem("ironair-theme", next); return next; })} title="Alternar tema" aria-label="Alternar tema">
              <Sun size={16} className={theme === "light" ? "active" : ""} />
              <Moon size={16} className={theme === "dark" ? "active" : ""} />
            </button>
          </div>
        </header>
        <div className="mobilePageTitleRow"><h1 className="mobilePageTitle">{title}</h1>{view === "Visão Geral" && <><button type="button" className={`dashboardEditToggle ${dashboardEditing ? "active" : ""}`} onClick={() => setDashboardEditing((editing) => !editing)} aria-label={dashboardEditing ? "Concluir organização do dashboard" : "Organizar dashboard"}><Pencil size={16} /></button><button type="button" className={`dashboardEditToggle ${dashboardHidden ? "active" : ""}`} onClick={() => setDashboardHidden((hidden) => !hidden)} aria-label={dashboardHidden ? "Mostrar dados do dashboard" : "Ocultar dados do dashboard"} aria-pressed={dashboardHidden}>{dashboardHidden ? <EyeOff size={17} /> : <Eye size={17} />}</button></>}</div>
        {view === "Visão Geral" && (
          <>
            <div className="filters">
              <span className="filterDates">{formatDashboardDate(periodRange(period, range, allTimeStart).from)} a {formatDashboardDate(periodRange(period, range, allTimeStart).to)}</span>
              <button className="refreshBtn" onClick={() => refreshAll(true)} title="Atualizar Shopify, Mercado Livre, Amazon e banco" aria-label="Atualizar">
                <RefreshCw size={16} />
              </button>
              <div className="dashboardFilter exportMenu"><span>Período</span><button className="filterTrigger" onClick={() => { setDraftRange(period === "Personalizado" ? range : { from: "", to: "" }); setCalendarMonth(todayISO().slice(0, 7)); setSelectingRangeEnd(false); setFilterModal(filterModal === "period" ? null : "period"); }} aria-expanded={filterModal === "period"}>{period}<ChevronDown size={14} /></button>
                {filterModal === "period" && <div className="exportOptions dashboardOptions periodOptions">
                  {periodOptions.map((x) => <button key={x} onClick={() => choosePeriod(x)}>{x}</button>)}
                  <div className="filterCustomDates">
                    <div className="calendarHeader"><button aria-label="Mês anterior" onClick={() => setCalendarMonth(shiftCalendarMonth(calendarMonth, -1))}>←</button><b>{calendarMonthTitle(calendarMonth)}</b><button aria-label="Próximo mês" onClick={() => setCalendarMonth(shiftCalendarMonth(calendarMonth, 1))}>→</button></div>
                    <div className="calendarGrid">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((x) => <span key={x}>{x}</span>)}{calendarDays(calendarMonth).map((day, i) => day ? <button key={day} className={`${day === draftRange.from || day === draftRange.to ? "selected" : ""} ${draftRange.from && draftRange.to && day > draftRange.from && day < draftRange.to ? "inRange" : ""}`} onClick={() => { if (!selectingRangeEnd || (draftRange.from && day < draftRange.from)) { setDraftRange({ from: day, to: "" }); setSelectingRangeEnd(true); } else { setDraftRange((r) => ({ ...r, to: day })); setSelectingRangeEnd(false); } }}>{Number(day.slice(-2))}</button> : <span key={`blank-${i}`} />)}</div>
                    <small>{draftRange.from ? `${formatDashboardDate(draftRange.from)} → ${draftRange.to ? formatDashboardDate(draftRange.to) : "selecione o fim"}` : "Selecione o início e o fim"}</small>
                    <button className="primary" disabled={!draftRange.from || !draftRange.to} onClick={() => { setRange(draftRange); setPeriod("Personalizado"); setFilterModal(null); }}>Aplicar</button>
                  </div>
                </div>}
              </div>
              <div className="dashboardFilter exportMenu platformFilter"><span>Plataforma</span><button className="filterTrigger" onClick={() => setFilterModal(filterModal === "platform" ? null : "platform")} aria-expanded={filterModal === "platform"}>{platform ? platform.replaceAll("_", " ") : "Todas"}<ChevronDown size={14} /></button>
                {filterModal === "platform" && <div className="exportOptions dashboardOptions">{["", ...dashboardPlatforms].map((x) => <button key={x || "all"} onClick={() => { setPlatform(x); setFilterModal(null); }}>{x ? x.replaceAll("_", " ") : "Todas"}</button>)}</div>}
              </div>
              <div className="dashboardFilter exportMenu"><span>Produto</span><button className="filterTrigger" onClick={() => setFilterModal(filterModal === "product" ? null : "product")} aria-expanded={filterModal === "product"}>{product ? String(dashboardProducts.find(([sku]) => sku === product)?.[1] || product) : "Todos"}<ChevronDown size={14} /></button>
                {filterModal === "product" && <div className="exportOptions dashboardOptions">{[["", "Todos"], ...dashboardProducts].map(([sku, name]) => <button key={String(sku) || "all"} onClick={() => { setProduct(String(sku)); setFilterModal(null); }}>{String(name)}</button>)}</div>}
              </div>
            </div>
            {dashboardLayoutReady && <div className={`dashboardLayout ${dashboardEditing ? "editing" : ""}`}>
              {dashboardLayout.map((blockId, index) => {
                const kpi = blockId.startsWith("kpi-") ? dashboardCards[Number(blockId.slice(4))] : null;
                const kpiPosition = kpi ? dashboardKpiIds.indexOf(blockId) : -1;
                if (kpiPosition > 8 && !dashboardEditing) return null;
                return <Fragment key={blockId}>
                  {kpiPosition === 8 && !dashboardEditing && <div className={`dashboardMoreSection ${dashboardExpanded ? "expanded" : ""}`}>
                    <div className={`dashboardExtraCards ${dashboardExpanded ? "expanded" : ""}`} aria-hidden={!dashboardExpanded}>
                      <div className="dashboardExtraCardsInner">
                        {dashboardKpiIds.slice(8).map((id) => {
                          const extra = dashboardCards[Number(id.slice(4))];
                          return <div key={id} className="dashboardLayoutItem dashboardKpiItem"><article className="card kpi"><span>{extra.label}</span><strong className={!dashboardHidden && isNegativeDisplay(extra.value) ? "negative" : extra.label === "Lucro líquido" && !dashboardHidden ? "dashboardProfitPositive" : undefined}>{dashboardHidden ? "—" : extra.value}</strong><small>{dashboardHidden ? maskDashboardNumbers(extra.delta) : extra.delta}</small></article></div>;
                        })}
                      </div>
                    </div>
                    <div className="dashboardMoreDivider">
                      <button type="button" className="dashboardMoreToggle" aria-expanded={dashboardExpanded} aria-label={dashboardExpanded ? "Mostrar menos cards" : "Mostrar mais cards"} onClick={() => setDashboardExpanded((expanded) => !expanded)}>
                        {dashboardExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </button>
                      <span>{dashboardExpanded ? "Mostrar menos" : "Mostrar mais"}</span>
                    </div>
                  </div>}
                  {(kpiPosition < 8 || dashboardEditing) && <div className={`dashboardLayoutItem ${kpi ? "dashboardKpiItem" : blockId === "timeline" || blockId === "alerts" ? "dashboardHalfItem" : "dashboardFullItem"} ${dashboardDropTarget === blockId ? "dropTarget" : ""}`}
                  onDragOver={dashboardEditing ? (event) => { event.preventDefault(); setDashboardDropTarget(blockId); } : undefined}
                  onDragLeave={dashboardEditing ? () => setDashboardDropTarget((current) => current === blockId ? null : current) : undefined}
                  onDrop={dashboardEditing ? (event) => { event.preventDefault(); moveDashboardBlock(dashboardDragSource.current || event.dataTransfer.getData("text/plain"), blockId); dashboardDragSource.current = null; setDashboardDropTarget(null); } : undefined}>
                  {dashboardEditing && <div className="dashboardDragControls">
                    <span draggable onDragStart={(event) => { dashboardDragSource.current = blockId; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", blockId); }} onDragEnd={() => { dashboardDragSource.current = null; setDashboardDropTarget(null); }} title="Arraste para reorganizar" aria-label="Arraste para reorganizar"><GripVertical size={18} /></span>
                    <button type="button" disabled={index === 0} onClick={() => moveDashboardBlock(blockId, dashboardLayout[Math.max(0, index - dashboardRowStep())])} aria-label={`Mover ${kpi?.label || blockId} para cima`}><ArrowUp size={16} /></button>
                    <button type="button" className="dashboardHorizontalMove" disabled={index === 0} onClick={() => moveDashboardBlock(blockId, dashboardLayout[index - 1])} aria-label={`Mover ${kpi?.label || blockId} para a esquerda`}><ArrowLeft size={16} /></button>
                    <button type="button" className="dashboardHorizontalMove" disabled={index === dashboardLayout.length - 1} onClick={() => moveDashboardBlock(blockId, dashboardLayout[index + 1])} aria-label={`Mover ${kpi?.label || blockId} para a direita`}><ArrowRight size={16} /></button>
                    <button type="button" disabled={index === dashboardLayout.length - 1} onClick={() => moveDashboardBlock(blockId, dashboardLayout[Math.min(dashboardLayout.length - 1, index + dashboardRowStep())])} aria-label={`Mover ${kpi?.label || blockId} para baixo`}><ArrowDown size={16} /></button>
                  </div>}
                  {kpi ? <article className="card kpi"><span>{kpi.label}</span><strong className={!dashboardHidden && isNegativeDisplay(kpi.value) ? "negative" : kpi.label === "Lucro líquido" && !dashboardHidden ? "dashboardProfitPositive" : undefined}>{dashboardHidden ? "—" : kpi.value}</strong><small>{dashboardHidden ? maskDashboardNumbers(kpi.delta) : kpi.delta}</small></article> : blockId === "timeline" ? <article className="card chartCard"><div className="sectionHead"><div><h2>Vendas no tempo</h2><p>{period === "Personalizado" ? `${range.from} → ${range.to}` : period}</p></div><ChartStyleToggle mode={dashboardChartMode} onChange={setDashboardChartMode} /></div><SalesTimeline rows={dashboard?.daily || []} period={period} range={range} firstSaleDate={allTimeStart} hidden={dashboardHidden} mode={dashboardChartMode} /></article> : blockId === "alerts" ? <article className="card pad"><div className="sectionHead"><div><h2>Alertas da operação</h2><p>Estoque de atenção · atualização automática</p></div><span className="badge">{dashboardHidden ? "—" : stockAlerts.length}</span></div><div className="alerts">{stockAlerts.length ? stockAlerts.map((a, i) => <div className="alert" key={a}><span>{dashboardHidden ? "—" : i + 1}</span><p>{dashboardHidden ? maskDashboardNumbers(a) : a}</p></div>) : <p className="muted">Nenhum alerta de estoque.</p>}</div></article> : blockId === "channels" ? <ChannelTable rows={channelRows} hidden={dashboardHidden} /> : <Inventory products={periodInventoryProducts} salesPeriod={period} onEdit={(p: any) => open("product", p)} hidden={dashboardHidden} showShopee={connectedProviders.has("Shopee")} />}
                </div>}
                </Fragment>;
              })}
            </div>}
          </>
        )}
        {view === "Vendas" && (
          <Sales
            q={q}
            setQ={setQ}
            rows={filtered}
            onNew={() => open("sale")}
            onOpen={(s: any) => open("saleDetail", s)}
            onDelete={(s: any) => remove(`/api/orders?id=${encodeURIComponent(s.raw.id)}`)}
            onDeleteMany={(rows: any[]) =>
              removeMany(
                "/api/orders",
                rows.map((s) => s.raw.id),
              )
            }
            onExport={(rows: any[], format: "csv" | "xml") => exportFile("vendas", rows, format)}
          />
        )}{" "}
        {view === "Devoluções" && <Returns rows={returnRows} />}{" "}
        {view === "Clientes" && (
          <Customers
            rows={customers}
            onNew={() => open("customer")}
            onEdit={(c: any) => open("customer", c)}
            onBackfill={async () => {
              try {
                const r = await apiJson("/api/customers/backfill-locations", {
                  method: "POST",
                  body: "{}",
                });
                await loadData();
                notify(`Cidade/UF atualizados: ${r.updated || 0}`);
              } catch (e: any) {
                notify(e.message || "Reconecte o Mercado Livre para buscar cidade/UF");
              }
            }}
            onDelete={(c: any) => remove(`/api/customers?id=${encodeURIComponent(c.id)}`)}
            onDeleteMany={(ids: string[]) => removeMany("/api/customers", ids, "clientes")}
            onExport={(rows: any[], format: "csv" | "xml") => exportFile("clientes", rows, format)}
          />
        )}{" "}
        {view === "Estoque" && (
          <>
            <Inventory products={periodInventoryProducts} salesPeriod={period} onEdit={(p: any) => open("product", p)} onDeleteMany={(skus: string[]) => removeMany("/api/products", skus, "produtos", "skus")} bulkEnabled showShopee={connectedProviders.has("Shopee")} />
            <Movements movements={movements} onNew={() => open("movement")} onEdit={(movement: any) => open("movementEdit", movement)} />
          </>
        )}{" "}
        {view === "Despesas" && <Expenses rows={expenseRows} data={dashboard} onNew={() => open("expense")} onEdit={(expense: any) => open("expense", expense)} onDelete={(expense: any) => remove(`/api/expenses?id=${encodeURIComponent(expense.id)}`)} onDeleteMany={(ids: string[]) => removeMany("/api/expenses", ids, "despesas")} />}
        {view === "Produtos" && <Products products={catalogRows} inventory={products} onNew={() => open("product")} onEdit={(p: any) => open("product", p)} onDelete={(p: any) => remove(`/api/products?sku=${encodeURIComponent(p.sku)}`)} onDeleteMany={(skus: string[]) => removeMany("/api/products", skus, "produtos", "skus")} />} {view === "Campanhas" && <Campaigns manager campaigns={campaigns} adsets={adsets} ads={ads} onNew={() => open("campaign")} onDelete={(c: any) => remove(`/api/campaigns?campaignId=${encodeURIComponent(c.campaignId)}&platform=${encodeURIComponent(c.platform)}`)} />}{" "}
        {view === "Performance" && <PerformanceView />}{" "}
        {view === "Financeiro" && <Finance />} {view === "Integrações" && <Integrations refreshKey={integrationsRefreshKey} onNew={() => open("integration")} onOpen={(i: Integration) => open("integrationDetail", i)} />} {view === "Criativos" && <Creatives rows={ads} />} {view === "Configurações" && <SettingsView onEdit={() => open("settings")} />}
      </section>
      {modal && (
        <Modal
          kind={modal}
          data={selected}
          close={() => setModal(null)}
          notify={notify}
          products={products}
          catalogProducts={catalogRows}
          integrations={integrationsSeed}
          channelOptions={salesAndStockOptions(connectedProviders)}
          onDeleteIntegration={async (i: Integration) => { const removed = await remove(`/api/integrations?provider=${encodeURIComponent(i.name)}`); if (removed) { setIntegrationsRefreshKey((value) => value + 1); setModal(null); } return removed; }}
          onSave={async (kind: any, data: any) => {
            try {
              if (kind === "movement")
                await apiJson("/api/inventory/movement", {
                  method: "POST",
                  body: JSON.stringify({
                    ...data,
                    quantity: Number(data.qty || data.quantity || 1),
                    warehouseCode: warehouseCode(data.to) || "CENTRAL",
                    reference: data.ref,
                    note: data.to ? `Destino: ${data.to}` : undefined,
                    date: data.date,
                  }),
                });
              else if (kind === "movementEdit")
                await apiJson(`/api/inventory/movement/${encodeURIComponent(data.id)}`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    sku: data.sku,
                    type: data.type,
                    quantity: Number(data.qty),
                    createdAt: data.createdAt,
                    reference: data.ref,
                    note: data.note,
                    warehouseCode: data.warehouseCode,
                    fromWarehouseCode: data.fromWarehouseCode,
                    toWarehouseCode: data.toWarehouseCode,
                  }),
                });
              else if (kind === "sale")
                await apiJson("/api/orders", {
                  method: "POST",
                  body: JSON.stringify({
                    ...data,
                    sku: data.sku,
                    product: catalogRows.find((p: any) => p.sku === data.sku)?.name || data.product,
                    quantity: 1,
                  }),
                });
              else if (kind === "saleDetail")
                await apiJson("/api/orders", {
                  method: "PATCH",
                  body: JSON.stringify({
                    id: data.raw?.id,
                    customer: data.customer,
                    feeAmount: Number(data.feeAmount ?? data.fee ?? 0),
                    shippingAmount: Number(data.shippingAmount ?? data.freight ?? 0),
                    orderItemId: data.orderItemId,
                    itemSku: data.itemSku,
                  }),
                });
              else if (kind === "customer")
                await apiJson("/api/customers", {
                  method: data.id ? "PATCH" : "POST",
                  body: JSON.stringify(data),
                });
              else if (kind === "product")
                await apiJson("/api/products", {
                  method: "POST",
                  body: JSON.stringify(data),
                });
              else if (kind === "integration") {
                await apiJson("/api/integrations", {
                  method: "POST",
                  body: JSON.stringify(data),
                });
                setIntegrationsRefreshKey((v) => v + 1);
              } else if (kind === "campaign")
                await apiJson("/api/campaigns", {
                  method: "POST",
                  body: JSON.stringify(data),
                });
              else if (kind === "expense")
                await apiJson("/api/expenses", {
                  method: data.id ? "PATCH" : "POST",
                  body: JSON.stringify(data),
                });
              setModal(null);
              await loadData();
              notify("Salvo e persistido");
            } catch (e: any) {
              notify(e.message || "Erro ao salvar");
            }
          }}
        />
      )}
      {toast && (
        <div className="toast">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
    </main>
  );
}
function warehouseCode(label?: string) {
  return (
    (
      {
        Central: "CENTRAL",
        "Amazon FBA": "AMAZON_FBA",
        "Mercado Livre Full": "ML_FULL",
        Manual: "CENTRAL",
        Shopify: "CENTRAL",
        "Mercado Livre": "CENTRAL",
        Amazon: "CENTRAL",
        Shopee: "CENTRAL",
      } as any
    )[label || ""] || label
  );
}
function periodDays(period: string) {
  if (period === "Hoje" || period === "Ontem") return 1;
  if (period === "7 dias") return 7;
  if (period === "30 dias") return 30;
  if (period === "Este mês") return Math.max(1, new Date().getDate());
  if (period === "Mês passado") return new Date(Date.UTC(Number(todayISO().slice(0, 4)), Number(todayISO().slice(5, 7)) - 1, 0)).getUTCDate();
  if (period === "Este ano") return Math.floor((Date.parse(`${todayISO()}T12:00:00Z`) - Date.parse(`${todayISO().slice(0, 4)}-01-01T12:00:00Z`)) / 864e5) + 1;
  return 365;
}
function localISODate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
function todayISO() {
  return localISODate();
}
function saoPauloDateTimeLocal(d = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d).replace(" ", "T");
}
function startOfYearISO() {
  const d = new Date();
  return `${localISODate(d).slice(0, 4)}-01-01`;
}
function dateKey(value: any) {
  return value
    ? new Date(value).toLocaleDateString("en-CA", {
        timeZone: "America/Sao_Paulo",
      })
    : "";
}
function firstPaidSaleDay(orders: any[]) {
  return orders.filter((o) => o.status === "PAID" && o.paidAt).map((o) => dateKey(o.paidAt)).sort()[0] || todayISO();
}
function periodRange(period: string, range: { from: string; to: string }, firstSaleDate = todayISO()) {
  const today = todayISO();
  if (period === "Ontem") { const previous = new Date(`${today}T12:00:00Z`); previous.setUTCDate(previous.getUTCDate() - 1); const day = previous.toISOString().slice(0, 10); return { from: day, to: day }; }
  if (period === "Tempo todo") return { from: firstSaleDate, to: today };
  if (period === "Personalizado") return range;
  if (period === "Este ano") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  if (period === "Mês passado") {
    const [year, month] = today.split("-").map(Number);
    const previous = new Date(Date.UTC(year, month - 2, 1));
    const previousYear = previous.getUTCFullYear();
    const previousMonth = String(previous.getUTCMonth() + 1).padStart(2, "0");
    const lastDay = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
    return { from: `${previousYear}-${previousMonth}-01`, to: `${previousYear}-${previousMonth}-${String(lastDay).padStart(2, "0")}` };
  }
  if (period === "Este mês")
    return {
      from: `${today.slice(0, 7)}-01`,
      to: today,
    };
  const days = periodDays(period);
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - (days - 1));
  const from = localISODate(fromDate);
  return { from, to: today };
}
function paginationNumbers(current: number, total: number) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  if (current <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (current >= total - 2) {
    pages.add(total - 1);
    pages.add(total - 2);
    pages.add(total - 3);
  }
  const sorted = [...pages].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  return sorted.flatMap((n, i) => (i && n - sorted[i - 1] > 1 ? ["…", n] : [n]));
}
function buildDashboard(orders: any[] = [], balances: any[] = [], period = "Hoje", range = { from: startOfYearISO(), to: todayISO() }) {
  const r = periodRange(period, range, firstPaidSaleDay(orders));
  const daily = new Map<string, any>();
  const channels = new Map<string, any>();
  const registeredCostBySku = new Map<string, number>((balances || []).map((balance: any) => [String(balance.variant?.sku || balance.sku || ""), Number(balance.variant?.unitCost || 0)]));
  const ironAirCosts = [...registeredCostBySku].filter(([sku]) => /^IRON-AIR-/i.test(sku)).map(([, cost]) => cost).filter((cost) => cost > 0);
  const sharedIronAirCost = ironAirCosts.length && ironAirCosts.every((cost) => cost === ironAirCosts[0]) ? ironAirCosts[0] : 0;
  const itemUnitCost = (item: any) => Number(item.unitCost || 0) > 0 ? Number(item.unitCost) : registeredCostBySku.get(String(item.sku || "")) || (/\biron air\b/i.test(String(item.name || "")) ? sharedIronAirCost : 0);
  let revenue = 0,
    cogs = 0,
    fees = 0,
    unitCostTotal = 0,
    unitsWithCost = 0,
    ordersCount = 0;
  for (const o of orders) {
    if (o.status !== "PAID") continue;
    const key = dateKey(o.paidAt || o.createdAt);
    if (!key || key < r.from || key > r.to) continue;
    const orderRevenue = Number(o.grossAmount || 0) - Number(o.discountAmount || 0);
    const orderFees = Number(o.feeAmount || 0) + Number(o.shippingAmount || 0) + Number(o.taxAmount || 0);
    const orderCogs = (o.items || []).reduce((sum: number, i: any) => sum + itemUnitCost(i) * Number(i.quantity || 0), 0);
    for (const item of o.items || []) {
      const registeredUnitCost = itemUnitCost(item);
      if (registeredUnitCost > 0) {
        unitCostTotal += registeredUnitCost * Number(item.quantity || 0);
        unitsWithCost += Number(item.quantity || 0);
      }
    }
    revenue += orderRevenue;
    cogs += orderCogs;
    fees += orderFees;
    ordersCount++;
    const salesProfit = orderRevenue - orderFees;
    const generalProfit = salesProfit - orderCogs;
    const d = daily.get(key) || {
      date: key,
      revenue: 0,
      profit: 0,
      salesProfit: 0,
      orders: 0,
    };
    d.revenue += orderRevenue;
    d.salesProfit += salesProfit;
    d.profit += generalProfit;
    d.orders++;
    daily.set(key, d);
    const c = channels.get(o.channel) || {
      name: o.channel,
      invested: 0,
      sales: 0,
      revenue: 0,
      cogs: 0,
      fees: 0,
    };
    c.sales++;
    c.revenue += orderRevenue;
    c.cogs += orderCogs;
    c.fees += orderFees;
    channels.set(o.channel, c);
  }
  const salesProfit = revenue - fees;
  const grossProfit = salesProfit - cogs;
  const profit = grossProfit;
  const available = (balances || []).reduce((sum: number, b: any) => sum + Math.max(0, Number(b.onHand || 0) - Number(b.reserved || 0)), 0);
  return {
    periodDays: periodDays(period),
    revenue,
    orders: ordersCount,
    cogs,
    markupUnitCost: unitsWithCost ? unitCostTotal / unitsWithCost : 0,
    fees,
    taxes: 0,
    media: 0,
    metaAds: 0,
    googleAds: 0,
    tiktokAds: 0,
    salesProfit,
    grossProfit,
    profit,
    expenses: 0,
    margin: revenue ? profit / revenue : 0,
    salesMargin: revenue ? salesProfit / revenue : 0,
    roas: null,
    ticket: ordersCount ? revenue / ordersCount : 0,
    available,
    trackingEvents: 0,
    periodMode: period === "Tempo todo" ? "all" : null,
    periodFrom: r.from,
    periodTo: r.to,
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    channels: [...channels.values()].map((c) => ({
      name: c.name,
      invested: c.invested,
      sales: c.sales,
      revenue: c.revenue,
      cpa: c.sales ? c.invested / c.sales : null,
      roas: c.invested ? c.revenue / c.invested : null,
      salesProfit: c.revenue - c.fees - c.invested,
      profit: c.revenue - c.cogs - c.fees - c.invested,
    })),
  };
}
function fmtDate(value: any) {
  return value
    ? new Date(value).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}
function fmtMovementDate(movement: any) {
  const value = movement?.createdAt;
  if (movement?.source === "MANUAL" && typeof value === "string") {
    const date = new Date(value);
    if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0) {
      const [, month, day] = value.match(/^(\d{4})-(\d{2})-(\d{2})/) || [];
      if (day && month) return `${day}/${month}`;
    }
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  }
  return fmtDate(value);
}
function movementDay(movement: any) {
  const value = movement?.createdAt;
  if (movement?.source === "MANUAL" && typeof value === "string" && /T00:00:00(?:\.\d+)?Z$/.test(value)) return value.slice(0, 10);
  return dateKey(value);
}
function movementLocalDateTime(movement: any) {
  const value = movement?.createdAt;
  if (movement?.source === "MANUAL" && typeof value === "string" && /T00:00:00(?:\.\d+)?Z$/.test(value)) return `${value.slice(0, 10)}T12:00`;
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (kind: string) => parts.find((item) => item.type === kind)?.value || "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
function dashboardKpis(d: any) {
  const revenue = Number(d?.revenue || 0);
  const cogs = Number(d?.cogs || 0);
  const media = Number(d?.media || 0);
  const investment = cogs + Number(d?.fees || 0) + media + Number(d?.expenses || 0);
  const ratio = (value: number) => String(Number(value.toFixed(2)));
  const percent = (value: number) => `${(value * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  return [
    {
      label: "Faturamento",
      value: money(d?.revenue || 0),
      delta: `${d?.orders || 0} pedidos pagos`,
    },
    {
      label: "Pedidos pagos",
      value: String(d?.orders || 0),
      delta: "Aprovados",
    },
    {
      label: "Líq. do Marketplace",
      value: money(d?.salesProfit ?? (revenue - Number(d?.fees || 0))),
      delta: "Faturamento − taxas e frete",
    },
    {
      label: "Lucro líquido",
      value: money((d?.grossProfit ?? (revenue - Number(d?.fees || 0) - cogs)) - Number(d?.expenses || 0)),
      delta: "Lucro bruto − despesas",
    },
    {
      label: "Taxas + frete",
      value: money(Number(d?.fees || 0) ? -Math.abs(Number(d?.fees || 0)) : 0),
      delta: "Plataforma / logística",
    },
    {
      label: "Custo dos produtos",
      value: money(d?.cogs || 0),
      delta: "Custo unitário × quantidade vendida",
    },
    {
      label: "Ticket médio",
      value: money(d?.ticket || 0),
      delta: "Receita / pedidos",
    },
    {
      label: "Estoque",
      value: `${d?.available || 0} un.`,
      delta: "Disponíveis",
    },
    {
      label: "Impostos",
      value: money(d?.taxes || 0),
      delta: "% sobre o faturamento",
    },
    {
      label: "Lucro bruto pós Ads",
      value: money((d?.grossProfit ?? (revenue - Number(d?.fees || 0) - cogs)) - media),
      delta: "Lucro bruto − anúncios",
    },
    {
      label: "Valor em Ads",
      value: money(media),
      delta: "Total investido em anúncios",
    },
    {
      label: "ROI",
      value: investment > 0 ? ratio(Math.max(0, (revenue - investment) / investment)) : "—",
      delta: "Retorno sobre o investimento",
    },
    {
      label: "TACOS",
      value: revenue > 0 ? percent(media / revenue) : "—",
      delta: "Investimento em anúncios / faturamento",
    },
    {
      label: "MPA",
      value: revenue > 0 ? percent(((d?.grossProfit ?? (revenue - Number(d?.fees || 0) - cogs)) - media) / revenue) : "—",
      delta: "Lucro bruto pós Ads / faturamento",
    },
    {
      label: "Lucro bruto",
      value: money(d?.grossProfit ?? (revenue - Number(d?.fees || 0) - cogs)),
      delta: "Faturamento − taxas e frete − produtos",
    },
    {
      label: "ROAS total",
      value: Number(d?.media || 0) > 0 ? `${(revenue / Number(d.media)).toFixed(2)}x` : "—",
      delta: "Faturamento / investimento em anúncios",
    },
  ].map((card) => d ? card : { ...card, value: "—", delta: "Carregando dados..." });
}
function chartBars(rows: any[] = []) {
  if (!rows.length) return Array.from({ length: 14 }, () => ({ revenue: 2, profit: 2 }));
  const max = Math.max(...rows.map((r) => Math.max(Number(r.revenue || 0), Number(r.profit || 0))), 1);
  return rows.slice(-20).map((r) => ({
    revenue: Math.max(2, (Number(r.revenue || 0) / max) * 100),
    profit: Math.max(2, (Number(r.profit || 0) / max) * 100),
  }));
}
function addDaysISO(day: string, days: number) {
  const d = new Date(`${day}T12:00:00.000-03:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function compactDay(day: string) {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}
function formatDashboardDate(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}
function shiftCalendarMonth(month: string, offset: number) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
function calendarMonthTitle(month: string) {
  const [year, value] = month.split("-").map(Number);
  const name = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, value - 1, 1)));
  return `${name[0].toUpperCase()}${name.slice(1)} ${year}`;
}
function calendarDays(month: string) {
  const [year, value] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, value - 1, 1));
  const blanks = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return [...Array(blanks).fill(""), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
}
function salesTimeline(rows: any[] = [], period: string, range: { from: string; to: string }, firstSaleDate = todayISO()) {
  const r = periodRange(period, range, firstSaleDate);
  const source = new Map(rows.map((row) => [row.date, row]));
  const totalDays = Math.max(1, Math.round((new Date(`${r.to}T12:00:00.000-03:00`).getTime() - new Date(`${r.from}T12:00:00.000-03:00`).getTime()) / 864e5) + 1);
  const maxPoints = period === "Tempo todo" ? 24 : period === "30 dias" ? 30 : totalDays;
  const step = Math.max(1, Math.ceil(totalDays / maxPoints));
  const points = [];
  for (let i = 0; i < totalDays; i += step) {
    let revenue = 0,
      orders = 0,
      last = r.from;
    for (let j = 0; j < step && i + j < totalDays; j++) {
      const day = addDaysISO(r.from, i + j);
      const row = source.get(day);
      revenue += Number(row?.revenue || 0);
      orders += Number(row?.orders || 0);
      last = day;
    }
    points.push({ date: last, revenue, orders });
  }
  if (!points.length) points.push({ date: r.to, revenue: 0, orders: 0 });
  return points;
}
function SalesTimeline({ rows, period, range, firstSaleDate, hidden = false, mode = "line" }: any) {
  const points = salesTimeline(rows, period, range, firstSaleDate);
  const dates = periodRange(period, range, firstSaleDate);
  return <SalesChart points={points} from={dates.from} to={dates.to} hidden={hidden} mode={mode} />;
}
function formatOrders(rows: any[]) {
  return (rows || []).map((o) => {
    const items = o.items || [];
    const firstItem = items[0];
    const voltages = [...new Set(items.map((item: any) => {
      const registered = String(item.variant?.voltage || "").trim();
      if (registered) return registered;
      const match = `${item.sku || ""} ${item.name || ""}`.match(/\b(110|127|220)\s*V\b/i);
      return match ? `${match[1]}V` : "";
    }).filter(Boolean))];
    const cogs = items.reduce((s: number, i: any) => s + Number(i.unitCost || 0) * Number(i.quantity || 0), 0);
    const fee = Number(o.feeAmount || 0);
    const freight = Number(o.shippingAmount || 0);
    const revenue = Number(o.grossAmount || 0) - Number(o.discountAmount || 0);
    return {
      raw: o,
      id: o.externalId,
      date: fmtDate(o.paidAt || o.createdAt),
      customer: o.customer?.name || "Cliente",
      product: items.map((i: any) => `${i.name}${i.sku ? ` (${i.sku})` : ""}`).join(", ") || "—",
      voltage: voltages.join(", ") || "—",
      itemSku: firstItem?.sku || "",
      orderItemId: firstItem?.id || "",
      source: o.sourceSnapshot?.fulfillmentOrigin === "AMAZON_FBA" || o.sourceSnapshot?.warehouseCode === "AMAZON_FBA" ? "Amazon FBA" : o.sourceSnapshot?.fulfillmentOrigin === "ML_FULL" || o.sourceSnapshot?.warehouseCode === "ML_FULL" ? "Mercado Livre Full" : o.channel,
      campaign: o.attribution?.campaign || o.attribution?.source || "—",
      value: money(Number(o.grossAmount || 0)),
      fee,
      freight,
      cogs,
      profit: o.status === "REFUNDED" || o.status === "CANCELLED" ? 0 : revenue - fee - freight - Number(o.taxAmount || 0),
      status: o.status,
      tracking: o.attribution?.fbclid || o.attribution?.gclid ? "Atribuído" : "Sem clique",
    };
  });
}
function formatInventory(rows: any[], movements: any[] = [], orders?: any[], salesRange?: { from: string; to: string } | null) {
  const bySku = new Map<string, any>();
  const transfers = new Map<string, { fba: number; full: number }>();
  const sold = new Map<string, any>();
  for (const m of movements || []) {
    const day = movementDay(m);
    const inPeriod = !salesRange || (day >= salesRange.from && day <= salesRange.to);
    if (inPeriod && m.type === "TRANSFER_IN" && Number(m.quantity) > 0 && (m.warehouseCode === "AMAZON_FBA" || m.warehouseCode === "ML_FULL")) {
      const bucket = transfers.get(m.sku) || { fba: 0, full: 0 };
      if (m.warehouseCode === "AMAZON_FBA") bucket.fba += Number(m.quantity);
      else bucket.full += Number(m.quantity);
      transfers.set(m.sku, bucket);
    }
    if (!orders && m.type === "SALE" && Number(m.quantity) < 0) {
      const bucket = sold.get(m.sku) || {
        shopify: 0,
        ml: 0,
        amazon: 0,
        shopee: 0,
        manual: 0,
      };
      const qty = Math.abs(Number(m.quantity || 0));
      const ch = String(m.orderChannel || "").toUpperCase();
      if (ch === "SHOPIFY") bucket.shopify += qty;
      else if (ch === "MERCADO_LIVRE") bucket.ml += qty;
      else if (ch === "AMAZON") bucket.amazon += qty;
      else if (ch === "SHOPEE") bucket.shopee += qty;
      else bucket.manual += qty;
      sold.set(m.sku, bucket);
    }
  }
  if (orders) for (const order of orders) {
    if (order.status !== "PAID") continue;
    const paidDay = dateKey(order.paidAt);
    if (!paidDay || (salesRange && (paidDay < salesRange.from || paidDay > salesRange.to))) continue;
    for (const item of order.items || []) {
      const sku = String(item.sku || item.variant?.sku || "");
      if (!sku) continue;
      const bucket = sold.get(sku) || { shopify: 0, ml: 0, amazon: 0, shopee: 0, manual: 0 };
      const quantity = Number(item.quantity || 0);
      const channel = String(order.channel || "").toUpperCase();
      if (channel === "SHOPIFY") bucket.shopify += quantity;
      else if (channel === "MERCADO_LIVRE") bucket.ml += quantity;
      else if (channel === "AMAZON") bucket.amazon += quantity;
      else if (channel === "SHOPEE") bucket.shopee += quantity;
      else bucket.manual += quantity;
      sold.set(sku, bucket);
    }
  }
  for (const r of rows || []) {
    const sku = r.variant?.sku || r.sku;
    const s = sold.get(sku) || {};
    const item = bySku.get(sku) || {
      product: r.variant?.product?.name || r.variant?.name || "Produto",
      name: r.variant?.name,
      sku,
      physical: 0,
      reserved: 0,
      committed: 0,
      safety: r.variant?.safetyStock || 0,
      cost: Number(r.variant?.unitCost || 0),
      price: Number(r.variant?.salePrice || 0),
      unitCost: Number(r.variant?.unitCost || 0),
      salePrice: Number(r.variant?.salePrice || 0),
      available: 0,
      shopify: s.shopify || 0,
      ml: s.ml || 0,
      amazon: s.amazon || 0,
      shopee: s.shopee || 0,
      manual: s.manual || 0,
      fbaQty: 0,
      fullQty: 0,
      status: "Saudável",
      productId: r.variant?.productId,
    };
    if (r.warehouse?.code === "CENTRAL") {
      item.physical += r.onHand;
      item.reserved += r.reserved;
      item.available += Math.max(0, Number(r.onHand || 0) - Number(r.reserved || 0));
    }
    const transfer = transfers.get(sku);
    if (transfer) { item.fbaQty = transfer.fba; item.fullQty = transfer.full; }
    item.status = item.available <= item.safety ? "Pouco" : "Saudável";
    bySku.set(sku, item);
  }
  return [...bySku.values()];
}
function formatMovements(rows: any[], balances: any[] = []) {
  const byKey = new Map((rows || []).filter((m) => m.idempotencyKey).map((m) => [m.idempotencyKey, m]));
  const running = new Map<string, number>();
  for (const balance of balances) running.set(`${balance.variant?.sku || balance.sku}:${balance.warehouse?.code || balance.warehouseCode}`, Number(balance.onHand || 0));
  return (rows || []).map((m) => {
    const pairKey = String(m.idempotencyKey || "");
    const other = byKey.get(m.type === "TRANSFER_IN" ? pairKey.slice(0, -3) : `${pairKey}:in`);
    const balanceKey = `${m.sku}:${m.warehouseCode}`;
    const balance = running.get(balanceKey);
    if (balance !== undefined && m.type !== "RESERVE" && m.type !== "RELEASE") running.set(balanceKey, balance - Number(m.quantity || 0));
    return ({
    id: m.id,
    raw: m,
    date: fmtMovementDate(m),
    createdAt: movementLocalDateTime(m),
    sku: m.sku,
    type: m.type,
    qty: m.quantity,
    ref: m.reference || m.note || m.warehouseCode,
    reference: m.reference || "",
    note: m.note || "",
    warehouseCode: m.warehouseCode,
    fromWarehouseCode: m.type === "TRANSFER_OUT" ? m.warehouseCode : other?.warehouseCode || "CENTRAL",
    toWarehouseCode: m.type === "TRANSFER_IN" ? m.warehouseCode : other?.warehouseCode || "AMAZON_FBA",
    source: m.source,
    balance: balance ?? "—",
  }); });
}
function formatCampaigns(rows: any[], level: "campaign" | "adset" | "ad" = "campaign") {
  return rows.map((c) => ({
    campaignId: c.campaignId,
    adsetId: c.adsetId,
    adId: c.adId,
    accountId: c.accountId,
    name: level === "ad" ? c.adName || c.adId : level === "adset" ? c.adsetName || c.adsetId : c.campaignName,
    campaignName: c.campaignName,
    adsetName: c.adsetName,
    status: c.status,
    platform: c.platform,
    spendValue: Number(c.spend || 0),
    recentSpend: Number(c.recentSpend || 0),
    revenueValue: Number(c.revenue || 0),
    clicks: Number(c.clicks || 0),
    impressions: Number(c.impressions || 0),
    manual: c.accountId === "manual",
    spend: money(c.spend || 0),
    sales: c.sales || 0,
    revenue: money(c.revenue || 0),
    cpa: c.cpa ? money(c.cpa) : "—",
    roas: c.roas ? `${c.roas.toFixed(2)}x` : "—",
    profit: "—",
  }));
}
function formatChannels(rows: any[]) {
  return (rows || []).map((c) => ({
    name: c.name,
    invested: money(c.invested || 0),
    sales: c.sales || 0,
    revenue: money(c.revenue || 0),
    cpa: c.cpa ? money(c.cpa) : "—",
    roas: c.roas ? `${c.roas.toFixed(2)}x` : "—",
    profit: money(c.salesProfit || 0),
  }));
}
function ChannelTable({ rows, hidden = false }: { rows: any[]; hidden?: boolean }) {
  return (
    <article className="card tableCard">
      <div className="sectionHead">
        <div>
          <h2>Performance por canal</h2>
          <p>Receita e lucro de venda consolidado</p>
        </div>
      </div>
      <div className="tableWrap">
        <table className="channelTable">
          <thead>
            <tr>
              <th>Canal</th>
              <th>Investido</th>
              <th>Vendas</th>
              <th>Receita</th>
              <th>CPA</th>
              <th>ROAS</th>
              <th>Lucro vendas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.name}>
                <td>
                  <b>{c.name}</b>
                </td>
                <td>{hidden ? "—" : c.invested}</td>
                <td>{hidden ? "—" : c.sales}</td>
                <td>{hidden ? "—" : c.revenue}</td>
                <td>{hidden ? "—" : c.cpa}</td>
                <td>{hidden ? "—" : c.roas}</td>
                <td className={!hidden && isNegativeDisplay(c.profit) ? "negative" : "positive"}>{hidden ? "—" : c.profit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
function MobileBulkActions({ ids, selected, setSelected, selecting, setSelecting, onDeleteMany, label }: { ids: string[]; selected: Set<string>; setSelected: React.Dispatch<React.SetStateAction<Set<string>>>; selecting: boolean; setSelecting: React.Dispatch<React.SetStateAction<boolean>>; onDeleteMany: (ids: string[]) => Promise<boolean>; label: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const selectedIds = ids.filter((id) => selected.has(id));
  return <>
    <div className="mobileBulkActions">
      <button type="button" className="ghost clickable" disabled={!ids.length && !selecting} onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}>{selecting ? "Cancelar seleção" : "Selecionar"}</button>
      {selecting && <button type="button" className="ghost clickable salesDeleteButton" disabled={!selectedIds.length} onClick={() => setConfirmOpen(true)}><Trash2 size={14} />Excluir selecionados{selectedIds.length ? ` (${selectedIds.length})` : ""}</button>}
    </div>
    {confirmOpen && <div className="salesConfirmBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setConfirmOpen(false); }}>
      <div className="salesConfirmDialog" role="alertdialog" aria-modal="true" aria-labelledby="bulk-confirm-title" aria-describedby="bulk-confirm-description">
        <h2 id="bulk-confirm-title">Confirmar exclusão</h2><p id="bulk-confirm-description">Excluir {selectedIds.length} {label} selecionados? Essa ação não pode ser desfeita.</p>
        <div className="salesConfirmActions"><button className="ghost clickable" disabled={deleting} onClick={() => setConfirmOpen(false)}>Cancelar</button><button className="salesDeleteButton" disabled={deleting} onClick={async () => { setDeleting(true); try { if (await onDeleteMany(selectedIds) !== false) { setSelected(new Set()); setSelecting(false); setConfirmOpen(false); } } finally { setDeleting(false); } }}><Trash2 size={16} />{deleting ? "Excluindo..." : "Excluir"}</button></div>
      </div>
    </div>}
  </>;
}
function Inventory({ products, onEdit, onDeleteMany, bulkEnabled = false, hidden = false, showShopee = false, salesPeriod = "Tempo todo" }: any) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const toggleSelected = (sku: string) => setSelected((previous) => { const next = new Set(previous); next.has(sku) ? next.delete(sku) : next.add(sku); return next; });
  const physical = products.reduce((s: number, p: any) => s + Number(p.physical || 0), 0);
  const available = products.reduce((s: number, p: any) => s + Number(p.available || 0), 0);
  const reserved = products.reduce((s: number, p: any) => s + Number(p.reserved || 0), 0);
  const total = (key: string) => products.reduce((sum: number, item: any) => sum + Number(item[key] || 0), 0);
  const totalSales = total("shopify") + total("ml") + total("amazon") + total("shopee") + total("manual");
  return (
    <article className="card tableCard">
      <div className="sectionHead">
        <div>
          <h2>Estoque central</h2>
          <p>Saldo físico atual · vendas: {salesPeriod}</p>
        </div>
        <div className="inventorySummary">
          <span>
            <b>{hidden ? "—" : physical}</b> físico
          </span>
          <span>
            <b>{hidden ? "—" : available}</b> disponível
          </span>
          <span>
            <b>{hidden ? "—" : reserved}</b> reservado
          </span>
        </div>
      </div>
      {bulkEnabled && <MobileBulkActions ids={products.map((item: any) => String(item.sku))} selected={selected} setSelected={setSelected} selecting={selecting} setSelecting={setSelecting} onDeleteMany={onDeleteMany} label="produtos" />}
      <div className="formula">Estoque de segurança só muda o status para Pouco; não prende disponibilidade.</div>
      <div className="tableWrap inventoryTableWrap">
        <table className="inventoryTable">
          <thead>
            <tr>
              {bulkEnabled && selecting && <th className="checkCol"><input type="checkbox" checked={products.length > 0 && products.every((item: any) => selected.has(String(item.sku)))} onChange={() => setSelected(products.every((item: any) => selected.has(String(item.sku))) ? new Set() : new Set(products.map((item: any) => String(item.sku))))} aria-label="Selecionar todos os produtos" /></th>}
              <th>Produto</th>
              <th>SKU</th>
              <th>Custo</th>
              <th>Preço</th>
              <th>Físico</th>
              <th>Disponível</th>
              <th>Vend. Shopify</th>
              <th>Vend. ML</th>
              <th>Vend. Amazon</th>
              {showShopee && <th>Vend. Shopee</th>}
              <th>Total vendas</th>
              <th>Envio FBA</th>
              <th>Envio Full</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((i: any) => (
              <tr key={i.sku} className={bulkEnabled && selected.has(String(i.sku)) ? "mobileSelectedRow" : undefined} onClick={() => { if (bulkEnabled && window.matchMedia("(max-width: 650px)").matches) { if (selecting) toggleSelected(String(i.sku)); else onEdit(i); } }}>
                {bulkEnabled && selecting && <td className="checkCol" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected.has(String(i.sku))} onChange={() => toggleSelected(String(i.sku))} aria-label={`Selecionar ${i.product}`} /></td>}
                <td>
                  <b>{i.product}</b>
                </td>
                <td>{i.sku}</td>
                <td>{hidden ? "—" : money(i.cost || 0)}</td>
                <td>{hidden ? "—" : money(i.price || 0)}</td>
                <td>{hidden ? "—" : i.physical}</td>
                <td>
                  <b>{hidden ? "—" : i.available}</b>
                </td>
                <td>{hidden ? "—" : i.shopify}</td>
                <td>{hidden ? "—" : i.ml}</td>
                <td>{hidden ? "—" : i.amazon}</td>
                {showShopee && <td>{hidden ? "—" : i.shopee}</td>}
                <td><b>{hidden ? "—" : Number(i.shopify || 0) + Number(i.ml || 0) + Number(i.amazon || 0) + Number(i.shopee || 0) + Number(i.manual || 0)}</b></td>
                <td>{hidden ? "—" : i.fbaQty}</td>
                <td>{hidden ? "—" : i.fullQty}</td>
                <td>
                  <span className={`status ${i.status === "Saudável" ? "ok" : "warn"}`}>{i.status}</span>
                </td>
                <td>
                  <button className="mini" onClick={(event) => { event.stopPropagation(); onEdit(i); }} disabled={hidden}>
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="inventoryTotalRow">{bulkEnabled && selecting && <td className="checkCol" />}<td><b>Total</b></td><td>—</td><td>—</td><td>—</td><td><b>{hidden ? "—" : physical}</b></td><td><b>{hidden ? "—" : available}</b></td><td>{hidden ? "—" : total("shopify")}</td><td>{hidden ? "—" : total("ml")}</td><td>{hidden ? "—" : total("amazon")}</td>{showShopee && <td>{hidden ? "—" : total("shopee")}</td>}<td><b>{hidden ? "—" : totalSales}</b></td><td>{hidden ? "—" : total("fbaQty")}</td><td>{hidden ? "—" : total("fullQty")}</td><td>—</td><td></td></tr></tfoot>
        </table>
      </div>
    </article>
  );
}
function Products({ products, inventory, onNew, onEdit, onDelete, onDeleteMany }: any) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const toggleSelected = (sku: string) => setSelected((previous) => { const next = new Set(previous); next.has(sku) ? next.delete(sku) : next.add(sku); return next; });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const rows = products.filter((p: any) => `${p.product} ${p.name} ${p.sku}`.toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visible = rows.slice((Math.min(page, pages) - 1) * pageSize, Math.min(page, pages) * pageSize);
  const stockFor = (sku: string) => inventory.find((item: any) => item.sku === sku);
  const editable = (p: any) => ({ ...p, physical: stockFor(p.sku)?.physical || 0, safety: p.safetyStock, cost: p.unitCost, price: p.salePrice });
  return (
    <article className="card tableCard">
      <div className="sectionHead">
        <div>
          <h2>Catálogo de produtos</h2>
          <p>{rows.length} produtos · SKUs, preços e disponibilidade</p>
        </div>
        <button className="primary" onClick={onNew}>
          <Plus size={14} />
          Novo produto
        </button>
      </div>
      <MobileBulkActions ids={visible.map((product: any) => String(product.sku))} selected={selected} setSelected={setSelected} selecting={selecting} setSelecting={setSelecting} onDeleteMany={onDeleteMany} label="produtos" />
      <div className="catalogToolbar">
        <label className="catalogSearch"><Search size={15} /><input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Pesquisar produto ou SKU..." /></label>
        <div className="catalogPageSize">Itens por página <AnchoredSelect value={String(pageSize)} onChange={(v) => { setPageSize(Number(v)); setPage(1); }} options={["10", "25", "50"]} compact /></div>
      </div>
      <div className="tableWrap">
        <table className="catalogTable">
          <thead><tr>{selecting && <th className="checkCol"><input type="checkbox" checked={visible.length > 0 && visible.every((item: any) => selected.has(String(item.sku)))} onChange={() => setSelected(visible.every((item: any) => selected.has(String(item.sku))) ? new Set() : new Set(visible.map((item: any) => String(item.sku))))} aria-label="Selecionar todos os produtos exibidos" /></th>}<th>SKU interno</th><th>Imagem</th><th>Produto</th><th>Variante</th><th>Preço</th><th>Custo</th><th>Físico</th><th>Disponível</th><th aria-label="Ações"></th></tr></thead>
          <tbody>{visible.map((p: any) => <tr key={p.sku} className={selected.has(String(p.sku)) ? "mobileSelectedRow" : undefined} onClick={() => { if (window.matchMedia("(max-width: 650px)").matches) { if (selecting) toggleSelected(String(p.sku)); else onEdit(editable(p)); } }}>
            {selecting && <td className="checkCol" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected.has(String(p.sku))} onChange={() => toggleSelected(String(p.sku))} aria-label={`Selecionar ${p.product}`} /></td>}<td><b>{p.sku}</b></td><td><span className="catalogImage"><PackageCheck size={18} /></span></td><td>{p.product}</td><td>{p.name}</td><td>{money(Number(p.salePrice || 0))}</td><td>{money(Number(p.unitCost || 0))}</td><td>{stockFor(p.sku)?.physical || 0}</td><td>{stockFor(p.sku)?.available || 0}</td>
            <td><div className="catalogRowActions"><button className="mini" title="Editar produto" aria-label={`Editar ${p.name}`} onClick={(event) => { event.stopPropagation(); onEdit(editable(p)); }}><Pencil size={15} /></button><button className="mini danger" title="Excluir produto" aria-label={`Excluir ${p.name}`} onClick={(event) => { event.stopPropagation(); onDelete(p); }}><Trash2 size={15} /></button></div></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!rows.length && <div className="catalogEmpty">Nenhum produto encontrado.</div>}
      <div className="catalogPagination"><span>Página {Math.min(page, pages)} de {pages}</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><button disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</button></div></div>
    </article>
  );
}
function Customers({ rows, onNew, onEdit, onDelete, onDeleteMany, onExport }: any) {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("Tempo todo");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(todayISO().slice(0, 7));
  const [draftRange, setDraftRange] = useState({ from: "", to: "" });
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [origin, setOrigin] = useState("");
  const [product, setProduct] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const origins = [...new Set(rows.flatMap((customer: any) => (customer.orderHistory || []).map((order: any) => String(order.channel))))].sort() as string[];
  const products = [...new Map<string, string>(rows.flatMap((customer: any) => (customer.orderHistory || []).flatMap((order: any) => order.items || [])).map((item: any) => [String(item.sku), String(item.name || item.sku)] as [string, string])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const dates = period === "Tempo todo" ? null : periodRange(period, { from, to });
  const filteredRows = rows.flatMap((customer: any) => {
    const matchingOrders = (customer.orderHistory || []).filter((order: any) => {
      const day = dateKey(order.date);
      return (!dates || (day >= dates.from && day <= dates.to)) && (!origin || order.channel === origin) && (!product || (order.items || []).some((item: any) => item.sku === product));
    });
    const text = `${customer.name || ""} ${customer.city || ""} ${customer.state || ""} ${customer.lastChannel || ""}`.toLocaleLowerCase("pt-BR");
    if ((dates || origin || product) && !matchingOrders.length) return [];
    if (search.trim() && !text.includes(search.trim().toLocaleLowerCase("pt-BR"))) return [];
    return [{ ...customer, orders: dates || origin || product ? matchingOrders.length : customer.orders, revenue: dates || origin || product ? matchingOrders.filter((order: any) => order.status === "PAID").reduce((total: number, order: any) => total + Number(order.grossAmount || 0), 0) : customer.revenue, lastChannel: dates || origin || product ? matchingOrders[0]?.channel : customer.lastChannel, lastOrderAt: dates || origin || product ? matchingOrders[0]?.date : customer.lastOrderAt }];
  });
  const selectedRows = filteredRows.filter((customer: any) => selected.has(customer.id));
  const allSelected = filteredRows.length > 0 && filteredRows.every((customer: any) => selected.has(customer.id));
  const exportRows = (selectedRows.length ? selectedRows : filteredRows).map((customer: any) => ({ data: customer.lastOrderAt ? fmtDate(customer.lastOrderAt) : "", nome: customer.name || "", cidade: customer.city || "", uf: customer.state || "", pedidos: customer.orders, receita: customer.revenue, ultimo_canal: customer.lastChannel || "" }));
  useEffect(() => { setSelected(new Set()); setExportOpen(false); }, [search, period, from, to, origin, product]);
  useEffect(() => {
    if (!exportOpen) return;
    const dismiss = (event: PointerEvent) => { if (!exportMenuRef.current?.contains(event.target as Node)) setExportOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [exportOpen]);
  const toggleSelected = (id: string) => setSelected((previous) => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const deleteSelected = async () => {
    if (!selectedRows.length || deleting) return;
    setDeleting(true);
    try { if (await onDeleteMany(selectedRows.map((customer: any) => customer.id)) !== false) { setSelected(new Set()); setConfirmDelete(false); } }
    finally { setDeleting(false); }
  };
  return (
    <div className={`salesPage ${selecting ? "mobileSelectionActive" : ""}`}>
      <div className="sectionHead salesPageHeader"><div className="rowActions">
        <button className="ghost clickable salesDeleteButton" disabled={!selectedRows.length} onClick={() => setConfirmDelete(true)}><Trash2 size={14} />Excluir selecionados</button>
        <div className="exportMenu" ref={exportMenuRef}>
          <button className="ghost clickable" disabled={!filteredRows.length} onClick={() => setExportOpen((open) => !open)}><Download size={14} /> Exportar</button>
          {exportOpen && <div className="exportOptions"><button onClick={() => { onExport(exportRows, "csv"); setExportOpen(false); }}>CSV</button><button onClick={() => { onExport(exportRows, "xml"); setExportOpen(false); }}>XML</button></div>}
        </div>
        <button className="primary" onClick={onNew}><Plus size={14} />Novo cliente</button>
      </div></div>
      <MobileBulkActions ids={filteredRows.map((customer: any) => customer.id)} selected={selected} setSelected={setSelected} selecting={selecting} setSelecting={setSelecting} onDeleteMany={onDeleteMany} label="clientes" />
      <section className="card salesSearchSection" aria-label="Busca e filtros de clientes">
      <div className="salesSearchRow">
        <label className="search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, cidade ou canal..." aria-label="Buscar clientes" /></label>
        <button type="button" className="mobileSalesFilterButton ghost" onClick={() => setFiltersOpen(true)}><Filter size={16} />Filtros</button>
      </div>
      {filtersOpen && <button type="button" className="mobileSalesFilterBackdrop" aria-label="Fechar filtros" onClick={() => setFiltersOpen(false)} />}
      <div className={`salesFilters ${filtersOpen ? "mobileFiltersOpen" : ""}`}>
        <div className="mobileSalesFilterHead"><b>Filtros</b><button type="button" className="mobileSalesFilterClose" aria-label="Fechar filtros" onClick={() => setFiltersOpen(false)}><X size={20} /></button></div>
        <div className="salesPeriodControl">
          <button type="button" className="salesPeriodTrigger" aria-expanded={periodOpen} onClick={() => { setPeriodOpen((open) => !open); setCalendarMonth((from || todayISO()).slice(0, 7)); setDraftRange(period === "Personalizado" ? { from, to } : { from: "", to: "" }); setSelectingEnd(false); }}><span>Período</span><b>{period}</b><ChevronDown size={15} /></button>
          {periodOpen && <div className="salesPeriodOptions">
            {periodOptions.map((option) => <button type="button" key={option} className={period === option ? "active" : ""} onClick={() => { setPeriod(option); setFrom(""); setTo(""); setPeriodOpen(false); }}>{option}</button>)}
            <div className="salesPeriodCalendar">
              <div className="calendarHeader"><button type="button" aria-label="Mês anterior" onClick={() => setCalendarMonth(shiftCalendarMonth(calendarMonth, -1))}>←</button><b>{calendarMonthTitle(calendarMonth)}</b><button type="button" aria-label="Próximo mês" onClick={() => setCalendarMonth(shiftCalendarMonth(calendarMonth, 1))}>→</button></div>
              <div className="calendarGrid">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => <span key={day}>{day}</span>)}{calendarDays(calendarMonth).map((day, index) => day ? <button key={day} type="button" className={`${day === draftRange.from || day === draftRange.to ? "selected" : ""} ${draftRange.from && draftRange.to && day > draftRange.from && day < draftRange.to ? "inRange" : ""}`} onClick={() => { if (!selectingEnd || (draftRange.from && day < draftRange.from)) { setDraftRange({ from: day, to: "" }); setSelectingEnd(true); } else { setDraftRange((range) => ({ ...range, to: day })); setSelectingEnd(false); } }}>{Number(day.slice(-2))}</button> : <span key={`blank-${index}`} />)}</div>
              <small>{draftRange.from ? `${formatDashboardDate(draftRange.from)} → ${draftRange.to ? formatDashboardDate(draftRange.to) : "selecione o fim"}` : "Selecione o início e o fim"}</small>
              <button type="button" className="primary" disabled={!draftRange.from || !draftRange.to} onClick={() => { setFrom(draftRange.from); setTo(draftRange.to); setPeriod("Personalizado"); setPeriodOpen(false); }}>Aplicar período</button>
            </div>
          </div>}
        </div>
        <div className="salesSelectField"><span>Origem</span><AnchoredSelect value={origin} onChange={setOrigin} options={[{ value: "", label: "Todas" }, ...origins.map((channel) => ({ value: channel, label: channel.replaceAll("_", " ") }))]} compact /></div>
        <div className="salesSelectField"><span>Produto</span><AnchoredSelect value={product} onChange={setProduct} options={[{ value: "", label: "Todos" }, ...products.map(([sku, name]) => ({ value: sku, label: name }))]} compact /></div>
        <button type="button" className="ghost" onClick={() => { setPeriod("Tempo todo"); setFrom(""); setTo(""); setPeriodOpen(false); setOrigin(""); setProduct(""); }}>Limpar</button>
        <button type="button" className="mobileSalesFilterApply primary" onClick={() => setFiltersOpen(false)}>Aplicar</button>
      </div>
      </section>
    <article className="card tableCard">
      <div className="sectionHead">
        <div>
          <h2>Lista de clientes</h2>
        </div>
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th className="checkCol" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(filteredRows.map((customer: any) => customer.id)))} aria-label="Selecionar todos os clientes exibidos" /></th>
              <th className="listDateCell">Data</th>
              <th>Nome</th>
              <th>Cidade</th>
              <th>UF</th>
              <th>Pedidos</th>
              <th>Receita</th>
              <th>Último canal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((c: any) => (
              <tr key={c.id} className={`clickrow ${selected.has(c.id) ? "mobileSelectedRow" : ""}`} onClick={() => { if (selecting && window.matchMedia("(max-width: 650px)").matches) toggleSelected(c.id); else onEdit(c); }}>
                <td className="checkCol" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelected(c.id)} aria-label={`Selecionar ${c.name || "cliente"}`} /></td>
                <td className="listDateCell">{c.lastOrderAt ? fmtDate(c.lastOrderAt) : "—"}</td>
                <td>
                  <b>{c.name || "Cliente sem nome"}</b>
                </td>
                <td>{c.city || "—"}</td>
                <td>{c.state || "—"}</td>
                <td>{c.orders}</td>
                <td>{money(c.revenue || 0)}</td>
                <td>{c.lastChannel || "—"}</td>
                <td>
                  <div className="rowActions">
                    <button
                      className="mini"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(c);
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="mini danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(c);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
      {confirmDelete && <div className="salesConfirmBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setConfirmDelete(false); }}>
        <div className="salesConfirmDialog" role="alertdialog" aria-modal="true" aria-labelledby="customers-confirm-title" aria-describedby="customers-confirm-description">
          <h2 id="customers-confirm-title">Confirmar exclusão</h2>
          <p id="customers-confirm-description">Excluir {selectedRows.length} clientes selecionados? Essa ação não pode ser desfeita.</p>
          <div className="salesConfirmActions"><button className="ghost clickable" disabled={deleting} onClick={() => setConfirmDelete(false)}>Cancelar</button><button className="salesDeleteButton" disabled={deleting} onClick={deleteSelected}><Trash2 size={16} />{deleting ? "Excluindo..." : "Excluir"}</button></div>
        </div>
      </div>}
    </div>
  );
}
function Sales({ q, setQ, rows, onNew, onOpen, onDelete, onDeleteMany, onExport }: any) {
  const [status, setStatus] = useState("PAID");
  const [source, setSource] = useState("Todas");
  const [product, setProduct] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [salesPeriod, setSalesPeriod] = useState("Tempo todo");
  const [salesPeriodOpen, setSalesPeriodOpen] = useState(false);
  const salesPeriodRef = useRef<HTMLDivElement>(null);
  const [salesDraftRange, setSalesDraftRange] = useState({ from: "", to: "" });
  const [salesCalendarMonth, setSalesCalendarMonth] = useState(todayISO().slice(0, 7));
  const [salesSelectingEnd, setSalesSelectingEnd] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!salesPeriodOpen && !exportOpen) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!salesPeriodRef.current?.contains(target)) setSalesPeriodOpen(false);
      if (!exportMenuRef.current?.contains(target)) setExportOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSalesPeriodOpen(false); setExportOpen(false); }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [salesPeriodOpen, exportOpen]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ kind: "single"; sale: any } | { kind: "many"; sales: any[] } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const statusClass = (status: string) => (status === "CANCELLED" || status === "CHARGEBACK" ? "danger" : status === "PAID" ? "ok" : "warn");
  const keyOf = (s: any) => String(s.raw?.id || s.id);
  const sources = useMemo(() => ["Todas", ...Array.from(new Set(rows.map((s: any) => s.source).filter(Boolean)))], [rows]);
  const products = useMemo(() => [...new Map<string, string>(rows.flatMap((sale: any) => sale.raw?.items || []).map((item: any) => [String(item.sku || item.name), String(item.name || item.sku)] as [string, string])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const filtered = useMemo(
    () =>
      rows.filter((s: any) => {
        const key = s.raw?.paidAt || s.raw?.createdAt;
        const day = key ? dateKey(key) : "";
        return (status === "Todos" || s.status === status) && (source === "Todas" || s.source === source) && (!product || (s.raw?.items || []).some((item: any) => String(item.sku || item.name) === product)) && (!from || day >= from) && (!to || day <= to);
      }),
    [rows, status, source, product, from, to],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const allPageSelected = pageRows.length > 0 && pageRows.every((s: any) => selected.has(keyOf(s)));
  const pageNumbers = paginationNumbers(safePage, totalPages);
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
    setExportOpen(false);
  }, [q, status, source, product, from, to, pageSize]);
  const selectedRows = filtered.filter((s: any) => selected.has(keyOf(s)));
  const exportRows = (selectedRows.length ? selectedRows : filtered).map(({ raw, ...rest }: any) => rest);
  const salesRevenue = filtered.reduce((total: number, sale: any) => sale.status === "PAID" ? total + Number(sale.raw?.grossAmount || 0) - Number(sale.raw?.discountAmount || 0) : total, 0);
  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileFiltersOpen(false); };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [mobileFiltersOpen]);
  useEffect(() => {
    if (!pendingDelete || deleting) return;
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPendingDelete(null); };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [pendingDelete, deleting]);
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageRows.forEach((s: any) => next.delete(keyOf(s)));
      else pageRows.forEach((s: any) => next.add(keyOf(s)));
      return next;
    });
  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      const result = pendingDelete.kind === "many" ? await onDeleteMany(pendingDelete.sales) : await onDelete(pendingDelete.sale);
      if (result !== false) {
        if (pendingDelete.kind === "many") setSelected(new Set());
        setPendingDelete(null);
      }
    } finally {
      setDeleting(false);
    }
  };
  return (
    <div className={`salesPage ${selecting ? "mobileSelectionActive" : ""}`}>
      <div className="sectionHead salesPageHeader">
        <div className="rowActions">
          <button className="ghost clickable salesDeleteButton" disabled={!selected.size} onClick={() => setPendingDelete({ kind: "many", sales: [...selectedRows] })}>
            <Trash2 size={14} />
            Excluir selecionados
          </button>
          <div className="exportMenu" ref={exportMenuRef}>
            <button className="ghost clickable" disabled={!filtered.length} onClick={() => setExportOpen((v) => !v)}>
              <Download size={14} /> Exportar
            </button>
            {exportOpen && !!filtered.length && (
              <div className="exportOptions">
                <button
                  onClick={() => {
                    onExport(exportRows, "csv");
                    setExportOpen(false);
                  }}
                >
                  CSV
                </button>
                <button
                  onClick={() => {
                    onExport(exportRows, "xml");
                    setExportOpen(false);
                  }}
                >
                  XML
                </button>
              </div>
            )}
          </div>
          <button className="primary" onClick={onNew}>
            <Plus size={14} />
            Venda manual
          </button>
        </div>
      </div>
      <MobileBulkActions ids={pageRows.map((sale: any) => keyOf(sale))} selected={selected} setSelected={setSelected} selecting={selecting} setSelecting={setSelecting} onDeleteMany={(ids) => onDeleteMany(pageRows.filter((sale: any) => ids.includes(keyOf(sale))))} label="pedidos" />
      <section className="card salesSearchSection" aria-label="Busca e filtros de vendas">
      <div className="salesSearchRow">
        <div className="search">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pedido, cliente, campanha ou canal..." />
        </div>
        <button className="mobileSalesFilterButton ghost" onClick={() => setMobileFiltersOpen(true)}><Filter size={16} />Filtros</button>
      </div>
      {mobileFiltersOpen && <button className="mobileSalesFilterBackdrop" aria-label="Fechar filtros" onClick={() => setMobileFiltersOpen(false)} />}
      <div className={`salesFilters ${mobileFiltersOpen ? "mobileFiltersOpen" : ""}`}>
        <div className="mobileSalesFilterHead"><b>Filtros</b><button className="mobileSalesFilterClose" aria-label="Fechar filtros" onClick={() => setMobileFiltersOpen(false)}><X size={20} /></button></div>
        <div className="salesSelectField"><Filter size={14} /><AnchoredSelect value={status} onChange={setStatus} options={["Todos", "PAID", "CANCELLED", "PENDING", "REFUNDED", "CHARGEBACK"]} compact /></div>
        <div className="salesPeriodControl" ref={salesPeriodRef}>
          <button type="button" className="salesPeriodTrigger" aria-expanded={salesPeriodOpen} onClick={() => { setSalesPeriodOpen((open) => !open); setSalesCalendarMonth((from || todayISO()).slice(0, 7)); setSalesDraftRange({ from: salesPeriod === "Personalizado" ? from : "", to: salesPeriod === "Personalizado" ? to : "" }); setSalesSelectingEnd(false); }}><span>Período</span><b>{salesPeriod}</b><ChevronDown size={15} /></button>
          {salesPeriodOpen && <div className="salesPeriodOptions">
            {periodOptions.map((option) => <button type="button" key={option} className={salesPeriod === option ? "active" : ""} onClick={() => { const dates = periodRange(option, { from: "", to: "" }); setSalesPeriod(option); setFrom(option === "Tempo todo" ? "" : dates.from); setTo(option === "Tempo todo" ? "" : dates.to); setSalesPeriodOpen(false); }}>{option}</button>)}
            <div className="salesPeriodCalendar">
              <div className="calendarHeader"><button type="button" aria-label="Mês anterior" onClick={() => setSalesCalendarMonth(shiftCalendarMonth(salesCalendarMonth, -1))}>←</button><b>{calendarMonthTitle(salesCalendarMonth)}</b><button type="button" aria-label="Próximo mês" onClick={() => setSalesCalendarMonth(shiftCalendarMonth(salesCalendarMonth, 1))}>→</button></div>
              <div className="calendarGrid">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => <span key={day}>{day}</span>)}{calendarDays(salesCalendarMonth).map((day, index) => day ? <button type="button" key={day} className={`${day === salesDraftRange.from || day === salesDraftRange.to ? "selected" : ""} ${salesDraftRange.from && salesDraftRange.to && day > salesDraftRange.from && day < salesDraftRange.to ? "inRange" : ""}`} onClick={() => { if (!salesSelectingEnd || (salesDraftRange.from && day < salesDraftRange.from)) { setSalesDraftRange({ from: day, to: "" }); setSalesSelectingEnd(true); } else { setSalesDraftRange((range) => ({ ...range, to: day })); setSalesSelectingEnd(false); } }}>{Number(day.slice(-2))}</button> : <span key={`blank-${index}`} />)}</div>
              <small>{salesDraftRange.from ? `${formatDashboardDate(salesDraftRange.from)} → ${salesDraftRange.to ? formatDashboardDate(salesDraftRange.to) : "selecione o fim"}` : "Selecione o início e o fim"}</small>
              <button type="button" className="primary" disabled={!salesDraftRange.from || !salesDraftRange.to} onClick={() => { setFrom(salesDraftRange.from); setTo(salesDraftRange.to); setSalesPeriod("Personalizado"); setSalesPeriodOpen(false); }}>Aplicar</button>
            </div>
          </div>}
        </div>
        <div className="salesSelectField"><span>Origem</span><AnchoredSelect value={source} onChange={setSource} options={sources.map(String)} compact /></div>
        <div className="salesSelectField"><span>Produto</span><AnchoredSelect value={product} onChange={setProduct} options={[{ value: "", label: "Todos" }, ...products.map(([sku, name]) => ({ value: sku, label: name }))]} compact /></div>
        <button
          className="ghost clickable"
          onClick={() => {
            setStatus("Todos");
            setSource("Todas");
            setProduct("");
            setFrom("");
            setTo("");
            setSalesPeriod("Tempo todo");
            setSalesPeriodOpen(false);
            setQ("");
          }}
        >
          Limpar
        </button>
        <button className="mobileSalesFilterApply primary" onClick={() => setMobileFiltersOpen(false)}>Aplicar</button>
      </div>
      </section>
      <section className="salesSummary" aria-label="Resumo das vendas">
        <div className="card"><span>Vendas encontradas</span><strong>{filtered.length.toLocaleString("pt-BR")}</strong></div>
        <div className="card"><span>Faturamento</span><strong className={salesRevenue < 0 ? "negative" : undefined}>{money(salesRevenue)}</strong></div>
      </section>
      <article className="card tableCard salesResultsSection">
      <div className="sectionHead"><h2>Pedidos consolidados</h2></div>
      <div className="salesStatusTabs" role="tablist" aria-label="Tipo de vendas">
        <button type="button" role="tab" aria-selected={status === "PAID"} className={status === "PAID" ? "active" : ""} onClick={() => setStatus("PAID")}>Aprovadas</button>
        <button type="button" role="tab" aria-selected={status !== "PAID"} className={status !== "PAID" ? "active" : ""} onClick={() => setStatus("Todos")}>Todas</button>
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th className="checkCol">
                <input type="checkbox" checked={allPageSelected} onChange={togglePage} aria-label="Selecionar página" />
              </th>
              <th className="listDateCell">Data</th>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Origem</th>
              <th>Voltagem</th>
              <th>Valor</th>
              <th>Taxa</th>
              <th>Frete</th>
              <th>Lucro vendas</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((s: any) => (
              <tr key={keyOf(s)} className={`clickrow ${selected.has(keyOf(s)) ? "mobileSelectedRow" : ""}`} onClick={() => { if (selecting && window.matchMedia("(max-width: 650px)").matches) toggleOne(keyOf(s)); else onOpen(s); }}>
                <td className="checkCol" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(keyOf(s))} onChange={() => toggleOne(keyOf(s))} aria-label={`Selecionar ${s.id}`} />
                </td>
                <td className="listDateCell">{s.date}</td>
                <td>
                  <b>{s.id}</b>
                </td>
                <td>{s.customer}</td>
                <td>{s.source}</td>
                <td>{s.voltage}</td>
                <td className={isNegativeDisplay(s.value) ? "negative" : undefined}>{s.value}</td>
                <td className={Number(s.fee || 0) !== 0 ? "negative" : undefined}>{money(Number(s.fee || 0) ? -Math.abs(Number(s.fee || 0)) : 0)}</td>
                <td className={Number(s.freight || 0) !== 0 ? "negative" : undefined}>{money(Number(s.freight || 0) ? -Math.abs(Number(s.freight || 0)) : 0)}</td>
                <td className={Number(s.profit || 0) < 0 || s.status === "CANCELLED" ? "negative" : s.status === "REFUNDED" ? "refundedProfit" : "positive"}>{money(s.profit || 0)}</td>
                <td>
                  <span className={`status ${statusClass(s.status)}`}>{s.status}</span>
                </td>
                <td>
                  <div className="rowActions">
                    <button
                      className="mini"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(s);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="mini danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete({ kind: "single", sale: s });
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span>
          Página {safePage} de {totalPages}
        </span>
        <div>
          <button className="ghost clickable pageArrow" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
            ‹
          </button>
          {pageNumbers.map((n: any, i: number) =>
            n === "…" ? (
              <span className="pageDots" key={`${n}-${i}`}>
                …
              </span>
            ) : (
              <button key={n} className={`ghost clickable pageNumber ${safePage === n ? "selected" : ""}`} onClick={() => setPage(n)}>
                {n}
              </button>
            ),
          )}
          <button className="ghost clickable pageArrow" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
            ›
          </button>
        </div>
      </div>
      </article>
      {pendingDelete && <div className="salesConfirmBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setPendingDelete(null); }}>
        <div className="salesConfirmDialog" role="alertdialog" aria-modal="true" aria-labelledby="sales-confirm-title" aria-describedby="sales-confirm-description">
          <h2 id="sales-confirm-title">Confirmar exclusão</h2>
          <p id="sales-confirm-description">{pendingDelete.kind === "many" ? `Excluir ${pendingDelete.sales.length} pedidos selecionados?` : `Excluir o pedido ${pendingDelete.sale.id}?`} Essa ação não pode ser desfeita.</p>
          <div className="salesConfirmActions"><button className="ghost clickable" disabled={deleting} onClick={() => setPendingDelete(null)}>Cancelar</button><button className="salesDeleteButton" disabled={deleting} onClick={confirmDelete}><Trash2 size={16} />{deleting ? "Excluindo..." : "Excluir"}</button></div>
        </div>
      </div>}
    </div>
  );
}
function AdThumbnail({ url, small = false, platform = "meta" }: { url?: string; small?: boolean; platform?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return <span className={`adThumbnail ${small ? "small" : ""}`}>{url && !failed ? <img src={url} alt="Miniatura do anúncio" loading="lazy" onError={() => setFailed(true)} /> : <img src={`/integration-logos/${platform.toLowerCase().replace(" ads", "")}-ads.webp`} alt="Miniatura indisponível" />}</span>;
}
function Campaigns({ campaigns: inputCampaigns, adsets: inputAdsets = [], ads: inputAds = [], onNew, onDelete, manager = false }: any) {
  const [selectedPlatform, setSelectedPlatform] = useState("Meta");
  const [level, setLevel] = useState("Campanhas");
  const [search, setSearch] = useState("");
  const [adPeriod, setAdPeriod] = useState("Hoje");
  const [adRange, setAdRange] = useState({ from: "", to: "" });
  const [draftAdRange, setDraftAdRange] = useState({ from: "", to: "" });
  const [adCalendarMonth, setAdCalendarMonth] = useState(() => todayISO().slice(0, 7));
  const [adSelectingEnd, setAdSelectingEnd] = useState(false);
  const [adPeriodOpen, setAdPeriodOpen] = useState(false);
  const adPeriodRef = useRef<HTMLDivElement>(null);
  const [scopedData, setScopedData] = useState<{ campaigns: any[]; adsets: any[]; ads: any[] } | null>(null);
  const [scopedError, setScopedError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedCampaignKeys, setSelectedCampaignKeys] = useState<string[]>([]);
  const [selectedAdsetKeys, setSelectedAdsetKeys] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "selected">("all");
  const [metaMetrics, setMetaMetrics] = useState<any>(null);
  const [metricsError, setMetricsError] = useState("");
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const selectedDates = adPeriod === "Tempo todo" ? null : periodRange(adPeriod, adRange);
  const dateQuery = selectedDates ? `&from=${encodeURIComponent(selectedDates.from)}&to=${encodeURIComponent(selectedDates.to)}` : "";
  const dateKey = `${adPeriod}:${selectedDates?.from || ""}:${selectedDates?.to || ""}`;
  const campaigns = manager ? scopedData?.campaigns || [] : inputCampaigns;
  const adsets = manager ? scopedData?.adsets || [] : inputAdsets;
  const ads = manager ? scopedData?.ads || [] : inputAds;
  useEffect(() => {
    if (!adPeriodOpen) return;
    const dismiss = (event: PointerEvent) => { if (!adPeriodRef.current?.contains(event.target as Node)) setAdPeriodOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setAdPeriodOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [adPeriodOpen]);
  useEffect(() => {
    if (!manager) return;
    let active = true;
    setScopedData(null);
    setScopedError("");
    setMetaMetrics(null);
    setMetricsError("");
    setSelectedIds([]);
    setSelectedCampaignKeys([]);
    setSelectedAdsetKeys([]);
    apiJson(`/api/campaigns?hierarchy=1${dateQuery}`).then((data) => {
      if (active) setScopedData({ campaigns: formatCampaigns(data.campaigns || [], "campaign"), adsets: formatCampaigns(data.adsets || [], "adset"), ads: formatCampaigns(data.ads || [], "ad") });
    }).catch((error) => { if (active) setScopedError(error.message || "Falha ao carregar campanhas"); });
    apiJson(`/api/campaigns/metrics?${dateQuery.slice(1)}`).then((data) => { if (active) setMetaMetrics(data.metrics); }).catch((error) => { if (active) setMetricsError(error.message || "Métricas Meta indisponíveis"); });
    return () => { active = false; };
  }, [manager, dateKey, inputCampaigns]);
  useEffect(() => {
    if (!manager) return;
    try { setColumnWidths(JSON.parse(localStorage.getItem("ironair-ads-column-widths-v1") || "{}")); } catch { /* ignore invalid saved layout */ }
  }, [manager]);
  useEffect(() => {
    if (!manager || level !== "Anúncios" || selectedPlatform !== "Meta") return;
    let active = true;
    apiJson("/api/campaigns/thumbnails").then((data) => { if (active) setThumbnails(data.thumbnails || {}); }).catch(() => {});
    return () => { active = false; };
  }, [manager, level, selectedPlatform]);
  const platforms = ["Meta", "Google", "TikTok"];
  const levels = ["Contas", "Campanhas", "Conjuntos", "Anúncios"];
  const campaignKey = (c: any) => [c.platform, c.accountId, c.campaignId].join(":");
  const adsetKey = (c: any) => [c.platform, c.accountId, c.campaignId, c.adsetId].join(":");
  const platformRows = campaigns.filter((c: any) => String(c.platform).toLowerCase().includes(selectedPlatform.toLowerCase()));
  const accountRows = Array.from(new Map(platformRows.map((c: any) => [c.accountId, c.accountId])).values()).filter(Boolean).map((accountId: any) => {
    const rows = platformRows.filter((c: any) => c.accountId === accountId);
    return { campaignId: accountId, accountId, name: accountId === "manual" ? "Campanhas manuais" : accountId, status: rows.some((c: any) => c.status === "ACTIVE") ? "ACTIVE" : null, spendValue: rows.reduce((sum: number, c: any) => sum + c.spendValue, 0), recentSpend: rows.reduce((sum: number, c: any) => sum + c.recentSpend, 0), revenueValue: rows.reduce((sum: number, c: any) => sum + c.revenueValue, 0), sales: rows.reduce((sum: number, c: any) => sum + c.sales, 0), clicks: rows.reduce((sum: number, c: any) => sum + c.clicks, 0), impressions: rows.reduce((sum: number, c: any) => sum + c.impressions, 0), children: rows.length };
  });
  const levelRows = level === "Conjuntos" ? adsets : level === "Anúncios" ? ads : campaigns;
  const visibleRows = (manager ? level === "Contas" ? accountRows : level === "Campanhas" ? platformRows : levelRows.filter((c: any) => String(c.platform).toLowerCase().includes(selectedPlatform.toLowerCase())) : campaigns).filter((c: any) => (!manager || statusFilter === "all" || statusFilter === "active" && c.status === "ACTIVE" || statusFilter === "selected" && selectedIds.includes([level, c.platform || selectedPlatform, c.accountId, c.campaignId, c.adsetId, c.adId].join(":"))) && (level !== "Conjuntos" && level !== "Anúncios" || !selectedCampaignKeys.length || selectedCampaignKeys.includes(campaignKey(c))) && (level !== "Anúncios" || !selectedAdsetKeys.length || selectedAdsetKeys.includes(adsetKey(c))) && `${c.name} ${c.accountId || ""} ${c.campaignName || ""} ${c.campaignId || ""} ${c.adsetName || ""} ${c.adsetId || ""}`.toLowerCase().includes(search.toLowerCase()));
  const rowIdFor = (c: any, rowLevel: string) => [rowLevel, c.platform || selectedPlatform, c.accountId, c.campaignId, c.adsetId, c.adId].join(":");
  const rowId = (c: any) => rowIdFor(c, level);
  const updateSelection = (nextIds: string[]) => {
    setSelectedIds(nextIds);
    if (level === "Campanhas") {
      setSelectedCampaignKeys(platformRows.filter((c: any) => nextIds.includes(rowId(c))).map(campaignKey));
      setSelectedAdsetKeys([]);
    } else if (level === "Conjuntos") {
      setSelectedAdsetKeys(adsets.filter((c: any) => nextIds.includes(rowId(c))).map(adsetKey));
    }
  };
  const changeLevel = (nextLevel: string) => {
    setLevel(nextLevel);
    setStatusFilter("all");
    setSearch("");
    setSelectedIds(nextLevel === "Campanhas" ? platformRows.filter((c: any) => selectedCampaignKeys.includes(campaignKey(c))).map((c: any) => rowIdFor(c, nextLevel)) : nextLevel === "Conjuntos" ? adsets.filter((c: any) => selectedAdsetKeys.includes(adsetKey(c))).map((c: any) => rowIdFor(c, nextLevel)) : []);
  };
  const visibleIds = visibleRows.map(rowId);
  const visibleCountLabel = level === "Contas" && manager ? ["conta", "contas"] : level === "Conjuntos" && manager ? ["conjunto", "conjuntos"] : level === "Anúncios" && manager ? ["anúncio", "anúncios"] : ["campanha", "campanhas"];
  const selectedVisible = visibleIds.filter((id: string) => selectedIds.includes(id));
  const showActions = visibleRows.some((c: any) => c.manual);
  const totalSpend = platformRows.reduce((sum: number, c: any) => sum + c.spendValue, 0);
  const totalRevenue = platformRows.reduce((sum: number, c: any) => sum + c.revenueValue, 0);
  const metaPurchaseRevenue = platformRows.reduce((sum: number, c: any) => sum + Number(metaMetrics?.campaigns?.[c.campaignId]?.purchaseValue || 0), 0);
  const summaryRevenue = selectedPlatform === "Meta" ? metaPurchaseRevenue : totalRevenue;
  const summaryReady = Boolean(scopedData && (selectedPlatform !== "Meta" || metaMetrics));
  const statusLabels: Record<string, string> = { ACTIVE: "Ativa", PAUSED: "Pausada", CAMPAIGN_PAUSED: "Campanha pausada", ADSET_PAUSED: "Conjunto pausado", DISAPPROVED: "Reprovado", PENDING_REVIEW: "Em análise", WITH_ISSUES: "Com problemas", IN_PROCESS: "Processando", ARCHIVED: "Arquivada" };
  const metric = (c: any) => selectedPlatform === "Meta" ? metaMetrics?.[level === "Contas" ? "accounts" : level === "Conjuntos" ? "adsets" : level === "Anúncios" ? "ads" : "campaigns"]?.[level === "Contas" ? c.accountId : level === "Conjuntos" ? c.adsetId : level === "Anúncios" ? c.adId : c.campaignId] : undefined;
  const count = (value: number | undefined) => value == null ? "—" : value.toLocaleString("pt-BR");
  const amount = (value: number | undefined) => value == null ? "—" : money(value);
  const percent = (value: number | undefined) => value == null ? "—" : `${value.toFixed(2)}%`;
  const ratio = (value: number | undefined) => value == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  const sumRows = (key: string) => visibleRows.reduce((sum: number, row: any) => sum + Number(row[key] || 0), 0);
  const sumMeta = (key: string) => visibleRows.reduce((sum: number, row: any) => sum + Number(metric(row)?.[key] || 0), 0);
  const hasMeta = visibleRows.some((row: any) => Boolean(metric(row)));
  const totalCell = (key: string) => {
    const spend = sumRows("spendValue");
    const impressions = sumRows("impressions");
    const clicks = sumRows("clicks");
    const linkClicks = sumMeta("linkClicks");
    const purchases = sumMeta("purchases");
    const sales = sumRows("sales");
    switch (key) {
      case "name": return `Resultados de ${visibleRows.length} ${visibleCountLabel[visibleRows.length === 1 ? 0 : 1]}`;
      case "related": return level === "Contas" ? count(sumRows("children")) : "";
      case "spend": return money(spend);
      case "impressions": return count(impressions);
      case "clicks": return count(clicks);
      case "cpm": return impressions ? money(spend / impressions * 1000) : "—";
      case "ctr": return impressions ? percent(clicks / impressions * 100) : "—";
      case "cpc": return clicks ? money(spend / clicks) : "—";
      case "linkClicks": return hasMeta ? count(linkClicks) : "—";
      case "linkCtr": return hasMeta && impressions ? percent(linkClicks / impressions * 100) : "—";
      case "linkCpc": return hasMeta && linkClicks ? money(spend / linkClicks) : "—";
      case "landingViews": return hasMeta ? count(sumMeta("landingViews")) : "—";
      case "checkouts": return hasMeta ? count(sumMeta("checkouts")) : "—";
      case "checkoutValue": return hasMeta ? money(sumMeta("checkoutValue")) : "—";
      case "purchases": return hasMeta ? count(purchases) : "—";
      case "purchaseValue": return hasMeta ? money(sumMeta("purchaseValue")) : "—";
      case "costPerPurchase": return hasMeta && purchases ? money(spend / purchases) : "—";
      case "purchaseRoas": return hasMeta && spend ? ratio(sumMeta("purchaseValue") / spend) : "—";
      case "erpSales": return count(sales);
      case "erpRevenue": return money(sumRows("revenueValue"));
      case "erpCpa": return sales ? money(spend / sales) : "—";
      case "erpRoas": return spend ? ratio(sumRows("revenueValue") / spend) : "—";
      default: return "";
    }
  };
  const metricColumns = [
    { key: "select", title: "", width: 38, render: (c: any) => <input type="checkbox" aria-label={`Selecionar ${c.name}`} checked={selectedIds.includes(rowId(c))} onChange={(event) => updateSelection(event.target.checked ? [...selectedIds, rowId(c)] : selectedIds.filter((id) => id !== rowId(c)))} /> },
    { key: "name", title: level === "Contas" ? "Conta de anúncios" : level === "Conjuntos" ? "Conjunto de anúncios" : level === "Anúncios" ? "Anúncio" : "Campanha", width: 290, render: (c: any) => level !== "Anúncios" ? <button className="adAccountLink" title={c.name} onClick={() => { if (level === "Campanhas") { setSelectedCampaignKeys([campaignKey(c)]); setSelectedAdsetKeys([]); } else if (level === "Conjuntos") setSelectedAdsetKeys([adsetKey(c)]); changeLevel(level === "Contas" ? "Campanhas" : level === "Campanhas" ? "Conjuntos" : "Anúncios"); setSelectedIds([]); if (level === "Contas") setSearch(c.accountId); }}>{c.name}</button> : <span className="adNameWithThumb"><AdThumbnail url={thumbnails[c.adId]} small platform={c.platform} /><b title={c.name}>{c.name}</b></span> },
    { key: "related", title: level === "Contas" ? "Campanhas" : level === "Anúncios" ? "Conjunto" : level === "Conjuntos" ? "Campanha" : "Conta", width: 185, render: (c: any) => level === "Contas" ? c.children : level === "Anúncios" ? c.adsetName || c.adsetId : level === "Conjuntos" ? c.campaignName : c.accountId },
    { key: "status", title: "Veiculação", width: 160, render: (c: any) => <span className={`adDelivery ${c.status === "ACTIVE" || (!c.status && c.recentSpend > 0) ? "active" : ""}`} title={c.status ? "Status informado pela plataforma" : "Gasto registrado nos últimos 7 dias"}>{c.status ? statusLabels[c.status] || c.status : c.recentSpend > 0 ? "Com gasto (7d)" : "Sem gasto (7d)"}</span> },
    { key: "spend", title: "Valor gasto", width: 130, render: (c: any) => money(c.spendValue) },
    { key: "impressions", title: "Impressões", width: 120, render: (c: any) => count(c.impressions) },
    { key: "reach", title: "Alcance", width: 115, render: (c: any) => count(metric(c)?.reach) },
    { key: "frequency", title: "Frequência", width: 115, render: (c: any) => metric(c)?.frequency == null ? "—" : Number(metric(c).frequency).toFixed(2) },
    { key: "cpm", title: "CPM", width: 120, render: (c: any) => c.impressions ? money(c.spendValue / c.impressions * 1000) : "—" },
    { key: "clicks", title: "Cliques (todos)", width: 130, render: (c: any) => count(c.clicks) },
    { key: "ctr", title: "CTR (todos)", width: 120, render: (c: any) => c.impressions ? percent(c.clicks / c.impressions * 100) : "—" },
    { key: "cpc", title: "CPC (todos)", width: 120, render: (c: any) => c.clicks ? money(c.spendValue / c.clicks) : "—" },
    { key: "linkClicks", title: "Cliques no link", width: 135, render: (c: any) => count(metric(c)?.linkClicks) },
    { key: "linkCtr", title: "CTR (link)", width: 120, render: (c: any) => metric(c) && c.impressions ? percent(metric(c).linkClicks / c.impressions * 100) : "—" },
    { key: "linkCpc", title: "CPC (link)", width: 120, render: (c: any) => metric(c)?.linkClicks ? money(c.spendValue / metric(c).linkClicks) : "—" },
    { key: "landingViews", title: "Visualizações da página", width: 170, render: (c: any) => count(metric(c)?.landingViews) },
    { key: "checkouts", title: "Finalizações de compra", width: 175, render: (c: any) => count(metric(c)?.checkouts) },
    { key: "checkoutValue", title: "Valor de finalizações", width: 170, render: (c: any) => amount(metric(c)?.checkoutValue) },
    { key: "purchases", title: "Compras Meta", width: 135, render: (c: any) => count(metric(c)?.purchases) },
    { key: "purchaseValue", title: "Valor de compras Meta", width: 175, render: (c: any) => amount(metric(c)?.purchaseValue) },
    { key: "costPerPurchase", title: "Custo por compra Meta", width: 175, render: (c: any) => metric(c)?.purchases ? money(c.spendValue / metric(c).purchases) : "—" },
    { key: "purchaseRoas", title: "ROAS Meta", width: 125, render: (c: any) => metric(c) && c.spendValue ? ratio(metric(c).purchaseValue / c.spendValue) : "—" },
    { key: "erpSales", title: "Vendas ERP", width: 115, render: (c: any) => count(c.sales) },
    { key: "erpRevenue", title: "Receita ERP", width: 130, render: (c: any) => money(c.revenueValue) },
    { key: "erpCpa", title: "CPA ERP", width: 115, render: (c: any) => c.sales ? money(c.spendValue / c.sales) : "—" },
    { key: "erpRoas", title: "ROAS ERP", width: 115, render: (c: any) => c.spendValue ? ratio(c.revenueValue / c.spendValue) : "—" },
    ...(showActions ? [{ key: "actions", title: "", width: 60, render: (c: any) => c.manual ? <button className="mini danger" aria-label={`Excluir ${c.name}`} onClick={() => onDelete(c)}><Trash2 size={14} /></button> : null }] : []),
  ];
  const fullWidth = metricColumns.reduce((total, col) => total + (columnWidths[col.key] || col.width), 0);
  const beginResize = (event: React.PointerEvent<HTMLSpanElement>, key: string, width: number) => {
    event.preventDefault(); event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[key] || width;
    const move = (next: PointerEvent) => setColumnWidths((previous) => ({ ...previous, [key]: Math.max(key === "name" ? 145 : 72, startWidth + next.clientX - startX) }));
    const end = (next: PointerEvent) => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); setColumnWidths((previous) => { const updated = { ...previous, [key]: Math.max(key === "name" ? 145 : 72, startWidth + next.clientX - startX) }; localStorage.setItem("ironair-ads-column-widths-v1", JSON.stringify(updated)); return updated; }); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end, { once: true });
  };
  return (
    <article className={`card tableCard ${manager ? "adManager" : ""}`}>
      <div className="sectionHead">
        <div>
          <h2>{manager ? "Gerenciador de anúncios" : "Campanhas"}</h2>
          <p>{manager ? "Contas, campanhas, conjuntos e anúncios por plataforma" : "Investimento, vendas e retorno por campanha"}</p>
        </div>
        <div className="rowActions">
          <button className="primary" onClick={onNew}>
            <Plus size={14} />
            Campanha manual
          </button>
        </div>
      </div>
      {manager && <>
        <div className="adPlatformTabs" role="tablist" aria-label="Plataforma de anúncios">
          {platforms.map((name) => <button key={name} role="tab" aria-selected={selectedPlatform === name} className={selectedPlatform === name ? "active" : ""} onClick={() => { setSelectedPlatform(name); setLevel("Campanhas"); setSearch(""); setSelectedIds([]); setSelectedCampaignKeys([]); setSelectedAdsetKeys([]); }}><span className="adPlatformIcon"><img src={`/integration-logos/${name.toLowerCase()}-ads.webp`} alt="" /></span>{name} Ads<span className="adPlatformCount">{campaigns.filter((c: any) => String(c.platform).toLowerCase().includes(name.toLowerCase())).length}</span></button>)}
        </div>
        <div className="adManagerMetrics"><div><small>Investimento</small><strong>{scopedData ? money(totalSpend) : "—"}</strong></div><div><small>{selectedPlatform === "Meta" ? "Valor de compras Meta" : "Receita atribuída"}</small><strong>{summaryReady ? money(summaryRevenue) : "—"}</strong></div><div><small>{selectedPlatform === "Meta" ? "ROAS Meta" : "ROAS"}</small><strong>{summaryReady && totalSpend ? ratio(summaryRevenue / totalSpend) : "—"}</strong></div><div><small>Campanhas</small><strong>{scopedData ? platformRows.length : "—"}</strong></div></div>
        <div className="adLevelBar"><div className="adLevelTabs" role="tablist" aria-label="Nível de anúncios">{levels.map((name) => <button key={name} role="tab" aria-selected={level === name} className={level === name ? "active" : ""} onClick={() => changeLevel(name)}>{name}{name === "Campanhas" && selectedCampaignKeys.length > 0 && <span className="adPlatformCount">{selectedCampaignKeys.length}</span>}{name === "Conjuntos" && selectedAdsetKeys.length > 0 && <span className="adPlatformCount">{selectedAdsetKeys.length}</span>}</button>)}</div>
          <div className="adDateFilter" ref={adPeriodRef}>
            <button type="button" className="adDateTrigger" aria-label="Filtrar campanhas por data" aria-expanded={adPeriodOpen} onClick={() => { setDraftAdRange(adPeriod === "Personalizado" ? adRange : { from: "", to: "" }); setAdCalendarMonth((selectedDates?.from || todayISO()).slice(0, 7)); setAdSelectingEnd(false); setAdPeriodOpen((open) => !open); }}><CalendarDays size={15} /><span>{adPeriod === "Tempo todo" ? "Tempo todo" : `${adPeriod}: ${formatDashboardDate(selectedDates!.from)} a ${formatDashboardDate(selectedDates!.to)}`}</span><ChevronDown size={14} /></button>
            {adPeriodOpen && <div className="adDatePopover"><div className="adDatePresets">{periodOptions.map((option) => <button type="button" key={option} className={adPeriod === option ? "active" : ""} onClick={() => { setAdPeriod(option); setAdPeriodOpen(false); }}>{option}</button>)}</div><div className="adDateCalendar"><div className="calendarHeader"><button type="button" aria-label="Mês anterior" onClick={() => setAdCalendarMonth(shiftCalendarMonth(adCalendarMonth, -1))}>←</button><b>{calendarMonthTitle(adCalendarMonth)}</b><button type="button" aria-label="Próximo mês" onClick={() => setAdCalendarMonth(shiftCalendarMonth(adCalendarMonth, 1))}>→</button></div><div className="calendarGrid">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => <span key={day}>{day}</span>)}{calendarDays(adCalendarMonth).map((day, index) => day ? <button type="button" key={day} className={`${day === draftAdRange.from || day === draftAdRange.to ? "selected" : ""} ${draftAdRange.from && draftAdRange.to && day > draftAdRange.from && day < draftAdRange.to ? "inRange" : ""}`} onClick={() => { if (!adSelectingEnd || (draftAdRange.from && day < draftAdRange.from)) { setDraftAdRange({ from: day, to: "" }); setAdSelectingEnd(true); } else { setDraftAdRange((range) => ({ ...range, to: day })); setAdSelectingEnd(false); } }}>{Number(day.slice(-2))}</button> : <span key={`blank-${index}`} />)}</div><small>{draftAdRange.from ? `${formatDashboardDate(draftAdRange.from)} → ${draftAdRange.to ? formatDashboardDate(draftAdRange.to) : "selecione o fim"}` : "Selecione o início e o fim"}</small><button type="button" className="primary" disabled={!draftAdRange.from || !draftAdRange.to} onClick={() => { setAdRange(draftAdRange); setAdPeriod("Personalizado"); setAdPeriodOpen(false); }}>Aplicar período</button></div></div>}
          </div>
        </div>
      </>}
      <div className="adManagerToolbar"><div className="adToolbarFilters"><label className="adManagerSearch"><Search size={15} /><input aria-label="Buscar no gerenciador" placeholder={level === "Contas" ? "Buscar conta" : `Buscar ${level.toLowerCase()}`} value={search} onChange={(event) => setSearch(event.target.value)} /></label>{manager && <div className="adStatusFilter" role="group" aria-label="Filtrar linhas"><button type="button" className={statusFilter === "all" ? "active" : ""} aria-pressed={statusFilter === "all"} onClick={() => setStatusFilter("all")}>Todos</button><button type="button" className={statusFilter === "active" ? "active" : ""} aria-pressed={statusFilter === "active"} onClick={() => setStatusFilter("active")}>Ativos</button><button type="button" className={statusFilter === "selected" ? "active" : ""} aria-pressed={statusFilter === "selected"} onClick={() => setStatusFilter("selected")}>Selecionados</button></div>}</div><div className="adSelectionInfo">{manager && selectedIds.length > 0 && <><b>{selectedIds.length} selecionados</b><button type="button" onClick={() => updateSelection([])}>Limpar</button></>}{manager && (level === "Conjuntos" || level === "Anúncios") && selectedCampaignKeys.length > 0 && <button type="button" onClick={() => { setSelectedCampaignKeys([]); setSelectedAdsetKeys([]); setSelectedIds([]); }}>Limpar campanhas</button>}{manager && level === "Anúncios" && selectedAdsetKeys.length > 0 && <button type="button" onClick={() => { setSelectedAdsetKeys([]); setSelectedIds([]); }}>Limpar conjuntos</button>}<span>{visibleRows.length} {visibleCountLabel[visibleRows.length === 1 ? 0 : 1]}</span></div></div>
      {manager && <>
        <div className="adMetricsNote">{metricsError ? `Métricas da Meta indisponíveis: ${metricsError}` : !metaMetrics && selectedPlatform === "Meta" ? "Carregando métricas detalhadas da Meta…" : "Métricas da Meta e atribuições do ERP exibidas em colunas separadas."} Arraste a borda do cabeçalho para ajustar a coluna.</div>
        <div className="tableWrap adWideTable">
          <table style={{ width: fullWidth }}>
            <colgroup>{metricColumns.map((col) => <col key={col.key} style={{ width: columnWidths[col.key] || col.width }} />)}</colgroup>
            <thead><tr>{metricColumns.map((col) => <th key={col.key} className={col.key === "select" ? "adSelectCell" : col.key === "name" ? "adStickyName" : ""} title={col.title}>{col.key === "select" ? <input type="checkbox" aria-label="Selecionar todos os itens visíveis" checked={visibleIds.length > 0 && selectedVisible.length === visibleIds.length} onChange={(event) => updateSelection(event.target.checked ? [...new Set([...selectedIds, ...visibleIds])] : selectedIds.filter((id) => !visibleIds.includes(id)))} /> : col.title}{col.key !== "select" && <span className="adResizeHandle" role="separator" aria-label={`Ajustar largura: ${col.title}`} onPointerDown={(event) => beginResize(event, col.key, col.width)} />}</th>)}</tr></thead>
            <tbody>{visibleRows.map((c: any) => <tr key={rowId(c)} className={selectedIds.includes(rowId(c)) ? "adRowSelected" : ""}>{metricColumns.map((col) => <td key={col.key} className={col.key === "select" ? "adSelectCell" : col.key === "name" ? "adStickyName" : ""} title={typeof col.render(c) === "string" ? col.render(c) : undefined}>{col.render(c)}</td>)}</tr>)}
              {!visibleRows.length && <tr><td className="adManagerEmpty" colSpan={metricColumns.length}>{scopedError || (!scopedData ? "Carregando dados do período…" : statusFilter === "selected" && !selectedIds.length ? "Selecione itens na aba Todos para vê-los aqui." : search ? "Nenhum resultado para esta busca." : `Nenhum dado de ${level.toLowerCase()} disponível para ${selectedPlatform} Ads.`)}</td></tr>}
            </tbody>
            {visibleRows.length > 0 && <tfoot><tr className="adTotalsRow">{metricColumns.map((col) => <td key={col.key} className={col.key === "select" ? "adSelectCell" : col.key === "name" ? "adStickyName" : ""}>{totalCell(col.key)}</td>)}</tr></tfoot>}
          </table>
        </div>
      </>}
      {!manager && <div className="tableWrap">
        <table>
          <thead>
            <tr>
              {manager && <th className="adSelectCell"><input type="checkbox" aria-label="Selecionar todos os itens visíveis" checked={visibleIds.length > 0 && selectedVisible.length === visibleIds.length} onChange={(event) => setSelectedIds(event.target.checked ? [...new Set([...selectedIds, ...visibleIds])] : selectedIds.filter((id) => !visibleIds.includes(id)))} /></th>}
              <th>{manager ? level === "Contas" ? "Conta de anúncios" : level === "Conjuntos" ? "Conjunto de anúncios" : level === "Anúncios" ? "Anúncio" : "Campanha" : "Campanha"}</th>
              {!manager && <th>Plataforma</th>}
              {manager && <th>{level === "Contas" ? "Campanhas" : level === "Anúncios" ? "Conjunto" : level === "Conjuntos" ? "Campanha" : "Conta"}</th>}
              {manager && <th>Status</th>}
              {manager && <th>Impressões</th>}
              {manager && <th>Cliques</th>}
              {manager && <th>CTR</th>}
              {manager && <th>CPC</th>}
              {manager && <th>CPM</th>}
              <th>Investimento</th>
              <th>Vendas</th>
              <th>Receita</th>
              <th>CPA</th>
              <th>ROAS</th>
              {showActions && <th></th>}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((c: any) => (
              <tr key={rowId(c)} className={manager && selectedIds.includes(rowId(c)) ? "adRowSelected" : ""}>
                {manager && <td className="adSelectCell"><input type="checkbox" aria-label={`Selecionar ${c.name}`} checked={selectedIds.includes(rowId(c))} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, rowId(c)] : selectedIds.filter((id) => id !== rowId(c)))} /></td>}
                <td>
                  {manager && level !== "Anúncios" ? <button className="adAccountLink" onClick={() => { setSearch(level === "Contas" ? c.accountId : level === "Campanhas" ? c.campaignId : c.adsetId); setLevel(level === "Contas" ? "Campanhas" : level === "Campanhas" ? "Conjuntos" : "Anúncios"); setSelectedIds([]); }}>{c.name}</button> : <b>{c.name}</b>}
                </td>
                {!manager && <td>{c.platform}</td>}
                {manager && <td>{level === "Contas" ? c.children : level === "Anúncios" ? c.adsetName || c.adsetId : level === "Conjuntos" ? c.campaignName : c.accountId}</td>}
                {manager && <td><span className={`adDelivery ${c.status === "ACTIVE" || (!c.status && c.recentSpend > 0) ? "active" : ""}`} title={c.status ? "Status informado pela plataforma" : "Gasto registrado nos últimos 7 dias"}>{c.status ? statusLabels[c.status] || c.status : c.recentSpend > 0 ? "Com gasto (7d)" : "Sem gasto (7d)"}</span></td>}
                {manager && <td>{Number(c.impressions || 0).toLocaleString("pt-BR")}</td>}
                {manager && <td>{Number(c.clicks || 0).toLocaleString("pt-BR")}</td>}
                {manager && <td>{c.impressions ? `${((c.clicks / c.impressions) * 100).toFixed(2)}%` : "—"}</td>}
                {manager && <td>{c.clicks ? money(c.spendValue / c.clicks) : "—"}</td>}
                {manager && <td>{c.impressions ? money((c.spendValue / c.impressions) * 1000) : "—"}</td>}
                <td>{money(c.spendValue)}</td>
                <td>{c.sales}</td>
                <td>{money(c.revenueValue)}</td>
                <td>{c.sales ? money(c.spendValue / c.sales) : "—"}</td>
                <td>{c.spendValue ? ratio(c.revenueValue / c.spendValue) : "—"}</td>
                {showActions && <td>
                  {c.manual && <button className="mini danger" aria-label={`Excluir ${c.name}`} onClick={() => onDelete(c)}>
                    <Trash2 size={14} />
                  </button>}
                </td>}
              </tr>
            ))}
            {!visibleRows.length && <tr><td className="adManagerEmpty" colSpan={(manager ? 14 : 7) + (showActions ? 1 : 0)}>{search ? "Nenhum resultado para esta busca." : `Nenhum dado de ${level.toLowerCase()} disponível para ${selectedPlatform} Ads.`}</td></tr>}
          </tbody>
        </table>
      </div>}
    </article>
  );
}
function Creatives({ rows }: { rows: any[] }) {
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [sortMode, setSortMode] = useState<"default" | "spend" | "clicks" | "sales">("default");
  const filtersMenuRef = useRef<HTMLDetailsElement>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [metaSales, setMetaSales] = useState<Record<string, number>>({});
  useEffect(() => {
    let active = true;
    Promise.allSettled([apiJson("/api/campaigns/thumbnails"), apiJson("/api/campaigns/metrics")]).then(([images, metrics]) => {
      if (!active) return;
      if (images.status === "fulfilled") setThumbnails(images.value.thumbnails || {});
      if (metrics.status === "fulfilled") setMetaSales(Object.fromEntries(Object.entries(metrics.value.metrics?.ads || {}).map(([id, value]: [string, any]) => [id, Number(value.purchases || 0)])));
    });
    return () => { active = false; };
  }, []);
  const salesFor = (row: any) => String(row.platform).toLowerCase().includes("meta") ? metaSales[row.adId] : Number(row.sales || 0);
  const filtered = rows.filter((row) => `${row.name} ${row.campaignName} ${row.adsetName}`.toLowerCase().includes(query.toLowerCase()) && (!activeOnly || row.status === "ACTIVE")).sort((a, b) => sortMode === "spend" ? b.spendValue - a.spendValue : sortMode === "clicks" ? b.clicks - a.clicks : sortMode === "sales" ? (salesFor(b) || 0) - (salesFor(a) || 0) || b.spendValue - a.spendValue : 0);
  const statusLabels: Record<string, string> = { ACTIVE: "Ativo", PAUSED: "Pausado", CAMPAIGN_PAUSED: "Campanha pausada", ADSET_PAUSED: "Conjunto pausado", DISAPPROVED: "Reprovado", PENDING_REVIEW: "Em análise" };
  return (
    <article className="card tableCard realCreatives">
      <div className="sectionHead"><div><h2>Criativos</h2><p>Anúncios sincronizados das plataformas conectadas</p></div><span className="pill">{filtered.length} {filtered.length === 1 ? "anúncio" : "anúncios"}</span></div>
      <div className="creativeToolbar"><label className="adManagerSearch"><Search size={15} /><input aria-label="Buscar criativo" placeholder="Buscar anúncio ou campanha" value={query} onChange={(event) => setQuery(event.target.value)} /></label><button type="button" className={`creativeActiveFilter ${activeOnly ? "active" : ""}`} aria-pressed={activeOnly} onClick={() => setActiveOnly((current) => !current)}>Ativos</button><details className="creativeFiltersMenu" ref={filtersMenuRef}><summary><Filter size={14} /> Filtros <ChevronDown size={14} /></summary><div className="creativeFiltersOptions" role="group" aria-label="Ordenar criativos">{([['default', 'Padrão'], ['spend', 'Mais gasto'], ['clicks', 'Mais cliques'], ['sales', 'Mais vendas']] as const).map(([value, label]) => <button type="button" key={value} className={sortMode === value ? "active" : ""} aria-pressed={sortMode === value} onClick={() => { setSortMode(value); if (filtersMenuRef.current) filtersMenuRef.current.open = false; }}>{label}{sortMode === value && <CheckCircle2 size={14} />}</button>)}</div></details></div>
      {filtered.length ? <div className="creativeGrid">
        {filtered.map((row) => <div className="creativeCard" key={`${row.platform}:${row.accountId}:${row.adId}`}>
          <div className="realCreativeHeading"><span className="adPlatformIcon"><img src={`/integration-logos/${String(row.platform).toLowerCase().replace(" ads", "")}-ads.webp`} alt="" /></span><span className={`adDelivery ${row.status === "ACTIVE" ? "active" : ""}`}>{statusLabels[row.status] || row.status || "Sem status"}</span></div>
          <div className="creativeIdentity"><AdThumbnail url={thumbnails[row.adId]} platform={row.platform} /><div><h3 title={row.name}>{row.name}</h3><p title={row.campaignName}>{row.campaignName || "Campanha não informada"}</p><p title={row.adsetName}>{row.adsetName || "Conjunto não informado"}</p></div></div>
          <div className="creativeStats"><span>Gasto<b>{money(row.spendValue)}</b></span><span>Cliques<b>{row.clicks.toLocaleString("pt-BR")}</b></span><span>{String(row.platform).toLowerCase().includes("meta") ? "Compras Meta" : "Vendas ERP"}<b>{salesFor(row) == null ? "—" : salesFor(row).toLocaleString("pt-BR")}</b></span></div>
        </div>)}
      </div> : <p className="adManagerEmpty">{query || activeOnly ? "Nenhum anúncio encontrado para este filtro." : "Nenhum anúncio sincronizado ainda."}</p>}
      <p className="creativeSourceNote">Miniaturas e compras vêm da Meta quando disponíveis. Os valores podem diferir das vendas atribuídas pelo ERP.</p>
    </article>
  );
}

function Movements({ movements, onNew, onEdit }: any) {
  return (
    <article className="card tableCard">
      <div className="sectionHead">
        <div>
          <h2>Ledger de estoque</h2>
          <p>Registro cronológico com data, SKU, quantidade e referência</p>
        </div>
        <button className="primary" onClick={onNew}>
          <Plus size={14} />
          Nova movimentação
        </button>
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>SKU</th>
              <th>Movimento</th>
              <th>Quantidade</th>
              <th>Referência</th>
              <th>Saldo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m: any, i: number) => (
              <tr key={i}>
                <td>
                  <b>{m.date}</b>
                </td>
                <td>{m.sku}</td>
                <td>{m.type}</td>
                <td className={m.qty < 0 ? "negative" : "positive"}>
                  {m.qty > 0 ? "+" : ""}
                  {m.qty}
                </td>
                <td>{m.ref}</td>
                <td>
                  <b>{m.balance}</b>
                </td>
                <td><button className="mini" title="Editar movimentação" aria-label={`Editar movimentação ${m.sku} ${m.date}`} onClick={() => onEdit(m)}><Pencil size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
function Finance() {
  const [data, setData] = useState<any>(null);
  const [mpToken, setMpToken] = useState('');
  const [mpSaving, setMpSaving] = useState(false);
  const [mpError, setMpError] = useState('');
  useEffect(() => { apiJson("/api/dashboard?all=1").then(setData).catch(() => setData(null)); }, []);
  const [transfers, setTransfers] = useState<any>(null);
  const [transferError, setTransferError] = useState("");
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const loadTransfers = (fresh = false) => {
    setLoadingTransfers(true);
    setTransferError("");
    apiJson(`/api/finance/transfers${fresh ? "?fresh=1" : ""}`)
      .then(setTransfers)
      .catch((error) => setTransferError(error?.message || "Falha ao consultar repasses"))
      .finally(() => setLoadingTransfers(false));
  };
  useEffect(() => { loadTransfers(true); }, []);
  useEffect(() => {
    if (transfers?.mercadoPago?.status !== 'processing') return;
    const timer = window.setTimeout(() => loadTransfers(true), 8000);
    return () => window.clearTimeout(timer);
  }, [transfers?.mercadoPago?.status, transfers?.updatedAt]);
  const amazonRows = transfers?.amazon?.rows || [];
  const mpRows = transfers?.mercadoPago?.rows || [];
  const payoutRows = [
    ...amazonRows.map((row: any) => ({ source: 'Amazon', id: row.id, date: row.transferDate, amount: row.amount, currency: row.currency || 'BRL', status: row.transferStatus, account: row.accountTail ? `Final ${row.accountTail}` : '—', period: `${row.periodStart ? new Date(row.periodStart).toLocaleDateString('pt-BR') : '—'} – ${row.periodEnd ? new Date(row.periodEnd).toLocaleDateString('pt-BR') : '—'}` })),
    ...(transfers?.asaas?.rows || []).map((row: any) => ({ source: 'Asaas', id: row.id, date: row.date, amount: row.amount, currency: 'BRL', status: row.status, account: row.account, period: '—' })),
    ...mpRows.map((row: any) => ({ source: 'Mercado Pago', id: row.id, date: row.date, amount: row.amount, currency: 'BRL', status: row.status, account: row.account || '—', period: '—' })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const saveMpToken = async () => {
    setMpSaving(true); setMpError('');
    try {
      await apiJson('/api/integrations/mercado-pago', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: mpToken }) });
      setMpToken(''); loadTransfers(true);
    } catch (error: any) { setMpError(error?.message || 'Não foi possível conectar o Mercado Pago.'); }
    finally { setMpSaving(false); }
  };
  const transferStatus = (value: string) => {
    const normalized = value.toUpperCase();
    if (/TRANSFER|DONE|SUCCESS|SUCCEEDED/.test(normalized)) return "Transferência informada";
    if (/CLOSE|PROCESS/.test(normalized)) return "Fechado pela Amazon";
    if (/OPEN|PEND/.test(normalized)) return "Em processamento";
    return value || "Status indisponível";
  };
  return (
    <>
      <section className="financeHeroGrid">
        <article className="card pad financeHeroCard financeCashCard">
          <span>Caixa da empresa</span>
          <strong className={Number(transfers?.companyCash?.amount || 0) < 0 ? "negative" : undefined}>{transfers?.companyCash ? money(transfers.companyCash.amount || 0) : "—"}</strong>
          <small>{transfers?.companyCash?.transfers || 0} repasses e saques informados · tempo todo</small>
          {transfers?.companyCash && !transfers.companyCash.complete && <p>Valor parcial: uma ou mais fontes de saques ainda não foram consultadas por completo.</p>}
        </article>
        <article className="card pad financeHeroCard financeExpectedCard">
          <span>Lucro esperado</span>
          <strong className={Number(data?.profit || 0) < 0 ? "negative" : undefined}>{data ? money(data.profit || 0) : "—"}</strong>
          <small>Resultado estimado · tempo todo</small>
        </article>
      </section>
      <section className="kpiGrid">
        {[
          ["Receita", data?.revenue || 0],
          ["A receber nas plataformas", data && transfers?.companyCash ? Number(data.salesProfit || 0) - Number(transfers.companyCash.amount || 0) : null],
          ["Ads", data?.media || 0],
          ["Despesas", data?.expenses || 0],
        ].map(([a, b]: any) => (
          <article className="card kpi" key={a}>
            <span>{a}</span>
            <strong className={b != null && Number(b) < 0 ? "negative" : undefined}>{b == null ? '—' : money(b)}</strong>
          </article>
        ))}
      </section>
      <article className="card pad financeTransfers">
        <div className="sectionHead">
          <div><h2>Repasses e saques</h2><p>Histórico completo · mais recentes primeiro</p></div>
          <button className="mini" type="button" onClick={() => loadTransfers(true)} disabled={loadingTransfers} aria-label="Atualizar repasses"><RefreshCw size={16} /></button>
        </div>
        {transfers?.mercadoPago?.status === 'credential_required' && <div className="financeTokenConnect"><label htmlFor="mp-access-token">Access Token de produção do Mercado Pago</label><div><input id="mp-access-token" type="password" autoComplete="off" spellCheck={false} value={mpToken} onChange={event => setMpToken(event.target.value)} placeholder="APP_USR-…" /><button className="primary" type="button" disabled={!mpToken || mpSaving} onClick={saveMpToken}>{mpSaving ? 'Conectando…' : 'Conectar'}</button></div><small>Salvo criptografado no servidor. O token não aparece novamente na tela.</small>{mpError && <p className="financeTransferNote">{mpError}</p>}</div>}
        {transferError && <p className="financeTransferNote">{transferError}</p>}
        {payoutRows.length > 0 && <div className="tableWrap"><table className="expenseTable"><thead><tr><th>Plataforma</th><th>Período</th><th>Data da transferência</th><th>Valor</th><th>Status</th><th>Conta</th></tr></thead><tbody>{payoutRows.map((row: any) => <tr key={`${row.source}-${row.id}`}><td><strong>{row.source}</strong><small>{row.id}</small></td><td>{row.period}</td><td>{row.date ? new Date(row.date).toLocaleDateString('pt-BR') : '—'}</td><td className={Number(row.amount) < 0 ? "negative" : undefined}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: row.currency }).format(row.amount)}</td><td>{row.source === 'Amazon' ? transferStatus(row.status) : row.status === 'approved' ? 'Aprovado' : row.status}</td><td>{row.account}</td></tr>)}</tbody></table></div>}
        <p className="financeTransferNote">A transferência informada pela plataforma não confirma o crédito na sua conta bancária. Esse saldo não entra novamente na receita nem no lucro.</p>
      </article>
    </>
  );
}
function Expenses({ rows, data, onNew, onEdit, onDelete, onDeleteMany }: any) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const toggleSelected = (id: string) => setSelected((previous) => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const annualCycles: Record<string, number> = { MONTHLY: 12, QUARTERLY: 4, SEMIANNUAL: 2, YEARLY: 1 };
  const periodLabel: Record<string, string> = {
    MONTHLY: "Dia 01 ao último dia do mês",
    QUARTERLY: "Jan–Mar · Abr–Jun · Jul–Set · Out–Dez",
    SEMIANNUAL: "01/01–30/06 · 01/07–31/12",
    YEARLY: "01/01–31/12",
  };
  return <article className="card tableCard">
    <div className="sectionHead"><div><h2>Despesas</h2><p>Valores fixos e percentuais que abatem o lucro líquido</p></div><button className="primary" onClick={onNew}><Plus size={14} />Nova despesa</button></div>
    <MobileBulkActions ids={rows.map((expense: any) => String(expense.id))} selected={selected} setSelected={setSelected} selecting={selecting} setSelecting={setSelecting} onDeleteMany={onDeleteMany} label="despesas" />
    <div className="expenseSummary"><span>Abatido no lucro líquido</span><strong>{money(data?.expenses || 0)}</strong><small>Recorrências seguem meses, trimestres, semestres e anos civis.</small></div>
    <div className="tableWrap"><table className="expenseTable"><thead><tr>{selecting && <th className="checkCol"><input type="checkbox" checked={rows.length > 0 && rows.every((item: any) => selected.has(String(item.id)))} onChange={() => setSelected(rows.every((item: any) => selected.has(String(item.id))) ? new Set() : new Set(rows.map((item: any) => String(item.id))))} aria-label="Selecionar todas as despesas" /></th>}<th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Valor</th><th>Período / data</th><th>Frequência</th><th></th></tr></thead><tbody>{rows.map((expense: any) => <tr key={expense.id} className={selected.has(String(expense.id)) ? "mobileSelectedRow" : undefined} onClick={() => { if (window.matchMedia("(max-width: 650px)").matches) { if (selecting) toggleSelected(String(expense.id)); else onEdit(expense); } }}>{selecting && <td className="checkCol" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected.has(String(expense.id))} onChange={() => toggleSelected(String(expense.id))} aria-label={`Selecionar ${expense.description}`} /></td>}<td><b>{expense.description}</b></td><td>{expense.category}</td><td>{expense.kind === "PERCENT" ? "Percentual" : "Valor fixo"}</td><td>{expense.kind === "PERCENT" ? <span className="expenseValue">{`${Number(expense.rate || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% do faturamento`}{expense.schedule === "YEARLY" && data?.expenseBreakdown?.find((line: any) => line.id === expense.id)?.basis !== undefined && <small>Base anual: {money(data.expenseBreakdown.find((line: any) => line.id === expense.id).basis)} · Abatimento: {money(data.expenseBreakdown.find((line: any) => line.id === expense.id).amount)}</small>}</span> : <span className="expenseValue">{money(expense.amount)}{annualCycles[expense.schedule] && <small>No ano: {money(Number(expense.amount) * annualCycles[expense.schedule])}</small>}</span>}</td><td>{periodLabel[expense.schedule] || formatDashboardDate(dateKey(expense.date))}</td><td>{{ MONTHLY: "Mensal", QUARTERLY: "Trimestral", SEMIANNUAL: "Semestral", YEARLY: "Anual", FIXED: "Única", CUSTOM: "Única" }[expense.schedule as string] || "Única"}</td><td><div className="expenseRowActions"><button className="mini" title="Editar despesa" aria-label={`Editar ${expense.description}`} onClick={(event) => { event.stopPropagation(); onEdit(expense); }}><Pencil size={15} /></button><button className="mini danger" title="Excluir despesa" aria-label={`Excluir ${expense.description}`} onClick={(event) => { event.stopPropagation(); onDelete(expense); }}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>
    {!rows.length && <div className="catalogEmpty">Nenhuma despesa cadastrada.</div>}
  </article>;
}
function Returns({ rows }: { rows: any[] }) {
  const statusLabel: Record<string, string> = { IN_TRANSIT: "Devolução a caminho", DELIVERED: "Reembolsada", REFUNDED: "Reembolsada" };
  return <article className="card tableCard">
    <div className="sectionHead"><div><h2>Devoluções do Mercado Livre</h2><p>{rows.length} pedidos REFUNDED · {rows.filter((row) => row.status === "IN_TRANSIT").length} a caminho · {rows.filter((row) => row.refundAmount !== null).length} reembolsos confirmados</p></div></div>
    <div className="tableWrap"><table className="expenseTable returnsTable"><thead><tr><th>Pedido / pacote</th><th>Cliente</th><th>Produto</th><th>Motivo</th><th>Situação</th><th>Reembolso</th><th>Vendas</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
      <td><strong>#{row.orderExternalId || "—"}</strong><br /><a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">Pacote #{row.externalOrderId}</a></td>
      <td>{row.customerName || "—"}</td>
      <td>{row.sku || "—"}</td><td>{row.reason || "—"}</td><td><span className={`status ${row.refundAmount !== null ? "danger" : "warn"}`}>{statusLabel[row.status] || row.status}</span></td>
      <td className={row.refundAmount === null ? undefined : "negative"}>{row.refundAmount === null ? "Pendente" : `-${money(row.refundAmount)}`}</td><td>{row.erpOrderStatus ? <span className={`status ${row.erpOrderStatus === "PAID" ? "ok" : row.erpOrderStatus === "REFUNDED" || row.erpOrderStatus === "PENDING" ? "warn" : "danger"}`}>{row.erpOrderStatus}</span> : "Verificar vínculo"}</td>
    </tr>)}</tbody></table></div>
  </article>;
}
function Integrations({ refreshKey, onNew, onOpen }: any) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/integrations", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch(() => setRows([]));
  }, [refreshKey]);
  const visible: Integration[] = rows.map((row: any) => {
    const seed = integrationsSeed.find((i) => i.name === row.provider) || {
      name: row.provider,
      status: "Preparado" as const,
      cat: "Integração",
      desc: "Integração criada manualmente",
      logo: String(row.provider || "?")
        .slice(0, 2)
        .toUpperCase(),
      accent: "#7cf8bb",
      webhook: "",
      fields: row.fields || [],
    };
    return {
      ...seed,
      cat: integrationCategory(row.provider),
      status: row.status === "CONNECTED" ? "Conectado" : row.status === "ERROR" ? "Atenção" : "Preparado",
      accountId: row.externalAccountId || undefined,
      lastSyncAt: row.lastSyncAt || undefined,
      lastError: row.lastError || undefined,
    };
  });
  return (
    <>
      <div className="sectionTools">
        <div>
          <h2>Ecossistema de integrações</h2>
          <p>Conecte canais, pagamentos, mídia e logística.</p>
        </div>
        <button className="primary" onClick={onNew}>
          <Plus size={15} />
          Criar nova integração
        </button>
      </div>
      <div className="integrationGrid">
        {visible.map((i) => {
          const status = i.status;
          return (
            <article className="card integration integrationClickable" key={i.name} onClick={() => onOpen({ ...i, status })}>
              <PlatformLogo i={i} />
              <div className="integrationInfo">
                <b>{i.name}</b>
                <small>{i.desc}</small>
              </div>
              <div className="integrationActions">
                <span className={status === "Conectado" ? "status ok" : "status warn"}>{status}</span>
                <span className="integrationCategoryBadge">{i.cat}</span>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
const integrationLogoSrc: Record<string, string> = {
  "Meta Ads": "/integration-logos/meta-ads.webp",
  "Google Ads": "/integration-logos/google-ads.webp",
  "TikTok Ads": "/integration-logos/tiktok-ads.webp",
  Shopify: "/integration-logos/shopify.webp",
  "Mercado Livre": "/integration-logos/mercado-livre.webp",
  Amazon: "/integration-logos/amazon.webp",
  Kiwify: "/integration-logos/kiwify.webp",
  Asaas: "/integration-logos/asaas.png",
  "Mercado Pago": "/integration-logos/mercado-pago.png",
};
function PlatformLogo({ i }: { i: Integration }) {
  const src = integrationLogoSrc[i.name];
  return (
    <span className={`platformLogo brand-${i.name.toLowerCase().replaceAll(" ", "-")}`} title={i.name}>
      {src ? <img src={src} alt={`Logo ${i.name}`} /> : i.logo}
    </span>
  );
}
function SettingsView({ onEdit }: any) {
  return (
    <div className="settingsGrid">
      <article className="card pad">
        <h2>Empresa</h2>
        <p className="muted">Dados gerais usados em relatórios e documentos.</p>
        <div className="settingRows">
          <span>
            Nome<b>Iron Air Brasil</b>
          </span>
          <span>
            Moeda<b>BRL</b>
          </span>
          <span>
            Fuso<b>America/Sao_Paulo</b>
          </span>
        </div>
        <button className="ghost clickable" onClick={onEdit}>
          <Pencil size={14} /> Editar
        </button>
      </article>
      <article className="card pad">
        <h2>Tracking</h2>
        <p className="muted">Janela e modelo de atribuição.</p>
        <div className="settingRows">
          <span>
            Janela<b>7 dias</b>
          </span>
          <span>
            Modelo<b>Último clique pago</b>
          </span>
          <span>
            First-party<b>Ativo</b>
          </span>
        </div>
        <button className="ghost clickable" onClick={onEdit}>
          <Pencil size={14} /> Editar
        </button>
      </article>
    </div>
  );
}
function Modal({ kind, data, close, notify, products, catalogProducts, integrations, channelOptions, onSave, onDeleteIntegration }: any) {
  const [f, setF] = useState<any>(() => {
    if (kind === "expense") return data ? { ...data, desc: data.description, value: data.amount, date: dateKey(data.date), schedule: data.schedule === "CUSTOM" ? "FIXED" : data.schedule } : { kind: "FIXED", schedule: "FIXED", date: todayISO() };
    if (kind === "sale") return data ? { ...data, _edit: data.sku } : { source: "Manual", paidAt: saoPauloDateTimeLocal(), feeAmount: 0, shippingAmount: 0 };
    return data ? { ...data, _edit: data.sku } : {};
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const title: any = {
    movement: "Nova movimentação",
    movementEdit: "Editar movimentação",
    sale: "Venda manual",
    customer: "Novo cliente",
    product: data ? "Editar produto" : "Novo produto",
    campaign: "Nova campanha",
    creative: "Novo criativo",
    expense: data ? "Editar despesa" : "Lançar despesa",
    integration: "Adicionar integração",
    integrationDetail: data?.name || "Integração",
    settings: "Configurações",
    saleDetail: `Pedido ${data?.id || ""}`,
  };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(kind, f);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className="modalBack"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) close();
      }}
    >
      <div className={`modal ${kind === "integration" ? "modalWide" : ""}`}>
        <div className="modalHead">
          <div>
            <h2>{title[kind]}</h2>
            <p>{kind === "integrationDetail" ? "Configure credenciais, webhook e sincronização." : kind === "expense" ? "A despesa será salva e abatida do lucro líquido." : kind === "movementEdit" ? "Os dados da movimentação serão salvos no banco local." : "Preencha os dados abaixo. No localhost eles ficam apenas nesta sessão."}</p>
          </div>
          <button className="close" onClick={close}>
            <X />
          </button>
        </div>
        <div className="modalBody">
          {kind === "movement" && (
            <FormGrid>
              <Select label="Tipo" value={f.type} onChange={(v: any) => set("type", v)} options={["Entrada manual", "Saída manual", "Transferência", "Avaria", "Devolução", "Ajuste de inventário"]} />
              <Select label="SKU" value={f.sku} onChange={(v: any) => set("sku", v)} options={products.map((p: any) => p.sku)} />
              <Input label="Quantidade" type="number" value={f.qty} onChange={(v: any) => set("qty", v)} />
              <Input label="Data" type="date" value={f.date} onChange={(v: any) => set("date", v)} />
              <Input label="Referência / motivo" value={f.ref} onChange={(v: any) => set("ref", v)} />
              <Select label="Destino" value={f.to} onChange={(v: any) => setF((current: any) => ({ ...current, to: v, type: v === "Amazon FBA" || v === "Mercado Livre Full" ? "Transferência" : current.type === "Transferência" ? "" : current.type }))} options={channelOptions} />
            </FormGrid>
          )}
          {kind === "movementEdit" && (
            <FormGrid>
              <Select label="SKU" value={f.sku} onChange={(v: any) => set("sku", v)} options={products.map((p: any) => p.sku)} />
              <label className="field"><span>Data e hora</span><input type="datetime-local" value={f.createdAt || ""} onChange={(e) => set("createdAt", e.target.value)} /></label>
              <Select label="Movimento" value={f.type} onChange={(v: any) => setF((current: any) => ({ ...current, type: v, qty: ["SALE", "DAMAGE"].includes(v) ? -Math.abs(Number(current.qty || 1)) : ["PURCHASE", "RETURN"].includes(v) ? Math.abs(Number(current.qty || 1)) : current.qty }))} options={f.type === "TRANSFER_IN" || f.type === "TRANSFER_OUT" ? [f.type] : ["PURCHASE", "SALE", "RESERVE", "RELEASE", "RETURN", "DAMAGE", "ADJUSTMENT"]} />
              <Input label="Quantidade (+ entrada, − saída)" type="number" value={f.qty} onChange={(v: any) => set("qty", v)} />
              {f.type === "TRANSFER_IN" || f.type === "TRANSFER_OUT" ? <>
                <Select label="Origem" value={f.fromWarehouseCode} onChange={(v: any) => set("fromWarehouseCode", v)} options={["CENTRAL", "AMAZON_FBA", "ML_FULL"]} />
                <Select label="Destino" value={f.toWarehouseCode} onChange={(v: any) => set("toWarehouseCode", v)} options={["CENTRAL", "AMAZON_FBA", "ML_FULL"]} />
              </> : <Select label="Depósito" value={f.warehouseCode} onChange={(v: any) => set("warehouseCode", v)} options={["CENTRAL", "AMAZON_FBA", "ML_FULL"]} />}
              <Input label="Referência" value={f.reference} onChange={(v: any) => setF((current: any) => ({ ...current, reference: v, ref: v }))} />
              <Input label="Observação" value={f.note} onChange={(v: any) => set("note", v)} />
              <div className="field"><span>Saldo após movimento</span><strong>{f.balance}</strong><small>Recalculado ao salvar quantidade, SKU ou depósito.</small></div>
              <div className="field"><span>Origem do registro</span><strong>{f.source === "SYNC" ? "Integração · edição manual" : "Manual"}</strong></div>
            </FormGrid>
          )}
          {kind === "sale" && (
            <FormGrid>
              <Input label="Cliente" value={f.customer} onChange={(v: any) => set("customer", v)} />
              <Select label="Produto / voltagem" value={f.sku} onChange={(v: any) => set("sku", v)} options={catalogProducts.map((p: any) => ({ value: p.sku, label: p.name || `${p.product} · ${p.voltage || p.sku}` }))} />
              <Input label="Valor" type="number" value={f.value} onChange={(v: any) => set("value", v)} />
              <Select label="Origem" value={f.source} onChange={(v: any) => set("source", v)} options={channelOptions} />
              <label className="field"><span>Data e hora da venda</span><input type="datetime-local" value={f.paidAt || ""} onChange={(e) => set("paidAt", e.target.value)} /></label>
              <Input label="Taxas" type="number" value={f.feeAmount} onChange={(v: any) => set("feeAmount", v)} />
              <Input label="Frete" type="number" value={f.shippingAmount} onChange={(v: any) => set("shippingAmount", v)} />
              <Input label="E-mail" value={f.email} onChange={(v: any) => set("email", v)} />
              <Input label="Observação" value={f.note} onChange={(v: any) => set("note", v)} />
            </FormGrid>
          )}
          {kind === "customer" && (
            <FormGrid>
              <Input label="Nome" value={f.name} onChange={(v: any) => set("name", v)} />
              <Input label="ID externo" value={f.externalId} onChange={(v: any) => set("externalId", v)} />
              <Input label="Cidade" value={f.city} onChange={(v: any) => set("city", v)} />
              <Input label="UF" value={f.state} onChange={(v: any) => set("state", v)} />
              <Input label="CEP" value={f.zip} onChange={(v: any) => set("zip", v)} />
            </FormGrid>
          )}
          {kind === "product" && (
            <FormGrid>
              <Input label="Nome do produto" value={f.product} onChange={(v: any) => set("product", v)} />
              <Input label="SKU" value={f.sku} onChange={(v: any) => set("sku", v)} />
              <Input label="Quantidade" type="number" value={f.physical} onChange={(v: any) => set("physical", v)} />
              <Input label="Estoque de segurança" type="number" value={f.safety} onChange={(v: any) => set("safety", v)} />
              <Input label="Custo unitário" type="number" value={f.cost} onChange={(v: any) => set("cost", v)} />
              <Input label="Preço de venda" type="number" value={f.price} onChange={(v: any) => set("price", v)} />
            </FormGrid>
          )}
          {kind === "campaign" && (
            <FormGrid>
              <Input label="Nome" value={f.name} onChange={(v: any) => set("name", v)} />
              <Select label="Plataforma" value={f.platform} onChange={(v: any) => set("platform", v)} options={["Meta", "Google Ads", "TikTok Ads"]} />
              <Input label="Campaign ID" value={f.campaignId} onChange={(v: any) => set("campaignId", v)} />
              <Input label="Orçamento diário" type="number" value={f.budget} onChange={(v: any) => set("budget", v)} />
              <Input label="UTM campaign" value={f.utm} onChange={(v: any) => set("utm", v)} />
              <Select label="Status" value={f.status} onChange={(v: any) => set("status", v)} options={["Ativa", "Pausada", "Rascunho"]} />
            </FormGrid>
          )}
          {kind === "creative" && (
            <FormGrid>
              <Input label="Nome do criativo" value={f.name} onChange={(v: any) => set("name", v)} />
              <Select label="Plataforma" value={f.platform} onChange={(v: any) => set("platform", v)} options={["Meta", "Google Ads", "TikTok Ads"]} />
              <Input label="Campanha" value={f.campaign} onChange={(v: any) => set("campaign", v)} />
              <Input label="Ad ID" value={f.adId} onChange={(v: any) => set("adId", v)} />
              <Input label="URL do criativo" value={f.url} onChange={(v: any) => set("url", v)} />
              <Select label="Formato" value={f.format} onChange={(v: any) => set("format", v)} options={["Vídeo", "Imagem", "Carrossel"]} />
            </FormGrid>
          )}
          {kind === "expense" && (
            <FormGrid>
              <AnchoredSelect label="Tipo" value={f.kind || "FIXED"} onChange={(v) => set("kind", v)} options={[{ value: "FIXED", label: "Valor fixo" }, { value: "PERCENT", label: "Porcentagem do faturamento" }]} />
              <Select label="Categoria" value={f.category} onChange={(v: any) => set("category", v)} options={["Frete", "Mídia", "Taxa", "Imposto", "Software", "Operacional", "Outro"]} />
              <Input label="Descrição" value={f.desc} onChange={(v: any) => set("desc", v)} />
              {f.kind === "PERCENT" ? <Input label="Percentual (%)" type="number" value={f.rate} onChange={(v: any) => set("rate", v)} /> : <Input label="Valor (R$)" type="number" value={f.value} onChange={(v: any) => set("value", v)} />}
              <AnchoredSelect label="Frequência / data" value={f.schedule || "FIXED"} onChange={(v) => setF((current: any) => ({ ...current, schedule: v, date: current.date || todayISO() }))} options={[{ value: "FIXED", label: "Única" }, { value: "MONTHLY", label: "Mensal" }, { value: "QUARTERLY", label: "Trimestral" }, { value: "SEMIANNUAL", label: "Semestral" }, { value: "YEARLY", label: "Anual" }]} />
              {f.schedule === "FIXED" && <CalendarDateField label="Data da despesa" value={f.date || ""} onChange={(value) => set("date", value)} />}
              {["MONTHLY", "QUARTERLY", "SEMIANNUAL", "YEARLY"].includes(f.schedule) && <p className="expenseScheduleHint">{{ MONTHLY: "Mês civil: dia 01 ao último dia.", QUARTERLY: "Trimestres civis: jan–mar, abr–jun, jul–set e out–dez.", SEMIANNUAL: "Semestres civis: 01/01–30/06 e 01/07–31/12.", YEARLY: "Ano civil: 01/01–31/12." }[f.schedule as "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "YEARLY"]} {f.kind === "PERCENT" ? "O percentual incide sobre o faturamento acumulado do período." : "O valor é lançado uma vez por período."}</p>}
              {f.schedule === "FIXED" && <p className="expenseScheduleHint">{f.kind === "PERCENT" ? "Percentual aplicado uma vez sobre o faturamento da data escolhida." : "Lançamento único na data escolhida; aparece nos períodos que incluem esse dia."}</p>}
            </FormGrid>
          )}
          {kind === "integration" && (
            <div className="integrationPicker">
              {integrations.map((i: Integration) => (
                <button
                  key={i.name}
                  onClick={() => {
                    setF(i);
                  }}
                  className={f.name === i.name ? "picked" : ""}
                >
                  <PlatformLogo i={i} />
                  <span>
                    <b>{i.name}</b>
                    <small>{i.desc}</small>
                  </span>
                  <em>{i.cat}</em>
                </button>
              ))}
            </div>
          )}
          {kind === "integrationDetail" && <IntegrationDetail i={data} notify={notify} />} {kind === "saleDetail" && <SaleDetail s={f} set={set} products={products} />}{" "}
          {kind === "settings" && (
            <FormGrid>
              <Input label="Nome da empresa" value={f.company || "Iron Air Brasil"} onChange={(v: any) => set("company", v)} />
              <Select label="Moeda" value={f.currency || "BRL"} onChange={(v: any) => set("currency", v)} options={["BRL", "USD", "EUR"]} />
              <Select label="Janela de atribuição" value={f.window || "7 dias"} onChange={(v: any) => set("window", v)} options={["1 dia", "7 dias", "14 dias", "30 dias"]} />
              <Select label="Modelo" value={f.model || "Último clique pago"} onChange={(v: any) => set("model", v)} options={["Último clique pago", "First touch"]} />
            </FormGrid>
          )}
        </div>
        {kind === "integrationDetail" && <div className="modalFoot"><button type="button" className="ghost clickable integrationDeleteButton" onClick={() => { if (window.confirm(`Excluir ${data.name}? A integração será desconectada.`)) onDeleteIntegration(data); }}>Excluir integração</button></div>}
        {kind !== "integrationDetail" && (
          <div className="modalFoot">
            <button className="ghost clickable" onClick={close} disabled={saving}>
              Cancelar
            </button>
            <button className="primary" onClick={save} disabled={saving || (kind === "sale" && !f.sku) || (kind === "expense" && f.schedule === "FIXED" && !f.date)}>
              <Save size={15} />
              {saving ? "Salvando..." : kind === "integration" ? "Adicionar" : "Salvar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
function AsaasIntegrationDetail({ i, notify }: { i: Integration; notify: (x: string) => void }) {
  const [state, setState] = useState<any>(null);
  const [token, setToken] = useState('');
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reload = () => apiJson('/api/integrations/asaas').then(setState).catch((e: any) => setError(e.message));
  useEffect(() => { reload(); }, []);
  const save = async (method: 'POST' | 'PUT') => {
    setBusy(true); setError('');
    try {
      await apiJson('/api/integrations/asaas', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(method === 'POST' ? { accessToken: token } : { callbackUrl: url, email }) });
      setToken(''); await reload(); notify(method === 'POST' ? 'Asaas conectado' : 'Webhook de transferências cadastrado');
    } catch (e: any) { setError(e.message || 'Falha ao configurar Asaas'); }
    finally { setBusy(false); }
  };
  return <div>
    <div className="integrationHero"><PlatformLogo i={i} /><div><h3>Asaas</h3><p>Saques e transferências da Shopify</p></div><span className={state?.status === 'CONNECTED' ? 'status ok' : 'status warn'}>{state?.status === 'CONNECTED' ? 'Conectado' : state?.status === 'ERROR' ? 'Permissão pendente' : 'Preparado'}</span></div>
    <div className="credentials">
      <p className="muted">A chave fica criptografada no servidor. O financeiro consulta o histórico de transferências diretamente no Asaas.</p>
      <label><span>Chave API de produção</span><input className="fullInput" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="$aact_prod_…" /></label>
      <button className="primary" type="button" disabled={busy || !token} onClick={() => save('POST')}>Conectar Asaas</button>
      <h4>Webhook de saques</h4>
      <p className="muted">Eventos TRANSFER_* com token de autenticação e envio sequencial. A URL precisa ser HTTPS pública e executar esta versão do projeto.</p>
      <label><span>URL pública</span><input className="fullInput" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://seu-dominio/api/webhooks/asaas" /></label>
      <label><span>E-mail para falhas</span><input className="fullInput" type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <button className="primary" type="button" disabled={busy || state?.status !== 'CONNECTED' || !url || !email} onClick={() => save('PUT')}>Cadastrar webhook</button>
      {state?.lastError && <p className="negative">{state.lastError}</p>}
      {state?.webhook && <p className="muted">Webhook: {state.webhook.status} · {state.webhook.callbackUrl}</p>}
      {error && <p className="negative">{error}</p>}
    </div>
  </div>;
}
function IntegrationDetail({ i, notify }: { i: Integration; notify: (x: string) => void }) {
  const [tab, setTab] = useState("Configuração");
  const [show, setShow] = useState(false);
  const [metaConnected, setMetaConnected] = useState(i.status === "Conectado");
  const [shop, setShop] = useState("");
  const [status, setStatus] = useState<any>(null);
  const statusPath = i.name === "Shopify" ? "/api/integrations/shopify/status" : i.name === "Mercado Livre" ? "/api/integrations/mercadolivre/status" : i.name === "Amazon" ? "/api/integrations/amazon/status" : null;
  const reloadStatus = () =>
    statusPath &&
    fetch(statusPath, { cache: "no-store" })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => null);
  useEffect(() => {
    reloadStatus();
  }, [statusPath]);
  const sync = async (body: any) => {
    const r = await apiJson("/api/integrations/shopify/sync", {
      method: "POST",
      body: JSON.stringify(body),
    });
    notify(`Sincronizado: ${r.products || 0} produtos, ${r.orders || 0} pedidos`);
    reloadStatus();
  };
  if (i.name === "Asaas") return <AsaasIntegrationDetail i={i} notify={notify} />;
  if (i.name === "Meta Ads") {
    const connectMeta = async () => {
      const result = await apiJson('/api/integrations/meta/authorize', { method: 'POST' });
      if (result.url) window.location.href = result.url;
    };
    const disconnectMeta = async () => {
      await apiJson('/api/integrations/meta/self-disconnect', { method: 'POST' });
      setMetaConnected(false);
      notify('Meta Ads desconectada');
    };
    return <div>
      <div className="integrationHero"><PlatformLogo i={i} /><div><h3>Meta Ads</h3><p>Gastos, impressões e cliques por campanha</p></div><span className={metaConnected ? "status ok" : "status warn"}>{metaConnected ? "Conectado" : "Preparado"}</span></div>
      <div className="detailGrid">
        <div className="detailBox"><span>Conta de anúncios</span><b>{metaConnected ? i.accountId || "Não conectada" : "Não conectada"}</b></div>
        <div className="detailBox"><span>Última sincronização</span><b>{metaConnected && i.lastSyncAt ? fmtDate(i.lastSyncAt) : "Nunca"}</b></div>
      </div>
      {i.lastError && <p className="muted">Erro recente: {i.lastError}</p>}
      <p className="muted">A conexão é separada por empresa. O token fica criptografado no servidor; a sincronização periódica usa somente a conta vinculada a esta empresa.</p>
      <div className="metaConnectionActions">
        <button type="button" className="primary" onClick={connectMeta}><Link2 size={15} />{metaConnected ? "Trocar conta Meta" : "Conectar Meta Ads"}</button>
        {metaConnected && <button type="button" className="metaDisconnectButton" onClick={disconnectMeta}><LogOut size={15} />Desconectar</button>}
      </div>
    </div>;
  }
  if (i.name === "Shopify") {
    const connected = status?.status === "CONNECTED";
    return (
      <div>
        <div className="integrationHero">
          <PlatformLogo i={i} />
          <div>
            <h3>Shopify</h3>
            <p>OAuth por tenant com modo DEV/manual preservado</p>
          </div>
          <span className={connected ? "status ok" : "status warn"}>{connected ? "Conectado" : "Preparado"}</span>
        </div>
        <div className="tabs">
          {["Configuração", "Webhooks", "Sincronização"].map((t) => (
            <button className={tab === t ? "selected" : ""} onClick={() => setTab(t)} key={t}>
              {t}
            </button>
          ))}
        </div>
        {tab === "Configuração" && (
          <div className="credentials">
            <div className="detailGrid">
              <div className="detailBox">
                <span>Loja conectada</span>
                <b>{status?.shopDomain || "Nenhuma"}</b>
              </div>
              <div className="detailBox">
                <span>Modo</span>
                <b>{status?.mode === "OAUTH" ? "OAuth" : "DEV/manual"}</b>
              </div>
              <div className="detailBox">
                <span>Última sync</span>
                <b>{status?.lastSyncAt ? fmtDate(status.lastSyncAt) : "Nunca"}</b>
              </div>
              <div className="detailBox">
                <span>Status</span>
                <b>{connected ? "Ativa" : "Aguardando"}</b>
              </div>
            </div>
            <p className="muted">Tokens e secrets ficam somente no servidor. O modo DEV/manual continua aceitando os webhooks já cadastrados da Iron Air.</p>
            <label>
              <span>Loja Shopify</span>
              <input className="fullInput" value={shop} onChange={(e) => setShop(e.target.value)} placeholder="sua-loja.myshopify.com" />
            </label>
            <div className="syncOptions">
              <button onClick={() => (shop ? (location.href = `/api/integrations/shopify/connect?shop=${encodeURIComponent(shop)}`) : notify("Informe a loja Shopify"))}>
                <Link2 />
                Conectar Shopify
              </button>
              <button
                onClick={async () => {
                  await apiJson("/api/integrations/shopify/disconnect", {
                    method: "POST",
                    body: "{}",
                  });
                  setStatus({ ...status, status: "DISCONNECTED" });
                  notify("Shopify desconectado");
                }}
              >
                <Trash2 />
                Desconectar
              </button>
            </div>
          </div>
        )}
        {tab === "Webhooks" && (
          <div className="webhookBox">
            <label>Endpoint</label>
            <div className="copyField">
              <code>{location.origin}/api/webhooks/shopify</code>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(`${location.origin}/api/webhooks/shopify`);
                  notify("Webhook copiado");
                }}
              >
                <Copy size={15} />
              </button>
            </div>
            <div className="eventChecks">
              {(status?.webhooks?.length
                ? status.webhooks
                : [
                    { topic: "orders/create", status: "PENDING" },
                    { topic: "orders/paid", status: "PENDING" },
                    { topic: "orders/updated", status: "PENDING" },
                    { topic: "orders/cancelled", status: "PENDING" },
                    { topic: "refunds/create", status: "PENDING" },
                  ]
              ).map((w: any) => (
                <label key={w.topic}>
                  <input type="checkbox" checked readOnly />
                  {w.topic} · {w.status}
                </label>
              ))}
            </div>
          </div>
        )}
        {tab === "Sincronização" && (
          <div className="syncPanel">
            <h3>Sincronização manual</h3>
            <p className="muted">Busca dados recentes da loja conectada ou do modo DEV/manual.</p>
            <div className="syncOptions">
              <button onClick={() => sync({ products: false, orders: true, days: 90 })}>
                <RefreshCw />
                Pedidos
              </button>
              <button onClick={() => sync({ products: true, orders: false })}>
                <PackageCheck />
                Produtos
              </button>
              <button onClick={() => sync({ products: true, orders: true, days: 90 })}>
                <CircleDollarSign />
                Sincronizar agora
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
  if (i.name === "Mercado Livre") {
    const connected = status?.status === "CONNECTED";
    const mlName = status?.user?.nickname || status?.externalAccountId || "Nenhuma";
    const syncMl = async () => {
      await apiJson("/api/integrations/refresh", {
        method: "POST",
        body: JSON.stringify({ provider: "Mercado Livre" }),
      }).catch(() => null);
      const r = await apiJson("/api/integrations/mercadolivre/sync", {
        method: "POST",
        body: JSON.stringify({ days: 365 }),
      });
      notify(`Mercado Livre: ${r.orders || 0} pedidos sincronizados`);
      reloadStatus();
    };
    return (
      <div>
        <div className="integrationHero">
          <PlatformLogo i={i} />
          <div>
            <h3>Mercado Livre</h3>
            <p>OAuth por tenant com tokens server-side</p>
          </div>
          <span className={connected && !status?.requiresReconnect ? "status ok" : "status warn"}>{status?.requiresReconnect ? "Reconectar" : connected ? "Conectado" : "Preparado"}</span>
        </div>
        <div className="tabs">
          {["Configuração", "Webhooks", "Sincronização"].map((t) => (
            <button className={tab === t ? "selected" : ""} onClick={() => setTab(t)} key={t}>
              {t}
            </button>
          ))}
        </div>
        {tab === "Configuração" && (
          <div className="credentials">
            <div className="detailGrid">
              <div className="detailBox">
                <span>Conta conectada</span>
                <b>{mlName}</b>
              </div>
              <div className="detailBox">
                <span>Modo</span>
                <b>OAuth</b>
              </div>
              <div className="detailBox">
                <span>Última sync</span>
                <b>{status?.lastSyncAt ? fmtDate(status.lastSyncAt) : "Nunca"}</b>
              </div>
              <div className="detailBox">
                <span>Status</span>
                <b>{status?.requiresReconnect ? "Reconexão necessária" : connected ? "Ativa" : "Aguardando"}</b>
              </div>
              <div className="detailBox">
                <span>Refresh token</span>
                <b>{status?.refreshTokenAvailable ? "Ativo" : "Ausente"}</b>
              </div>
              <div className="detailBox">
                <span>Expira em</span>
                <b>{status?.expiresAt ? fmtDate(status.expiresAt) : "—"}</b>
              </div>
            </div>
            {status?.requiresReconnect && <p className="negative">A conexão não tem token de renovação. Ative “Refresh Token” no aplicativo do Mercado Livre Developer e conecte a conta novamente para retomar a sincronização automática.</p>}
            <p className="muted">Tokens ficam criptografados no servidor. Com “Refresh Token” ativo no aplicativo, a conexão se renova automaticamente.</p>
            <div className="syncOptions">
              <button onClick={() => (location.href = "/api/integrations/mercadolivre/connect")}>
                <Link2 />
                Conectar Mercado Livre
              </button>
              <button
                onClick={async () => {
                  await apiJson("/api/integrations/mercadolivre/disconnect", {
                    method: "POST",
                    body: "{}",
                  });
                  setStatus({ ...status, status: "DISCONNECTED" });
                  notify("Mercado Livre desconectado");
                }}
              >
                <Trash2 />
                Desconectar
              </button>
            </div>
          </div>
        )}
        {tab === "Webhooks" && (
          <div className="webhookBox">
            <label>Endpoint</label>
            <div className="copyField">
              <code>{location.origin}/api/webhooks/mercadolivre</code>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(`${location.origin}/api/webhooks/mercadolivre`);
                  notify("Webhook copiado");
                }}
              >
                <Copy size={15} />
              </button>
            </div>
            <div className="eventChecks">
              {(status?.webhooks?.length
                ? status.webhooks
                : [
                    { topic: "notifications", status: "PENDING" },
                    { topic: "orders", status: "PENDING" },
                  ]
              ).map((w: any) => (
                <label key={w.topic}>
                  <input type="checkbox" checked readOnly />
                  {w.topic} · {w.status}
                </label>
              ))}
            </div>
          </div>
        )}
        {tab === "Sincronização" && (
          <div className="syncPanel">
            <h3>Sincronização manual</h3>
            <p className="muted">Busca pedidos recentes da conta conectada e atualiza vendas/dashboard.</p>
            <div className="syncOptions">
              <button onClick={syncMl}>
                <RefreshCw />
                Sincronizar pedidos
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
  if (i.name === "Amazon") {
    const connected = status?.status === "CONNECTED";
    const syncAmazon = async () => {
      await apiJson("/api/integrations/refresh", {
        method: "POST",
        body: JSON.stringify({ provider: "Amazon" }),
      }).catch(() => null);
      const r = await apiJson("/api/integrations/amazon/sync", {
        method: "POST",
        body: JSON.stringify({ days: 365 }),
      });
      notify(`Amazon: ${r.orders || 0} pedidos sincronizados`);
      reloadStatus();
    };
    return (
      <div>
        <div className="integrationHero">
          <PlatformLogo i={i} />
          <div>
            <h3>Amazon</h3>
            <p>SP-API com refresh token criptografado por tenant</p>
          </div>
          <span className={connected ? "status ok" : "status warn"}>{connected ? "Conectado" : "Preparado"}</span>
        </div>
        <div className="tabs">
          {["Configuração", "Webhooks", "Sincronização"].map((t) => (
            <button className={tab === t ? "selected" : ""} onClick={() => setTab(t)} key={t}>
              {t}
            </button>
          ))}
        </div>
        {tab === "Configuração" && (
          <div className="credentials">
            <div className="detailGrid">
              <div className="detailBox">
                <span>Marketplace</span>
                <b>{status?.marketplaceId || "Brasil"}</b>
              </div>
              <div className="detailBox">
                <span>Modo</span>
                <b>SP-API</b>
              </div>
              <div className="detailBox">
                <span>Última sync</span>
                <b>{status?.lastSyncAt ? fmtDate(status.lastSyncAt) : "Nunca"}</b>
              </div>
              <div className="detailBox">
                <span>Status</span>
                <b>{connected ? "Ativa" : "Aguardando"}</b>
              </div>
              <div className="detailBox">
                <span>Refresh token</span>
                <b>{status?.refreshTokenAvailable ? "Ativo" : "Ausente"}</b>
              </div>
            </div>
            <p className="muted">O refresh token da Amazon fica criptografado no servidor. A sincronização usa LWA e SP-API no marketplace Brasil.</p>
            <div className="syncOptions">
              <button
                onClick={async () => {
                  await apiJson("/api/integrations/amazon/connect", {
                    method: "POST",
                    body: "{}",
                  });
                  notify("Amazon conectada");
                  reloadStatus();
                }}
              >
                <Link2 />
                Conectar Amazon
              </button>
              <button
                onClick={async () => {
                  await apiJson("/api/integrations/amazon/disconnect", {
                    method: "POST",
                    body: "{}",
                  });
                  setStatus({ ...status, status: "DISCONNECTED" });
                  notify("Amazon desconectada");
                }}
              >
                <Trash2 />
                Desconectar
              </button>
            </div>
          </div>
        )}
        {tab === "Webhooks" && (
          <div className="webhookBox">
            <label>Notificações</label>
            <div className="copyField">
              <code>Amazon SP-API Notifications via Seller Central</code>
              <button onClick={() => notify("Configure notificações no Seller Central quando liberado")}>
                <Copy size={15} />
              </button>
            </div>
          </div>
        )}
        {tab === "Sincronização" && (
          <div className="syncPanel">
            <h3>Sincronização manual</h3>
            <p className="muted">Renova o token e busca pedidos recentes da conta Amazon autorizada.</p>
            <div className="syncOptions">
              <button onClick={syncAmazon}>
                <RefreshCw />
                Sincronizar pedidos
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div>
      <div className="integrationHero">
        <PlatformLogo i={i} />
        <div>
          <h3>{i.name}</h3>
          <p>{i.desc}</p>
        </div>
        <span className={i.status === "Conectado" ? "status ok" : "status warn"}>{i.status}</span>
      </div>
      <div className="tabs">
        {["Configuração", "Webhooks", "Sincronização"].map((t) => (
          <button className={tab === t ? "selected" : ""} onClick={() => setTab(t)} key={t}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Configuração" && (
        <div className="credentials">
          <p className="muted">Integração preparada por tenant. Credenciais finais ficam somente no servidor/OAuth.</p>
          {i.fields.map((x) => (
            <label key={x}>
              <span>{x}</span>
              <div className="secretInput">
                <input type={show ? "text" : "password"} defaultValue="••••••••••••••••" />
                <button onClick={() => setShow(!show)}>{show ? "Ocultar" : "Mostrar"}</button>
              </div>
            </label>
          ))}
          <button className="primary" onClick={() => notify("Fluxo preparado para conexão por tenant")}>
            <Link2 size={14} />
            Testar conexão
          </button>
        </div>
      )}
      {tab === "Webhooks" && (
        <div className="webhookBox">
          <label>URL do webhook</label>
          <div className="copyField">
            <code>https://seu-dominio.com{i.webhook}</code>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(`https://seu-dominio.com${i.webhook}`);
                notify("Webhook copiado");
              }}
            >
              <Copy size={15} />
            </button>
          </div>
        </div>
      )}
      {tab === "Sincronização" && (
        <div className="syncPanel">
          <h3>Sincronização manual</h3>
          <p className="muted">Cada empresa terá sua própria conexão e fila de sincronização.</p>
          <div className="syncOptions">
            <button onClick={() => notify("Sincronização preparada por tenant")}>
              <RefreshCw />
              Sincronizar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function SaleDetail({ s, set, products }: any) {
  const fee = Number(s.feeAmount ?? s.fee ?? 0),
    freight = Number(s.shippingAmount ?? s.freight ?? 0),
    gross = Number(s.raw?.grossAmount || 0),
    discount = Number(s.raw?.discountAmount || 0),
    rawItem = s.raw?.items?.[0] || {},
    originalSku = rawItem.sku || s.itemSku || "";
  const assignable = products.filter((p: any) => String(p.sku || "").match(/(127|220)/i));
  const selectedSku = String(s.itemSku ?? (assignable.some((p: any) => p.sku === originalSku) ? originalSku : ""));
  const selectedProduct = products.find((p: any) => p.sku === selectedSku);
  const qty = Number(rawItem.quantity || 1);
  const cogs = selectedProduct ? Number(selectedProduct.unitCost ?? selectedProduct.cost ?? 0) * qty : Number(s.cogs || 0);
  const profit = s.status === "REFUNDED" || s.status === "CANCELLED" ? 0 : gross - discount - cogs - fee - freight;
  return (
    <div className="detailGrid">
      <label className="field">
        <span>Cliente</span>
        <input value={s.customer || ""} onChange={(e) => set("customer", e.target.value)} />
      </label>
      <AnchoredSelect label="Produto / voltagem" value={selectedSku} onChange={(v) => set("itemSku", v)} options={[{ value: "", label: `Sem atribuir${originalSku ? ` (${originalSku})` : ""}` }, ...assignable.map((p: any) => ({ value: p.sku, label: `${p.sku} · ${p.product}` }))]} />
      <div className="detailBox">
        <span>Valor</span>
        <b>{s.value}</b>
      </div>
      <div className="detailBox">
        <span>Custo dos produtos</span>
        <b>{money(cogs)}</b>
      </div>
      <div className="detailBox">
        <span>Lucro líquido</span>
        <b className={profit < 0 || s.status === "CANCELLED" ? "negative" : s.status === "REFUNDED" ? "refundedProfit" : undefined}>{money(profit)}</b>
      </div>
      <div className="detailBox">
        <span>SKU atual</span>
        <b>{originalSku || "—"}</b>
      </div>
      <label className="field">
        <span>Taxa da plataforma</span>
        <input type="number" value={fee} onChange={(e) => set("feeAmount", e.target.value)} />
      </label>
      <label className="field">
        <span>Custo do frete</span>
        <input type="number" value={freight} onChange={(e) => set("shippingAmount", e.target.value)} />
      </label>
      <div className="detailWide">
        <h3>{s.source}</h3>
        <p>{s.product}</p>
      </div>
    </div>
  );
}
function FormGrid({ children }: { children: any }) {
  return <div className="formGrid">{children}</div>;
}
function CalendarDateField({ label, value, onChange, compact = false }: { label: string; value: string; onChange: (value: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => (value || todayISO()).slice(0, 7));
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);
  const toggle = () => {
    if (!open && triggerRef.current) {
      const anchor = triggerRef.current.closest(".salesSelectField") || triggerRef.current;
      const rect = anchor.getBoundingClientRect();
      const width = 284;
      setPosition({ top: rect.bottom + 320 > window.innerHeight && rect.top > 320 ? rect.top - 314 : rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) });
      setMonth((value || todayISO()).slice(0, 7));
    }
    setOpen((current) => !current);
  };
  return <div className={compact ? "salesDateField" : "field calendarDateField"}>
    <span>{label}</span>
    <button ref={triggerRef} type="button" className="calendarDateTrigger" aria-label={label} aria-expanded={open} onClick={toggle}>{value ? formatDashboardDate(value) : "dd/mm/aaaa"}<CalendarDays size={15} /></button>
    {open && createPortal(<div ref={panelRef} className="singleDatePopover" style={position}>
      <div className="calendarHeader"><button type="button" aria-label="Mês anterior" onClick={() => setMonth(shiftCalendarMonth(month, -1))}>←</button><b>{calendarMonthTitle(month)}</b><button type="button" aria-label="Próximo mês" onClick={() => setMonth(shiftCalendarMonth(month, 1))}>→</button></div>
      <div className="calendarGrid">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => <span key={day}>{day}</span>)}{calendarDays(month).map((day, i) => day ? <button type="button" key={day} className={day === value ? "selected" : ""} onClick={() => { onChange(day); setOpen(false); }}>{Number(day.slice(-2))}</button> : <span key={`blank-${i}`} />)}</div>
      {value && <button type="button" className="clearDate" onClick={() => { onChange(""); setOpen(false); }}>Limpar data</button>}
    </div>, document.querySelector(".shell") || document.body)}
  </div>;
}
function Input({ label, value, onChange, type = "text" }: any) {
  if (type === "date") return <CalendarDateField label={label} value={value || ""} onChange={onChange} />;
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={label} />
    </label>
  );
}
function Select({ label, value, onChange, options }: any) {
  return <AnchoredSelect label={label} value={value ?? ""} onChange={onChange} options={[{ value: "", label: "Selecione..." }, ...options]} />;
}

type SelectOption = string | { value: string; label: string };
function AnchoredSelect({ label, value, onChange, options, compact = false }: { label?: string; value: string; onChange: (value: string) => void; options: SelectOption[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const normalized = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  const current = normalized.find((option) => option.value === String(value ?? ""));
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const closeOnScroll = (event: Event) => { if (!panelRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", closeOnScroll);
    document.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", closeOnScroll);
      document.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [open]);
  const toggle = () => {
    if (!open && triggerRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const filterPanel = triggerRef.current.closest(".salesFilters.mobileFiltersOpen") as HTMLElement | null;
      const anchor = triggerRef.current.closest(".salesSelectField, .field") || triggerRef.current;
      const anchorRect = anchor.getBoundingClientRect();
      const panelRect = filterPanel?.getBoundingClientRect();
      const panelStyle = filterPanel ? window.getComputedStyle(filterPanel) : null;
      const left = panelRect ? panelRect.left + Number.parseFloat(panelStyle?.paddingLeft || "0") : anchorRect.left;
      const availableWidth = panelRect ? panelRect.width - Number.parseFloat(panelStyle?.paddingLeft || "0") - Number.parseFloat(panelStyle?.paddingRight || "0") : anchorRect.width;
      const width = Math.min(availableWidth, window.innerWidth - 16);
      const height = Math.min(normalized.length * 38 + 12, 280);
      setPosition({ top: triggerRect.bottom + height + 6 > window.innerHeight && triggerRect.top > height ? triggerRect.top - height - 6 : triggerRect.bottom + 6, left: Math.max(8, Math.min(left, window.innerWidth - width - 8)), width });
    }
    setOpen((currentOpen) => !currentOpen);
  };
  return <div className={compact ? "anchoredSelect anchoredSelectCompact" : "field anchoredSelect"}>
    {label && <span>{label}</span>}
    <button ref={triggerRef} type="button" className="anchoredSelectTrigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={toggle}><span>{current?.label || "Selecione..."}</span><ChevronDown size={15} /></button>
    {open && createPortal(<div ref={panelRef} className={`anchoredSelectMenu${compact ? " compact" : ""}`} role="listbox" aria-label={label} style={position}>
      {normalized.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === String(value ?? "")} onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}
    </div>, document.querySelector(".shell") || document.body)}
  </div>;
}

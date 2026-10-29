"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, BarChart3, Bell, Boxes, CircleDollarSign, LayoutDashboard, LogOut, Megaphone, MousePointerClick, PackageCheck, PlugZap, Radar, Settings, ShoppingCart, Tag, TrendingUp, Users, Video, WalletCards, Search, Download, Plus, RefreshCw, X, Menu, Save, Link2, Copy, CheckCircle2, PackagePlus, Pencil, Eye, EyeOff, Trash2, Upload, Filter, MoreHorizontal, Sun, Moon, ChevronDown, ChevronUp, CalendarDays, GripVertical, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ReceiptText } from "lucide-react";
import PerformanceView from "./performance-view";
import SalesChart, { ChartStyleToggle, type SalesChartMode } from "./sales-chart";
import { campaigns as seedCampaigns, channels, inventory as seedInventory, movements as seedMovements, sales as seedSales } from "@/lib/mock";
import { normalizePaymentMethod } from "@/lib/payment-method";
function InvoiceNavIcon({ size = 18, className }: { size?: number; className?: string }) {
  const iconSize = Math.max(size, 22);
  return <svg className={`${className || ""} invoiceNavIcon`} width={iconSize} height={iconSize} viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 1.75h7.1L16 6.65v11.6H4z" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round"/><path d="M11 1.75v5h5" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round"/><text x="5.6" y="14.6" fill="currentColor" fontSize="6.6" fontWeight="800" fontFamily="Arial, sans-serif">NF</text></svg>;
}
type MenuEntry = { label: string; icon: typeof LayoutDashboard; view?: string; children?: Array<{ label: string; icon: typeof LayoutDashboard; view: string }> };
const menu: MenuEntry[] = [
  { label: "Visão Geral", icon: LayoutDashboard, view: "Visão Geral" },
  { label: "Performance", icon: BarChart3, view: "Performance" },
  { label: "Vendas", icon: ShoppingCart, children: [
    { label: "Pedidos", icon: TrendingUp, view: "Pedidos" },
    { label: "Reembolsos", icon: RefreshCw, view: "Reembolsos" },
  ] },
  { label: "Clientes", icon: Users, view: "Clientes" },
  { label: "Estoque", icon: Boxes, children: [
    { label: "Produtos", icon: PackageCheck, view: "Produtos" },
    { label: "Controle de estoque", icon: Boxes, view: "Estoque" },
  ] },
  { label: "Faturamento", icon: ReceiptText, children: [
    { label: "Nota Fiscal Eletrônica (NF-e)", icon: InvoiceNavIcon as typeof LayoutDashboard, view: "Nota Fiscal Eletrônica (NF-e)" },
    { label: "Etiquetas", icon: Tag, view: "Etiquetas" },
    { label: "Despesas", icon: WalletCards, view: "Despesas" },
  ] },
  { label: "Trackeamento", icon: Radar, children: [
    { label: "Eventos", icon: Activity, view: "Eventos" },
    { label: "Campanhas", icon: Megaphone, view: "Campanhas" },
    { label: "Criativos", icon: Video, view: "Criativos" },
  ] },
  { label: "Financeiro", icon: CircleDollarSign, view: "Financeiro" },
  { label: "Integrações", icon: PlugZap, view: "Integrações" },
  { label: "Configurações", icon: Settings, view: "Configurações" },
];
const menuViews = menu.flatMap((item) => item.children?.map((child) => child.view) || (item.view ? [item.view] : []));
const money = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const isNegativeDisplay = (value: string | number) => typeof value === "number" ? value < 0 : /^\s*[-−]/.test(value);
const periodOptions = ["Hoje", "Ontem", "7 dias", "30 dias", "Este mês", "Mês passado", "Este ano", "Tempo todo"];
const integrationCategory = (name: string) => /ads|meta|pixel|tiktok/i.test(name) ? "ADS" : /shopify|mercado livre|amazon|shopee|kiwify/i.test(name) ? "Plataforma de vendas" : /banco|bank|nubank|inter|itaú|bradesco|santander|mercado pago|asaas/i.test(name) ? "Banco" : "Outros";
const salesAndStockOptions = (connected: Set<string>) => ["Manual", ...(connected.has("Shopify") ? ["Shopify"] : []), ...(connected.has("Mercado Livre") ? ["Mercado Livre", "Mercado Livre Full"] : []), ...(connected.has("Amazon") ? ["Amazon", "Amazon FBA"] : []), ...(connected.has("Shopee") ? ["Shopee"] : [])];
const maskDashboardNumbers = (value: string) => value.replace(/(?:R\$\s*)?\d+(?:[.,]\d+)*(?:%|x)?/g, "—");
const adRevenueCardIds = ["performance-meta-revenue", "performance-google-revenue", "performance-tiktok-revenue", "performance-ads-revenue"];
const defaultDashboardLayout = ["kpi-0", "kpi-2", "kpi-14", "kpi-3", "kpi-1", "kpi-4", "kpi-5", "performance-margin", "kpi-7", "kpi-6", "kpi-8", "kpi-11", "performance-meta-ads", "performance-google-ads", "performance-tiktok-ads", "kpi-9", "kpi-10", ...adRevenueCardIds, "kpi-12", "kpi-13", "kpi-15", "alerts", "inventory"];
const dashboardAvailableLayout = [...defaultDashboardLayout, "timeline", "performance-insights", "performance-location", "performance-dre", "performance-channels", "performance-campaigns"];
const dashboardLayoutStorageKey = "ironair-dashboard-layout-v1";
const dashboardExpandedStorageKey = "ironair-dashboard-expanded-v1";
const dashboardWidthsStorageKey = "ironair-dashboard-widths-v1";
const dashboardLayoutDirtyKey = "ironair-dashboard-layout-pending-v1";
const activeViewStorageKey = "ironair-active-view-v1";
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
  const [campaignNavigation, setCampaignNavigation] = useState<{ level: "Campanhas" | "Conjuntos" | "Anúncios"; date: string; query: string; platform: string; nonce: number } | null>(null);
  const [viewStorageReady, setViewStorageReady] = useState(false);
  useEffect(() => {
    const storedView = sessionStorage.getItem(activeViewStorageKey);
    const savedView = storedView === "Devoluções" ? "Reembolsos" : storedView === "Vendas" ? "Pedidos" : storedView === "Faturamento" ? "Nota Fiscal Eletrônica (NF-e)" : storedView === "Trackeamento" ? "Eventos" : storedView;
    if (savedView && menuViews.includes(savedView)) setView(savedView);
    setViewStorageReady(true);
  }, []);
  useEffect(() => {
    if (!viewStorageReady) return;
    sessionStorage.setItem(activeViewStorageKey, view);
  }, [view, viewStorageReady]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openNavGroups, setOpenNavGroups] = useState<Set<string>>(() => new Set(["Vendas", "Estoque", "Faturamento", "Trackeamento"]));
  const [period, setPeriod] = useState("Hoje");
  const [platform, setPlatform] = useState("");
  const [product, setProduct] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
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
  const [dashboardCardCatalogOpen, setDashboardCardCatalogOpen] = useState(false);
  const [dashboardHidden, setDashboardHidden] = useState(false);
  const [dashboardExpanded, setDashboardExpanded] = useState(false);
  const [dashboardWidths, setDashboardWidths] = useState<Record<string, number>>({});
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
  const dashboardSelection = useRef({ period, range, platform, product, paymentMethod });
  dashboardSelection.current = { period, range, platform, product, paymentMethod };
  const [draftRange, setDraftRange] = useState(() => ({
    from: startOfYearISO(),
    to: todayISO(),
  }));
  const [filterModal, setFilterModal] = useState<"period" | "platform" | "product" | "payment" | null>(null);
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
  const [inventoryFolders, setInventoryFolders] = useState<any[]>([]);
  const [integrationsRefreshKey, setIntegrationsRefreshKey] = useState(0);
  const [integrationRows, setIntegrationRows] = useState<any[]>([]);
  const connectedProviders = new Set(integrationRows.filter((row) => row.status === "CONNECTED").map((row) => row.provider));
  useEffect(() => {
    if (view !== "Integrações" || modal) return;
    apiJson("/api/integrations").then((rows) => setIntegrationRows(Array.isArray(rows) ? rows : [])).catch(() => null);
  }, [view, modal, integrationsRefreshKey]);
  const [sales, setSales] = useState<any[]>([]);
  const [returnRows, setReturnRows] = useState<any[]>([]);
  const [returnSyncing, setReturnSyncing] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationTab, setNotificationTab] = useState<"Vendas" | "Alertas">("Vendas");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const getPushDeviceId = () => {
    const storageKey = 'ironair-push-device-id-v1';
    let deviceId = localStorage.getItem(storageKey);
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem(storageKey, deviceId);
    }
    return deviceId;
  };
  const registerPushSubscription = async (subscription: PushSubscription) => apiJson('/api/push/subscription', {
    method: 'POST',
    body: JSON.stringify({
      ...subscription.toJSON(),
      deviceId: getPushDeviceId(),
      deviceLabel: `${navigator.platform || 'Dispositivo'} · ${navigator.userAgent}`
    })
  });
  useEffect(() => {
    if (!sessionInfo || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    setPushSupported(true);
    navigator.serviceWorker.register('/sw.js').then(async registration => {
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;
      await registerPushSubscription(subscription);
      setPushEnabled(true);
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
      const known = Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && dashboardAvailableLayout.includes(id)) : [];
      const next = [...new Set(known)];
      if (!next.length || (next.length === 2 && next.includes("alerts") && next.includes("inventory"))) return defaultDashboardLayout;
      const missingRevenueCards = adRevenueCardIds.filter((id) => !next.includes(id));
      if (missingRevenueCards.length) next.splice(next.includes("kpi-12") ? next.indexOf("kpi-12") : next.length, 0, ...missingRevenueCards);
      return next;
    };
    const load = async () => {
      let localLayout: string[] = defaultDashboardLayout;
      let localExpanded = false;
      let localWidths: Record<string, number> = {};
      let pending = false;
      try {
        localLayout = normalize(JSON.parse(localStorage.getItem(dashboardLayoutStorageKey) || "[]"));
        localExpanded = localStorage.getItem(dashboardExpandedStorageKey) === "true";
        const parsedWidths = JSON.parse(localStorage.getItem(dashboardWidthsStorageKey) || "{}");
        if (parsedWidths && typeof parsedWidths === "object") localWidths = Object.fromEntries(Object.entries(parsedWidths).filter(([id, width]) => dashboardAvailableLayout.includes(id) && Number(width) >= 1 && Number(width) <= 4).map(([id, width]) => [id, Number(width)]));
        pending = localStorage.getItem(dashboardLayoutDirtyKey) === "true";
      } catch { /* Browser storage may be unavailable. */ }
      if (!active) return;
      setDashboardLayout(localLayout);
      setDashboardExpanded(localExpanded);
      setDashboardWidths(localWidths);
      setDashboardLayoutReady(true);
      let layout = localLayout;
      let expanded = localExpanded;
      let widths = localWidths;
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
            if (saved.widths && typeof saved.widths === "object") widths = Object.fromEntries(Object.entries(saved.widths).filter(([id, width]) => dashboardAvailableLayout.includes(id) && Number(width) >= 1 && Number(width) <= 4).map(([id, width]) => [id, Number(width)]));
          } else {
            needsSave = true;
          }
        }
      } catch { /* Keep the browser layout while the API is unavailable. */ }
      if (!active) return;
      dashboardLayoutSkipSave.current = !needsSave;
      setDashboardLayout(layout);
      setDashboardExpanded(expanded);
      setDashboardWidths(widths);
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
      localStorage.setItem(dashboardWidthsStorageKey, JSON.stringify(dashboardWidths));
      localStorage.setItem(dashboardLayoutDirtyKey, "true");
    } catch { /* The layout remains usable when browser storage is unavailable. */ }
    const revision = ++dashboardLayoutSaveRevision.current;
    dashboardLayoutSaveQueue.current = dashboardLayoutSaveQueue.current.catch(() => undefined).then(() => apiJson("/api/dashboard/layout", {
      method: "PUT",
      body: JSON.stringify({ layout: dashboardLayout, expanded: dashboardExpanded, widths: dashboardWidths }),
    })).then(() => {
      if (revision === dashboardLayoutSaveRevision.current) {
        try { localStorage.setItem(dashboardLayoutDirtyKey, "false"); } catch { /* Browser storage may be unavailable. */ }
      }
    }).catch(() => undefined);
  }, [dashboardLayout, dashboardExpanded, dashboardWidths, dashboardLayoutLoaded]);
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
  const startDashboardResize = (event: React.PointerEvent<HTMLButtonElement>, blockId: string) => {
    event.preventDefault(); event.stopPropagation();
    const item = event.currentTarget.closest(".dashboardLayoutItem") as HTMLElement | null;
    const grid = item?.closest(".dashboardLayout") as HTMLElement | null;
    if (!item || !grid) return;
    const itemLeft = item.getBoundingClientRect().left;
    const gridWidth = grid.getBoundingClientRect().width;
    const update = (clientX: number) => setDashboardWidths((current) => ({ ...current, [blockId]: Math.max(1, Math.min(4, Math.ceil((clientX - itemLeft) / (gridWidth / 4)))) }));
    const move = (pointerEvent: PointerEvent) => update(pointerEvent.clientX);
    const finish = (pointerEvent: PointerEvent) => { update(pointerEvent.clientX); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); document.body.classList.remove("dashboardResizing"); };
    document.body.classList.add("dashboardResizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  };
  const dashboardRowStep = () => typeof window === "undefined" ? 4 : window.innerWidth <= 650 ? 1 : window.innerWidth <= 1050 ? 2 : 4;
  const filtered = useMemo(() => sales.filter((s) => Object.values(s).join(" ").toLowerCase().includes(q.toLowerCase())), [q, sales]);
  const dashboardPlatforms = useMemo(() => [...new Set(orderRows.map((o) => String(o.channel || "")))].filter(Boolean).sort(), [orderRows]);
  const dashboardProducts = useMemo(() => availableCatalogProductOptions(catalogRows).map((option) => [option.value, option.label] as [string, string]), [catalogRows]);
  const dashboardPaymentMethods = useMemo(() => [...new Set(orderRows.map((o) => normalizePaymentMethod(o.paymentMethod)).filter((method) => method && method.toLowerCase() !== "manual"))].sort(), [orderRows]);
  const scopedOrders = (orders: any[]) => {
    const { platform: selectedPlatform, product: selectedProduct, paymentMethod: selectedPaymentMethod } = dashboardSelection.current;
    return orders.filter((o) => (!selectedPlatform || o.channel === selectedPlatform) && (!selectedProduct || (o.items || []).some((i: any) => (i.variant?.sku || i.sku) === selectedProduct)) && (!selectedPaymentMethod || normalizePaymentMethod(o.paymentMethod) === selectedPaymentMethod));
  };
  const firstSaleDate = firstPaidSaleDay(scopedOrders(orderRows));
  const allTimeStart = period === "Tempo todo" && dashboard?.periodMode === "all" ? dashboard.periodFrom : firstSaleDate;
  const inventorySalesRange = period === "Tempo todo" ? null : periodRange(period, range, firstSaleDate);
  const periodInventoryProducts = formatInventory(inventoryRows, inventoryMovementRows, scopedOrders(orderRows), inventorySalesRange);
  const stockInventoryProducts = formatInventory(inventoryRows, inventoryMovementRows, orderRows, null);
  const stockAlerts = products.filter((item) => Number(item.available || 0) <= Number(item.safety || 0)).map((item) => `${item.product} ${item.name || item.sku}: ${item.available} ${Number(item.available) === 1 ? "unidade disponível" : "unidades disponíveis"}.`);
  const recentSales = orderRows
    .filter((order) => order.status === "PAID")
    .sort((a, b) => new Date(b.paidAt || b.createdAt).getTime() - new Date(a.paidAt || a.createdAt).getTime());
  const title = view === "Visão Geral" ? "Dashboard Geral" : view;
  const dashboardCards = dashboardKpis(dashboard);
  const performanceCatalogOrder = ["Faturamento", "Líq. do Marketplace", "Lucro bruto", "Lucro líquido", "Pedidos pagos", "Taxas + frete", "Custo dos produtos", "Margem líquida", "Estoque", "Ticket médio", "Impostos", "ROI", "Meta Ads", "Google Ads", "TikTok Ads", "Lucro bruto pós Ads", "Valor em Ads", "Faturamento Meta", "Faturamento Google", "Faturamento TikTok", "Faturamento Ads", "TACOS", "MPA", "ROAS total"];
  const performanceCatalogCards = [
    ...dashboardCards.map((card: any, index: number) => ({ id: `kpi-${index}`, label: card.label, description: card.delta, value: card.value, kind: "Performance", source: "performance" })),
    { id: "performance-margin", label: "Margem líquida", description: "Resultado líquido ÷ faturamento", value: `${(Number(dashboard?.margin || 0) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`, kind: "Performance", source: "performance" },
    { id: "performance-meta-ads", label: "Meta Ads", description: "Investimento no período", value: money(Number(dashboard?.metaAds || 0)), kind: "Performance", source: "performance" },
    { id: "performance-google-ads", label: "Google Ads", description: "Investimento no período", value: money(Number(dashboard?.googleAds || 0)), kind: "Performance", source: "performance" },
    { id: "performance-tiktok-ads", label: "TikTok Ads", description: "Investimento no período", value: money(Number(dashboard?.tiktokAds || 0)), kind: "Performance", source: "performance" },
    { id: "performance-meta-revenue", label: "Faturamento Meta", description: "Valor de compras atribuído pela Meta", value: money(Number(dashboard?.metaPurchaseRevenue || 0)), kind: "Performance", source: "performance" },
    { id: "performance-google-revenue", label: "Faturamento Google", description: "Valor de compras atribuído pelo Google Ads", value: money(Number(dashboard?.googlePurchaseRevenue || 0)), kind: "Performance", source: "performance" },
    { id: "performance-tiktok-revenue", label: "Faturamento TikTok", description: "Valor de compras atribuído pelo TikTok Ads", value: money(Number(dashboard?.tiktokPurchaseRevenue || 0)), kind: "Performance", source: "performance" },
    { id: "performance-ads-revenue", label: "Faturamento Ads", description: "Meta + Google + TikTok", value: money(Number(dashboard?.adRevenue || 0)), kind: "Performance", source: "performance" },
  ].sort((a, b) => performanceCatalogOrder.indexOf(a.label) - performanceCatalogOrder.indexOf(b.label));
  const dashboardCardMap = new Map(performanceCatalogCards.map((card) => [card.id, card]));
  const dashboardKpiIds = dashboardLayout.filter((id) => dashboardCardMap.has(id));
  const dashboardCardCatalog = [
    ...performanceCatalogCards,
    { id: "timeline", label: "Receita ao longo do tempo", description: "Valor de pedidos pagos por dia", value: "Gráfico", kind: "Performance", source: "performance" },
    { id: "alerts", label: "Alertas da operação", description: "Estoque e pontos de atenção", value: `${stockAlerts.length} alertas`, kind: "Visão Geral", source: "dashboard" },
    { id: "inventory", label: "Estoque", description: "Posição e disponibilidade dos produtos", value: "Tabela", kind: "Estoque", source: "dashboard" },
    { id: "performance-insights", label: "Indicadores do período", description: "Quanto cada custo representa do faturamento", value: "4 indicadores", kind: "Performance", source: "performance" },
    { id: "performance-location", label: "Resultado por local", description: "Estados e cidades com ou sem vendas", value: "Mapa interativo", kind: "Performance", source: "performance" },
    { id: "performance-dre", label: "DRE gerencial", description: "Receita até o resultado líquido", value: "Demonstrativo", kind: "Performance", source: "performance" },
    { id: "performance-channels", label: "Resultado por canal", description: "Receita e resultado por plataforma", value: "Canais", kind: "Performance", source: "performance" },
    { id: "performance-campaigns", label: "Campanhas com mais investimento", description: "Investimento, vendas, receita e ROAS", value: "Tabela", kind: "Performance", source: "performance" },
  ];
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
        await registerPushSubscription(subscription);
        setPushEnabled(true);
        notify('Notificações ativadas neste aparelho.');
      }
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível configurar as notificações.'); }
    finally { setPushBusy(false); }
  };
  const api = apiJson;
  const dashboardKey = (p = dashboardSelection.current.period, r = dashboardSelection.current.range, selectedPlatform = dashboardSelection.current.platform, selectedProduct = dashboardSelection.current.product, selectedPaymentMethod = dashboardSelection.current.paymentMethod) => `${todayISO()}:${p === "Personalizado" ? `custom:${r.from}:${r.to}` : p}:${selectedPlatform}:${selectedProduct}:${selectedPaymentMethod}`;
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
    const { platform: selectedPlatform, product: selectedProduct, paymentMethod: selectedPaymentMethod } = dashboardSelection.current;
    const key = dashboardKey(p, r, selectedPlatform, selectedProduct, selectedPaymentMethod);
    const pendingKey = fresh ? `${key}:fresh` : key;
    const pr = periodRange(p, r, firstSaleDate);
    let pending = dashboardPending.current.get(pendingKey);
    if (!pending) {
      pending = api(`/api/dashboard?from=${encodeURIComponent(pr.from)}&to=${encodeURIComponent(pr.to)}&platform=${encodeURIComponent(selectedPlatform)}&product=${encodeURIComponent(selectedProduct)}&paymentMethod=${encodeURIComponent(selectedPaymentMethod)}${p === "Tempo todo" ? "&all=1" : ""}${fresh ? "&fresh=1" : ""}`);
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
      inventory: { url: "/api/inventory", fallback: { balances: [], movements: [], folders: [] }, apply: (data) => { setInventoryRows(data.balances || []); setInventoryMovementRows(data.movements || []); setInventoryFolders(data.folders || []); setProducts(formatInventory(data.balances || [], data.movements || [])); setMovements(formatMovements(data.movements || [], data.balances || [], data.folders || [])); } },
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
      "Pedidos": ["orders", "inventory", "products", "customers", "integrations"],
      "Reembolsos": ["returns", "orders"],
      "Clientes": ["customers"],
      "Produtos": ["products", "inventory", "orders"],
      "Estoque": ["inventory", "orders", "products", "integrations"],
      "Despesas": ["expenses"],
      "Nota Fiscal Eletrônica (NF-e)": [],
      "Etiquetas": [],
      "Campanhas": [],
      "Criativos": ["campaigns"],
      "Financeiro": ["expenses"],
      "Eventos": [],
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
  const refreshReturns = async (manual = false) => {
    if (returnSyncing) return;
    setReturnSyncing(true);
    try {
      const result: any = await apiJson('/api/returns/sync', { method: 'POST', body: '{}' });
      const rows = await apiJson('/api/returns');
      setReturnRows(Array.isArray(rows) ? rows : []);
      if (manual) {
        const failures = (result.results || []).filter((item: any) => !item.ok);
        notify(failures.length ? `Reembolsos atualizados parcialmente: ${failures.map((item: any) => `${item.provider} (${item.error})`).join(' | ')}` : 'Reembolsos atualizados ao vivo');
      }
    } catch (error: any) {
      if (manual) notify(error?.message || 'Não foi possível atualizar as devoluções');
    } finally {
      setReturnSyncing(false);
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
    if (view !== "Pedidos" && view !== "Reembolsos") return;
    const refreshVisible = () => { if (document.visibilityState === "visible") loadData(false, "view"); };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [view]);
  useEffect(() => {
    if (view !== 'Reembolsos') return;
    void refreshReturns(false);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshReturns(false);
    }, 60_000);
    return () => window.clearInterval(timer);
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
  }, [period, range.from, range.to, platform, product, paymentMethod]);
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
          {menu.map((item) => {
            const Icon = item.icon;
            if (item.children?.length) return <div className="navGroup" key={item.label}>
              <button type="button" className="navGroupLabel" aria-expanded={openNavGroups.has(item.label)} onClick={() => setOpenNavGroups((current) => { const next = new Set(current); next.has(item.label) ? next.delete(item.label) : next.add(item.label); return next; })}><Icon size={18} /><span>{item.label}</span><ChevronDown className={`navGroupArrow ${openNavGroups.has(item.label) ? "open" : ""}`} size={15} /></button>
              {openNavGroups.has(item.label) && item.children.map((child) => { const ChildIcon = child.icon; return <button onClick={() => { setView(child.view); setMobileMenuOpen(false); }} className={`navSubItem ${view === child.view ? "active" : ""}`} key={child.view}><ChildIcon size={15} /><span>{child.label}</span></button>; })}
            </div>;
            return <button onClick={() => { if (item.view) setView(item.view); setMobileMenuOpen(false); }} className={view === item.view ? "active" : ""} key={item.label}>
              <Icon size={18} /><span>{item.label}</span>
            </button>;
          })}
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
            {view === "Visão Geral" && <button type="button" className={`dashboardEditToggle ${dashboardEditing ? "active" : ""}`} onClick={() => setDashboardEditing((editing) => { if (editing) setDashboardCardCatalogOpen(false); return !editing; })} aria-label={dashboardEditing ? "Concluir organização do dashboard" : "Organizar dashboard"} title={dashboardEditing ? "Concluir organização" : "Organizar dashboard"}><Pencil size={16} /></button>}
            {view === "Visão Geral" && dashboardEditing && <button type="button" className="dashboardNewCardButton" onClick={() => setDashboardCardCatalogOpen(true)}><Plus size={15} /> Novo card</button>}
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
        <div className="mobilePageTitleRow"><h1 className="mobilePageTitle">{title}</h1>{view === "Visão Geral" && <><button type="button" className={`dashboardEditToggle ${dashboardEditing ? "active" : ""}`} onClick={() => setDashboardEditing((editing) => { if (editing) setDashboardCardCatalogOpen(false); return !editing; })} aria-label={dashboardEditing ? "Concluir organização do dashboard" : "Organizar dashboard"}><Pencil size={16} /></button>{dashboardEditing && <button type="button" className="dashboardNewCardButton" onClick={() => setDashboardCardCatalogOpen(true)}><Plus size={15} /> Novo card</button>}<button type="button" className={`dashboardEditToggle ${dashboardHidden ? "active" : ""}`} onClick={() => setDashboardHidden((hidden) => !hidden)} aria-label={dashboardHidden ? "Mostrar dados do dashboard" : "Ocultar dados do dashboard"} aria-pressed={dashboardHidden}>{dashboardHidden ? <EyeOff size={17} /> : <Eye size={17} />}</button></>}</div>
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
              <div className="dashboardFilter exportMenu platformFilter"><span>Plataforma</span><button className="filterTrigger" onClick={() => setFilterModal(filterModal === "platform" ? null : "platform")} aria-expanded={filterModal === "platform"}>{platform && salesOriginLogo(platform) && <span className="filterPlatformLogo"><img src={salesOriginLogo(platform)} alt="" /></span>}<span>{platform ? originLabel(platform) : "TODAS"}</span><ChevronDown size={14} /></button>
                {filterModal === "platform" && <div className="exportOptions dashboardOptions platformFilterOptions">{["", ...dashboardPlatforms].map((x) => <button key={x || "all"} onClick={() => { setPlatform(x); setFilterModal(null); }}>{x && salesOriginLogo(x) && <span className="filterPlatformLogo"><img src={salesOriginLogo(x)} alt="" /></span>}<span>{x ? originLabel(x) : "TODAS"}</span></button>)}</div>}
              </div>
              <div className="dashboardFilter exportMenu"><span>Produto</span><button className="filterTrigger" onClick={() => setFilterModal(filterModal === "product" ? null : "product")} aria-expanded={filterModal === "product"}>{product ? String(dashboardProducts.find(([sku]) => sku === product)?.[1] || product) : "Todos"}<ChevronDown size={14} /></button>
                {filterModal === "product" && <div className="exportOptions dashboardOptions">{[["", "Todos"], ...dashboardProducts].map(([sku, name]) => <button key={String(sku) || "all"} onClick={() => { setProduct(String(sku)); setFilterModal(null); }}>{String(name)}</button>)}</div>}
              </div>
              <div className="dashboardFilter exportMenu"><span>Método de Pag.</span><button className="filterTrigger" onClick={() => setFilterModal(filterModal === "payment" ? null : "payment")} aria-expanded={filterModal === "payment"}>{paymentMethod || "Todos"}<ChevronDown size={14} /></button>
                {filterModal === "payment" && <div className="exportOptions dashboardOptions">{["", ...dashboardPaymentMethods].map((method) => <button key={method || "all"} onClick={() => { setPaymentMethod(method); setFilterModal(null); }}>{method || "Todos"}</button>)}</div>}
              </div>
            </div>
            {dashboardLayoutReady && <div className={`dashboardLayout ${dashboardEditing ? "editing" : ""}`}>
              {dashboardLayout.map((blockId, index) => {
                const kpi = dashboardCardMap.get(blockId) || null;
                const kpiPosition = kpi ? dashboardKpiIds.indexOf(blockId) : -1;
                if (kpiPosition > 8 && !dashboardEditing) return null;
                return <Fragment key={blockId}>
                  {kpiPosition === 8 && !dashboardEditing && <div className={`dashboardMoreSection ${dashboardExpanded ? "expanded" : ""}`}>
                    <div className={`dashboardExtraCards ${dashboardExpanded ? "expanded" : ""}`} aria-hidden={!dashboardExpanded}>
                      <div className="dashboardExtraCardsInner">
                        {dashboardKpiIds.slice(8).map((id) => {
                          const extra = dashboardCardMap.get(id)!;
                          return <div key={id} className="dashboardLayoutItem dashboardKpiItem"><article className="card kpi"><span>{extra.label}</span><strong className={!dashboardHidden && isNegativeDisplay(extra.value) ? "negative" : extra.label === "Lucro líquido" && !dashboardHidden ? "dashboardProfitPositive" : undefined}>{dashboardHidden ? "—" : extra.value}</strong><small>{dashboardHidden ? maskDashboardNumbers(extra.description) : extra.description}</small></article></div>;
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
                  {(kpiPosition < 8 || dashboardEditing) && <div className={`dashboardLayoutItem ${kpi ? "dashboardKpiItem" : blockId === "timeline" || blockId === "alerts" ? "dashboardHalfItem" : "dashboardFullItem"} ${dashboardDropTarget === blockId ? "dropTarget" : ""}`} style={{ "--dashboard-span": dashboardWidths[blockId] || (kpi ? 1 : blockId === "timeline" || blockId === "alerts" ? 2 : 4) } as React.CSSProperties}
                  onDragOver={dashboardEditing ? (event) => { event.preventDefault(); setDashboardDropTarget(blockId); } : undefined}
                  onDragLeave={dashboardEditing ? () => setDashboardDropTarget((current) => current === blockId ? null : current) : undefined}
                  onDrop={dashboardEditing ? (event) => { event.preventDefault(); moveDashboardBlock(dashboardDragSource.current || event.dataTransfer.getData("text/plain"), blockId); dashboardDragSource.current = null; setDashboardDropTarget(null); } : undefined}>
                  {dashboardEditing && <div className="dashboardDragControls">
                    <span draggable onDragStart={(event) => { dashboardDragSource.current = blockId; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", blockId); }} onDragEnd={() => { dashboardDragSource.current = null; setDashboardDropTarget(null); }} title="Arraste para reorganizar" aria-label="Arraste para reorganizar"><GripVertical size={18} /></span>
                    <button type="button" disabled={index === 0} onClick={() => moveDashboardBlock(blockId, dashboardLayout[Math.max(0, index - dashboardRowStep())])} aria-label={`Mover ${kpi?.label || blockId} para cima`}><ArrowUp size={16} /></button>
                    <button type="button" className="dashboardHorizontalMove" disabled={index === 0} onClick={() => moveDashboardBlock(blockId, dashboardLayout[index - 1])} aria-label={`Mover ${kpi?.label || blockId} para a esquerda`}><ArrowLeft size={16} /></button>
                    <button type="button" className="dashboardHorizontalMove" disabled={index === dashboardLayout.length - 1} onClick={() => moveDashboardBlock(blockId, dashboardLayout[index + 1])} aria-label={`Mover ${kpi?.label || blockId} para a direita`}><ArrowRight size={16} /></button>
                    <button type="button" disabled={index === dashboardLayout.length - 1} onClick={() => moveDashboardBlock(blockId, dashboardLayout[Math.min(dashboardLayout.length - 1, index + dashboardRowStep())])} aria-label={`Mover ${kpi?.label || blockId} para baixo`}><ArrowDown size={16} /></button>
                    <button type="button" className="dashboardRemoveBlock" onClick={() => setDashboardLayout((current) => current.filter((id) => id !== blockId))} aria-label={`Remover ${kpi?.label || blockId} do Dashboard`} title="Remover do Dashboard"><Trash2 size={16} /></button>
                  </div>}
                  {kpi ? <article className="card kpi"><span>{kpi.label}</span><strong className={!dashboardHidden && isNegativeDisplay(kpi.value) ? "negative" : kpi.label === "Lucro líquido" && !dashboardHidden ? "dashboardProfitPositive" : undefined}>{dashboardHidden ? "—" : kpi.value}</strong><small>{dashboardHidden ? maskDashboardNumbers(kpi.description) : kpi.description}</small></article> : blockId === "timeline" ? <article className="card chartCard"><div className="sectionHead"><div><h2>Vendas no tempo</h2><p>{period === "Personalizado" ? `${range.from} → ${range.to}` : period}</p></div><ChartStyleToggle mode={dashboardChartMode} onChange={setDashboardChartMode} /></div><SalesTimeline rows={dashboard?.daily || []} period={period} range={range} firstSaleDate={allTimeStart} hidden={dashboardHidden} mode={dashboardChartMode} /></article> : blockId === "alerts" ? <article className="card pad"><div className="sectionHead"><div><h2>Alertas da operação</h2><p>Estoque de atenção · atualização automática</p></div><span className="badge">{dashboardHidden ? "—" : stockAlerts.length}</span></div><div className="alerts">{stockAlerts.length ? stockAlerts.map((a, i) => <div className="alert" key={a}><span>{dashboardHidden ? "—" : i + 1}</span><p>{dashboardHidden ? maskDashboardNumbers(a) : a}</p></div>) : <p className="muted">Nenhum alerta de estoque.</p>}</div></article> : blockId === "inventory" ? <Inventory products={periodInventoryProducts} folders={inventoryFolders} salesPeriod={period} onEdit={(p: any) => open("product", p)} hidden={dashboardHidden} showShopee={connectedProviders.has("Shopee")} /> : blockId === "channels" || blockId === "performance-channels" ? <ChannelTable rows={channelRows} hidden={dashboardHidden} title={blockId === "performance-channels" ? "Resultado por canal" : "Performance por canal"} /> : <DashboardPerformancePanel id={blockId} data={dashboard} campaigns={campaigns} hidden={dashboardHidden} />}
                  {dashboardEditing && <button type="button" className="dashboardResizeHandle" data-width={`${(dashboardWidths[blockId] || (kpi ? 1 : blockId === "timeline" || blockId === "alerts" ? 2 : 4)) * 25}%`} aria-label={`Redimensionar ${kpi?.label || blockId}`} title="Arraste para alterar a largura" onPointerDown={(event) => startDashboardResize(event, blockId)}><span /></button>}
                </div>}
                </Fragment>;
              })}
            </div>}
          </>
        )}
        {view === "Pedidos" && (
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
            notify={notify}
          />
        )}{" "}
        {view === "Reembolsos" && <Returns rows={returnRows} syncing={returnSyncing} onSync={() => refreshReturns(true)} />}{" "}
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
            <Inventory products={stockInventoryProducts} folders={inventoryFolders} onRefresh={() => loadData(false,"view")} salesPeriod="desde o início de cada pasta" onEdit={(p: any) => open("product", p)} onDeleteMany={(skus: string[]) => removeMany("/api/products", skus, "produtos", "skus")} bulkEnabled showShopee={connectedProviders.has("Shopee")} />
            <Movements movements={movements} onNew={() => open("movement")} onEdit={(movement: any) => open("movementEdit", movement)} onDelete={(movement: any) => remove(`/api/inventory/movement/${encodeURIComponent(movement.id)}`)} />
          </>
        )}{" "}
        {view === "Despesas" && <Expenses rows={expenseRows} data={dashboard} onNew={() => open("expense")} onEdit={(expense: any) => open("expense", expense)} onDelete={(expense: any) => remove(`/api/expenses?id=${encodeURIComponent(expense.id)}`)} onDeleteMany={(ids: string[]) => removeMany("/api/expenses", ids, "despesas")} />}
        {view === "Nota Fiscal Eletrônica (NF-e)" && <BillingDocuments key="invoices" mode="invoices" notify={notify} />}
        {view === "Etiquetas" && <BillingDocuments key="labels" mode="labels" notify={notify} />}
        {view === "Produtos" && <Products products={catalogRows} orders={orderRows} platforms={[...connectedProviders].filter((provider) => ["Shopify", "Mercado Livre", "Amazon", "Shopee"].includes(provider))} onImported={() => loadData(false, "view")} onNew={() => open("product")} onEdit={(p: any) => open("product", p)} onDelete={(p: any) => remove(`/api/products?sku=${encodeURIComponent(p.sku)}`)} onDeleteMany={(skus: string[]) => removeMany("/api/products", skus, "produtos", "skus")} />} {view === "Campanhas" && <Campaigns manager campaigns={campaigns} adsets={adsets} ads={ads} navigationTarget={campaignNavigation} onNavigationConsumed={() => setCampaignNavigation(null)} onNew={() => open("campaign")} onDelete={(c: any) => remove(`/api/campaigns?campaignId=${encodeURIComponent(c.campaignId)}&platform=${encodeURIComponent(c.platform)}`)} />}{" "}
        {view === "Performance" && <PerformanceView />}{" "}
        {view === "Eventos" && <TrackingView notify={notify} onOpenCampaign={(target) => { setCampaignNavigation({ ...target, nonce: Date.now() }); setView("Campanhas"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}{" "}
        {view === "Financeiro" && <Finance />} {view === "Integrações" && <Integrations refreshKey={integrationsRefreshKey} onNew={() => open("integration")} onOpen={(i: Integration) => open("integrationDetail", i)} />} {view === "Criativos" && <Creatives rows={ads} />} {view === "Configurações" && <SettingsView onEdit={() => open("settings")} />}
      </section>
      {dashboardCardCatalogOpen && <div className="modalBack dashboardCardCatalogBack" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDashboardCardCatalogOpen(false); }}><section className="modal modalWide dashboardCardCatalogModal" role="dialog" aria-modal="true" aria-labelledby="dashboard-card-catalog-title"><header className="modalHead"><div><h2 id="dashboard-card-catalog-title">Todos os cards</h2><p>Prévia dos cards do Dashboard Geral e da tela Performance.</p></div><button type="button" className="close" aria-label="Fechar" onClick={() => setDashboardCardCatalogOpen(false)}><X size={19} /></button></header><div className="modalBody"><div className="dashboardCardCatalogGrid">{dashboardCardCatalog.map((card) => { const added = dashboardLayout.includes(card.id); return <article className="dashboardCatalogCard" key={card.id}><span className="dashboardCatalogKind">{card.kind}</span><DashboardCatalogPreview card={card} hidden={dashboardHidden} /><button type="button" className="dashboardCatalogAction" disabled={added} onClick={() => { setDashboardLayout((current) => current.includes(card.id) ? current : [...current, card.id]); setDashboardCardCatalogOpen(false); }}>{added ? <><CheckCircle2 size={14} /> Adicionado</> : <><Plus size={14} /> Adicionar</>}</button></article>; })}</div></div><footer className="modalFoot"><span className="dashboardCatalogCount">{dashboardCardCatalog.length} cards disponíveis</span><button type="button" className="ghost" onClick={() => setDashboardCardCatalogOpen(false)}>Fechar</button></footer></section></div>}
      {modal && (
        <Modal
          kind={modal}
          data={selected}
          close={() => setModal(null)}
          notify={notify}
          products={products}
          inventoryFolders={inventoryFolders}
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
                    folderId: data.folderId,
                    type: data.type,
                    quantity: Number(data.qty),
                    createdAt: data.date || data.createdAt,
                    reference: data.ref,
                    warehouseCode: "CENTRAL",
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
                    grossAmount: Number(data.grossAmount ?? data.raw?.grossAmount ?? 0),
                    cogs: Number(data.cogs ?? 0),
                    paidAt: data.paidAt,
                    paymentMethod: data.paymentMethod ?? data.raw?.paymentMethod ?? "",
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
function TablePagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageNumbers = paginationNumbers(safePage, totalPages);
  return <div className="pagination">
    <span>Página {safePage} de {totalPages}</span>
    <div>
      <button type="button" className="ghost clickable pageArrow" aria-label="Página anterior" disabled={safePage <= 1} onClick={() => onChange(safePage - 1)}>‹</button>
      {pageNumbers.map((number, index) => number === "…"
        ? <span className="pageDots" key={`dots-${index}`}>…</span>
        : <button type="button" key={number} className={`ghost clickable pageNumber ${safePage === number ? "selected" : ""}`} aria-current={safePage === number ? "page" : undefined} onClick={() => onChange(Number(number))}>{number}</button>)}
      <button type="button" className="ghost clickable pageArrow" aria-label="Próxima página" disabled={safePage >= totalPages} onClick={() => onChange(safePage + 1)}>›</button>
    </div>
  </div>;
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
  const value=movement?.createdAt;
  if(movement?.source==="MANUAL"&&typeof value==="string"&&/T00:00:00(?:\.\d+)?Z$/.test(value)){
    const [,month,day]=value.match(/^(\d{4})-(\d{2})-(\d{2})/)||[];
    if(day&&month)return `${day}/${month}, 00:00`;
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
  const adRevenue = Number(d?.adRevenue || 0);
  const adCogs = Number(d?.adCogs || 0);
  const cogs = Number(d?.cogs || 0);
  const media = Number(d?.media || 0);
  const marketplaceNet = Number(d?.salesProfit ?? (revenue - Number(d?.fees || 0)));
  const grossProfitAfterAds = marketplaceNet - media - cogs;
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
      value: money(marketplaceNet),
      delta: "Faturamento − taxas e frete",
    },
    {
      label: "Lucro líquido",
      value: money(d?.profit ?? (grossProfitAfterAds - Number(d?.expenses || 0))),
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
      value: money(adRevenue - media),
      delta: "Faturamento Ads − anúncios",
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
      value: adRevenue > 0 ? percent(media / adRevenue) : "—",
      delta: "Anúncios / faturamento Ads",
    },
    {
      label: "MPA",
      value: adRevenue > 0 ? percent((adRevenue - media) / adRevenue) : "—",
      delta: "Faturamento Ads após anúncios / faturamento Ads",
    },
    {
      label: "Lucro bruto",
      value: money(grossProfitAfterAds),
      delta: "Líq. do marketplace − anúncios − produtos",
    },
    {
      label: "ROAS total",
      value: media > 0 ? `${(adRevenue / media).toFixed(2)}x` : "—",
      delta: "Faturamento Ads / anúncios",
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
function DashboardPerformancePanel({ id, data, campaigns, hidden }: { id: string; data: any; campaigns: any[]; hidden: boolean }) {
  const revenue = Number(data?.revenue || 0), fees = Number(data?.fees || 0), cogs = Number(data?.cogs || 0), media = Number(data?.media || 0), expenses = Number(data?.expenses || 0);
  const gross = Number(data?.grossProfit ?? revenue - fees - cogs), profit = Number(data?.profit ?? gross - media - expenses);
  if (id === "performance-insights") return <article className="card performancePanel"><div className="sectionHead"><div><h2>Indicadores do período</h2><p>Quanto cada custo representa do faturamento</p></div></div>{[["Ticket médio por pedido", money(Number(data?.ticket || 0))], ["Gasto com anúncios sobre faturamento", revenue ? `${(media / revenue * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"], ["Taxas e frete sobre faturamento", revenue ? `${(fees / revenue * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"], ["Margem líquida", revenue ? `${(profit / revenue * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"]].map(([label, value]) => <div className="performanceInsightRow" key={label}><span>{label}</span><b>{hidden ? "—" : value}</b></div>)}</article>;
  if (id === "performance-dre") { const rows = [["Receita de vendas pagas", revenue], ["(-) Taxas, tributos e frete", -fees], ["Receita após taxas e frete", revenue - fees], ["(-) Custo dos produtos vendidos", -cogs], ["Lucro bruto gerencial", gross], ["(-) Investimento em anúncios", -media], ["(-) Despesas operacionais", -expenses], ["Resultado líquido gerencial", profit]] as const; return <article className="card performancePanel"><div className="sectionHead"><div><h2>DRE gerencial</h2><p>Receita até o resultado líquido</p></div></div><div className="performanceDre">{rows.map(([label, amount], index) => <div className={`${index === 2 || index === 4 ? "strong" : ""} ${index === rows.length - 1 ? "final" : ""}`} key={label}><span>{label}</span><b className={amount < 0 ? "negative" : undefined}>{hidden ? "—" : money(amount)}</b></div>)}</div></article>; }
  if (id === "performance-campaigns") return <article className="card performancePanel"><div className="sectionHead"><div><h2>Campanhas com mais investimento</h2><p>Investimento, vendas, receita e ROAS</p></div></div><div className="performanceTableWrap"><table><thead><tr><th>Campanha</th><th>Plataforma</th><th>Investimento</th><th>Vendas</th><th>Receita</th><th>ROAS</th></tr></thead><tbody>{campaigns.slice(0, 8).map((campaign: any, index) => <tr key={campaign.campaignId || index}><td>{campaign.campaignName || campaign.name || "Campanha"}</td><td>{campaign.platform || "—"}</td><td>{hidden ? "—" : money(Number(campaign.spend || 0))}</td><td>{hidden ? "—" : Number(campaign.sales || 0)}</td><td>{hidden ? "—" : money(Number(campaign.revenue || 0))}</td><td>{hidden ? "—" : Number(campaign.spend) ? `${(Number(campaign.revenue || 0) / Number(campaign.spend)).toFixed(2)}x` : "—"}</td></tr>)}</tbody></table>{!campaigns.length && <div className="performanceEmpty">Nenhuma campanha encontrada no período.</div>}</div></article>;
  if (id === "performance-location") return <article className="card performancePanel dashboardLocationPlaceholder"><div className="sectionHead"><div><h2>Resultado por local</h2><p>Estados e cidades com ou sem vendas</p></div></div><div className="catalogMap"><div aria-hidden="true"><i>AM</i><i>MT</i><i>BA</i><i>MG</i><i>SP</i><i>RS</i></div></div><p className="muted">Abra Performance para interagir com o mapa completo.</p></article>;
  return <article className="card performancePanel"><div className="performanceEmpty">Card indisponível.</div></article>;
}

function DashboardCatalogPreview({ card, hidden }: { card: { id: string; label: string; description: string; value: string | number }; hidden: boolean }) {
  const value = hidden ? "—" : card.value;
  const isKpi = card.id.startsWith("kpi-") || ["performance-margin", "performance-meta-ads", "performance-google-ads", "performance-tiktok-ads"].includes(card.id);
  if (isKpi) return <article className="card kpi dashboardCatalogReplica"><span>{card.label}</span><strong className={isNegativeDisplay(card.value) ? "negative" : undefined}>{value}</strong><small>{card.description}</small></article>;
  if (card.id === "timeline") return <article className="card chartCard dashboardCatalogReplica catalogTimeline"><div className="sectionHead"><div><h2>{card.label}</h2><p>{card.description}</p></div></div><svg viewBox="0 0 220 54" preserveAspectRatio="none" aria-hidden="true"><path d="M2 43 C24 40 27 17 49 24 S75 51 95 31 S123 8 140 28 S174 45 218 13" /></svg></article>;
  if (card.id === "alerts") return <article className="card pad dashboardCatalogReplica"><div className="sectionHead"><div><h2>{card.label}</h2><p>Estoque de atenção</p></div><span className="badge">3</span></div><div className="alerts">{[1, 2, 3].map((number) => <div className="alert" key={number}><span>{number}</span><p>Produto com estoque de atenção.</p></div>)}</div></article>;
  if (card.id === "inventory" || card.id === "performance-campaigns") return <article className="card dashboardCatalogReplica catalogReplicaTable"><div className="sectionHead"><div><h2>{card.label}</h2><p>{card.description}</p></div></div><table><thead><tr><th>{card.id === "inventory" ? "Produto" : "Campanha"}</th><th>{card.id === "inventory" ? "SKU" : "Investimento"}</th><th>{card.id === "inventory" ? "Disponível" : "ROAS"}</th></tr></thead><tbody><tr><td>—</td><td>—</td><td>—</td></tr><tr><td>—</td><td>—</td><td>—</td></tr></tbody></table></article>;
  if (card.id === "performance-location") return <article className="card performancePanel dashboardCatalogReplica"><div className="sectionHead"><div><h2>{card.label}</h2><p>{card.description}</p></div></div><div className="catalogMap"><div aria-hidden="true"><i>AM</i><i>MT</i><i>BA</i><i>MG</i><i>SP</i><i>RS</i></div></div></article>;
  const rows = card.id === "performance-dre" ? ["Receita", "Taxas e frete", "Lucro bruto", "Resultado líquido"] : card.id === "performance-channels" ? ["Mercado Livre", "Shopify", "Amazon"] : ["Ticket médio", "Anúncios", "Taxas e frete", "Margem líquida"];
  return <article className="card performancePanel dashboardCatalogReplica"><div className="sectionHead"><div><h2>{card.label}</h2><p>{card.description}</p></div></div><div className={card.id === "performance-dre" ? "performanceDre" : "catalogReplicaRows"}>{rows.map((row, index) => <div className={index === rows.length - 1 ? "final" : ""} key={row}><span>{row}</span><b>—</b></div>)}</div></article>;
}

function SalesTimeline({ rows, period, range, firstSaleDate, hidden = false, mode = "line" }: any) {
  const points = salesTimeline(rows, period, range, firstSaleDate);
  const dates = periodRange(period, range, firstSaleDate);
  return <SalesChart points={points} from={dates.from} to={dates.to} hidden={hidden} mode={mode} />;
}
function orderItemProductLabel(item:any){
  return String(item?.name||'').trim();
}
function availableCatalogProductOptions(catalogProducts: any[]) {
  return [...new Map<string, { value: string; label: string }>((catalogProducts || [])
    .filter((product: any) => {
      const available = Array.isArray(product.balances)
        ? product.balances.reduce((total: number, balance: any) => total + Number(balance.available || 0), 0)
        : Number(product.availableQuantity || 0);
      return String(product.sku || '').trim() && available > 0;
    })
    .map((product: any) => {
      const sku = String(product.sku).trim();
      const productName = String(product.product || product.name || sku).trim();
      const variantName = String(product.name || '').trim();
      const variant = variantName && variantName !== 'Default Title' && variantName !== productName ? variantName : '';
      return [sku, { value: sku, label: [productName, variant, sku].filter(Boolean).join(' · ') }] as [string, { value: string; label: string }];
    })).values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
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
      id: o.sourceSnapshot?.displayId || o.externalId,
      date: fmtDate(o.paidAt || o.createdAt),
      customer: o.customer?.name || "Cliente",
      product: items.map(orderItemProductLabel).filter(Boolean).join(", ") || "—",
      voltage: voltages.join(", ") || "—",
      itemSku: firstItem?.sku || "",
      orderItemId: firstItem?.id || "",
      source: o.sourceSnapshot?.fulfillmentOrigin === "AMAZON_FBA" || o.sourceSnapshot?.warehouseCode === "AMAZON_FBA" ? "Amazon FBA" : o.sourceSnapshot?.fulfillmentOrigin === "ML_FULL" || o.sourceSnapshot?.warehouseCode === "ML_FULL" ? "Mercado Livre Full" : o.channel,
      paymentMethod: normalizePaymentMethod(o.paymentMethod) || "",
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
  const physicalBySku = new Map<string, number>();
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
    if(m.type==='ADJUSTMENT') physicalBySku.set(m.sku,Number(physicalBySku.get(m.sku)||0)+Number(m.quantity||0));
  }
  if (orders) for (const order of orders) {
    if (order.status !== "PAID") continue;
    const paidDay = dateKey(order.paidAt);
    if (!paidDay || (salesRange && (paidDay < salesRange.from || paidDay > salesRange.to))) continue;
    for (const item of order.items || []) {
      const sku = String(item.variant?.sku || item.sku || "");
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
      parentName:r.variant?.product?.name,
      parentVariantCount:Number(r.variant?.product?._count?.variants||1),
      parentSku:r.variant?.source==='AMAZON'?r.variant?.product?.variants?.find((parent:any)=>parent.source==='AMAZON')?.sku||null:null,
      source: r.variant?.source || "MANUAL",
      fulfillment:r.variant?.fulfillment,
      platformManaged:Boolean(r.platformManaged),
      folderId: r.variant?.inventoryFolderId || null,
      folderName: r.variant?.inventoryFolder?.name || "Sem pasta",
      sharedPhysical: r.folderPhysical,
      sharedAvailable: r.folderAvailable,
      trackedShopify: Number(r.trackedSales?.shopify || 0),
      trackedMl: Number(r.trackedSales?.ml || 0),
      trackedAmazon: Number(r.trackedSales?.amazon || 0),
      trackedShopee: Number(r.trackedSales?.shopee || 0),
      trackedManual: Number(r.trackedSales?.manual || 0),
    };
    if (r.warehouse?.code === "CENTRAL") {
      item.physical += r.onHand;
      item.reserved += r.reserved;
      item.available += Number(r.available ?? Math.max(0, Number(r.onHand || 0) - Number(r.reserved || 0)));
    }
    const transfer = transfers.get(sku);
    if (transfer) { item.fbaQty = transfer.fba; item.fullQty = transfer.full; }
    item.status = item.available <= item.safety ? "Pouco" : "Saudável";
    bySku.set(sku, item);
  }
  return [...bySku.values()].map(item=>{
    const sales=item.shopify+item.ml+item.amazon+item.shopee+item.manual;
    const physical=item.platformManaged?Number(item.physical||0):Number(physicalBySku.get(item.sku)||0)-sales;
    const available=!item.platformManaged&&!item.folderId?physical-Number(item.reserved||0):Number(item.available||0);
    return {...item,physical,available,status:available<=item.safety?'Pouco':'Saudável'};
  });
}
function movementTypeLabel(type: string, quantity = 0) {
  if (type === "ADJUSTMENT" || type === "PURCHASE") return quantity < 0 ? "Saída manual" : "Entrada manual";
  if (type === "SALE") return "Venda";
  if (type === "DAMAGE") return "Avaria";
  if (type === "RETURN") return "Devolução";
  if (type === "RESERVE") return "Reserva";
  if (type === "RELEASE") return "Liberação";
  if (type === "TRANSFER_IN") return "Transferência recebida";
  if (type === "TRANSFER_OUT") return "Transferência enviada";
  return type;
}
function formatMovements(rows: any[], balances: any[] = [], folders: any[] = []) {
  const byKey = new Map((rows || []).filter((m) => m.idempotencyKey).map((m) => [m.idempotencyKey, m]));
  const running = new Map<string, number>();
  for (const folder of folders) running.set(`folder:${folder.name}`, Number(folder.physical || 0));
  for (const balance of balances) if (!balance.variant?.inventoryFolder?.name) running.set(`sku:${balance.variant?.sku || balance.sku}:${balance.warehouse?.code || balance.warehouseCode}`, Number(balance.officialOnHand ?? balance.onHand ?? 0));
  return (rows || []).map((m) => {
    const pairKey = String(m.idempotencyKey || "");
    const other = byKey.get(m.type === "TRANSFER_IN" ? pairKey.slice(0, -3) : `${pairKey}:in`);
    const balanceKey = m.folderName && m.folderName !== "Sem pasta" ? `folder:${m.folderName}` : `sku:${m.sku}:${m.warehouseCode}`;
    const balance = running.get(balanceKey);
    if (balance !== undefined && m.type !== "RESERVE" && m.type !== "RELEASE") running.set(balanceKey, balance - Number(m.quantity || 0));
    return ({
    id: m.id,
    raw: m,
    date: fmtMovementDate(m),
    createdAt: movementLocalDateTime(m),
    sku: m.folderMovement ? "—" : m.sku,
    folderId: m.folderId || m.raw?.variant?.inventoryFolder?.id || null,
    folderName: m.folderName || "Sem pasta",
    type: movementTypeLabel(m.type, Number(m.quantity || 0)),
    rawType: m.type,
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
function ChannelTable({ rows, hidden = false, title = "Performance por canal" }: { rows: any[]; hidden?: boolean; title?: string }) {
  return (
    <article className="card tableCard">
      <div className="sectionHead">
        <div>
          <h2>{title}</h2>
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
function Inventory({ products, folders = [], onRefresh, onEdit, onDeleteMany, bulkEnabled = false, hidden = false, showShopee = false, salesPeriod = "Tempo todo" }: any) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const toggleSelected = (sku: string) => setSelected((previous) => { const next = new Set(previous); next.has(sku) ? next.delete(sku) : next.add(sku); return next; });
  const assignedFolderIds=new Set(folders.map((folder:any)=>folder.id));
  const unassignedProducts=products.filter((product:any)=>!product.folderId||!assignedFolderIds.has(product.folderId));
  const physical = folders.reduce((sum:number,folder:any)=>sum+Number(folder.physical||0),0)+unassignedProducts.reduce((sum:number,product:any)=>sum+Number(product.physical||0),0);
  const available = folders.reduce((sum:number,folder:any)=>sum+Number(folder.available||0),0)+unassignedProducts.reduce((sum:number,product:any)=>sum+Number(product.available||0),0);
  const reserved = folders.reduce((sum:number,folder:any)=>sum+Number(folder.reserved||0),0)+unassignedProducts.reduce((sum:number,product:any)=>sum+Number(product.reserved||0),0);
  const total = (key: string) => products.reduce((sum: number, item: any) => sum + Number(item[key] || 0), 0);
  const [openVoltageFolders, setOpenVoltageFolders] = useState<Set<string>>(new Set());
  const [folderModalOpen,setFolderModalOpen]=useState(false);
  const [folderName,setFolderName]=useState("");
  const [folderSkus,setFolderSkus]=useState<Set<string>>(new Set());
  const [folderBusy,setFolderBusy]=useState(false);
  const voltageFolders = useMemo(() => {
    const grouped=new Map<string,any[]>(folders.map((folder:any)=>[String(folder.name),[]]));
    grouped.set("Sem pasta",[]);
    for(const item of products){const name=String(item.folderName||"Sem pasta");if(!grouped.has(name))grouped.set(name,[]);grouped.get(name)!.push(item)}
    return [...grouped.entries()].filter(([,items])=>items.length);
  }, [products,folders]);
  const folderTotal = (items: any[], key: string) => items.reduce((sum, item) => sum + Number(item[key] || 0), 0);
  const folderStock=(name:string,items:any[],key:'physical'|'available')=>name==='Sem pasta'?folderTotal(items,key):Number(folders.find((folder:any)=>folder.name===name)?.[key]||0);
  const folderMetric=(name:string,items:any[],key:string)=>name==='Sem pasta'?folderTotal(items,key):Number(folders.find((folder:any)=>folder.name===name)?.[key]||0);
  const productSale=(item:any,key:'shopify'|'ml'|'amazon'|'shopee'|'manual')=>{
    return Number(item[key]||0);
  };
  const consolidatedTotal=(key:string)=>folders.reduce((sum:number,folder:any)=>sum+Number(folder[key]||0),0)+folderTotal(unassignedProducts,key);
  const totalSales=consolidatedTotal("shopify")+consolidatedTotal("ml")+consolidatedTotal("amazon")+consolidatedTotal("shopee")+consolidatedTotal("manual");
  const toggleVoltageFolder = (folder: string) => setOpenVoltageFolders(current => { const next = new Set(current); next.has(folder) ? next.delete(folder) : next.add(folder); return next; });
  const moveToFolder=async(sku:string,folderId:string)=>{await apiJson('/api/inventory/folders',{method:'PATCH',body:JSON.stringify({sku,folderId:folderId||null})});await onRefresh?.()};
  const createFolder=async()=>{if(!folderName.trim())return;setFolderBusy(true);try{await apiJson('/api/inventory/folders',{method:'POST',body:JSON.stringify({name:folderName.trim(),skus:[...folderSkus]})});setFolderName('');setFolderSkus(new Set());setFolderModalOpen(false);await onRefresh?.()}finally{setFolderBusy(false)}};
  const productRow = (i: any) => <tr key={i.sku} className={`inventoryChildRow ${bulkEnabled && selected.has(String(i.sku)) ? "mobileSelectedRow" : ""}`} onClick={() => { if (bulkEnabled && window.matchMedia("(max-width: 650px)").matches) { if (selecting) toggleSelected(String(i.sku)); else onEdit(i); } }}>
    {bulkEnabled && selecting && <td className="checkCol" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected.has(String(i.sku))} onChange={() => toggleSelected(String(i.sku))} aria-label={`Selecionar ${i.product}`} /></td>}
    <td><b className="inventoryProductName" title={i.product}>{i.product}</b></td>
    <td><b>{i.sku}</b></td>
    <td className="salesOriginCell"><span className="salesOrigin">{salesOriginLogo(i.source)&&<span className="salesOriginLogo"><img src={salesOriginLogo(i.source)} alt="" /></span>}<span>{originLabel(i.fulfillment === 'Amazon FBA' ? i.fulfillment : i.source)}</span></span></td>
    <td>{bulkEnabled?<div className="inventoryFolderMenu" onClick={event=>event.stopPropagation()}><AnchoredSelect compact value={String(i.folderId||"")} onChange={folderId=>void moveToFolder(i.sku,folderId)} options={[{value:"",label:"Sem pasta"},...folders.map((folder:any)=>({value:String(folder.id),label:String(folder.name)}))]}/></div>:i.folderName}</td><td>{hidden ? "—" : money(i.cost || 0)}</td><td>{hidden ? "—" : money(i.price || 0)}</td><td>{hidden ? "—" : i.platformManaged&&i.folderId?`${i.available}/${Number(i.sharedPhysical||0)}`:i.platformManaged?i.physical:bulkEnabled&&i.folderId?i.sharedPhysical:i.physical}</td><td>{hidden ? "—" : i.available}</td>
    <td>{hidden ? "—" : productSale(i,"shopify")}</td><td>{hidden ? "—" : productSale(i,"ml")}</td><td>{hidden ? "—" : productSale(i,"amazon")}</td>{showShopee && <td>{hidden ? "—" : productSale(i,"shopee")}</td>}
    <td><b>{hidden ? "—" : productSale(i,"shopify")+productSale(i,"ml")+productSale(i,"amazon")+productSale(i,"shopee")+productSale(i,"manual")}</b></td><td>{hidden ? "—" : i.fbaQty}</td><td>{hidden ? "—" : i.fullQty}</td>
    <td><span className={`status ${i.status === "Saudável" ? "ok" : "warn"}`}>{i.status}</span></td><td><button className="mini" onClick={(event) => { event.stopPropagation(); onEdit(i); }} disabled={hidden}><Pencil size={14} /></button></td>
  </tr>;
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
        {bulkEnabled&&<button type="button" className="ghost clickable inventoryCreateFolder" onClick={()=>{setFolderSkus(new Set());setFolderModalOpen(true)}}><Plus size={14}/>Nova pasta</button>}
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
              <th className="salesOriginCell">Origem</th>
              <th>Pasta</th>
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
          <tbody>{voltageFolders.map(([folder,items])=>{if(folder==='Sem pasta')return <Fragment key={folder}>{items.map(productRow)}</Fragment>;const open=openVoltageFolders.has(folder);const sales=folderMetric(folder,items,"shopify")+folderMetric(folder,items,"ml")+folderMetric(folder,items,"amazon")+folderMetric(folder,items,"shopee")+folderMetric(folder,items,"manual");return <Fragment key={folder}><tr className="inventoryFolderRow" onClick={()=>toggleVoltageFolder(folder)}>{bulkEnabled&&selecting&&<td/>}<td><button type="button" className="inventoryFolderButton">{open?<ChevronUp size={16}/>:<ChevronDown size={16}/>}<span><b>{folder}</b><small>{items.length} {items.length===1?"produto":"produtos"}</small></span></button></td><td>—</td><td>—</td><td>{folder}</td><td>—</td><td>—</td><td><b>{hidden?"—":folderStock(folder,items,"physical")}</b></td><td>{hidden?"—":folderStock(folder,items,"available")}</td><td>{hidden?"—":folderMetric(folder,items,"shopify")}</td><td>{hidden?"—":folderMetric(folder,items,"ml")}</td><td>{hidden?"—":folderMetric(folder,items,"amazon")}</td>{showShopee&&<td>{hidden?"—":folderMetric(folder,items,"shopee")}</td>}<td><b>{hidden?"—":sales}</b></td><td>{hidden?"—":folderTotal(items,"fbaQty")}</td><td>{hidden?"—":folderTotal(items,"fullQty")}</td><td>—</td><td></td></tr>{open&&items.map(productRow)}</Fragment>})}</tbody>
          <tfoot><tr className="inventoryTotalRow">{bulkEnabled && selecting && <td className="checkCol" />}<td><b>Total</b></td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td><b>{hidden ? "—" : physical}</b></td><td>—</td><td>{hidden ? "—" : consolidatedTotal("shopify")}</td><td>{hidden ? "—" : consolidatedTotal("ml")}</td><td>{hidden ? "—" : consolidatedTotal("amazon")}</td>{showShopee && <td>{hidden ? "—" : consolidatedTotal("shopee")}</td>}<td><b>{hidden ? "—" : totalSales}</b></td><td>{hidden ? "—" : total("fbaQty")}</td><td>{hidden ? "—" : total("fullQty")}</td><td>—</td><td></td></tr></tfoot>
        </table>
      </div>
      {folderModalOpen&&<div className="salesConfirmBackdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!folderBusy)setFolderModalOpen(false)}}><div className="salesConfirmDialog inventoryFolderDialog" role="dialog" aria-modal="true"><h2>Nova pasta de estoque</h2><p>Crie uma pasta e selecione os produtos equivalentes.</p><label className="field"><span>Nome da pasta</span><input autoFocus value={folderName} onChange={event=>setFolderName(event.target.value)} placeholder="Ex.: 127V"/></label><div className="inventoryFolderProducts"><span>Produtos</span>{products.map((product:any)=><label key={product.sku}><input type="checkbox" checked={folderSkus.has(String(product.sku))} onChange={()=>setFolderSkus(current=>{const next=new Set(current);next.has(String(product.sku))?next.delete(String(product.sku)):next.add(String(product.sku));return next})}/><span><b title={product.product}>{product.product}</b><small>{product.sku} · {originLabel(product.source)}</small></span></label>)}</div><div className="salesConfirmActions"><button className="ghost clickable" disabled={folderBusy} onClick={()=>setFolderModalOpen(false)}>Cancelar</button><button className="primary" disabled={folderBusy||!folderName.trim()||!folderSkus.size} onClick={()=>void createFolder()}>{folderBusy?'Criando...':'Criar pasta'}</button></div></div></div>}
    </article>
  );
}
function Products({ products, orders = [], onNew, onEdit, onDelete, onDeleteMany, platforms = [], onImported }: any) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const toggleSelected = (sku: string) => setSelected((previous) => { const next = new Set(previous); next.has(sku) ? next.delete(sku) : next.add(sku); return next; });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [importOpen, setImportOpen] = useState(false);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importSelected, setImportSelected] = useState<Set<number>>(new Set());
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [systemNotice, setSystemNotice] = useState<{title:string;message:string}|null>(null);
  const [openParents,setOpenParents]=useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const normalizedProductQuery=query.trim().toLowerCase();
  const filteredProducts = products.filter((p: any) => `${p.product} ${p.name} ${p.sku}`.toLowerCase().includes(normalizedProductQuery));
  const parentGroups=new Map<string,any[]>();
  for(const product of filteredProducts){const key=`${product.source||'MANUAL'}:${product.parentId||product.productId||product.product}`;const group=parentGroups.get(key)||[];group.push(product);parentGroups.set(key,group)}
  const productGroups=[...parentGroups.entries()];
  const pages = Math.max(1, Math.ceil(productGroups.length / pageSize));
  const visibleGroups=productGroups.slice((Math.min(page,pages)-1)*pageSize,Math.min(page,pages)*pageSize);
  const visible=visibleGroups.flatMap(([key,variants])=>variants.length<2?variants:[{isParent:true,parentKey:key,product:variants[0].parentName||variants[0].product,imageUrl:variants[0].imageUrl,source:variants[0].source,fulfillment:variants.every((variant:any)=>variant.fulfillment==='Amazon FBA')?'Amazon FBA':variants[0].fulfillment,parentSku:variants[0].parentSku,variantCount:variants.length,childSkus:variants.map((variant:any)=>String(variant.sku)),sku:`parent:${key}`},...((openParents.has(key)||Boolean(normalizedProductQuery))?variants.map((variant:any)=>({...variant,parentKey:key})):[])])
  const editable = (p: any) => ({ ...p, cost: p.unitCost, price: p.salePrice });
  const productBySku = new Map<string, any>(products.map((product: any) => [String(product.sku), product]));
  const salesBySku = new Map<string, { units: number; revenue: number; fees: number; shipping: number; cost: number }>();
  for (const order of orders) {
    if (order.status !== "PAID") continue;
    const items = order.items || [];
    const lineValues = items.map((item: any) => Number(item.unitPrice || 0) * Number(item.quantity || 0));
    const linesTotal = lineValues.reduce((sum: number, value: number) => sum + value, 0);
    const orderRevenue = Number(order.grossAmount || 0) - Number(order.discountAmount || 0);
    const orderFees = Number(order.feeAmount || 0) + Number(order.taxAmount || 0);
    const orderShipping = Number(order.shippingAmount || 0);
    items.forEach((item: any, index: number) => {
      const sku = String(item.variant?.sku || item.sku || "");
      if (!sku) return;
      const quantity = Number(item.quantity || 0);
      const share = linesTotal > 0 ? lineValues[index] / linesTotal : items.length ? 1 / items.length : 0;
      const current = salesBySku.get(sku) || { units: 0, revenue: 0, fees: 0, shipping: 0, cost: 0 };
      current.units += quantity;
      current.revenue += orderRevenue * share;
      current.fees += orderFees * share;
      current.shipping += orderShipping * share;
      current.cost += Number(item.unitCost || productBySku.get(sku)?.unitCost || 0) * quantity;
      salesBySku.set(sku, current);
    });
  }
  const emptyProductMetrics = () => ({ units: 0, revenue: 0, fees: 0, shipping: 0, cost: 0 });
  const productMetrics = (product: any) => {
    const skus = product.isParent ? product.childSkus || [] : [String(product.sku)];
    return skus.reduce((total: ReturnType<typeof emptyProductMetrics>, sku: string) => {
      const metrics = salesBySku.get(String(sku)) || emptyProductMetrics();
      total.units += metrics.units;
      total.revenue += metrics.revenue;
      total.fees += metrics.fees;
      total.shipping += metrics.shipping;
      total.cost += metrics.cost;
      return total;
    }, emptyProductMetrics());
  };
  const productMargin = (product: any) => {
    const metrics = productMetrics(product);
    return metrics.revenue ? (metrics.revenue - metrics.fees - metrics.shipping - metrics.cost) / metrics.revenue : 0;
  };
  const readImportFile = async (file: File) => {
    const text = await file.text();
    let parsed:any[]=[];
    if(file.name.toLowerCase().endsWith('.xml')){
      const doc=new DOMParser().parseFromString(text,'application/xml');
      parsed=[...doc.querySelectorAll('produto, product, item')].map((node:any)=>({sku:node.querySelector('sku, codigo, code')?.textContent?.trim(),product:node.querySelector('produto, product, title, nome, name')?.textContent?.trim(),name:node.querySelector('variante, variant, nome, name, title')?.textContent?.trim(),price:Number(String(node.querySelector('preco, price, valor')?.textContent||'0').replace(',','.')),cost:Number(String(node.querySelector('custo, cost')?.textContent||'0').replace(',','.')),quantity:Number(node.querySelector('quantidade, quantity, estoque, stock')?.textContent||0)}));
    }else{
      const lines=text.split(/\r?\n/).filter(Boolean); const headers=(lines.shift()||'').split(/[,;]/).map(value=>value.trim().toLowerCase());
      parsed=lines.map(line=>{const values=line.split(/[,;]/).map(value=>value.replace(/^"|"$/g,'').trim()); const row=Object.fromEntries(headers.map((header,index)=>[header,values[index]])); return {sku:row.sku||row.codigo||row.code,product:row.produto||row.product||row.nome||row.name,name:row.variante||row.variant||row.nome||row.name,price:Number(String(row.preco||row.price||row.valor||0).replace(',','.')),cost:Number(String(row.custo||row.cost||0).replace(',','.')),quantity:Number(row.quantidade||row.quantity||row.estoque||row.stock||0)};});
    }
    parsed=parsed.filter(row=>row.sku);
    setImportRows(parsed); setImportSelected(new Set(parsed.map((_,index)=>index))); setImportMenuOpen(false); setImportOpen(true);
  };
  const executeImport = async () => {
    setImporting(true);
    try{
      const body=importRows.length?{rows:importRows.filter((_,index)=>importSelected.has(index))}:{platforms:[...selectedPlatforms]};
      const result=await apiJson('/api/products/import',{method:'POST',body:JSON.stringify(body)});
      await onImported?.(); setImportOpen(false); setImportRows([]); setSelectedPlatforms(new Set());
      setSystemNotice({title:'Sincronização concluída',message:`${result.imported||0} produtos importados.`});
    }catch(error:any){setSystemNotice({title:'Não foi possível sincronizar',message:error.message||'Não foi possível importar os produtos.'});}finally{setImporting(false);}
  };
  return (
    <article className="card tableCard">
      <div className="sectionHead">
        <div>
          <h2>Catálogo de produtos</h2>
          <p>{parentGroups.size} produtos · {filteredProducts.length} variações, SKUs, preços e disponibilidade</p>
        </div>
        <div className="rowActions productCatalogActions"><div className="exportMenu"><button className="ghost clickable" onClick={() => setImportMenuOpen((open)=>!open)}><Upload size={14} />Importar</button>{importMenuOpen&&<div className="exportOptions"><button onClick={()=>{if(fileRef.current){fileRef.current.accept='.csv';fileRef.current.click()}}}>CSV</button><button onClick={()=>{if(fileRef.current){fileRef.current.accept='.xml';fileRef.current.click()}}}>XML</button></div>}<input ref={fileRef} hidden type="file" onChange={(event)=>{const file=event.target.files?.[0];if(file)void readImportFile(file);event.currentTarget.value=''}}/></div><button className="ghost clickable" onClick={() => {setImportRows([]);setSelectedPlatforms(new Set());setImportOpen(true)}}><RefreshCw size={14}/>Sincronizar produtos</button><button className="primary" onClick={onNew}><Plus size={14} />Novo produto</button></div>
      </div>
      <MobileBulkActions ids={visible.filter((product:any)=>!product.isParent).map((product: any) => String(product.sku))} selected={selected} setSelected={setSelected} selecting={selecting} setSelecting={setSelecting} onDeleteMany={onDeleteMany} label="produtos" />
      <div className="catalogToolbar">
        <label className="catalogSearch"><Search size={15} /><input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Pesquisar produto ou SKU..." /></label>
        <div className="catalogPageSize">Itens por página <AnchoredSelect value={String(pageSize)} onChange={(v) => { setPageSize(Number(v)); setPage(1); }} options={["10", "25", "50"]} compact /></div>
      </div>
      <div className="tableWrap">
        <table className="catalogTable">
          <colgroup>{selecting&&<col style={{width:42}}/>}<col style={{width:64}}/><col style={{width:420}}/><col style={{width:360}}/><col style={{width:180}}/><col style={{width:160}}/><col style={{width:160}}/><col style={{width:160}}/><col style={{width:160}}/><col style={{width:160}}/><col style={{width:160}}/><col style={{width:160}}/><col style={{width:112}}/></colgroup>
          <thead><tr>{selecting && <th className="checkCol"><input type="checkbox" checked={visible.some((item:any)=>!item.isParent) && visible.filter((item:any)=>!item.isParent).every((item: any) => selected.has(String(item.sku)))} onChange={() => {const variants=visible.filter((item:any)=>!item.isParent);setSelected(variants.every((item:any)=>selected.has(String(item.sku)))?new Set():new Set(variants.map((item:any)=>String(item.sku))))}} aria-label="Selecionar todos os produtos exibidos" /></th>}<th></th><th>Nome</th><th>SKU</th><th>Origem</th><th>Preço</th><th>Custo</th><th className="catalogMetricHeader">Unidades vendidas</th><th className="catalogMetricHeader">Total faturado</th><th>Taxas</th><th>Frete</th><th className="catalogMargin">Margem</th><th aria-label="Ações"></th></tr></thead>
          <tbody>{visible.map((p: any) => p.isParent?<tr key={p.sku} className="catalogParentRow" onClick={()=>setOpenParents(current=>{const next=new Set(current);next.has(p.parentKey)?next.delete(p.parentKey):next.add(p.parentKey);return next})}>{selecting&&<td/>}<td><span className="catalogImage">{p.imageUrl?<img src={p.imageUrl} alt={p.product}/>:<PackageCheck size={18}/>}</span></td><td><button type="button" className="catalogParentButton">{openParents.has(p.parentKey)||normalizedProductQuery?<ChevronUp size={16}/>:<ChevronDown size={16}/>}<span><b>{p.product}</b><small>{p.variantCount} variações</small></span></button></td><td><b>{p.parentSku||'—'}</b></td><td><span className="catalogOrigin">{p.source!=='MANUAL'&&<span className="filterPlatformLogo"><img src={integrationLogoSrc[p.source==='MERCADO_LIVRE'?'Mercado Livre':p.source==='AMAZON'?'Amazon':'Shopify']} alt="" /></span>}{originLabel(p.fulfillment||(p.source==='MERCADO_LIVRE'?'Mercado Livre':p.source==='AMAZON'?'Amazon':p.source==='SHOPIFY'?'Shopify':'Manual'))}</span></td><td>—</td><td>—</td><td>{productMetrics(p).units}</td><td>{money(productMetrics(p).revenue)}</td><td className={productMetrics(p).fees ? "negative" : undefined}>{money(productMetrics(p).fees ? -Math.abs(productMetrics(p).fees) : 0)}</td><td className={productMetrics(p).shipping ? "negative" : undefined}>{money(productMetrics(p).shipping ? -Math.abs(productMetrics(p).shipping) : 0)}</td><td>{(productMargin(p) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</td><td/></tr>:<tr key={p.sku} className={`${p.parentKey?'catalogVariationRow ':''}${selected.has(String(p.sku)) ? "mobileSelectedRow" : ''}`} onClick={() => { if (window.matchMedia("(max-width: 650px)").matches) { if (selecting) toggleSelected(String(p.sku)); else onEdit(editable(p)); } }}>
            {selecting && <td className="checkCol" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected.has(String(p.sku))} onChange={() => toggleSelected(String(p.sku))} aria-label={`Selecionar ${p.product}`} /></td>}<td><span className="catalogImage">{p.imageUrl?<img src={p.imageUrl} alt={p.product}/>:<PackageCheck size={18}/>}</span></td><td className="catalogProductName" title={p.product}>{p.externalUrl?<a href={p.externalUrl} target="_blank" rel="noreferrer" onClick={(event)=>event.stopPropagation()}>{p.product}</a>:p.product}</td><td><b>{p.sku}</b></td><td><span className="catalogOrigin">{p.source!=='MANUAL'&&<span className="filterPlatformLogo"><img src={integrationLogoSrc[p.source==='MERCADO_LIVRE'?'Mercado Livre':p.source==='AMAZON'?'Amazon':'Shopify']} alt="" /></span>}{originLabel(p.fulfillment|| (p.source==='MERCADO_LIVRE'?'Mercado Livre':p.source==='AMAZON'?'Amazon':p.source==='SHOPIFY'?'Shopify':'Manual'))}</span></td><td>{money(Number(p.salePrice || 0))}</td><td>{money(Number(p.unitCost || 0))}</td><td>{productMetrics(p).units}</td><td>{money(productMetrics(p).revenue)}</td><td className={productMetrics(p).fees ? "negative" : undefined}>{money(productMetrics(p).fees ? -Math.abs(productMetrics(p).fees) : 0)}</td><td className={productMetrics(p).shipping ? "negative" : undefined}>{money(productMetrics(p).shipping ? -Math.abs(productMetrics(p).shipping) : 0)}</td><td className="catalogMargin">{(productMargin(p) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</td>
            <td><div className="catalogRowActions"><button className="mini" title="Editar produto" aria-label={`Editar ${p.name}`} onClick={(event) => { event.stopPropagation(); onEdit(editable(p)); }}><Pencil size={15} /></button><button className="mini danger" title="Excluir produto" aria-label={`Excluir ${p.name}`} onClick={(event) => { event.stopPropagation(); onDelete(p); }}><Trash2 size={15} /></button></div></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!productGroups.length && <div className="catalogEmpty">Nenhum produto encontrado.</div>}
      <div className="catalogPagination"><span>Página {Math.min(page, pages)} de {pages}</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><button disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</button></div></div>
      {importOpen && <div className="salesConfirmBackdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!importing)setImportOpen(false)}}><div className="productImportDialog" role="dialog" aria-modal="true"><div className="modalHead"><div><h2>{importRows.length?'Importar produtos':'Sincronizar produtos'}</h2><p>{importRows.length?'Selecione os produtos encontrados no arquivo.':'Puxe os produtos das plataformas de venda integradas.'}</p></div><button className="close" onClick={()=>setImportOpen(false)}><X/></button></div><div className="productImportBody">
        {!importRows.length&&<><h3>Plataformas de venda integradas</h3><p className="muted">Selecione uma ou mais plataformas</p><div className="platformImportGrid">{platforms.length?platforms.map((platform:string)=><button key={platform} className={selectedPlatforms.has(platform)?'selected':''} onClick={()=>setSelectedPlatforms(current=>{const next=new Set(current);next.has(platform)?next.delete(platform):next.add(platform);return next})}><span className="platformSyncLogo"><img src={integrationLogoSrc[platform]} alt="" /></span><span className="platformSyncInfo"><span className="platformSyncTitle"><b>{platform}</b><span className="platformSyncStatus">Conectado</span></span><small>Sincronizar produtos</small></span></button>):<p className="muted">Nenhuma plataforma de vendas conectada.</p>}</div></>}
        {!!importRows.length&&<><div className="sectionHead"><div><h3>Produtos encontrados</h3><p>{importSelected.size} de {importRows.length} selecionados</p></div><button className="ghost clickable" onClick={()=>setImportSelected(importSelected.size===importRows.length?new Set():new Set(importRows.map((_,index)=>index)))}>{importSelected.size===importRows.length?'Desmarcar todos':'Selecionar todos'}</button></div><div className="importPreview">{importRows.map((row,index)=><label key={`${row.sku}-${index}`}><input type="checkbox" checked={importSelected.has(index)} onChange={()=>setImportSelected(current=>{const next=new Set(current);next.has(index)?next.delete(index):next.add(index);return next})}/><span><b>{row.product||row.name||row.sku}</b><small>{row.sku}</small></span></label>)}</div></>}
      </div><div className="modalFoot"><button className="ghost clickable" onClick={()=>setImportOpen(false)}>Cancelar</button><button className="primary" disabled={importing||(!importRows.length&&!selectedPlatforms.size)||Boolean(importRows.length&&!importSelected.size)} onClick={executeImport}>{importing?'Aguarde...':importRows.length?'Importar selecionados':'Sincronizar produtos'}</button></div></div></div>}
      {systemNotice&&<div className="salesConfirmBackdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)setSystemNotice(null)}}><div className="salesConfirmDialog" role="alertdialog" aria-modal="true"><h2>{systemNotice.title}</h2><p>{systemNotice.message}</p><div className="salesConfirmActions"><button className="primary" onClick={()=>setSystemNotice(null)}>OK</button></div></div></div>}
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
        <div className="salesSelectField"><span>Origem</span><AnchoredSelect value={origin} onChange={setOrigin} options={[{ value: "", label: "TODAS" }, ...origins.map((channel) => ({ value: channel, label: originLabel(channel), icon: salesOriginLogo(channel) }))]} compact /></div>
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
                <td className="salesOriginCell">
                  <b>{c.name || "Cliente sem nome"}</b>
                </td>
                <td>{c.city || "—"}</td>
                <td>{c.state || "—"}</td>
                <td>{c.orders}</td>
                <td>{money(c.revenue || 0)}</td>
                <td>{c.lastChannel ? originLabel(c.lastChannel) : "—"}</td>
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
function Sales({ q, setQ, rows, onNew, onOpen, onDelete, onDeleteMany, onExport, notify }: any) {
  const [status, setStatus] = useState("PAID");
  const [source, setSource] = useState("Todas");
  const [product, setProduct] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
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
  const documentInputRef = useRef<HTMLInputElement>(null);
  const pendingDocumentRef = useRef<{ sale: any; type: "SHIPPING_LABEL" | "REFUNDED_LABEL" | "INVOICE_PDF" | "INVOICE_XML" | "REFUNDED_DANFE" | "REFUNDED_XML" } | null>(null);
  const [billingDocuments, setBillingDocuments] = useState<any[]>([]);
  const [uploadingDocument, setUploadingDocument] = useState("");
  const [invoiceMenuSale, setInvoiceMenuSale] = useState("");
  const loadBillingDocuments = async () => {
    try {
      const data = await apiJson("/api/billing-documents");
      setBillingDocuments(data.documents || []);
    } catch (error: any) {
      notify?.(error.message || "Não foi possível carregar os documentos");
    }
  };
  useEffect(() => { loadBillingDocuments(); }, []);
  const documentMap = useMemo(() => new Map(billingDocuments.map((document: any) => [`${document.orderId}:${document.type}`, document])), [billingDocuments]);
  const chooseDocument = (sale: any, type: "SHIPPING_LABEL" | "REFUNDED_LABEL" | "INVOICE_PDF" | "INVOICE_XML" | "REFUNDED_DANFE" | "REFUNDED_XML") => {
    pendingDocumentRef.current = { sale, type };
    if (documentInputRef.current) {
      documentInputRef.current.value = "";
      documentInputRef.current.accept = type === "INVOICE_XML" || type === "REFUNDED_XML" ? ".xml,application/xml,text/xml" : ".pdf,application/pdf";
      documentInputRef.current.click();
    }
  };
  const uploadDocument = async (file?: File) => {
    const pending = pendingDocumentRef.current;
    if (!pending || !file) return;
    const uploadKey = `${keyOf(pending.sale)}:${pending.type}`;
    setUploadingDocument(uploadKey);
    try {
      const form = new FormData();
      form.set("orderId", keyOf(pending.sale));
      form.set("type", pending.type);
      form.set("file", file);
      const response = await fetch("/api/billing-documents", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) throw new Error(result.error || "Falha no upload");
      await loadBillingDocuments();
      notify?.(`${pending.type === "SHIPPING_LABEL" ? "Etiqueta" : pending.type === "REFUNDED_LABEL" ? "Etiqueta Refunded" : pending.type === "REFUNDED_XML" ? "XML de devolução" : pending.type === "REFUNDED_DANFE" ? "DANFE de devolução" : pending.type === "INVOICE_XML" ? "XML da nota fiscal" : "DANFE PDF"} adicionado ao pedido ${pending.sale.id}`);
    } catch (error: any) {
      notify?.(error.message || "Não foi possível enviar o documento");
    } finally {
      setUploadingDocument("");
      pendingDocumentRef.current = null;
    }
  };
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
  const products = useMemo(() => [...new Map<string, string>(rows.flatMap((sale: any) => sale.raw?.items || []).map((item: any) => [String(item.variant?.sku || item.sku), orderItemProductLabel(item)] as [string, string])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const paymentMethods = useMemo(() => [...new Set<string>(rows.map((sale: any) => normalizePaymentMethod(sale.paymentMethod)).filter((method: string) => method && method.toLowerCase() !== "manual"))].sort(), [rows]);
  const filtered = useMemo(
    () =>
      rows.filter((s: any) => {
        const key = s.raw?.paidAt || s.raw?.createdAt;
        const day = key ? dateKey(key) : "";
        return (status === "Todos" || s.status === status) && (source === "Todas" || s.source === source) && (!product || (s.raw?.items || []).some((item: any) => String(item.variant?.sku || item.sku) === product)) && (!paymentMethod || normalizePaymentMethod(s.paymentMethod) === paymentMethod) && (!from || day >= from) && (!to || day <= to);
      }),
    [rows, status, source, product, paymentMethod, from, to],
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
  }, [q, status, source, product, paymentMethod, from, to, pageSize]);
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
      <input ref={documentInputRef} className="billingFileInput" type="file" onChange={(event) => uploadDocument(event.target.files?.[0])} />
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
        <div className="salesSelectField"><span>Origem</span><AnchoredSelect value={source} onChange={setSource} options={sources.map((channel) => ({ value: String(channel), label: originLabel(channel), icon: salesOriginLogo(channel) }))} compact /></div>
        <div className="salesSelectField"><span>Produto</span><AnchoredSelect value={product} onChange={setProduct} options={[{ value: "", label: "Todos" }, ...products.map(([sku, name]) => ({ value: sku, label: name }))]} compact /></div>
        <div className="salesSelectField"><span>Método de Pag.</span><AnchoredSelect value={paymentMethod} onChange={setPaymentMethod} options={[{ value: "", label: "Todos" }, ...paymentMethods]} compact /></div>
        <button
          className="ghost clickable"
          onClick={() => {
            setStatus("Todos");
            setSource("Todas");
            setProduct("");
            setPaymentMethod("");
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
              <th className="salesProductCell">Produto</th>
              <th className="salesSkuCell">SKU</th>
              <th className="salesClientCell">Cliente</th>
              <th className="salesOriginCell">Origem</th>
              <th>Valor</th>
              <th>Método de Pag.</th>
              <th>Taxa da plataforma</th>
              <th>Frete</th>
              <th>Taxa FBA</th>
              <th>Taxa ML Full</th>
              <th>Lucro vendas</th>
              <th>Status</th>
              <th className="salesDocumentsHead">Documentos</th>
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
                <td>{s.raw?.platformUrl ? <a className="orderPlatformLink" href={s.raw.platformUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}><b>{s.id}</b></a> : <b>{s.id}</b>}</td>
                <td className="salesProductCell"><span className="salesProductText" title={s.product}>{s.product}</span></td>
                <td className="salesSkuCell" title={s.itemSku}>{s.itemSku || "—"}</td>
                <td className="salesClientCell">{s.customer}</td>
                <td className="salesOriginCell">
                  <span className="salesOrigin">
                    {salesOriginLogo(s.source) && <span className="salesOriginLogo"><img src={salesOriginLogo(s.source)} alt="" /></span>}
                    <span>{originLabel(s.source)}</span>
                  </span>
                </td>
                <td className={isNegativeDisplay(s.value) ? "negative" : undefined}>{s.value}</td>
                <td>{s.paymentMethod || "—"}</td>
                <td className={Number(s.fee || 0) !== 0 && s.source !== "Amazon FBA" && s.source !== "Mercado Livre Full" ? "negative" : undefined}>{money(s.source !== "Amazon FBA" && s.source !== "Mercado Livre Full" && Number(s.fee || 0) ? -Math.abs(Number(s.fee || 0)) : 0)}</td>
                <td className={Number(s.freight || 0) !== 0 ? "negative" : undefined}>{money(Number(s.freight || 0) ? -Math.abs(Number(s.freight || 0)) : 0)}</td>
                <td className={s.source === "Amazon FBA" && Number(s.fee || 0) !== 0 ? "negative" : undefined}>{money(s.source === "Amazon FBA" && Number(s.fee || 0) ? -Math.abs(Number(s.fee || 0)) : 0)}</td>
                <td className={s.source === "Mercado Livre Full" && Number(s.fee || 0) !== 0 ? "negative" : undefined}>{money(s.source === "Mercado Livre Full" && Number(s.fee || 0) ? -Math.abs(Number(s.fee || 0)) : 0)}</td>
                <td className={Number(s.profit || 0) < 0 || s.status === "CANCELLED" ? "negative" : s.status === "REFUNDED" ? "refundedProfit" : "positive"}>{money(s.profit || 0)}</td>
                <td>
                  <span className={`status ${statusClass(s.status)}`}>{s.status}</span>
                </td>
                <td onClick={(event) => event.stopPropagation()}>
                  <div className="salesDocumentActions">
                    {(() => {
                      const labelDocument = documentMap.get(`${keyOf(s)}:SHIPPING_LABEL`) || documentMap.get(`${keyOf(s)}:REFUNDED_LABEL`);
                      const busy = uploadingDocument === `${keyOf(s)}:SHIPPING_LABEL`;
                      return labelDocument ? <a className="salesDocumentButton added" href={`/api/billing-documents/${labelDocument.id}`} title="Baixar etiqueta" aria-label="Baixar etiqueta"><BillingDocumentIcon type="SHIPPING_LABEL" /></a> : <button type="button" className="salesDocumentButton" disabled={busy} onClick={() => chooseDocument(s, "SHIPPING_LABEL")} title="Adicionar etiqueta" aria-label="Adicionar etiqueta">{busy ? <RefreshCw className="spin" size={18} /> : <span className="salesDocumentGlyph"><BillingDocumentIcon type="SHIPPING_LABEL" /><Plus size={9} /></span>}</button>;
                    })()}
                    {(() => {
                      const legacy = documentMap.get(`${keyOf(s)}:INVOICE`);
                      const pdfDocument = documentMap.get(`${keyOf(s)}:INVOICE_PDF`) || (legacy?.mimeType === "application/pdf" ? legacy : null);
                      const xmlDocument = documentMap.get(`${keyOf(s)}:INVOICE_XML`) || (legacy?.mimeType?.includes("xml") ? legacy : null);
                      const refundedDanfe = documentMap.get(`${keyOf(s)}:REFUNDED_DANFE`);
                      const refundedXml = documentMap.get(`${keyOf(s)}:REFUNDED_XML`);
                      const menuOpen = invoiceMenuSale === keyOf(s);
                      const complete = Boolean(pdfDocument && xmlDocument);
                      return <div className="invoiceDocumentMenu">
                        <button type="button" className={`salesDocumentButton ${pdfDocument || xmlDocument ? "added" : ""}`} onClick={() => setInvoiceMenuSale(menuOpen ? "" : keyOf(s))} title="DANFE PDF e XML" aria-label="Abrir arquivos da nota fiscal" aria-expanded={menuOpen}>{complete ? <BillingDocumentIcon type="INVOICE" /> : <span className="salesDocumentGlyph"><BillingDocumentIcon type="INVOICE" /><Plus size={9} /></span>}</button>
                        {menuOpen && <div className="invoiceDocumentOptions">
                          {pdfDocument ? <a href={`/api/billing-documents/${pdfDocument.id}`} title="Baixar DANFE"><Download size={14} /><b>DANFE</b></a> : <button type="button" title="Adicionar DANFE" disabled={uploadingDocument === `${keyOf(s)}:INVOICE_PDF`} onClick={() => { setInvoiceMenuSale(""); chooseDocument(s, "INVOICE_PDF"); }}><Upload size={14} /><b>DANFE</b></button>}
                          {xmlDocument ? <a href={`/api/billing-documents/${xmlDocument.id}`} title="Baixar XML"><Download size={14} /><b>XML</b></a> : <button type="button" title="Adicionar XML" disabled={uploadingDocument === `${keyOf(s)}:INVOICE_XML`} onClick={() => { setInvoiceMenuSale(""); chooseDocument(s, "INVOICE_XML"); }}><Upload size={14} /><b>XML</b></button>}
                          {s.status === "REFUNDED" && (refundedDanfe ? <a href={`/api/billing-documents/${refundedDanfe.id}`} title="Baixar DANFE de devolução"><Download size={14} /><b>DANFE DEV.</b></a> : <button type="button" title="Adicionar DANFE de devolução" disabled={uploadingDocument === `${keyOf(s)}:REFUNDED_DANFE`} onClick={() => { setInvoiceMenuSale(""); chooseDocument(s, "REFUNDED_DANFE"); }}><Upload size={14} /><b>DANFE DEV.</b></button>)}
                          {s.status === "REFUNDED" && (refundedXml ? <a href={`/api/billing-documents/${refundedXml.id}`} title="Baixar XML de devolução"><Download size={14} /><b>XML DEV.</b></a> : <button type="button" title="Adicionar XML de devolução" disabled={uploadingDocument === `${keyOf(s)}:REFUNDED_XML`} onClick={() => { setInvoiceMenuSale(""); chooseDocument(s, "REFUNDED_XML"); }}><Upload size={14} /><b>XML DEV.</b></button>)}
                        </div>}
                      </div>;
                    })()}
                  </div>
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
function BillingDocumentIcon({ type }: { type: "SHIPPING_LABEL" | "REFUNDED_LABEL" | "INVOICE" | "INVOICE_PDF" | "INVOICE_XML" | "REFUNDED_DANFE" | "REFUNDED_XML" }) {
  if (type === "SHIPPING_LABEL" || type === "REFUNDED_LABEL") return <Tag className="billingDocumentTypeIcon" size={19} aria-hidden="true" />;
  return <svg className="billingDocumentTypeIcon billingInvoiceIcon" width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 1.75h7.1L16 6.65v11.6H4z" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round"/><path d="M11 1.75v5h5" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round"/><text x="5.6" y="14.6" fill="currentColor" fontSize="6.6" fontWeight="800" fontFamily="Arial, sans-serif">NF</text></svg>;
}
function BillingDocuments({ notify, mode }: { notify?: (message: string) => void; mode: "invoices" | "labels" }) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("ALL");
  const [channel, setChannel] = useState("");
  const [period, setPeriod] = useState("Tempo todo");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(todayISO().slice(0, 7));
  const [draftRange, setDraftRange] = useState({ from: "", to: "" });
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const pageSize = 25;
  useEffect(() => {
    let active = true;
    setLoading(true);
    apiJson("/api/billing-documents")
      .then((data) => { if (active) setDocuments(data.documents || []); })
      .catch((error) => { if (active) notify?.(error.message || "Não foi possível carregar o faturamento"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const scopedDocuments = useMemo(() => documents.filter((document) => mode === "labels" ? document.type === "SHIPPING_LABEL" || document.type === "REFUNDED_LABEL" : document.type !== "SHIPPING_LABEL" && document.type !== "REFUNDED_LABEL"), [documents, mode]);
  const channels = useMemo(() => [...new Set<string>(scopedDocuments.map((document) => String(document.order?.channel || "")).filter(Boolean))].sort(), [scopedDocuments]);
  const selectedDates = period === "Tempo todo" ? null : periodRange(period, { from, to });
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return scopedDocuments.filter((document) => {
      const matchesType = type === "ALL" || document.type === type || (document.type === "INVOICE" && type === "INVOICE_PDF" && document.mimeType === "application/pdf") || (document.type === "INVOICE" && type === "INVOICE_XML" && document.mimeType?.includes("xml"));
      if (!matchesType) return false;
      if (channel && document.order?.channel !== channel) return false;
      const documentDay = dateKey(document.updatedAt);
      if (selectedDates && (documentDay < selectedDates.from || documentDay > selectedDates.to)) return false;
      if (!needle) return true;
      return [document.fileName, document.order?.externalId, document.order?.customer?.name, document.order?.channel]
        .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(needle));
    });
  }, [scopedDocuments, query, type, channel, period, from, to]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const allSelected = filtered.length > 0 && filtered.every((document) => selected.has(document.id));
  const toggleSelected = (id: string) => setSelected((previous) => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((document) => document.id)));
  const deleteDocuments = async () => {
    if (!pendingDelete.length || deleting) return;
    setDeleting(true);
    try {
      const result = await apiJson("/api/billing-documents", { method: "DELETE", body: JSON.stringify({ ids: pendingDelete }) });
      setDocuments((current) => current.filter((document) => !pendingDelete.includes(document.id)));
      setSelected(new Set());
      setPendingDelete([]);
      notify?.(`${result.deleted || pendingDelete.length} ${pendingDelete.length === 1 ? "documento excluído" : "documentos excluídos"}`);
    } catch (error: any) {
      notify?.(error.message || "Não foi possível excluir os documentos");
    } finally {
      setDeleting(false);
    }
  };
  useEffect(() => { setPage(1); setSelected(new Set()); }, [query, type, channel, period, from, to]);
  const fileSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("pt-BR")} KB`;
  return <div className="billingPage">
    <div className="sectionHead billingActions"><p className="billingIntro">{mode === "labels" ? "Etiquetas vinculadas às vendas e aos clientes" : "DANFEs e XMLs vinculados às vendas e aos clientes"}</p><button type="button" className="ghost clickable salesDeleteButton" disabled={!selected.size} onClick={() => setPendingDelete([...selected])}><Trash2 size={14} />Excluir selecionados</button></div>
    <section className="card salesSearchSection" aria-label="Busca e filtros de faturamento">
      <div className="salesSearchRow">
        <label className="search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar arquivo, venda ou cliente..." aria-label="Buscar documentos" /></label>
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
        <div className="salesSelectField"><span>Canal</span><AnchoredSelect value={channel} onChange={setChannel} options={[{ value: "", label: "TODOS" }, ...channels.map((value) => ({ value, label: originLabel(value), icon: salesOriginLogo(value) }))]} compact /></div>
        {mode === "invoices" && <div className="salesSelectField"><span>Tipo</span><AnchoredSelect value={type} onChange={setType} options={[{ value: "ALL", label: "Todos" }, { value: "INVOICE_PDF", label: "DANFE" }, { value: "INVOICE_XML", label: "XML da NF" }, { value: "REFUNDED_DANFE", label: "DANFE devolução" }, { value: "REFUNDED_XML", label: "XML devolução" }]} compact /></div>}
        <button type="button" className="ghost" onClick={() => { setPeriod("Tempo todo"); setFrom(""); setTo(""); setPeriodOpen(false); setChannel(""); setType("ALL"); }}>Limpar</button>
        <button type="button" className="mobileSalesFilterApply primary" onClick={() => setFiltersOpen(false)}>Aplicar</button>
      </div>
    </section>
    <section className="billingSummary">
      <article className="card kpi"><span>{mode === "labels" ? "Etiquetas" : "Documentos fiscais"}</span><strong>{scopedDocuments.length}</strong></article>
      {mode === "invoices" && <article className="card kpi"><span>DANFEs</span><strong>{scopedDocuments.filter((document) => document.type === "INVOICE_PDF" || document.type === "REFUNDED_DANFE" || (document.type === "INVOICE" && document.mimeType === "application/pdf")).length}</strong></article>}
      {mode === "invoices" && <article className="card kpi"><span>XMLs</span><strong>{scopedDocuments.filter((document) => document.type === "INVOICE_XML" || document.type === "REFUNDED_XML" || (document.type === "INVOICE" && document.mimeType?.includes("xml"))).length}</strong></article>}
    </section>
    <article className="card tableCard">
      <div className="sectionHead"><div><h2>{mode === "labels" ? "Etiquetas" : "Documentos fiscais"}</h2><p>{filtered.length} {filtered.length === 1 ? "documento" : "documentos"}</p></div></div>
      <div className="tableWrap"><table className="billingTable"><thead><tr><th className="checkCol"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos os documentos exibidos" /></th><th>Data</th><th>Tipo</th><th>Arquivo</th><th>Venda</th><th>Cliente</th><th>Canal</th><th>Tamanho</th><th></th></tr></thead><tbody>
        {pageRows.map((document) => <tr key={document.id} className={selected.has(document.id) ? "mobileSelectedRow" : undefined}>
          <td className="checkCol"><input type="checkbox" checked={selected.has(document.id)} onChange={() => toggleSelected(document.id)} aria-label={`Selecionar ${document.fileName}`} /></td>
          <td>{new Date(document.updatedAt).toLocaleDateString("pt-BR")}</td>
          <td><span className={`billingType ${document.type === "SHIPPING_LABEL" || document.type === "REFUNDED_LABEL" ? "label" : document.type.startsWith("REFUNDED") ? "refunded" : "invoice"}`}><BillingDocumentIcon type={document.type} />{document.type === "SHIPPING_LABEL" || document.type === "REFUNDED_LABEL" ? "Etiqueta" : document.type === "REFUNDED_DANFE" ? "DANFE devolução" : document.type === "REFUNDED_XML" ? "XML devolução" : document.type === "INVOICE_XML" || (document.type === "INVOICE" && document.mimeType?.includes("xml")) ? "XML da NF" : "DANFE"}</span></td>
          <td><strong>{document.fileName}</strong></td>
          <td><strong>#{document.order?.externalId || "—"}</strong><small>{document.order?.paidAt ? new Date(document.order.paidAt).toLocaleDateString("pt-BR") : ""}</small></td>
          <td>{document.order?.customer?.name || "Cliente não informado"}</td>
          <td>{originLabel(document.order?.channel)}</td>
          <td>{fileSize(document.size)}</td>
          <td><div className="rowActions"><a className="mini billingDownload" href={`/api/billing-documents/${document.id}`} title="Baixar documento" aria-label={`Baixar ${document.fileName}`}><Download size={15} /></a><button type="button" className="mini danger" title="Excluir documento" aria-label={`Excluir ${document.fileName}`} onClick={() => setPendingDelete([document.id])}><Trash2 size={15} /></button></div></td>
        </tr>)}
      </tbody></table></div>
      {!loading && !filtered.length && <div className="catalogEmpty">Nenhum documento encontrado. Adicione uma etiqueta ou nota fiscal na tela de Vendas.</div>}
      {loading && <div className="catalogEmpty">Carregando documentos…</div>}
      {totalPages > 1 && <div className="pagination"><span>Página {safePage} de {totalPages}</span><div><button className="ghost clickable pageArrow" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</button>{paginationNumbers(safePage, totalPages).map((number: any, index: number) => number === "…" ? <span className="pageDots" key={`dots-${index}`}>…</span> : <button key={number} className={`ghost clickable pageNumber ${safePage === number ? "selected" : ""}`} onClick={() => setPage(number)}>{number}</button>)}<button className="ghost clickable pageArrow" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>›</button></div></div>}
    </article>
    {pendingDelete.length > 0 && <div className="salesConfirmBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setPendingDelete([]); }}><div className="salesConfirmDialog" role="alertdialog" aria-modal="true" aria-labelledby="billing-confirm-title"><h2 id="billing-confirm-title">Confirmar exclusão</h2><p>Excluir {pendingDelete.length === 1 ? "este documento" : `${pendingDelete.length} documentos selecionados`}? Essa ação não pode ser desfeita.</p><div className="salesConfirmActions"><button className="ghost clickable" disabled={deleting} onClick={() => setPendingDelete([])}>Cancelar</button><button className="salesDeleteButton" disabled={deleting} onClick={deleteDocuments}><Trash2 size={16} />{deleting ? "Excluindo..." : "Excluir"}</button></div></div></div>}
  </div>;
}
function AdThumbnail({ url, small = false, platform = "meta" }: { url?: string; small?: boolean; platform?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return <span className={`adThumbnail ${small ? "small" : ""}`}>{url && !failed ? <img src={url} alt="Miniatura do anúncio" loading="lazy" onError={() => setFailed(true)} /> : <img src={`/integration-logos/${platform.toLowerCase().replace(" ads", "")}-ads.webp`} alt="Miniatura indisponível" />}</span>;
}
function Campaigns({ campaigns: inputCampaigns, adsets: inputAdsets = [], ads: inputAds = [], onNew, onDelete, manager = false, navigationTarget = null, onNavigationConsumed }: any) {
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
    if (!manager || !navigationTarget) return;
    setSelectedPlatform(navigationTarget.platform || "Meta");
    setLevel(navigationTarget.level);
    setSearch(navigationTarget.query);
    setAdRange({ from: navigationTarget.date, to: navigationTarget.date });
    setDraftAdRange({ from: navigationTarget.date, to: navigationTarget.date });
    setAdCalendarMonth(navigationTarget.date.slice(0, 7));
    setAdPeriod("Personalizado");
    setAdPeriodOpen(false);
    setStatusFilter("all");
    setSelectedIds([]);
    setSelectedCampaignKeys([]);
    setSelectedAdsetKeys([]);
    onNavigationConsumed?.();
  }, [manager, navigationTarget?.nonce]);
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
  const visibleRows = (manager ? level === "Contas" ? accountRows : level === "Campanhas" ? platformRows : levelRows.filter((c: any) => String(c.platform).toLowerCase().includes(selectedPlatform.toLowerCase())) : campaigns).filter((c: any) => (!manager || statusFilter === "all" || statusFilter === "active" && c.status === "ACTIVE" || statusFilter === "selected" && selectedIds.includes([level, c.platform || selectedPlatform, c.accountId, c.campaignId, c.adsetId, c.adId].join(":"))) && (level !== "Conjuntos" && level !== "Anúncios" || !selectedCampaignKeys.length || selectedCampaignKeys.includes(campaignKey(c))) && (level !== "Anúncios" || !selectedAdsetKeys.length || selectedAdsetKeys.includes(adsetKey(c))) && `${c.name} ${c.accountId || ""} ${c.campaignName || ""} ${c.campaignId || ""} ${c.adsetName || ""} ${c.adsetId || ""} ${c.adId || ""}`.toLowerCase().includes(search.toLowerCase()));
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

function Movements({ movements, onNew, onEdit, onDelete }: any) {
  const [ledgerPeriod, setLedgerPeriod] = useState("Tempo todo");
  const [sku, setSku] = useState("Todos");
  const [folder, setFolder] = useState("Todas");
  const [movementType, setMovementType] = useState("Todos");
  const ledgerPeriodOptions = ["Hoje", "Ontem", "7 dias", "30 dias", "Este mês", "Mês passado", "Este ano", "Tempo todo"];
  const folders = useMemo(() => Array.from(new Set<string>(movements.map((movement: any) => String(movement.folderName || "Sem pasta")))).sort((a, b) => a.localeCompare(b, "pt-BR")), [movements]);
  const skus = useMemo(() => Array.from(new Set<string>(movements
    .filter((movement: any) => folder === "Todas" || movement.folderName === folder)
    .map((movement: any) => String(movement.sku || ""))
    .filter((value: string) => value && value !== "—")))
    .sort((a, b) => a.localeCompare(b, "pt-BR")), [movements, folder]);
  const movementTypes = useMemo(() => Array.from(new Set<string>(movements.map((movement: any) => String(movement.type || "")).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [movements]);
  useEffect(() => { if (sku !== "Todos" && !skus.includes(sku)) setSku("Todos"); }, [sku, skus]);
  const firstMovementDay = useMemo(() => movements.map((movement: any) => String(movement.createdAt || "").slice(0, 10)).filter(Boolean).sort()[0] || todayISO(), [movements]);
  const selectedPeriod = periodRange(ledgerPeriod, { from: "", to: "" }, firstMovementDay);
  const filteredMovements = useMemo(() => movements.filter((movement: any) => {
    const day = String(movement.createdAt || "").slice(0, 10);
    return day >= selectedPeriod.from && day <= selectedPeriod.to
      && (sku === "Todos" || movement.sku === sku)
      && (folder === "Todas" || movement.folderName === folder)
      && (movementType === "Todos" || movement.type === movementType);
  }), [movements, selectedPeriod.from, selectedPeriod.to, sku, folder, movementType]);
  const filtersActive = ledgerPeriod !== "Tempo todo" || sku !== "Todos" || folder !== "Todas" || movementType !== "Todos";
  return (
    <article className="card tableCard">
      <div className="sectionHead">
        <div>
          <h2>Ledger de estoque</h2>
          <p>Registro cronológico com data, SKU, pasta, quantidade e referência</p>
        </div>
        <button className="primary" onClick={onNew}>
          <Plus size={14} />
          Nova movimentação
        </button>
      </div>
      <div className="ledgerFilters">
        <label className="ledgerSelectFilter">
          <CalendarDays size={15} />
          <span>Período</span>
          <select value={ledgerPeriod} onChange={(event) => setLedgerPeriod(event.target.value)} aria-label="Filtrar por período">
            {ledgerPeriodOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="ledgerSelectFilter">
          <span>SKU</span>
          <select value={sku} onChange={(event) => setSku(event.target.value)} aria-label="Filtrar por SKU">
            <option value="Todos">Todos</option>
            {skus.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="ledgerSelectFilter">
          <span>Pasta</span>
          <select value={folder} onChange={(event) => setFolder(event.target.value)} aria-label="Filtrar por pasta">
            <option value="Todas">Todas</option>
            {folders.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="ledgerSelectFilter">
          <Filter size={15} />
          <span>Tipo</span>
          <select value={movementType} onChange={(event) => setMovementType(event.target.value)} aria-label="Filtrar por tipo de movimento">
            <option value="Todos">Todos</option>
            {movementTypes.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <span className="ledgerResultCount">{filteredMovements.length} de {movements.length}</span>
        {filtersActive && <button type="button" className="ghost clickable ledgerClearFilters" onClick={() => { setLedgerPeriod("Tempo todo"); setSku("Todos"); setFolder("Todas"); setMovementType("Todos"); }}>Limpar filtros</button>}
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>SKU</th>
              <th>Pasta</th>
              <th>Movimento</th>
              <th>Quantidade</th>
              <th>Referência</th>
              <th>Saldo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredMovements.map((m: any, i: number) => (
              <tr key={i}>
                <td>
                  <b>{m.date}</b>
                </td>
                <td><b>{m.sku}</b></td>
                <td>{m.folderName}</td>
                <td>{m.type}</td>
                <td className={m.qty < 0 ? "negative" : "positive"}>
                  {m.qty > 0 ? "+" : ""}
                  {m.qty}
                </td>
                <td>{m.ref}</td>
                <td>
                  <b>{m.balance}</b>
                </td>
                <td><div className="rowActions"><button className="mini" title="Editar movimentação" aria-label={`Editar movimentação ${m.sku} ${m.date}`} onClick={() => onEdit(m)}><Pencil size={14} /></button><button className="mini danger" title="Excluir movimentação" aria-label={`Excluir movimentação ${m.sku} ${m.date}`} onClick={() => { if (window.confirm(`Excluir a movimentação de ${m.sku}?`)) void onDelete(m); }}><Trash2 size={14} /></button></div></td>
              </tr>
            ))}
            {!filteredMovements.length && <tr><td colSpan={8} className="ledgerEmpty">Nenhuma movimentação encontrada para os filtros selecionados.</td></tr>}
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
          ["Líq. do marketplace", data?.salesProfit ?? (Number(data?.revenue || 0) - Number(data?.fees || 0))],
          ["A receber nas plataformas", data && transfers?.companyCash ? Number(data.salesProfit ?? (Number(data.revenue || 0) - Number(data.fees || 0))) - Number(transfers.companyCash.amount || 0) : null],
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
function Expenses({ rows, onNew, onEdit, onDelete, onDeleteMany }: any) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [expensePeriod, setExpensePeriod] = useState("Este mês");
  const [expenseRange, setExpenseRange] = useState({ from: "", to: "" });
  const [expensePeriodOpen, setExpensePeriodOpen] = useState(false);
  const [expenseDraftRange, setExpenseDraftRange] = useState({ from: "", to: "" });
  const [expenseCalendarMonth, setExpenseCalendarMonth] = useState(todayISO().slice(0, 7));
  const [selectingExpenseRangeEnd, setSelectingExpenseRangeEnd] = useState(false);
  const [periodData, setPeriodData] = useState<any>(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const toggleSelected = (id: string) => setSelected((previous) => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const annualCycles: Record<string, number> = { MONTHLY: 12, QUARTERLY: 4, SEMIANNUAL: 2, YEARLY: 1 };
  const periodLabel: Record<string, string> = {
    MONTHLY: "Dia 01 ao último dia do mês",
    QUARTERLY: "Jan–Mar · Abr–Jun · Jul–Set · Out–Dez",
    SEMIANNUAL: "01/01–30/06 · 01/07–31/12",
    YEARLY: "01/01–31/12",
  };
  const selectedExpenseRange = periodRange(expensePeriod, expenseRange);
  useEffect(() => {
    let cancelled = false;
    setPeriodLoading(true);
    const query = expensePeriod === "Tempo todo"
      ? "/api/dashboard?all=1&fresh=1"
      : `/api/dashboard?from=${encodeURIComponent(selectedExpenseRange.from)}&to=${encodeURIComponent(selectedExpenseRange.to)}&fresh=1`;
    apiJson(query)
      .then((result) => { if (!cancelled) setPeriodData(result); })
      .catch(() => { if (!cancelled) setPeriodData(null); })
      .finally(() => { if (!cancelled) setPeriodLoading(false); });
    return () => { cancelled = true; };
  }, [expensePeriod, expenseRange.from, expenseRange.to, rows]);
  const expenseData = periodData;
  const fixedExpenses = rows.filter((expense: any) => Boolean(expense.isFixed) && !/^imposto$/i.test(String(expense.category || "")));
  const taxExpenses = rows.filter((expense: any) => /^imposto$/i.test(String(expense.category || "")));
  const variableExpenses = rows.filter((expense: any) => !fixedExpenses.includes(expense) && !taxExpenses.includes(expense));
  const expenseAmounts = new Map((expenseData?.expenseBreakdown || []).map((line: any) => [String(line.id), Number(line.amount || 0)]));
  const groupTotal = (groupRows: any[]) => groupRows.reduce((total, expense) => total + Number(expenseAmounts.get(String(expense.id)) || 0), 0);
  const expenseGroups = [
    { key: "fixed", label: "Fixas", description: "Custos operacionais e demais despesas", rows: fixedExpenses },
    { key: "variable", label: "Variáveis", description: "Custos operacionais e demais despesas", rows: variableExpenses },
    { key: "tax", label: "Impostos", description: "Tributos e taxas fiscais", rows: taxExpenses },
  ].map((group) => ({ ...group, total: groupTotal(group.rows) }));
  const expenseClassLabel = (expense: any) => taxExpenses.includes(expense) ? "Imposto" : fixedExpenses.includes(expense) ? "Fixa" : "Variável";
  const renderExpenseRow = (expense: any) => <tr key={expense.id} className={selected.has(String(expense.id)) ? "mobileSelectedRow" : undefined} onClick={() => { if (window.matchMedia("(max-width: 650px)").matches) { if (selecting) toggleSelected(String(expense.id)); else onEdit(expense); } }}>{selecting && <td className="checkCol" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected.has(String(expense.id))} onChange={() => toggleSelected(String(expense.id))} aria-label={`Selecionar ${expense.description}`} /></td>}<td><b>{expense.description}</b></td><td>{expense.category}</td><td><span className={`expenseClass expenseClass-${expenseClassLabel(expense).toLocaleLowerCase("pt-BR")}`}>{expenseClassLabel(expense)}</span></td><td>{expense.kind === "PERCENT" ? <span className="expenseValue">{`${Number(expense.rate || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% do faturamento`}{expense.schedule === "YEARLY" && expenseData?.expenseBreakdown?.find((line: any) => line.id === expense.id)?.basis !== undefined && <small>Base anual: {money(expenseData.expenseBreakdown.find((line: any) => line.id === expense.id).basis)} · Abatimento: {money(expenseData.expenseBreakdown.find((line: any) => line.id === expense.id).amount)}</small>}</span> : <span className="expenseValue">{money(expense.amount)}{!expense.isFixed && expense.category !== "Imposto" && Number(expense.installments || 1) > 1 ? <small>{expense.installments}x de {money(Number(expense.amount) / Number(expense.installments))}</small> : annualCycles[expense.schedule] && <small>No ano: {money(Number(expense.amount) * annualCycles[expense.schedule])}</small>}</span>}</td><td>{!expense.isFixed && expense.category !== "Imposto" ? formatDashboardDate(dateKey(expense.date)) : periodLabel[expense.schedule] || formatDashboardDate(dateKey(expense.date))}</td><td>{!expense.isFixed && expense.category !== "Imposto" ? `${Number(expense.installments || 1)}x` : ({ MONTHLY: "Mensal", QUARTERLY: "Trimestral", SEMIANNUAL: "Semestral", YEARLY: "Anual", FIXED: "Única", CUSTOM: "Única" }[expense.schedule as string] || "Única")}</td><td><div className="expenseRowActions"><button className="mini" title="Editar despesa" aria-label={`Editar ${expense.description}`} onClick={(event) => { event.stopPropagation(); onEdit(expense); }}><Pencil size={15} /></button><button className="mini danger" title="Excluir despesa" aria-label={`Excluir ${expense.description}`} onClick={(event) => { event.stopPropagation(); onDelete(expense); }}><Trash2 size={15} /></button></div></td></tr>;
  return <article className="card tableCard">
    <div className="sectionHead"><div><h2>Despesas</h2><p>Fixas, variáveis e impostos que abatem o lucro líquido</p></div><button className="primary" onClick={onNew}><Plus size={14} />Nova despesa</button></div>
    <MobileBulkActions ids={rows.map((expense: any) => String(expense.id))} selected={selected} setSelected={setSelected} selecting={selecting} setSelecting={setSelecting} onDeleteMany={onDeleteMany} label="despesas" />
    <div className="ledgerFilters expensePeriodFilter"><span className="ledgerResultCount">{expenseData ? `${formatDashboardDate(expenseData.periodFrom || selectedExpenseRange.from)} a ${formatDashboardDate(expenseData.periodTo || selectedExpenseRange.to)}` : "Carregando…"}</span><div className="dashboardFilter exportMenu"><span>Período</span><button className="filterTrigger" type="button" onClick={() => { setExpenseDraftRange(expensePeriod === "Personalizado" ? expenseRange : { from: "", to: "" }); setExpenseCalendarMonth((expenseRange.from || todayISO()).slice(0, 7)); setSelectingExpenseRangeEnd(false); setExpensePeriodOpen((open) => !open); }} aria-expanded={expensePeriodOpen}><CalendarDays size={14} />{expensePeriod}<ChevronDown size={14} /></button>{expensePeriodOpen && <div className="exportOptions dashboardOptions periodOptions">{periodOptions.map((option) => <button type="button" key={option} onClick={() => { setExpensePeriod(option); setExpenseRange({ from: "", to: "" }); setExpensePeriodOpen(false); }}>{option}</button>)}<div className="filterCustomDates"><div className="calendarHeader"><button type="button" aria-label="Mês anterior" onClick={() => setExpenseCalendarMonth(shiftCalendarMonth(expenseCalendarMonth, -1))}>←</button><b>{calendarMonthTitle(expenseCalendarMonth)}</b><button type="button" aria-label="Próximo mês" onClick={() => setExpenseCalendarMonth(shiftCalendarMonth(expenseCalendarMonth, 1))}>→</button></div><div className="calendarGrid">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => <span key={day}>{day}</span>)}{calendarDays(expenseCalendarMonth).map((day, index) => day ? <button type="button" key={day} className={`${day === expenseDraftRange.from || day === expenseDraftRange.to ? "selected" : ""} ${expenseDraftRange.from && expenseDraftRange.to && day > expenseDraftRange.from && day < expenseDraftRange.to ? "inRange" : ""}`} onClick={() => { if (!selectingExpenseRangeEnd || (expenseDraftRange.from && day < expenseDraftRange.from)) { setExpenseDraftRange({ from: day, to: "" }); setSelectingExpenseRangeEnd(true); } else { setExpenseDraftRange((range) => ({ ...range, to: day })); setSelectingExpenseRangeEnd(false); } }}>{Number(day.slice(-2))}</button> : <span key={`blank-${index}`} />)}</div><small>{expenseDraftRange.from ? `${formatDashboardDate(expenseDraftRange.from)} → ${expenseDraftRange.to ? formatDashboardDate(expenseDraftRange.to) : "selecione o fim"}` : "Selecione o início e o fim"}</small><button type="button" className="primary" disabled={!expenseDraftRange.from || !expenseDraftRange.to} onClick={() => { setExpenseRange(expenseDraftRange); setExpensePeriod("Personalizado"); setExpensePeriodOpen(false); }}>Aplicar</button></div></div>}</div></div>
    <div className="expenseSummary"><span>Abatido no lucro líquido</span><strong>{periodLoading ? "—" : money(expenseData?.expenses || 0)}</strong><small>Recorrências seguem meses, trimestres, semestres e anos civis.</small></div>
    <div className="tableWrap"><table className="expenseTable"><thead><tr>{selecting && <th className="checkCol"><input type="checkbox" checked={rows.length > 0 && rows.every((item: any) => selected.has(String(item.id)))} onChange={() => setSelected(rows.every((item: any) => selected.has(String(item.id))) ? new Set() : new Set(rows.map((item: any) => String(item.id))))} aria-label="Selecionar todas as despesas" /></th>}<th>Descrição</th><th>Categoria</th><th>Classificação</th><th>Valor</th><th>Período / data</th><th>Frequência</th><th></th></tr></thead><tbody>{expenseGroups.map((group) => <Fragment key={group.key}><tr className={`expenseGroupRow expenseGroup-${group.key}`}><td colSpan={selecting ? 8 : 7}><span>{group.label}</span><small>{group.description}</small><b>{money(group.total)} · {group.rows.length} {group.rows.length === 1 ? "item" : "itens"}</b></td></tr>{group.rows.map(renderExpenseRow)}</Fragment>)}</tbody></table></div>
    {!rows.length && <div className="catalogEmpty">Nenhuma despesa cadastrada.</div>}
  </article>;
}
function Returns({ rows, syncing, onSync }: { rows: any[]; syncing: boolean; onSync: () => void }) {
  const statusLabel: Record<string, string> = { IN_TRANSIT: "Devolução a caminho", DELIVERED: "Reembolsada", REFUNDED: "Reembolsada", PENDING_REFUND: "Reembolso pendente" };
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [origin, setOrigin] = useState("Todas");
  const [status, setStatus] = useState("Todos");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [returnPeriod, setReturnPeriod] = useState("Tempo todo");
  const [returnPeriodOpen, setReturnPeriodOpen] = useState(false);
  const [returnDraftRange, setReturnDraftRange] = useState({ from: "", to: "" });
  const [returnCalendarMonth, setReturnCalendarMonth] = useState(todayISO().slice(0, 7));
  const [returnSelectingEnd, setReturnSelectingEnd] = useState(false);
  const origins = useMemo(() => ["Todas", ...Array.from(new Set<string>(rows.map((row) => String(row.channel || "")).filter(Boolean)))], [rows]);
  const filteredRows = useMemo(() => rows.filter((row) => {
    const day = dateKey(row.observedAt);
    const text = `${row.orderExternalId || ""} ${row.externalOrderId || ""} ${row.customerName || ""} ${row.sku || ""} ${row.reason || ""} ${originLabel(row.channel)}`.toLocaleLowerCase("pt-BR");
    return (!query.trim() || text.includes(query.trim().toLocaleLowerCase("pt-BR")))
      && (origin === "Todas" || row.channel === origin)
      && (status === "Todos" || row.status === status)
      && (!from || day >= from)
      && (!to || day <= to);
  }), [rows, query, origin, status, from, to]);
  const confirmedRows = filteredRows.filter((row) => row.refundAmount !== null);
  const pendingRefundRows = filteredRows.filter((row) => row.status === "PENDING_REFUND" && row.refundAmount === null);
  const totalRefunded = confirmedRows.reduce((total, row) => total + Number(row.refundAmount || 0), 0);
  return <div className="returnsView">
    <section className="card salesSearchSection" aria-label="Busca e filtros de reembolsos">
      <div className="salesSearchRow">
        <div className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pedido, cliente ou produto..." /></div>
        <button type="button" className="mobileSalesFilterButton ghost" onClick={() => setFiltersOpen(true)}><Filter size={16} />Filtros</button>
      </div>
      {filtersOpen && <button type="button" className="mobileSalesFilterBackdrop" aria-label="Fechar filtros" onClick={() => setFiltersOpen(false)} />}
      <div className={`salesFilters ${filtersOpen ? "mobileFiltersOpen" : ""}`}>
        <div className="mobileSalesFilterHead"><b>Filtros</b><button type="button" className="mobileSalesFilterClose" aria-label="Fechar filtros" onClick={() => setFiltersOpen(false)}><X size={20} /></button></div>
        <div className="salesSelectField"><span>Situação</span><AnchoredSelect value={status} onChange={setStatus} options={[{ value: "Todos", label: "Todas" }, ...Object.entries(statusLabel).map(([value, label]) => ({ value, label }))]} compact /></div>
        <div className="salesPeriodControl">
          <button type="button" className="salesPeriodTrigger" aria-expanded={returnPeriodOpen} onClick={() => { setReturnPeriodOpen((open) => !open); setReturnCalendarMonth((from || todayISO()).slice(0, 7)); setReturnDraftRange({ from: returnPeriod === "Personalizado" ? from : "", to: returnPeriod === "Personalizado" ? to : "" }); setReturnSelectingEnd(false); }}><span>Período</span><b>{returnPeriod}</b><ChevronDown size={15} /></button>
          {returnPeriodOpen && <div className="salesPeriodOptions">
            {periodOptions.map((option) => <button type="button" key={option} className={returnPeriod === option ? "active" : ""} onClick={() => { const dates = periodRange(option, { from: "", to: "" }); setReturnPeriod(option); setFrom(option === "Tempo todo" ? "" : dates.from); setTo(option === "Tempo todo" ? "" : dates.to); setReturnPeriodOpen(false); }}>{option}</button>)}
            <div className="salesPeriodCalendar">
              <div className="calendarHeader"><button type="button" aria-label="Mês anterior" onClick={() => setReturnCalendarMonth(shiftCalendarMonth(returnCalendarMonth, -1))}>←</button><b>{calendarMonthTitle(returnCalendarMonth)}</b><button type="button" aria-label="Próximo mês" onClick={() => setReturnCalendarMonth(shiftCalendarMonth(returnCalendarMonth, 1))}>→</button></div>
              <div className="calendarGrid">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => <span key={day}>{day}</span>)}{calendarDays(returnCalendarMonth).map((day, index) => day ? <button type="button" key={day} className={`${day === returnDraftRange.from || day === returnDraftRange.to ? "selected" : ""} ${returnDraftRange.from && returnDraftRange.to && day > returnDraftRange.from && day < returnDraftRange.to ? "inRange" : ""}`} onClick={() => { if (!returnSelectingEnd || (returnDraftRange.from && day < returnDraftRange.from)) { setReturnDraftRange({ from: day, to: "" }); setReturnSelectingEnd(true); } else { setReturnDraftRange((range) => ({ ...range, to: day })); setReturnSelectingEnd(false); } }}>{Number(day.slice(-2))}</button> : <span key={`blank-${index}`} />)}</div>
              <small>{returnDraftRange.from ? `${formatDashboardDate(returnDraftRange.from)} → ${returnDraftRange.to ? formatDashboardDate(returnDraftRange.to) : "selecione o fim"}` : "Selecione o início e o fim"}</small>
              <button type="button" className="primary" disabled={!returnDraftRange.from || !returnDraftRange.to} onClick={() => { setFrom(returnDraftRange.from); setTo(returnDraftRange.to); setReturnPeriod("Personalizado"); setReturnPeriodOpen(false); }}>Aplicar</button>
            </div>
          </div>}
        </div>
        <div className="salesSelectField"><span>Origem</span><AnchoredSelect value={origin} onChange={setOrigin} options={origins.map((channel) => ({ value: channel, label: channel === "Todas" ? "Todas" : originLabel(channel), icon: channel === "Todas" ? undefined : salesOriginLogo(channel) }))} compact /></div>
        <button type="button" className="ghost clickable" onClick={() => { setStatus("Todos"); setOrigin("Todas"); setFrom(""); setTo(""); setReturnPeriod("Tempo todo"); setReturnPeriodOpen(false); setQuery(""); }}>Limpar filtros</button>
        <button type="button" className="primary mobileSalesFilterApply" onClick={() => setFiltersOpen(false)}>Aplicar filtros</button>
      </div>
    </section>
    <section className="returnsSummary">
      <article className="card kpi"><span>Pedidos de reembolso</span><strong>{filteredRows.length}</strong></article>
      <article className="card kpi"><span>Reembolsados</span><strong>{confirmedRows.length}</strong></article>
      <article className="card kpi"><span>Reembolso pendente</span><strong>{pendingRefundRows.length}</strong></article>
      <article className="card kpi"><span>Valor total reembolsado</span><strong className="negative">-{money(totalRefunded)}</strong></article>
    </section>
    <article className="card tableCard">
    <div className="sectionHead"><div><h2>Reembolsos dos canais</h2><p>{filteredRows.length} pedidos · {filteredRows.filter((row) => row.status === "IN_TRANSIT").length} a caminho · {confirmedRows.length} reembolsos confirmados · atualização automática a cada minuto</p></div><button className="ghost clickable returnsSyncButton" disabled={syncing} onClick={onSync}><RefreshCw size={14} className={syncing ? "spin" : undefined} /><span>{syncing ? "Sincronizando…" : "Sincronizar agora"}</span></button></div>
    <div className="tableWrap"><table className="expenseTable returnsTable"><thead><tr><th>Data</th><th>Pedido / pacote</th><th>Cliente</th><th>Produto</th><th className="salesOriginCell">Origem</th><th>Motivo</th><th>Situação</th><th>Reembolso</th></tr></thead><tbody>{filteredRows.map((row) => <tr key={row.id}>
      <td>{fmtDate(row.observedAt)}</td>
      <td><strong>#{row.orderExternalId || "—"}</strong><br /><a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">{originLabel(row.channel)} · #{row.externalOrderId}</a></td>
      <td>{row.customerName || "—"}</td>
      <td>{row.sku || "—"}</td>
      <td className="salesOriginCell"><span className="salesOrigin">{salesOriginLogo(row.channel) && <span className="salesOriginLogo"><img src={salesOriginLogo(row.channel)} alt="" /></span>}<span>{originLabel(row.channel)}</span></span></td>
      <td>{row.reason || "—"}</td><td><span className={`status ${row.refundAmount !== null ? "danger" : "warn"}`}>{statusLabel[row.status] || row.status}</span></td>
      <td className={row.refundAmount === null ? undefined : "negative"}>{row.refundAmount === null ? "Pendente" : `-${money(row.refundAmount)}`}</td>
    </tr>)}</tbody></table></div>
    {!filteredRows.length && <div className="catalogEmpty">Nenhum reembolso encontrado com esses filtros.</div>}
    </article>
  </div>;
}
function TrackingView({ notify, onOpenCampaign }: { notify: (message: string) => void; onOpenCampaign: (target: { level: "Campanhas" | "Conjuntos" | "Anúncios"; date: string; query: string; platform: string }) => void }) {
  const [data, setData] = useState<any>(null);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [salesPage, setSalesPage] = useState(1);
  const [salesPageSize, setSalesPageSize] = useState(10);
  const [period, setPeriod] = useState("30 dias");
  const [range, setRange] = useState({ from: "", to: "" });
  const [periodOpen, setPeriodOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(todayISO().slice(0, 7));
  const [draftRange, setDraftRange] = useState({ from: "", to: "" });
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [site, setSite] = useState("");
  const [source, setSource] = useState("");
  const [adding, setAdding] = useState(false);
  const [shopDomain, setShopDomain] = useState("");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [assigning, setAssigning] = useState<any>(null);
  const [assignCampaign, setAssignCampaign] = useState("");
  const [assignAdset, setAssignAdset] = useState("");
  const [assignAd, setAssignAd] = useState("");
  const selectedRange = period === "Tempo todo" ? { from: "", to: "" } : periodRange(period, range);
  const load = async () => setData(await apiJson(`/api/tracking/dashboard?from=${selectedRange.from}&to=${selectedRange.to}&site=${encodeURIComponent(site)}&source=${encodeURIComponent(source)}`));
  useEffect(() => { void load().catch((error) => notify(error.message)); }, [selectedRange.from, selectedRange.to, site, source]);
  useEffect(() => { setSessionsPage(1); setSalesPage(1); }, [selectedRange.from, selectedRange.to, site, source]);
  const metrics = data?.metrics || {};
  const sessionsPageSize = 10;
  const sessions = data?.sessions || [];
  const sales = data?.sales || [];
  const sessionsTotalPages = Math.max(1, Math.ceil(sessions.length / sessionsPageSize));
  const salesTotalPages = Math.max(1, Math.ceil(sales.length / salesPageSize));
  const safeSessionsPage = Math.min(sessionsPage, sessionsTotalPages);
  const safeSalesPage = Math.min(salesPage, salesTotalPages);
  const visibleSessions = sessions.slice((safeSessionsPage - 1) * sessionsPageSize, safeSessionsPage * sessionsPageSize);
  const visibleSales = sales.slice((safeSalesPage - 1) * salesPageSize, safeSalesPage * salesPageSize);
  const campaignPlatformForSale = (row: any) => {
    const sourceName = `${row.firstSource || ""} ${row.lastSource || ""}`.toLowerCase();
    if (sourceName.includes("google")) return "Google";
    if (sourceName.includes("tiktok") || sourceName.includes("tik tok")) return "TikTok";
    return "Meta";
  };
  const openCampaignFromSale = (row: any, level: "Campanhas" | "Conjuntos" | "Anúncios", query: string) => onOpenCampaign({ level, query, platform: campaignPlatformForSale(row), date: dateKey(row.occurredAt) });
  const adOptions = data?.adOptions || [];
  const campaignOptions = [...new Map(adOptions.map((item:any) => [item.campaignId, { value:item.campaignId,label:`${item.campaignName} · ${item.platform}` }])).values()] as Array<{value:string;label:string}>;
  const adsetOptions = [...new Map(adOptions.filter((item:any)=>item.campaignId===assignCampaign&&item.adsetId).map((item:any)=>[item.adsetId,{value:item.adsetId,label:item.adsetName}])).values()] as Array<{value:string;label:string}>;
  const adOptionsForSelection = [...new Map(adOptions.filter((item:any)=>item.campaignId===assignCampaign&&(!assignAdset||item.adsetId===assignAdset)&&item.adId).map((item:any)=>[item.adId,{value:item.adId,label:item.adName}])).values()] as Array<{value:string;label:string}>;
  const trackerSnippet = typeof window === "undefined" ? "" : `<script async src="${window.location.origin}/api/tracking/script"></script>`;
  return <div className="trackingView">
    <section className="card trackingHero"><div><span className="trackingEyebrow">Analytics first-party</span><h2>Visitas, intenção de compra e vendas Shopify</h2><p>Acompanhe a jornada sem depender de cookies de terceiros.</p></div><button className="primary" onClick={() => setAdding(true)}><Plus size={15}/>Adicionar site</button></section>
    <section className="card trackingFilters"><div className="salesSelectField"><span>Site</span><AnchoredSelect value={site} onChange={setSite} options={[{ value: "", label: "Todos os sites" }, ...(data?.sites || []).map((item:any) => ({ value: item.domain, label: item.domain }))]} compact /></div><div className="trackingPeriodControl"><button type="button" className="trackingPeriodTrigger" aria-expanded={periodOpen} onClick={() => { setPeriodOpen((open) => !open); setCalendarMonth((range.from || todayISO()).slice(0, 7)); setDraftRange(period === "Personalizado" ? range : { from: "", to: "" }); setSelectingEnd(false); }}><span>Período</span><b>{period}</b><ChevronDown size={15}/></button>{periodOpen && <div className="trackingPeriodOptions">{["Hoje", "Ontem", "7 dias", "30 dias", "Este mês", "Mês passado", "Este ano", "Tempo todo"].map((option) => <button type="button" key={option} className={period === option ? "active" : ""} onClick={() => { setPeriod(option); setRange({ from: "", to: "" }); setPeriodOpen(false); }}>{option}</button>)}<div className="salesPeriodCalendar"><div className="calendarHeader"><button type="button" aria-label="Mês anterior" onClick={() => setCalendarMonth(shiftCalendarMonth(calendarMonth, -1))}>←</button><b>{calendarMonthTitle(calendarMonth)}</b><button type="button" aria-label="Próximo mês" onClick={() => setCalendarMonth(shiftCalendarMonth(calendarMonth, 1))}>→</button></div><div className="calendarGrid">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => <span key={day}>{day}</span>)}{calendarDays(calendarMonth).map((day, index) => day ? <button type="button" key={day} className={`${day === draftRange.from || day === draftRange.to ? "selected" : ""} ${draftRange.from && draftRange.to && day > draftRange.from && day < draftRange.to ? "inRange" : ""}`} onClick={() => { if (!selectingEnd || (draftRange.from && day < draftRange.from)) { setDraftRange({ from: day, to: "" }); setSelectingEnd(true); } else { setDraftRange((current) => ({ ...current, to: day })); setSelectingEnd(false); } }}>{Number(day.slice(-2))}</button> : <span key={`blank-${index}`}/>)}</div><small>{draftRange.from ? `${formatDashboardDate(draftRange.from)} → ${draftRange.to ? formatDashboardDate(draftRange.to) : "selecione o fim"}` : "Selecione o início e o fim"}</small><button type="button" className="primary" disabled={!draftRange.from || !draftRange.to} onClick={() => { setRange(draftRange); setPeriod("Personalizado"); setPeriodOpen(false); }}>Aplicar</button></div></div>}</div><div className="salesSelectField"><span>Origem</span><AnchoredSelect value={source} onChange={setSource} options={[{ value: "", label: "Todas" }, ...(data?.sources || []).map((item:string) => ({ value: item, label: item }))]} compact /></div><button className="ghost trackingRefresh" onClick={() => void load()}><RefreshCw size={14}/>Atualizar</button></section>
    <section className="trackingKpis">{[["Visitas",metrics.visits],["Visitantes",metrics.visitors],["Páginas vistas",metrics.pageViews],["Cliques em comprar",metrics.buyClicks],["Vendas totais",metrics.sales],["Faturamento",money(metrics.revenue||0)]].map(([label,value]) => <article className="card" key={String(label)}><span>{label}</span><strong>{value ?? 0}</strong></article>)}</section>
    <section className="trackingFunnel"><article className="card"><div className="sectionHead"><div><h2>Funil de conversão</h2><p>Somente vendas ligadas a uma sessão rastreada</p></div></div><div className="funnelSteps"><div><b>{metrics.visits||0}</b><span>Visitas</span></div><i>→</i><div><b>{metrics.buyClicks||0}</b><span>Cliques em comprar</span><small>{Number(metrics.clickRate||0).toFixed(1)}%</small></div><i>→</i><div><b>{metrics.attributedSales||0}</b><span>Vendas atribuídas</span><small>{Number(metrics.conversionRate||0).toFixed(1)}%</small></div></div></article><article className="card trackingSnippet"><h2>Instalação na Shopify</h2><p>Cole antes de <code>&lt;/head&gt;</code> no arquivo <code>theme.liquid</code>.</p><code className="trackingCode">{trackerSnippet}</code><button className="ghost" onClick={async()=>{await navigator.clipboard.writeText(trackerSnippet);notify("Código de Trackeamento copiado");}}><Copy size={13}/>Copiar código</button><small>Captura páginas e cliques em comprar; a venda é conciliada pelo pedido Shopify.</small></article></section>
    <article className="card tableCard"><div className="sectionHead"><div><h2>Sessões recentes</h2><p>Origem, campanha, páginas e intenção de compra</p></div></div><div className="tableWrap"><table><thead><tr><th>Última atividade</th><th>Origem</th><th>Campanha</th><th>Página de entrada</th><th>Páginas</th><th>Initiate Checkout</th></tr></thead><tbody>{visibleSessions.map((row:any) => <tr key={row.id}><td>{fmtDate(row.lastAt)}</td><td>{row.source}</td><td>{row.campaign}</td><td className="trackingUrl" title={row.landingPage}>{row.landingPage}</td><td>{row.pages}</td><td>{row.buyClicks ? <span className="status ok"><MousePointerClick size={12}/>{row.buyClicks}</span> : "—"}</td></tr>)}</tbody></table></div>{!sessions.length ? <div className="catalogEmpty">Nenhuma visita encontrada neste filtro.</div> : <TablePagination page={safeSessionsPage} totalPages={sessionsTotalPages} onChange={setSessionsPage} />}</article>
    <article className="card tableCard"><div className="sectionHead"><div><h2>Vendas Shopify recentes</h2><p>{metrics.attributedSales || 0} atribuídas de {metrics.sales || 0} vendas totais no período</p></div><div className="catalogPageSize"><strong>{sales.length} vendas</strong><span>Itens por página</span><AnchoredSelect value={String(salesPageSize)} onChange={(value) => { setSalesPageSize(Number(value)); setSalesPage(1); }} options={["10", "25", "50"]} compact /></div></div><div className="tableWrap"><table><thead><tr><th>Data</th><th>Pedido</th><th>Cliente</th><th>Primeira origem</th><th>Última origem</th><th>Campanha</th><th>Conjunto</th><th>Anúncio</th><th>Atribuição</th><th>Valor</th><th></th></tr></thead><tbody>{visibleSales.map((row:any) => <tr key={row.id}><td>{fmtDate(row.occurredAt)}</td><td><b>#{row.order}</b></td><td>{row.customer}</td><td>{row.firstSource}</td><td>{row.lastSource}</td><td>{row.campaign && row.campaign !== "—" ? <button type="button" className="trackingCampaignLink" onClick={() => openCampaignFromSale(row, "Campanhas", row.campaignId || row.campaign)}>{row.campaign}</button> : "—"}</td><td>{row.adset && row.adset !== "—" ? <button type="button" className="trackingCampaignLink" onClick={() => openCampaignFromSale(row, "Conjuntos", row.adsetId || row.adset)}>{row.adset}</button> : "—"}</td><td>{row.ad && row.ad !== "—" ? <button type="button" className="trackingCampaignLink" onClick={() => openCampaignFromSale(row, "Anúncios", row.adId || row.ad)}>{row.ad}</button> : "—"}</td><td><span className={`status ${row.attributed||row.manual ? "ok" : "warn"}`}>{row.manual ? "Manual" : row.attributed ? "Atribuída" : "Sem sessão"}</span></td><td className="positive">{money(row.value)}</td><td><button type="button" className="mini" title="Atribuir campanha" onClick={()=>{setAssigning(row);setAssignCampaign(row.campaignId||"");setAssignAdset(row.adsetId||"");setAssignAd(row.adId||"");}}><Pencil size={14}/></button></td></tr>)}</tbody></table></div>{!sales.length ? <div className="catalogEmpty">Nenhuma venda Shopify encontrada neste período.</div> : <TablePagination page={safeSalesPage} totalPages={salesTotalPages} onChange={setSalesPage} />}</article>
    {assigning && <div className="modalBack"><div className="modal card trackingSiteModal"><div className="modalHead"><div><h2>Atribuir venda #{assigning.order}</h2><p>Selecione a campanha, o conjunto e o anúncio responsáveis.</p></div><button className="mini" onClick={()=>setAssigning(null)}><X size={18}/></button></div><div className="modalBody"><label className="field"><span>Campanha</span><AnchoredSelect value={assignCampaign} onChange={(value)=>{setAssignCampaign(value);setAssignAdset("");setAssignAd("");}} options={[{value:"",label:"Selecione..."},...campaignOptions]}/></label><label className="field"><span>Conjunto</span><AnchoredSelect value={assignAdset} onChange={(value)=>{setAssignAdset(value);setAssignAd("");}} options={[{value:"",label:"Selecione..."},...adsetOptions]}/></label><label className="field"><span>Anúncio</span><AnchoredSelect value={assignAd} onChange={setAssignAd} options={[{value:"",label:"Selecione..."},...adOptionsForSelection]}/></label></div><div className="modalFoot"><button className="ghost" onClick={()=>setAssigning(null)}>Cancelar</button><button className="primary" disabled={!assignCampaign} onClick={async()=>{try{await apiJson('/api/tracking/dashboard',{method:'POST',body:JSON.stringify({action:'attribute-order',orderId:assigning.id,campaignId:assignCampaign,adsetId:assignAdset,adId:assignAd})});setAssigning(null);await load();notify(`Venda #${assigning.order} atribuída`);}catch(error:any){notify(error.message);}}}>Salvar atribuição</button></div></div></div>}
    {adding && <div className="modalBack"><div className="modal card trackingSiteModal"><div className="modalHead"><div><h2>Adicionar site</h2><p>Cadastre o domínio ou conecte sua loja Shopify.</p></div><button className="mini" onClick={() => setAdding(false)}><X size={18}/></button></div><div className="modalBody"><label className="field"><span>Nome</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Loja Iron Air"/></label><label className="field"><span>Domínio</span><input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="ironair.com.br"/></label><button className="primary trackingManualSave" onClick={async () => { try { await apiJson('/api/tracking/dashboard',{method:'POST',body:JSON.stringify({name,domain})}); setAdding(false); setName(''); setDomain(''); await load(); notify('Site adicionado ao Trackeamento'); } catch(error:any){ notify(error.message); } }}>Salvar site manual</button><div className="trackingOr"><span>ou</span></div>{!data?.shopify?.connected && <label className="field"><span>Domínio da loja Shopify</span><input value={shopDomain} onChange={(event) => setShopDomain(event.target.value)} placeholder="sua-loja.myshopify.com"/></label>}<button className="shopifyConnectButton" onClick={() => { if(data?.shopify?.connected){setSite(data.shopify.shopDomain || "");setAdding(false);notify(`Loja Shopify ${data.shopify.shopDomain} selecionada`);return;} const shop=shopDomain.trim(); if(!shop){notify("Informe a loja Shopify");return;} location.href=`/api/integrations/shopify/connect?shop=${encodeURIComponent(shop)}`; }}><img src="/integration-logos/shopify.png" alt=""/><span>{data?.shopify?.connected ? "Conectado com Shopify" : "Continuar com Shopify"}</span></button>{data?.shopify?.connected && <small className="trackingConnectedShop">{data.shopify.shopDomain}</small>}</div><div className="modalFoot"><button className="ghost" onClick={() => setAdding(false)}>Cancelar</button></div></div></div>}
  </div>;
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
  const sections = [
    { category: "Plataforma de vendas", title: "Plataformas de vendas", description: "Lojas, marketplaces, pedidos e estoque" },
    { category: "ADS", title: "ADS", description: "Campanhas, anúncios e mídia paga" },
    { category: "Banco", title: "Bancos", description: "Pagamentos, recebimentos e transferências" },
    { category: "Outros", title: "Outros", description: "Demais serviços conectados" },
  ].map((section) => ({ ...section, integrations: visible.filter((integration) => integration.cat === section.category) }))
    .filter((section) => section.integrations.length > 0);
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
      <div className="integrationSections">
        {sections.map((section) => (
          <section className="integrationSection" key={section.category}>
            <div className="integrationSectionHead">
              <h3>{section.title}</h3>
              <p>{section.description}</p>
            </div>
            <div className="integrationGrid">
              {section.integrations.map((i) => {
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
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
const integrationLogoSrc: Record<string, string> = {
  "Meta Ads": "/integration-logos/meta-ads.webp",
  "Google Ads": "/integration-logos/google-ads.webp",
  "TikTok Ads": "/integration-logos/tiktok-ads.webp",
  Shopify: "/integration-logos/shopify.png",
  "Mercado Livre": "/integration-logos/mercado-livre.jpg",
  Amazon: "/integration-logos/amazon.jpg",
  Kiwify: "/integration-logos/kiwify.webp",
  Asaas: "/integration-logos/asaas.png",
  "Mercado Pago": "/integration-logos/mercado-pago.png",
};
function salesOriginLogo(source: unknown) {
  const normalized = String(source || "").toUpperCase().replaceAll("_", " ");
  if (normalized.includes("MERCADO LIVRE") || normalized.includes("ML FULL")) return integrationLogoSrc["Mercado Livre"];
  if (normalized.includes("AMAZON")) return integrationLogoSrc.Amazon;
  if (normalized.includes("SHOPIFY")) return integrationLogoSrc.Shopify;
  return "";
}
function originLabel(source: unknown) {
  return String(source || "MANUAL").replaceAll("_", " ").trim().toLocaleUpperCase("pt-BR");
}
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
function Modal({ kind, data, close, notify, products, inventoryFolders = [], catalogProducts, integrations, channelOptions, onSave, onDeleteIntegration }: any) {
  const [f, setF] = useState<any>(() => {
    if (kind === "expense") return data ? { ...data, desc: data.description, value: data.amount, installments: data.installments || 1, date: dateKey(data.date), schedule: data.schedule === "CUSTOM" ? "FIXED" : data.schedule } : { kind: "FIXED", category: "Operacional", isFixed: false, installments: 1, schedule: "FIXED", date: todayISO() };
    if (kind === "sale") return data ? { ...data, _edit: data.sku } : { source: "Manual", paidAt: saoPauloDateTimeLocal(), feeAmount: 0, shippingAmount: 0 };
    if (kind === "movementEdit" && data) return {
      ...data,
      _edit: data.sku,
      productTarget: data.folderId ? `folder:${data.folderId}` : `sku:${data.sku}`,
      type: ["Entrada manual", "Saída manual", "Avaria", "Devolução"].includes(data.type) ? data.type : data.rawType === "ADJUSTMENT" ? (Number(data.qty) < 0 ? "Saída manual" : "Entrada manual") : ({ PURCHASE: "Entrada manual", DAMAGE: "Avaria", RETURN: "Devolução" } as any)[data.rawType] || data.type,
      date: String(data.createdAt || "").slice(0, 10),
    };
    return data ? { ...data, _edit: data.sku } : {};
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const movementProductOptions = [
    ...inventoryFolders.map((folder: any) => ({ value: `folder:${folder.id}`, label: `Pasta: ${folder.name}` })),
    ...products.map((product: any) => ({ value: `sku:${product.sku}`, label: `${product.product || product.name || product.sku} · ${product.sku}` })),
  ];
  const manualSaleProductOptions = availableCatalogProductOptions(catalogProducts);
  const setMovementProduct = (value: string) => setF((current: any) => value.startsWith("folder:")
    ? { ...current, productTarget: value, folderId: value.slice(7), sku: "" }
    : { ...current, productTarget: value, folderId: null, sku: value.replace(/^sku:/, "") });
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
            <p>{kind === "integrationDetail" ? (["Amazon", "Mercado Pago"].includes(data?.name) ? "Confira os dados da conexão." : data?.name === "Asaas" ? "Configure a chave de acesso e o webhook." : ["Shopify", "Mercado Livre"].includes(data?.name) ? "Configure a conexão e os webhooks." : "Configure os dados da integração.") : kind === "expense" ? "A despesa será salva e abatida do lucro líquido." : kind === "movementEdit" ? "Os dados da movimentação serão salvos no banco local." : "Preencha os dados abaixo. No localhost eles ficam apenas nesta sessão."}</p>
          </div>
          <button className="close" onClick={close}>
            <X />
          </button>
        </div>
        <div className="modalBody">
          {kind === "movement" && (
            <FormGrid>
              <Select label="Tipo" value={f.type} onChange={(v: any) => set("type", v)} options={["Entrada manual", "Saída manual", "Avaria", "Devolução"]} />
              <Select label="Produto" value={f.productTarget} onChange={setMovementProduct} options={movementProductOptions} />
              <Input label="Quantidade" type="number" value={f.qty} onChange={(v: any) => set("qty", v)} />
              <Input label="Data" type="date" value={f.date} onChange={(v: any) => set("date", v)} />
              <Input label="Referência / motivo" value={f.ref} onChange={(v: any) => set("ref", v)} />
            </FormGrid>
          )}
          {kind === "movementEdit" && (
            <FormGrid>
              <Select label="Tipo" value={f.type} onChange={(v: any) => set("type", v)} options={["Entrada manual", "Saída manual", "Avaria", "Devolução"]} />
              <Select label="Produto" value={f.productTarget} onChange={setMovementProduct} options={movementProductOptions} />
              <Input label="Quantidade" type="number" value={Math.abs(Number(f.qty || 0)) || ""} onChange={(v: any) => set("qty", v)} />
              <Input label="Data" type="date" value={f.date} onChange={(v: any) => set("date", v)} />
              <Input label="Referência / motivo" value={f.ref} onChange={(v: any) => set("ref", v)} />
            </FormGrid>
          )}
          {kind === "sale" && (
            <FormGrid>
              <Input label="Cliente" value={f.customer} onChange={(v: any) => set("customer", v)} />
              <Select label="Produto" value={f.sku} onChange={(v: any) => set("sku", v)} options={manualSaleProductOptions} />
              <Input label="Valor" type="number" value={f.value} onChange={(v: any) => set("value", v)} />
              <Select label="Origem" value={f.source} onChange={(v: any) => set("source", v)} options={channelOptions.map((channel: string) => ({ value: channel, label: originLabel(channel) }))} />
              <CalendarDateTimeField label="Data e hora da venda" value={f.paidAt || ""} onChange={(value) => set("paidAt", value)} />
              <Input label="Taxa da plataforma" type="number" value={f.feeAmount} onChange={(v: any) => set("feeAmount", v)} />
              <Input label="Frete" type="number" value={f.shippingAmount} onChange={(v: any) => set("shippingAmount", v)} />
              <Input label="Método de Pag." value={f.paymentMethod} onChange={(v: any) => set("paymentMethod", v)} />
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
              <Select label="Categoria" value={f.category || "Operacional"} onChange={(v: any) => setF((current: any) => ({ ...current, category: v, isFixed: v === "Imposto" ? false : current.isFixed }))} options={["Imposto", "Operacional", "Outro"]} />
              {f.category !== "Imposto" && <AnchoredSelect label="Classificação" value={f.isFixed ? "YES" : "NO"} onChange={(v) => setF((current: any) => ({ ...current, isFixed: v === "YES", schedule: v === "YES" ? (current.schedule === "FIXED" ? "MONTHLY" : current.schedule) : "FIXED", installments: current.installments || 1 }))} options={[{ value: "NO", label: "Variável" }, { value: "YES", label: "Fixa" }]} />}
              <Input label="Descrição" value={f.desc} onChange={(v: any) => set("desc", v)} />
              {f.kind === "PERCENT" ? <Input label="Percentual (%)" type="number" value={f.rate} onChange={(v: any) => set("rate", v)} /> : <Input label="Valor (R$)" type="number" value={f.value} onChange={(v: any) => set("value", v)} />}
              {(f.isFixed || f.category === "Imposto") ? <AnchoredSelect label="Frequência / data" value={f.schedule || "FIXED"} onChange={(v) => setF((current: any) => ({ ...current, schedule: v, date: current.date || todayISO() }))} options={[{ value: "FIXED", label: "Única" }, { value: "MONTHLY", label: "Mensal" }, { value: "QUARTERLY", label: "Trimestral" }, { value: "SEMIANNUAL", label: "Semestral" }, { value: "YEARLY", label: "Anual" }]} /> : <AnchoredSelect label="Parcelas" value={String(f.installments || 1)} onChange={(v) => set("installments", Number(v))} options={Array.from({ length: 24 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}x` }))} />}
              {(!f.isFixed && f.category !== "Imposto" || f.schedule === "FIXED") && <CalendarDateField label={!f.isFixed && f.category !== "Imposto" ? "Data da primeira parcela" : "Data da despesa"} value={f.date || ""} onChange={(value) => set("date", value)} />}
              {(f.isFixed || f.category === "Imposto") && ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "YEARLY"].includes(f.schedule) && <p className="expenseScheduleHint">{{ MONTHLY: "Mês civil: dia 01 ao último dia.", QUARTERLY: "Trimestres civis: jan–mar, abr–jun, jul–set e out–dez.", SEMIANNUAL: "Semestres civis: 01/01–30/06 e 01/07–31/12.", YEARLY: "Ano civil: 01/01–31/12." }[f.schedule as "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "YEARLY"]} {f.kind === "PERCENT" ? "O percentual incide sobre o faturamento acumulado do período." : "O valor é lançado uma vez por período."}</p>}
              {(f.isFixed || f.category === "Imposto") && f.schedule === "FIXED" && <p className="expenseScheduleHint">{f.kind === "PERCENT" ? "Percentual aplicado uma vez sobre o faturamento da data escolhida." : "Lançamento único na data escolhida; aparece nos períodos que incluem esse dia."}</p>}
              {!f.isFixed && f.category !== "Imposto" && <p className="expenseScheduleHint">O valor total será dividido em {Number(f.installments || 1)} parcela{Number(f.installments || 1) === 1 ? "" : "s"} mensal{Number(f.installments || 1) === 1 ? "" : "is"}, a partir da data escolhida.</p>}
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
          {kind === "integrationDetail" && <IntegrationDetail i={data} notify={notify} />} {kind === "saleDetail" && <SaleDetail s={f} set={set} products={catalogProducts} />}{" "}
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reload = () => apiJson('/api/integrations/asaas').then(setState).catch((e: any) => setError(e.message));
  useEffect(() => { reload(); }, []);
  const connect = async () => {
    setBusy(true); setError('');
    try {
      await apiJson('/api/integrations/asaas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: token }) });
      await apiJson('/api/integrations/asaas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callbackUrl: url }) });
      setToken(''); setUrl(''); await reload(); notify('Asaas conectado');
    } catch (e: any) { setError(e.message || 'Falha ao configurar Asaas'); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    setBusy(true); setError('');
    try {
      await apiJson('/api/integrations/asaas', { method: 'DELETE' });
      setToken(''); setUrl(''); await reload(); notify('Asaas desconectado');
    } catch (e: any) { setError(e.message || 'Falha ao desconectar Asaas'); }
    finally { setBusy(false); }
  };
  return <div>
    <div className="integrationHero"><PlatformLogo i={i} /><div><h3>Asaas</h3><p>Saques e transferências da Shopify</p></div><span className={state?.status === 'CONNECTED' ? 'status ok' : 'status warn'}>{state?.status === 'CONNECTED' ? 'Conectado' : state?.status === 'ERROR' ? 'Permissão pendente' : 'Preparado'}</span></div>
    <div className="credentials">
      <p className="muted">A chave fica criptografada no servidor. O financeiro consulta o histórico de transferências diretamente no Asaas.</p>
      {state?.status === 'CONNECTED' ? <div className="detailGrid">
        <div className="detailBox"><span>Chave API</span><b>Protegida</b></div>
        <div className="detailBox"><span>Status</span><b>Ativa</b></div>
      </div> : <>
        <label><span>Chave API de produção</span><input className="fullInput" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="$aact_prod_…" /></label>
        <h4>Webhook</h4>
        <label><span>URL pública</span><input className="fullInput" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://seu-dominio/api/webhooks/asaas" /></label>
      </>}
      <div className="syncOptions singleIntegrationAction">{state?.status === 'CONNECTED'
        ? <button className="integrationDisconnectButton" type="button" disabled={busy} onClick={disconnect}><Link2 size={15} />Desconectar</button>
        : <button type="button" disabled={busy || !token || !url} onClick={connect}><Link2 size={15} />Conectar</button>}
      </div>
      {state?.lastError && <p className="negative">{state.lastError}</p>}
      {error && <p className="negative">{error}</p>}
    </div>
  </div>;
}
function MercadoPagoIntegrationDetail({ i, notify }: { i: Integration; notify: (x: string) => void }) {
  const [connected, setConnected] = useState(i.status === "Conectado");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const connect = async () => {
    setBusy(true); setError("");
    try {
      await apiJson("/api/integrations/mercado-pago", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken: token }) });
      setToken(""); setConnected(true); notify("Mercado Pago conectado");
    } catch (e: any) { setError(e.message || "Falha ao conectar Mercado Pago"); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    setBusy(true); setError("");
    try {
      await apiJson("/api/integrations/mercado-pago", { method: "DELETE" });
      setConnected(false); setToken(""); notify("Mercado Pago desconectado");
    } catch (e: any) { setError(e.message || "Falha ao desconectar Mercado Pago"); }
    finally { setBusy(false); }
  };
  return <div>
    <div className="integrationHero"><PlatformLogo i={i} /><div><h3>Mercado Pago</h3><p>Credencial protegida por empresa</p></div><span className={connected ? "status ok" : "status warn"}>{connected ? "Conectado" : "Preparado"}</span></div>
    <div className="tabs"><button className="selected">Configuração</button></div>
    <div className="credentials">
      <p className="muted">O Access Token fica criptografado no servidor e não é exibido depois da conexão.</p>
      {connected ? <div className="detailGrid">
        <div className="detailBox"><span>Access Token</span><b>Protegido</b></div>
        <div className="detailBox"><span>Status</span><b>Ativa</b></div>
      </div> : <>
        <label><span>Access Token de produção</span><input className="fullInput" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="APP_USR-…" /></label>
        <div className="syncOptions singleIntegrationAction"><button type="button" disabled={busy || !token} onClick={connect}><Link2 size={15} />Conectar</button></div>
      </>}
      {connected && <div className="syncOptions singleIntegrationAction"><button className="integrationDisconnectButton" type="button" disabled={busy} onClick={disconnect}><Link2 size={15} />Desconectar</button></div>}
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
  if (i.name === "Asaas") return <AsaasIntegrationDetail i={i} notify={notify} />;
  if (i.name === "Mercado Pago") return <MercadoPagoIntegrationDetail i={i} notify={notify} />;
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
        {metaConnected && <button type="button" className="integrationDisconnectButton" onClick={disconnectMeta}><Link2 size={15} />Desconectar</button>}
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
          {["Configuração", "Webhooks"].map((t) => (
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
            {!connected && <label>
              <span>Loja Shopify</span>
              <input className="fullInput" value={shop} onChange={(e) => setShop(e.target.value)} placeholder="sua-loja.myshopify.com" />
            </label>}
            <div className="syncOptions singleIntegrationAction">
              {!connected ? <button onClick={() => (shop ? (location.href = `/api/integrations/shopify/connect?shop=${encodeURIComponent(shop)}`) : notify("Informe a loja Shopify"))}>
                <Link2 />Conectar
              </button> : <button className="disconnectAction integrationDisconnectButton"
                onClick={async () => {
                  await apiJson("/api/integrations/shopify/disconnect", {
                    method: "POST",
                    body: "{}",
                  });
                  setStatus({ ...status, status: "DISCONNECTED" });
                  notify("Shopify desconectado");
                }}
              >
                <Link2 />Desconectar
              </button>}
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
          </div>
        )}
      </div>
    );
  }
  if (i.name === "Mercado Livre") {
    const connected = status?.status === "CONNECTED";
    const mlName = status?.user?.nickname || status?.externalAccountId || "Nenhuma";
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
          {["Configuração", "Webhooks"].map((t) => (
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
            <div className="syncOptions singleIntegrationAction">
              {!connected || status?.requiresReconnect ? <button onClick={() => (location.href = "/api/integrations/mercadolivre/connect")}>
                <Link2 />Conectar
              </button> : <button className="disconnectAction integrationDisconnectButton"
                onClick={async () => {
                  await apiJson("/api/integrations/mercadolivre/disconnect", {
                    method: "POST",
                    body: "{}",
                  });
                  setStatus({ ...status, status: "DISCONNECTED" });
                  notify("Mercado Livre desconectado");
                }}
              >
                <Link2 />Desconectar
              </button>}
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
          </div>
        )}
      </div>
    );
  }
  if (i.name === "Amazon") {
    const connected = status?.status === "CONNECTED";
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
          <button className="selected">Configuração</button>
        </div>
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
            <div className="syncOptions singleIntegrationAction">
              {!connected ? <button
                onClick={async () => {
                  await apiJson("/api/integrations/amazon/connect", {
                    method: "POST",
                    body: "{}",
                  });
                  notify("Amazon conectada");
                  reloadStatus();
                }}
              >
                <Link2 />Conectar
              </button> : <button className="disconnectAction integrationDisconnectButton"
                onClick={async () => {
                  await apiJson("/api/integrations/amazon/disconnect", {
                    method: "POST",
                    body: "{}",
                  });
                  setStatus({ ...status, status: "DISCONNECTED" });
                  notify("Amazon desconectada");
                }}
              >
                <Link2 />Desconectar
              </button>}
            </div>
        </div>
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
    rawItem = s.raw?.items?.[0] || {},
    originalSku = rawItem.sku || s.itemSku || "";
  const orderChannel=String(s.raw?.channel||s.channel||s.source||'').toUpperCase().replaceAll(' ','_');
  const expectedSource=orderChannel.includes('SHOPIFY')?'SHOPIFY':orderChannel.includes('AMAZON')?'AMAZON':orderChannel.includes('MERCADO')?'MERCADO_LIVRE':orderChannel.includes('SHOPEE')?'SHOPEE':'';
  const assignable = products.filter((p:any)=>!expectedSource||String(p.source||'').toUpperCase()===expectedSource);
  const selectedSku = String(s.itemSku ?? (assignable.some((p: any) => p.sku === originalSku) ? originalSku : ""));
  const selectedProduct = products.find((p: any) => p.sku === selectedSku);
  const qty = Number(rawItem.quantity || 1);
  const cogs = Number(s.cogs ?? (Number(rawItem.unitCost || 0) * qty));
  const paidAt = s.paidAt ?? saoPauloDateTimeLocal(new Date(s.raw?.paidAt || s.raw?.createdAt));
  const paymentMethod = s.paymentMethod ?? s.raw?.paymentMethod ?? "";
  return (
    <div className="detailGrid">
      <label className="field">
        <span>Cliente</span>
        <input value={s.customer || ""} onChange={(e) => set("customer", e.target.value)} />
      </label>
      <AnchoredSelect label="Produto" value={selectedSku} onChange={(v) => { const product = products.find((item: any) => item.sku === v); set("itemSku", v); set("cogs", product ? Number(product.unitCost ?? product.cost ?? 0) * qty : 0); }} options={assignable.map((p: any) => ({ value: p.sku, label: `${p.sku} · ${p.product}` }))} />
      <label className="field"><span>Valor</span><input type="number" value={Number(s.grossAmount ?? s.raw?.grossAmount ?? 0)} onChange={(e) => set("grossAmount", e.target.value)} /></label>
      <label className="field"><span>Custo dos produtos</span><input type="number" value={cogs} onChange={(e) => set("cogs", e.target.value)} /></label>
      <CalendarDateTimeField label="Data e hora da venda" value={paidAt} onChange={(value) => set("paidAt", value)} />
      <label className="field"><span>Método de Pag.</span><input value={paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} placeholder="Informado pela plataforma" /></label>
      <label className="field">
        <span>Taxa da plataforma</span>
        <input type="number" value={fee} onChange={(e) => set("feeAmount", e.target.value)} />
      </label>
      <label className="field">
        <span>Custo do frete</span>
        <input type="number" value={freight} onChange={(e) => set("shippingAmount", e.target.value)} />
      </label>
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
function CalendarDateTimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const date = String(value || "").slice(0, 10);
  const time = String(value || "").slice(11, 16) || "00:00";
  const update = (nextDate: string, nextTime: string) => onChange(nextDate ? `${nextDate}T${nextTime || "00:00"}` : "");
  return <div className="field calendarDateTimeField"><span>{label}</span><div><CalendarDateField label="Data" value={date} onChange={(next) => update(next, time)} /><input aria-label="Hora" type="time" value={time} onChange={(event) => update(date || todayISO(), event.target.value)} /></div></div>;
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

type SelectOption = string | { value: string; label: string; icon?: string };
function AnchoredSelect({ label, value, onChange, options, compact = false }: { label?: string; value: string; onChange: (value: string) => void; options: SelectOption[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const normalized: Array<{ value: string; label: string; icon?: string }> = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
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
    <button ref={triggerRef} type="button" className="anchoredSelectTrigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={toggle}><span className="anchoredSelectValue">{current?.icon && <span className="filterPlatformLogo"><img src={current.icon} alt="" /></span>}<span>{current?.label || "Selecione..."}</span></span><ChevronDown size={15} /></button>
    {open && createPortal(<div ref={panelRef} className={`anchoredSelectMenu${compact ? " compact" : ""}`} role="listbox" aria-label={label} style={position}>
      {normalized.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === String(value ?? "")} onClick={() => { onChange(option.value); setOpen(false); }}>{option.icon && <span className="filterPlatformLogo"><img src={option.icon} alt="" /></span>}<span>{option.label}</span></button>)}
    </div>, document.querySelector(".shell") || document.body)}
  </div>;
}

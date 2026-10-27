"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoContains, geoDistance, geoGraticule10, geoMercator, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import { Check, ChevronDown, Globe2, Map, MapPin } from "lucide-react";

export type LocationState = { state: string; orders: number; revenue: number; result: number; cities: number };
export type LocationData = { locatedOrders: number; totalOrders: number; states: LocationState[]; cities: { state: string; city: string; orders: number; revenue: number; result: number }[]; missingStates: string[]; missingCities: { state: string; city: string }[] };
const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);
const coordinates: Record<string, [number, number]> = { AC: [-70.5, -9.0], AL: [-36.6, -9.6], AP: [-51.8, 1.4], AM: [-63.2, -4.2], BA: [-41.8, -12.5], CE: [-39.5, -5.2], DF: [-47.9, -15.8], ES: [-40.5, -19.5], GO: [-49.6, -16.0], MA: [-45.3, -5.0], MT: [-56.1, -12.9], MS: [-54.6, -20.5], MG: [-44.2, -18.8], PA: [-52.5, -3.8], PB: [-36.7, -7.1], PR: [-51.5, -24.6], PE: [-37.9, -8.4], PI: [-42.7, -7.7], RJ: [-43.2, -22.2], RN: [-36.6, -5.8], RS: [-53.2, -30.0], RO: [-63.6, -10.8], RR: [-61.3, 2.0], SC: [-50.2, -27.3], SP: [-48.5, -22.3], SE: [-37.4, -10.6], TO: [-48.3, -10.2] };
const cityKey = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const cityCoordinates: Record<string, [number, number]> = {
  "BELO HORIZONTE": [-43.94, -19.92], "SAO PAULO": [-46.63, -23.55], "RIO DE JANEIRO": [-43.17, -22.91], BRASILIA: [-47.88, -15.79], BELEM: [-48.49, -1.46], ARACAJU: [-37.07, -10.91], ITAITUBA: [-55.98, -4.28], CONTAGEM: [-44.05, -19.93], CAMARAGIBE: [-35.02, -8.02], GRAVATAI: [-50.99, -29.94], RONDONOPOLIS: [-54.64, -16.47], BAURU: [-49.06, -22.32], "RIBEIRAO PRETO": [-47.81, -21.17], ANAPOLIS: [-48.95, -16.33], SABARA: [-43.81, -19.89], "BALNEARIO CAMBORIU": [-48.63, -26.99], SALVADOR: [-38.50, -12.97], BRUSQUE: [-48.92, -27.10], SANTOS: [-46.33, -23.96], "PORTO ALEGRE": [-51.23, -30.03], "SAO JOSE DO RIO PRETO": [-49.38, -20.81], INDAIATUBA: [-47.22, -23.09], FORTALEZA: [-38.54, -3.73], GARANHUNS: [-36.49, -8.89], VITORIA: [-40.31, -20.32], "SALTO DE PIRAPORA": [-47.57, -23.65], "MONTE ALEGRE DE MINAS": [-48.88, -18.87], COLMEIA: [-48.54, -8.72], "JOAO PESSOA": [-34.88, -7.12], MANAUS: [-60.02, -3.12], "LARANJAL PAULISTA": [-47.84, -23.05], "SANTA HELENA": [-54.33, -24.86], FRANCA: [-47.40, -20.54], "BRAGANCA PAULISTA": [-46.54, -22.95], IBIRITE: [-44.06, -20.02], PINHAIS: [-49.19, -25.44], "OSVALDO CRUZ": [-50.88, -21.80],
};
const ibgeStateCodes: Record<string, string> = { "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO", "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA", "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS", "50": "MS", "51": "MT", "52": "GO", "53": "DF" };
const normalizeIbgePolygons = (collection: any) => ({ ...collection, features: collection?.features?.map((item: any) => ({ ...item, geometry: item.geometry?.type === "Polygon" ? { ...item.geometry, coordinates: item.geometry.coordinates.map((ring: any[]) => [...ring].reverse()) } : item.geometry?.type === "MultiPolygon" ? { ...item.geometry, coordinates: item.geometry.coordinates.map((polygon: any[][]) => polygon.map((ring: any[]) => [...ring].reverse())) } : item.geometry })) || [] });

export default function LocationGlobe({ data }: { data: LocationData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<Array<{ state: string; city?: string; x: number; y: number; radius: number }>>([]);
  const projectionRef = useRef<any>(null);
  const stateFeaturesRef = useRef<any[]>([]);
  const rotationRef = useRef<[number, number]>([52, 15]);
  const panRef = useRef<[number, number]>([0, 0]);
  const zoomRef = useRef(1);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; rotation: [number, number]; pan: [number, number]; moved: boolean } | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "globe">("map");
  const [country, setCountry] = useState("BR");
  const [locationTab, setLocationTab] = useState<"sold" | "missing">("sold");
  const [brazilStatesMap, setBrazilStatesMap] = useState<any>(null);
  const [selected, setSelected] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const selectedState = data.states.find(item => item.state === selected);
  const selectedCityData = data.cities.find(item => item.state === selected && item.city === selectedCity);
  const stateCities = data.cities.filter(item => item.state === selected);
  const missingSelectedState = data.missingStates.includes(selected) ? selected : "";
  const missingStateCities = data.missingCities.filter(item => item.state === missingSelectedState);
  const totals = data.states.reduce((sum, item) => ({ orders: sum.orders + item.orders, revenue: sum.revenue + item.revenue, result: sum.result + item.result, cities: sum.cities + item.cities }), { orders: 0, revenue: 0, result: 0, cities: 0 });
  const soldLabel = selectedCityData ? `${selectedCityData.city} · ${selectedCityData.state}` : selectedState ? `${selectedState.state} · ${selectedState.cities} ${selectedState.cities === 1 ? "cidade" : "cidades"}` : `Total · ${totals.cities} cidades`;
  const soldRevenue = selectedCityData?.revenue ?? selectedState?.revenue ?? totals.revenue;
  const soldOrders = selectedCityData?.orders ?? selectedState?.orders ?? totals.orders;
  const soldResult = selectedCityData?.result ?? selectedState?.result ?? totals.result;
  const countries = useMemo(() => feature(world as any, (world as any).objects.countries) as any, []);
  useEffect(() => { fetch("/api/performance/brazil-map", { cache: "force-cache" }).then(response => response.ok ? response.json() : null).then(map => setBrazilStatesMap(map ? normalizeIbgePolygons(map) : null)).catch(() => {}); }, []);
  useEffect(() => {
    if (selected && locationTab === "sold" && !data.states.some(item => item.state === selected)) setSelected("");
    if (selected && locationTab === "missing" && !data.missingStates.includes(selected)) setSelected("");
  }, [data.missingStates, data.states, locationTab, selected]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => { event.preventDefault(); event.stopPropagation(); zoomRef.current = Math.max(.72, Math.min(10, zoomRef.current * (event.deltaY > 0 ? .88 : 1.16))); };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let stopped = false;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const draw = (time = 0) => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(rect.width * ratio) || canvas.height !== Math.round(rect.height * ratio)) { canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio); }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      const styles = getComputedStyle(canvas);
      const text = styles.getPropertyValue("--text").trim() || "#ecf4f7";
      const border = styles.getPropertyValue("--border").trim() || "#22313b";
      const accent = styles.getPropertyValue("--accent").trim() || "#7cf8bb";
      const accent2 = styles.getPropertyValue("--accent2").trim() || "#53b9ff";
      const size = Math.min(rect.width, rect.height) * .88;
      const idleRotation = viewMode === "map" || dragRef.current || reduceMotion ? 0 : Math.sin(time / 6500) * 2;
      const rotation: [number, number] = [rotationRef.current[0] + idleRotation, rotationRef.current[1]];
      const projection = viewMode === "globe"
        ? geoOrthographic().translate([rect.width / 2, rect.height / 2]).scale((size / 2) * zoomRef.current).rotate(rotation).clipAngle(90).precision(.4)
        : geoMercator().fitExtent([[34, 38], [rect.width - 34, rect.height - 30]], brazilStatesMap || { type: "Sphere" } as any);
      if (viewMode === "map") {
        const baseScale = projection.scale(); const baseTranslate = projection.translate();
        const responsiveZoom = rect.width < 500 ? 1.5 : 1;
        const mapZoom = zoomRef.current * responsiveZoom;
        projection.scale(baseScale * mapZoom).translate([rect.width / 2 + (baseTranslate[0] - rect.width / 2) * mapZoom + panRef.current[0], rect.height / 2 + (baseTranslate[1] - rect.height / 2) * mapZoom + panRef.current[1]]);
      }
      projectionRef.current = projection;
      stateFeaturesRef.current = brazilStatesMap?.features || [];
      const path = geoPath(projection, context);
      if (viewMode === "globe") {
        context.beginPath(); path({ type: "Sphere" } as any); context.fillStyle = `${accent2}12`; context.fill(); context.strokeStyle = border; context.lineWidth = 1.3; context.stroke();
        context.beginPath(); path(geoGraticule10()); context.strokeStyle = `${text}12`; context.lineWidth = .7; context.stroke();
        context.beginPath(); path(countries); context.fillStyle = `${text}16`; context.fill(); context.strokeStyle = `${text}28`; context.lineWidth = .55; context.stroke();
      }
      const visible: Array<{ state: string; city?: string; x: number; y: number; radius: number }> = [];
      if (brazilStatesMap?.features) brazilStatesMap.features.forEach((stateFeature: any) => {
        const state = ibgeStateCodes[String(stateFeature?.properties?.codarea || "").slice(0, 2)];
        const available = locationTab === "sold" ? data.states.some(item => item.state === state) : data.missingStates.includes(state);
        const active = available && state === selected;
        const highlighted = active || (!selected && available);
        const activeColor = locationTab === "sold" ? accent : "#ff5f68";
        context.beginPath(); path(stateFeature);
        context.strokeStyle = highlighted ? activeColor : `${text}30`; context.lineWidth = highlighted ? 1.35 : .65; context.stroke();
        const coordinate = coordinates[state];
        if (!coordinate || (viewMode === "globe" && geoDistance(coordinate, [-rotation[0], -rotation[1]]) > Math.PI / 2)) return;
        const point = projection(coordinate);
        if (!point) return;
        context.font = `${active ? 800 : 650} ${zoomRef.current >= 2.4 ? 11 : 9}px system-ui, sans-serif`;
        context.fillStyle = active ? activeColor : `${text}a8`;
        context.textAlign = "center"; context.textBaseline = "middle";
        context.fillText(state, point[0], point[1]);
        if (available) visible.push({ state, x: point[0], y: point[1], radius: 18 });
      });
      if (locationTab === "sold") data.cities.forEach(item => {
        const coordinate = cityCoordinates[cityKey(item.city)];
        if (!coordinate || (viewMode === "globe" && geoDistance(coordinate, [-rotation[0], -rotation[1]]) > Math.PI / 2)) return;
        const point = projection(coordinate);
        if (!point) return;
        const [x, y] = point;
        const active = item.state === selected && item.city === selectedCity;
        context.beginPath(); context.arc(x, y, active ? 3 : 1.6, 0, Math.PI * 2); context.fillStyle = active ? accent : text; context.fill();
        if (zoomRef.current >= 2.7) { context.font = `${active ? 600 : 500} 10px system-ui, sans-serif`; context.fillStyle = active ? accent : text; context.textAlign = "left"; context.textBaseline = "middle"; context.fillText(item.city, x + 6, y); }
        visible.unshift({ state: item.state, city: item.city, x, y, radius: 9 });
      });
      pointsRef.current = visible;
      if (!stopped && !reduceMotion) frame = requestAnimationFrame(draw);
    };
    draw();
    const observer = new ResizeObserver(() => draw()); observer.observe(canvas);
    return () => { stopped = true; cancelAnimationFrame(frame); observer.disconnect(); };
  }, [brazilStatesMap, countries, data.cities, data.missingStates, data.states, locationTab, selected, selectedCity, viewMode]);
  const choosePoint = (element: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = element.getBoundingClientRect(); const x = clientX - rect.left; const y = clientY - rect.top;
    let point = pointsRef.current.find(item => Math.hypot(item.x - x, item.y - y) <= item.radius);
    if (!point) {
      const coordinate = projectionRef.current?.invert?.([x, y]);
      const stateFeature = coordinate && stateFeaturesRef.current.find(item => geoContains(item, coordinate));
      const state = stateFeature && ibgeStateCodes[String(stateFeature?.properties?.codarea || "").slice(0, 2)];
      const sold = state && data.states.some(item => item.state === state);
      const missing = state && data.missingStates.includes(state);
      if (state && (sold || missing)) {
        if (sold && locationTab === "missing") setLocationTab("sold");
        if (missing && locationTab === "sold") setLocationTab("missing");
        point = { state, x, y, radius: 0 };
      }
    }
    if (!point) return;
    if (point.city) {
      const sameCity = selected === point.state && selectedCity === point.city;
      setSelected(sameCity ? "" : point.state); setSelectedCity(sameCity ? "" : point.city);
    } else {
      const sameState = selected === point.state && !selectedCity;
      setSelected(sameState ? "" : point.state); setSelectedCity("");
    }
  };
  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => { event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, rotation: [...rotationRef.current], pan: [...panRef.current], moved: false }; };
  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; const dx = event.clientX - drag.x; const dy = event.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; if (viewMode === "map") panRef.current = [drag.pan[0] + dx, drag.pan[1] + dy]; else rotationRef.current = [drag.rotation[0] + dx * .32, Math.max(-75, Math.min(75, drag.rotation[1] - dy * .25))]; };
  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; if (!drag.moved) choosePoint(event.currentTarget, event.clientX, event.clientY); dragRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId); };
  return <article className={`card performancePanel locationPanel locationTab-${locationTab}`}>
    <div className="sectionHead"><div><h2><Globe2 size={18} /> Resultado por local</h2><p>Vendas pagas com localização no período</p></div><span className="locationCoverage">{data.locatedOrders} de {data.totalOrders} pedidos localizados</span></div>
    {data.states.length ? <div className="locationLayout">
      <div className={`locationGlobeWrap locationView-${viewMode}`}><div className="locationMapControls"><div className="locationCountryFilter"><span>País</span><details><summary>{country === "BR" ? "Brasil" : country}<ChevronDown size={13} /></summary><div className="locationCountryMenu"><button type="button" onClick={event => { setCountry("BR"); event.currentTarget.closest("details")?.removeAttribute("open"); }}><span>Brasil</span>{country === "BR" && <Check size={13} />}</button></div></details></div><div className="locationViewToggle" role="group" aria-label="Visualização do mapa"><button type="button" className={viewMode === "map" ? "active" : ""} onClick={() => { setViewMode("map"); zoomRef.current = 1; panRef.current = [0, 0]; }}><Map size={14} /> Mapa</button><button type="button" className={viewMode === "globe" ? "active" : ""} onClick={() => { setViewMode("globe"); zoomRef.current = 1; panRef.current = [0, 0]; }}><Globe2 size={14} /> Globo</button></div></div><canvas ref={canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { dragRef.current = null; }} aria-label={`${viewMode === "map" ? "Mapa do Brasil" : "Globo interativo"} com resultados por estado e cidade. Use a roda para ampliar.`} /><div className="locationGlobeHint"><MapPin size={13} />{locationTab === "sold" ? <span className="locationLegendSelected">Verde: estado selecionado</span> : <span className="locationLegendMissing">Vermelho: estado selecionado</span>}<span>· Arraste e role para navegar</span></div></div>
      <div className="locationRanking">
        <div className="locationTabs" role="tablist" aria-label="Situação das localidades"><button type="button" role="tab" aria-selected={locationTab === "sold"} className={locationTab === "sold" ? "active" : ""} onClick={() => { setLocationTab("sold"); setSelected(""); setSelectedCity(""); }}>Vendidos <b>{data.states.length}</b></button><button type="button" role="tab" aria-selected={locationTab === "missing"} className={locationTab === "missing" ? "active" : ""} onClick={() => { setLocationTab("missing"); setSelected(""); setSelectedCity(""); }}>Faltando <b>{data.missingStates.length}</b></button></div>
        {locationTab === "sold" ? <><div className="locationSelected"><span>{soldLabel}</span><strong>{brl(soldRevenue)}</strong><small>{soldOrders} {soldOrders === 1 ? "pedido" : "pedidos"} · Resultado {brl(soldResult)}</small></div><div className="locationLists"><div><h3>Estados</h3><div className="locationStateList">{data.states.map((item, index) => <button type="button" key={item.state} className={item.state === selectedState?.state && !selectedCity ? "active" : ""} onClick={() => { const same = selected === item.state && !selectedCity; setSelected(same ? "" : item.state); setSelectedCity(""); }}><span><b>{index + 1}</b>{item.state}</span><span><strong>{brl(item.revenue)}</strong><small>{item.orders} pedidos</small></span></button>)}</div></div><div><h3>{selectedState ? `Cidades em ${selectedState.state}` : "Selecione um estado"}</h3><div className="locationStateList locationCityList">{stateCities.map((item, index) => <button type="button" key={`${item.state}:${item.city}`} className={item.city === selectedCity ? "active" : ""} onClick={() => { const same = item.city === selectedCity; setSelected(same ? "" : item.state); setSelectedCity(same ? "" : item.city); }}><span><b>{index + 1}</b>{item.city}</span><span><strong>{brl(item.revenue)}</strong><small>{item.orders} pedidos</small></span></button>)}{selectedState && !stateCities.length && <small className="locationNoCities">Sem cidades detalhadas.</small>}</div></div></div></> : <><div className="locationSelected locationMissingSummary"><span>{selectedCity ? `${selectedCity} · ${missingSelectedState}` : missingSelectedState ? `${missingSelectedState} sem vendas` : "Sem vendas no período"}</span><strong>{selectedCity ? "Sem vendas" : missingSelectedState ? "Estado selecionado" : `${data.missingStates.length} estados`}</strong><small>{selectedCity ? "Cidade selecionada" : missingSelectedState ? `${missingStateCities.length} municípios sem venda` : `${data.missingCities.length} municípios do Brasil`}</small></div><div className="locationLists"><div><h3>Estados sem venda</h3><div className="locationStateList locationMissingList">{data.missingStates.map((state, index) => <button type="button" key={state} className={state === missingSelectedState && !selectedCity ? "active" : ""} onClick={() => { const same = selected === state && !selectedCity; setSelected(same ? "" : state); setSelectedCity(""); }}><span><b>{index + 1}</b>{state}</span><small>Sem vendas</small></button>)}</div></div><div><h3>{missingSelectedState ? `Cidades sem venda em ${missingSelectedState}` : "Selecione um estado"}</h3><div className="locationStateList locationMissingList">{missingStateCities.map((item, index) => <button type="button" key={`${item.state}:${item.city}`} className={item.city === selectedCity ? "active" : ""} onClick={() => { const same = item.city === selectedCity; setSelected(same ? "" : item.state); setSelectedCity(same ? "" : item.city); }}><span><b>{index + 1}</b>{item.city}</span><small>{item.state}</small></button>)}{missingSelectedState && !missingStateCities.length && <small className="locationNoCities">Nenhuma cidade sem venda neste estado.</small>}</div></div></div></>}
      </div>
    </div> : <div className="performanceEmpty">Nenhum pedido com cidade e estado neste período.</div>}
  </article>;
}

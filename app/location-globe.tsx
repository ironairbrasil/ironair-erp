"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import { Globe2, MapPin } from "lucide-react";

export type LocationState = { state: string; orders: number; revenue: number; result: number; cities: number };
export type LocationData = { locatedOrders: number; totalOrders: number; states: LocationState[]; cities: { state: string; city: string; orders: number; revenue: number; result: number }[]; missingStates: string[]; missingCities: { state: string; city: string }[] };
const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);
const coordinates: Record<string, [number, number]> = { AC: [-70.5, -9.0], AL: [-36.6, -9.6], AP: [-51.8, 1.4], AM: [-63.2, -4.2], BA: [-41.8, -12.5], CE: [-39.5, -5.2], DF: [-47.9, -15.8], ES: [-40.5, -19.5], GO: [-49.6, -16.0], MA: [-45.3, -5.0], MT: [-56.1, -12.9], MS: [-54.6, -20.5], MG: [-44.2, -18.8], PA: [-52.5, -3.8], PB: [-36.7, -7.1], PR: [-51.5, -24.6], PE: [-37.9, -8.4], PI: [-42.7, -7.7], RJ: [-43.2, -22.2], RN: [-36.6, -5.8], RS: [-53.2, -30.0], RO: [-63.6, -10.8], RR: [-61.3, 2.0], SC: [-50.2, -27.3], SP: [-48.5, -22.3], SE: [-37.4, -10.6], TO: [-48.3, -10.2] };
const cityKey = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const cityCoordinates: Record<string, [number, number]> = {
  "BELO HORIZONTE": [-43.94, -19.92], "SAO PAULO": [-46.63, -23.55], "RIO DE JANEIRO": [-43.17, -22.91], BRASILIA: [-47.88, -15.79], BELEM: [-48.49, -1.46], ARACAJU: [-37.07, -10.91], ITAITUBA: [-55.98, -4.28], CONTAGEM: [-44.05, -19.93], CAMARAGIBE: [-35.02, -8.02], GRAVATAI: [-50.99, -29.94], RONDONOPOLIS: [-54.64, -16.47], BAURU: [-49.06, -22.32], "RIBEIRAO PRETO": [-47.81, -21.17], ANAPOLIS: [-48.95, -16.33], SABARA: [-43.81, -19.89], "BALNEARIO CAMBORIU": [-48.63, -26.99], SALVADOR: [-38.50, -12.97], BRUSQUE: [-48.92, -27.10], SANTOS: [-46.33, -23.96], "PORTO ALEGRE": [-51.23, -30.03], "SAO JOSE DO RIO PRETO": [-49.38, -20.81], INDAIATUBA: [-47.22, -23.09], FORTALEZA: [-38.54, -3.73], GARANHUNS: [-36.49, -8.89], VITORIA: [-40.31, -20.32], "SALTO DE PIRAPORA": [-47.57, -23.65], "MONTE ALEGRE DE MINAS": [-48.88, -18.87], COLMEIA: [-48.54, -8.72], "JOAO PESSOA": [-34.88, -7.12], MANAUS: [-60.02, -3.12], "LARANJAL PAULISTA": [-47.84, -23.05], "SANTA HELENA": [-54.33, -24.86], FRANCA: [-47.40, -20.54], "BRAGANCA PAULISTA": [-46.54, -22.95], IBIRITE: [-44.06, -20.02], PINHAIS: [-49.19, -25.44], "OSVALDO CRUZ": [-50.88, -21.80],
};

export default function LocationGlobe({ data }: { data: LocationData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<Array<{ state: string; city?: string; x: number; y: number; radius: number }>>([]);
  const rotationRef = useRef<[number, number]>([52, 15]);
  const zoomRef = useRef(1);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; rotation: [number, number]; moved: boolean } | null>(null);
  const [locationTab, setLocationTab] = useState<"sold" | "missing">("sold");
  const [selected, setSelected] = useState(data.states[0]?.state || "");
  const [selectedCity, setSelectedCity] = useState("");
  const selectedState = data.states.find(item => item.state === selected) || data.states[0];
  const selectedCityData = data.cities.find(item => item.state === selected && item.city === selectedCity);
  const stateCities = data.cities.filter(item => item.state === selected).slice(0, 6);
  const missingSelectedState = data.missingStates.includes(selected) ? selected : data.missingStates[0] || "";
  const missingStateCities = data.missingCities.filter(item => item.state === missingSelectedState);
  const countries = useMemo(() => feature(world as any, (world as any).objects.countries) as any, []);
  useEffect(() => {
    if (locationTab === "sold" && !data.states.some(item => item.state === selected)) setSelected(data.states[0]?.state || "");
    if (locationTab === "missing" && !data.missingStates.includes(selected)) setSelected(data.missingStates[0] || "");
  }, [data.missingStates, data.states, locationTab, selected]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => { event.preventDefault(); event.stopPropagation(); zoomRef.current = Math.max(.72, Math.min(1.8, zoomRef.current * (event.deltaY > 0 ? .9 : 1.1))); };
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
      const idleRotation = dragRef.current || reduceMotion ? 0 : Math.sin(time / 6500) * 2;
      const rotation: [number, number] = [rotationRef.current[0] + idleRotation, rotationRef.current[1]];
      const projection = geoOrthographic().translate([rect.width / 2, rect.height / 2]).scale((size / 2) * zoomRef.current).rotate(rotation).clipAngle(90).precision(.4);
      const path = geoPath(projection, context);
      context.beginPath(); path({ type: "Sphere" } as any); context.fillStyle = `${accent2}12`; context.fill(); context.strokeStyle = border; context.lineWidth = 1.3; context.stroke();
      context.beginPath(); path(geoGraticule10()); context.strokeStyle = `${text}12`; context.lineWidth = .7; context.stroke();
      context.beginPath(); path(countries); context.fillStyle = `${text}16`; context.fill(); context.strokeStyle = `${text}28`; context.lineWidth = .55; context.stroke();
      const max = Math.max(1, ...data.states.map(item => item.revenue));
      const visible: Array<{ state: string; city?: string; x: number; y: number; radius: number }> = [];
      data.states.forEach(item => {
        const coordinate = coordinates[item.state];
        if (!coordinate) return;
        if (geoDistance(coordinate, [-rotation[0], -rotation[1]]) > Math.PI / 2) return;
        const point = projection(coordinate);
        if (!point) return;
        const [x, y] = point;
        const radius = 2.5 + Math.sqrt(item.revenue / max) * 4.5;
        const pulse = reduceMotion ? 0 : (Math.sin(time / 550 + item.state.charCodeAt(0)) + 1) * 1.2;
        context.beginPath(); context.arc(x, y, radius + pulse, 0, Math.PI * 2); context.fillStyle = `${accent}18`; context.fill();
        context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fillStyle = item.state === selected ? accent : accent2; context.fill(); context.strokeStyle = text; context.lineWidth = item.state === selected ? 2 : 1; context.stroke();
        visible.push({ state: item.state, x, y, radius: radius + 8 });
      });
      data.cities.forEach(item => {
        const coordinate = cityCoordinates[cityKey(item.city)];
        if (!coordinate || geoDistance(coordinate, [-rotation[0], -rotation[1]]) > Math.PI / 2) return;
        const point = projection(coordinate);
        if (!point) return;
        const [x, y] = point;
        const active = item.state === selected && item.city === selectedCity;
        context.beginPath(); context.arc(x, y, active ? 3 : 1.6, 0, Math.PI * 2); context.fillStyle = active ? accent : text; context.fill();
        visible.unshift({ state: item.state, city: item.city, x, y, radius: 9 });
      });
      pointsRef.current = visible;
      if (!stopped && !reduceMotion) frame = requestAnimationFrame(draw);
    };
    draw();
    const observer = new ResizeObserver(() => draw()); observer.observe(canvas);
    return () => { stopped = true; cancelAnimationFrame(frame); observer.disconnect(); };
  }, [countries, data.cities, data.states, selected, selectedCity]);
  const choosePoint = (element: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = element.getBoundingClientRect(); const x = clientX - rect.left; const y = clientY - rect.top;
    const point = pointsRef.current.find(item => Math.hypot(item.x - x, item.y - y) <= item.radius);
    if (point) { setSelected(point.state); setSelectedCity(point.city || ""); }
  };
  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => { event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, rotation: [...rotationRef.current], moved: false }; };
  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; const dx = event.clientX - drag.x; const dy = event.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; rotationRef.current = [drag.rotation[0] + dx * .32, Math.max(-75, Math.min(75, drag.rotation[1] - dy * .25))]; };
  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; if (!drag.moved) choosePoint(event.currentTarget, event.clientX, event.clientY); dragRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId); };
  return <article className="card performancePanel locationPanel">
    <div className="sectionHead"><div><h2><Globe2 size={18} /> Resultado por local</h2><p>Vendas pagas com localização no período</p></div><span className="locationCoverage">{data.locatedOrders} de {data.totalOrders} pedidos localizados</span></div>
    {data.states.length ? <div className="locationLayout">
      <div className="locationGlobeWrap"><canvas ref={canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { dragRef.current = null; }} aria-label="Globo interativo com resultados por estado e cidade. Arraste para girar e use a roda para ampliar." /><div className="locationGlobeHint"><MapPin size={13} /> Arraste para girar · role para ampliar</div></div>
      <div className="locationRanking">
        <div className="locationTabs" role="tablist" aria-label="Situação das localidades"><button type="button" role="tab" aria-selected={locationTab === "sold"} className={locationTab === "sold" ? "active" : ""} onClick={() => { setLocationTab("sold"); setSelected(data.states[0]?.state || ""); setSelectedCity(""); }}>Vendidos <b>{data.states.length}</b></button><button type="button" role="tab" aria-selected={locationTab === "missing"} className={locationTab === "missing" ? "active" : ""} onClick={() => { setLocationTab("missing"); setSelected(data.missingStates[0] || ""); setSelectedCity(""); }}>Faltando <b>{data.missingStates.length}</b></button></div>
        {locationTab === "sold" ? <>{selectedState && <div className="locationSelected"><span>{selectedCityData ? `${selectedCityData.city} · ${selectedCityData.state}` : `${selectedState.state} · ${selectedState.cities} ${selectedState.cities === 1 ? "cidade" : "cidades"}`}</span><strong>{brl(selectedCityData?.revenue ?? selectedState.revenue)}</strong><small>{selectedCityData?.orders ?? selectedState.orders} {(selectedCityData?.orders ?? selectedState.orders) === 1 ? "pedido" : "pedidos"} · Resultado {brl(selectedCityData?.result ?? selectedState.result)}</small></div>}<div className="locationLists"><div><h3>Estados</h3><div className="locationStateList">{data.states.slice(0, 6).map((item, index) => <button type="button" key={item.state} className={item.state === selectedState?.state && !selectedCity ? "active" : ""} onClick={() => { setSelected(item.state); setSelectedCity(""); }}><span><b>{index + 1}</b>{item.state}</span><span><strong>{brl(item.revenue)}</strong><small>{item.orders} pedidos</small></span></button>)}</div></div><div><h3>Cidades em {selectedState?.state}</h3><div className="locationStateList locationCityList">{stateCities.map(item => <button type="button" key={`${item.state}:${item.city}`} className={item.city === selectedCity ? "active" : ""} onClick={() => setSelectedCity(item.city)}><span>{item.city}</span><span><strong>{brl(item.revenue)}</strong><small>{item.orders} pedidos</small></span></button>)}{!stateCities.length && <small className="locationNoCities">Sem cidades detalhadas.</small>}</div></div></div></> : <><div className="locationSelected locationMissingSummary"><span>Sem vendas no período</span><strong>{data.missingStates.length} estados</strong><small>{data.missingCities.length} cidades conhecidas no cadastro</small></div><div className="locationLists"><div><h3>Estados sem venda</h3><div className="locationStateList locationMissingList">{data.missingStates.map(state => <button type="button" key={state} className={state === missingSelectedState ? "active" : ""} onClick={() => setSelected(state)}><span>{state}</span><small>Sem vendas</small></button>)}</div></div><div><h3>Cidades sem venda em {missingSelectedState}</h3><div className="locationStateList locationMissingList">{missingStateCities.map(item => <div className="locationMissingCity" key={`${item.state}:${item.city}`}><span>{item.city}</span><small>{item.state}</small></div>)}{!missingStateCities.length && <small className="locationNoCities">Nenhuma cidade conhecida sem venda neste estado.</small>}</div></div></div></>}
      </div>
    </div> : <div className="performanceEmpty">Nenhum pedido com cidade e estado neste período.</div>}
  </article>;
}

"use client";
import { Children, cloneElement, isValidElement, useEffect, useMemo, useRef, useState, type ReactNode, type ReactElement } from "react";

type NodeProps = { children?: ReactNode; className?: string; colSpan?: number };
const nodes = (children: ReactNode) => Children.toArray(children);
function actionContent(node: ReactNode): boolean {
  if (!isValidElement<NodeProps>(node)) return false;
  return /(?:^|\s)(?:rowActions|catalogRowActions|expenseRowActions|mini)(?:\s|$)/.test(node.props.className || "")
    || nodes(node.props.children).some(actionContent);
}
function actionTable(children: ReactNode) {
  const list = nodes(children);
  const table = list.find(node => isValidElement(node) && node.type === "table") as ReactElement<NodeProps> | undefined;
  if (!table) return { content: children, headers: [], rows: [], fixed: false };
  const hasActions = (node: ReactNode): boolean => {
    if (!isValidElement<NodeProps>(node)) return false;
    if (node.type === "tr") {
      const cells = nodes(node.props.children);
      return actionContent(cells[cells.length - 1]);
    }
    return nodes(node.props.children).some(hasActions);
  };
  if (!hasActions(table)) return { content: children, headers: [], rows: [], fixed: false };
  const headers: ReactNode[] = [], rows: ReactNode[] = [];
  function split(node: ReactNode, heading = false): ReactNode {
    if (!isValidElement<NodeProps>(node)) return node;
    const isHeading = heading || node.type === "thead";
    if (node.type === "colgroup") return cloneElement(node, { children: nodes(node.props.children).slice(0, -1) });
    if (node.type === "tr") {
      const cells = nodes(node.props.children);
      const last = cells[cells.length - 1];
      if (!isValidElement<NodeProps>(last)) return node;
      const span = last.props.colSpan || 1;
      const action = span > 1 ? <td /> : cloneElement(last, { colSpan: 1, children: isHeading ? "Ações" : last.props.children });
      (isHeading ? headers : rows).push(cloneElement(node, { key: (isHeading ? headers : rows).length, children: action }));
      const remaining = span > 1 ? [...cells.slice(0, -1), cloneElement(last, { colSpan: span - 1 })] : cells.slice(0, -1);
      return cloneElement(node, { children: remaining });
    }
    return cloneElement(node, { children: nodes(node.props.children).map(child => split(child, isHeading)) });
  }
  const content = list.map(node => node === table ? split(table) : node);
  return { content, headers, rows, fixed: true };
}

export default function TableScroll({ children }: { children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const actions = useRef<HTMLTableElement>(null);
  const [scroll, setScroll] = useState({ left: 0, max: 0, actions: 0 });
  const split = useMemo(() => actionTable(children), [children]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => {
      element.style.setProperty("--table-viewport-width", `${element.clientWidth}px`);
      const header = element.querySelector("thead tr");
      if (header) {
        const width = Array.from(header.children).reduce((total, cell) => total + (cell.classList.contains("checkCol") ? 42 : 300) * Number(cell.getAttribute("colspan") || 1), 0);
        element.style.setProperty("--table-data-width", `${width}px`);
      }
      const next = { left: element.scrollLeft, max: Math.max(0, element.scrollWidth - element.clientWidth), actions: actions.current?.getBoundingClientRect().width || 0 };
      setScroll(previous => previous.left === next.left && previous.max === next.max && previous.actions === next.actions ? previous : next);
      const mainRows = element.querySelectorAll<HTMLTableRowElement>("table tr");
      actions.current?.querySelectorAll<HTMLTableRowElement>("tr").forEach((row, index) => {
        const height = mainRows[index]?.getBoundingClientRect().height;
        if (height && row.style.height !== `${height}px`) row.style.height = `${height}px`;
      });
    };
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    const table = element.querySelector("table");
    if (table) { resize.observe(table); table.querySelectorAll("tr").forEach(row => resize.observe(row)); }
    element.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => { resize.disconnect(); element.removeEventListener("scroll", measure); };
  }, [children]);
  return <div className={`systemTableFrame ${split.fixed ? "hasFixedActions" : ""}`}>
    <div className="systemTableBody">
      <div className="tableWrap" ref={viewport}>{split.content}</div>
      {split.fixed && <div className="systemActionsColumn"><table ref={actions} className="systemActionsTable"><thead>{split.headers}</thead><tbody>{split.rows}</tbody></table></div>}
    </div>
    <div className="systemTableScrollbar" style={{ marginRight: scroll.actions }}>
      <input type="range" min={0} max={Math.max(1, scroll.max)} step={1} value={Math.min(scroll.left, Math.max(1, scroll.max))} disabled={!scroll.max}
        aria-label="Rolagem horizontal da tabela" onChange={event => { if (viewport.current) viewport.current.scrollLeft = Number(event.target.value); }} />
    </div>
  </div>;
}

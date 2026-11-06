"use client"

import { useState } from "react"
import type { CatalogNode } from "@lib/data/navigation"
import CatalogAccordion from "./catalog-accordion"
import CatalogScrollArea from "./catalog-scroll-area"

const colors = [
  ["Чёрный", "#27242c"], ["Серый", "#8b8d93"], ["Серебристый", "#bfc4c8"], ["Белый", "#f3f3f3"],
  ["Зелёный", "#9ed66a"], ["Бежевый", "#e8bc92"], ["Голубой", "#48b4e5"], ["Красный", "#ef382b"],
  ["Фиолетовый", "#a62ce0"], ["Жёлтый", "#f9df65"], ["Розовый", "#ed8bb2"], ["Графитовый", "#414349"],
  ["Титановый", "#b1aaa1"], ["Оранжевый", "#f47741"], ["Тёмно-синий", "#25334d"], ["Бирюзовый", "#69bcb4"],
]

export default function CatalogPanel({ nodes, onSelect }: { nodes: CatalogNode[]; onSelect?: () => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const childrenOf = (parent: string | null) => nodes.filter((node) => node.parent_id === parent)
  const renderBranch = (parent: string | null, depth = 0): React.ReactNode => {
    if (depth > 8) return null
    return <ul className={depth === 0 ? "texno-catalog-tree" : "texno-catalog-children"}>
      {childrenOf(parent).map((node) => {
        const hasChildren = childrenOf(node.id).length > 0
        return <li key={node.id}>
          {hasChildren ? <CatalogAccordion className="texno-catalog-group" label={<><span>{node.label}</span><span className="texno-catalog-group-end"><span className="texno-catalog-quantity">{childrenOf(node.id).length}</span><span className="texno-chevron" /></span></>}>
            {renderBranch(node.id, depth + 1)}
          </CatalogAccordion> : <button className={`texno-catalog-node ${selected === node.id ? "is-selected" : ""} ${node.id === "sale" ? "is-sale" : ""}`} onClick={() => { setSelected(node.id); onSelect?.() }} aria-pressed={selected === node.id}>
            {node.id === "sale" && <span className="texno-sale-mark" aria-hidden="true">%</span>}<span>{node.label}</span>
          </button>}
        </li>
      })}
    </ul>
  }

  return <CatalogScrollArea>
    {nodes.length > 0 && renderBranch(null)}
    <section className="texno-catalog-filters" aria-labelledby="catalog-filters-heading">
      <div className="texno-filter-heading"><h3 id="catalog-filters-heading">Фильтры</h3></div>
      <CatalogAccordion className="texno-filter-group" defaultOpen label={<>Цена <span className="texno-chevron" /></>}>
        <fieldset disabled aria-label="Фильтр цены пока недоступен">
          <div className="texno-price-preview" aria-hidden="true"><span /><span /></div>
          <div className="texno-price-inputs"><label><span className="sr-only">Цена от</span><input inputMode="numeric" placeholder="От, ₽" /></label><span>—</span><label><span className="sr-only">Цена до</span><input inputMode="numeric" placeholder="До, ₽" /></label></div>
        </fieldset>
      </CatalogAccordion>
      <CatalogAccordion className="texno-filter-group" defaultOpen label={<>Цвет <span className="texno-chevron" /></>}>
        <fieldset disabled aria-label="Фильтр по цвету пока недоступен"><div className="texno-color-preview">{colors.map(([name, color]) => <button type="button" key={name} aria-label={name} style={{ backgroundColor: color }} />)}</div></fieldset>
      </CatalogAccordion>
      <CatalogAccordion className="texno-filter-group" defaultOpen label={<>Встроенная память <span className="texno-chevron" /></>}>
        <fieldset disabled aria-label="Фильтр по памяти пока недоступен"><div className="texno-memory-preview">{["64 ГБ", "128 ГБ", "256 ГБ", "512 ГБ", "1 ТБ", "2 ТБ"].map((value) => <button type="button" key={value}>{value}</button>)}</div></fieldset>
      </CatalogAccordion>
      {["Диагональ", "Количество ядер процессора", "Сканер отпечатка пальца"].map((label) => <CatalogAccordion className="texno-filter-group" key={label} label={<>{label}<span className="texno-chevron" /></>}><fieldset disabled><input className="texno-filter-placeholder" aria-label={label} placeholder="—" /></fieldset></CatalogAccordion>)}
    </section>
  </CatalogScrollArea>
}

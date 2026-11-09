"use client"

import { useState } from "react"
import type { CatalogOptionGroup } from "@modules/store/lib/catalog-data"

const numeric = (value: string) => {
  const match = value.trim().match(/^(-?\d+(?:[.,]\d+)?)(?:\s+[^\d]+)?$/)
  return match ? Number(match[1].replace(",", ".")) : null
}
export default function CatalogRangeFilter({ group, selected, disabled, onChange }: { group: CatalogOptionGroup; selected: string[]; disabled: boolean; onChange: (values: string[]) => void }) {
  const values = group.values.map((item) => ({ ...item, number: numeric(item.label) })).filter((item): item is typeof item & { number: number } => item.number !== null)
  const chosen = values.filter((item) => selected.includes(item.value))
  const [min, setMin] = useState(chosen.length ? String(Math.min(...chosen.map((item) => item.number))) : "")
  const [max, setMax] = useState(chosen.length ? String(Math.max(...chosen.map((item) => item.number))) : "")
  const low = min === "" ? -Infinity : Number(min)
  const high = max === "" ? Infinity : Number(max)
  const matching = values.filter((item) => item.number >= low && item.number <= high)
  const invalid = !Number.isFinite(low) && low !== -Infinity || !Number.isFinite(high) && high !== Infinity || low > high || matching.length === 0
  if (!values.length) return <p className="texno-filter-error">Для диапазона пока нет числовых значений.</p>
  return <form onSubmit={(event) => {
    event.preventDefault()
    if (!invalid) onChange(min === "" && max === "" ? [] : matching.map((item) => item.value))
  }}>
    <div className="texno-price-inputs"><label><span>От</span><input type="number" step="any" value={min} placeholder={String(Math.min(...values.map((item) => item.number)))} aria-label={`${group.label}: от`} disabled={disabled} aria-invalid={invalid} onChange={(event) => setMin(event.target.value)} /></label><span aria-hidden="true">—</span><label><span>До</span><input type="number" step="any" value={max} placeholder={String(Math.max(...values.map((item) => item.number)))} aria-label={`${group.label}: до`} disabled={disabled} aria-invalid={invalid} onChange={(event) => setMax(event.target.value)} /></label></div>
    {invalid && <p className="texno-filter-error" role="alert">{low > high ? "Минимум должен быть меньше максимума." : "В выбранном диапазоне нет доступных значений."}</p>}
    <button type="submit" disabled={disabled || invalid} className="texno-text-link" style={{ minHeight: 44 }}>Применить</button>
  </form>
}

import { Button, Input, Table, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

export const tableOffset = (offset: number, count: number, size: number) =>
  Math.min(offset, Math.max(0, Math.ceil(count / size) - 1) * size)

export function TablePagination({ offset, count, size = 12, setOffset }: {
  offset: number
  count: number
  size?: number
  setOffset: (offset: number) => void
}) {
  const currentOffset = tableOffset(offset, count, size)
  const totalPages = Math.ceil(count / size)
  const current = Math.floor(currentOffset / size) + 1
  const [pageInput, setPageInput] = useState("")
  useEffect(() => {
    if (currentOffset !== offset) setOffset(currentOffset)
  }, [currentOffset, offset, setOffset])
  const goTo = (page: number) => {
    setPageInput("")
    setOffset((page - 1) * size)
  }
  const requested = Number(pageInput.trim())
  const valid = /^\d+$/.test(pageInput.trim()) && requested >= 1 && requested <= totalPages
  const start = Math.max(2, Math.min(current - 1, totalPages - 3))
  const end = Math.min(totalPages - 1, start + 2)
  const button = (page: number) => <Button key={page} type="button" size="small"
    variant={page === current ? "primary" : "secondary"} aria-label={`Страница ${page}`}
    aria-current={page === current ? "page" : undefined} onClick={() => goTo(page)}>{page}</Button>

  return <nav aria-label="Страницы таблицы" className="flex flex-wrap items-center justify-end gap-2 p-3">
    <Text size="small" className="text-ui-fg-subtle">{count ? `${currentOffset + 1}–${Math.min(currentOffset + size, count)} из ${count}` : "0 результатов"}</Text>
    {totalPages > 1 && <>
      <Button type="button" size="small" variant="secondary" disabled={current === 1} onClick={() => goTo(current - 1)}>Назад</Button>
      {button(1)}
      {start > 2 && <Text size="small" aria-hidden>…</Text>}
      {Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => button(start + index))}
      {end < totalPages - 1 && <Text size="small" aria-hidden>…</Text>}
      {button(totalPages)}
      <Button type="button" size="small" variant="secondary" disabled={current === totalPages} onClick={() => goTo(current + 1)}>Далее</Button>
      <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); if (valid) goTo(requested) }}>
        <Input type="text" inputMode="numeric" aria-label="Номер страницы" className="w-20" value={pageInput}
          onChange={(event) => setPageInput(event.target.value)} placeholder={String(current)} />
        <Button type="submit" variant="secondary" size="small" disabled={!valid}>Перейти</Button>
      </form>
    </>}
  </nav>
}

export function useTableSort(initial: string, resetPage: () => void = () => {}) {
  const [order, setOrder] = useState(initial)
  const select = (field: string, descendingFirst: boolean) => {
    setOrder(order === field ? `-${field}` : order === `-${field}` ? field : descendingFirst ? `-${field}` : field)
    resetPage()
  }
  const reset = () => { setOrder(initial); resetPage() }
  return { order, select, reset }
}

export function SortHeader({ sort, field, label, descendingFirst = false }: {
  sort: ReturnType<typeof useTableSort>
  field: string
  label: string
  descendingFirst?: boolean
}) {
  const direction = sort.order === field ? "ascending" : sort.order === `-${field}` ? "descending" : undefined
  return <Table.HeaderCell aria-sort={direction}>
    <Button type="button" variant="transparent" size="small" className="-ml-2 whitespace-nowrap"
      aria-label={`Сортировать: ${label}`} onClick={() => sort.select(field, descendingFirst)}>
      {label} <span aria-hidden className={direction ? "text-ui-fg-base" : "text-ui-fg-muted"}>{direction === "ascending" ? "↑" : direction === "descending" ? "↓" : "↕"}</span>
    </Button>
  </Table.HeaderCell>
}

const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" })
type SortValue = string | number | boolean | null | undefined

export function sortTableRows<T>(rows: T[], order: string, values: Record<string, (row: T) => SortValue>) {
  const desc = order.startsWith("-")
  const value = values[desc ? order.slice(1) : order]
  if (!value) return rows
  return [...rows].sort((left, right) => {
    const a = value(left)
    const b = value(right)
    if (a == null) return b == null ? 0 : 1
    if (b == null) return -1
    const comparison = typeof a === "string" || typeof b === "string" ? collator.compare(String(a), String(b)) : Number(a) - Number(b)
    return desc ? -comparison : comparison
  })
}

export const dateValue = (date?: string | Date | null) => date ? new Date(date).getTime() : null
export const addedDate = (date?: string | Date | null) => date
  ? new Date(date).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Moscow" })
  : "—"

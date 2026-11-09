import { ArrowDown, PencilSquare, Plus, Trash } from "@medusajs/icons"
import { Badge, Button, Container, Drawer, FocusModal, Heading, IconButton, Input, Label, Select, Switch, Table, Text, usePrompt } from "@medusajs/ui"
import { FormEvent, useState } from "react"
import type { CatalogNode } from "../../modules/navigation/types"
import { useQuery } from "@tanstack/react-query"
import { sdk } from "../lib/sdk"
import { SortHeader, sortTableRows, TablePagination, useTableSort } from "./admin-table"

type Props = { nodes: CatalogNode[]; disabled: boolean; onSave: (nodes: CatalogNode[]) => Promise<unknown> }

export const CatalogTreeEditor = ({ nodes, disabled, onSave }: Props) => {
  const categoriesQuery = useQuery({ queryKey: ["catalog-categories"], queryFn: () => sdk.client.fetch<{ categories: { id: string; name: string; handle: string; is_active: boolean; is_internal: boolean; metadata: Record<string, unknown> }[]; scope: string }>("/admin/catalog-cms/categories") })
  const categories = (categoriesQuery.data?.categories ?? []).filter((category) => category.is_active && !category.is_internal && category.metadata?.catalog_scope === categoriesQuery.data?.scope)
  const prompt = usePrompt()
  const [expanded, setExpanded] = useState<string[]>([])
  const [editing, setEditing] = useState<CatalogNode | null>(null)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const sort = useTableSort("", () => setPage(0))
  const [error, setError] = useState("")
  const roots = nodes.filter((node) => node.parent_id === null)
  const rows: { node: CatalogNode; depth: number }[] = []
  const visit = (parent: string | null, depth: number) => {
    if (depth > 8) return
    const siblings = sortTableRows(nodes.filter((entry) => entry.parent_id === parent), sort.order, {
      label: (node) => node.label,
      href: (node) => node.href,
      visible: (node) => node.visible,
    })
    for (const node of siblings) {
      if (!query || node.label.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru"))) rows.push({ node, depth })
      if (query || expanded.includes(node.id)) visit(node.id, depth + 1)
    }
  }
  visit(null, 0)
  const pages = Math.max(1, Math.ceil(rows.length / 20))
  const current = Math.min(page, pages - 1)

  const commit = async (next: CatalogNode[]) => {
    setError("")
    try {
      await onSave(next)
      setEditing(null)
      setCreating(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить дерево")
    }
  }
  const descendants = (id: string) => {
    const ids = new Set([id])
    for (let level = 0; level < 8; level++) {
      for (const node of nodes) if (node.parent_id && ids.has(node.parent_id)) ids.add(node.id)
    }
    return ids
  }
  const remove = async (node: CatalogNode) => {
    const ids = descendants(node.id)
    const confirmed = await prompt({ title: `Удалить «${node.label}»?`, description: `Будет удалено пунктов дерева: ${ids.size}. Товары и страницы сохранятся.`, confirmText: "Удалить", cancelText: "Отмена" })
    if (confirmed) await commit(nodes.filter((entry) => !ids.has(entry.id)))
  }
  const move = (node: CatalogNode, delta: number) => {
    const siblings = nodes.filter((entry) => entry.parent_id === node.parent_id)
    const target = siblings[siblings.findIndex((entry) => entry.id === node.id) + delta]
    if (!target) return
    const next = [...nodes]
    const from = next.findIndex((entry) => entry.id === node.id)
    const to = next.findIndex((entry) => entry.id === target.id)
    next[from] = target
    next[to] = node
    void commit(next)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!editing) return
    const selected = categories.find((category) => category.id === editing.category_id) ?? categories.find((category) => editing.href === `/collection/${category.handle}`)
    if (!selected && editing.href !== "/page/sale") { setError("Выберите опубликованную категорию"); return }
    const next = { ...editing, category_id: selected?.id, label: editing.label.trim(), href: selected ? `/collection/${selected.handle}` : "/page/sale" }
    void commit(creating ? [...nodes, next] : nodes.map((node) => node.id === next.id ? next : node))
  }
  const formFields = editing && <div className="flex flex-col gap-y-5">
    <div className="flex flex-col gap-y-2"><Label htmlFor="catalog-name">Название</Label><Input id="catalog-name" required maxLength={100} value={editing.label} onChange={(event) => setEditing({ ...editing, label: event.target.value })} /></div>
    <div className="flex flex-col gap-y-2"><Label htmlFor="catalog-parent">Группа</Label><Select value={editing.parent_id ?? "__root"} onValueChange={(parent) => setEditing({ ...editing, parent_id: parent === "__root" ? null : parent })}><Select.Trigger id="catalog-parent"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="__root">Верхний уровень</Select.Item>{nodes.filter((root) => !descendants(editing.id).has(root.id)).map((root) => <Select.Item value={root.id} key={root.id}>{root.label}</Select.Item>)}</Select.Content></Select></div>
    <div className="flex flex-col gap-y-2"><Label htmlFor="catalog-category">Категория товаров</Label><Select value={editing.category_id ?? categories.find((category) => editing.href === `/collection/${category.handle}`)?.id ?? (editing.href === "/page/sale" ? "__sale" : "")} onValueChange={(category_id) => { const category = categories.find((item) => item.id === category_id); setEditing({ ...editing, category_id: category?.id, href: category ? `/collection/${category.handle}` : "/page/sale" }) }}><Select.Trigger id="catalog-category"><Select.Value placeholder="Выберите категорию" /></Select.Trigger><Select.Content><Select.Item value="__sale">Акции и скидки</Select.Item>{categories.map((category) => <Select.Item value={category.id} key={category.id}>{category.name}</Select.Item>)}</Select.Content></Select><Text size="small" className="text-ui-fg-subtle">Адрес связан с категорией и обновляется при смене её slug. Новую категорию сначала опубликуйте в CMS каталога.</Text></div>
    <div className="flex items-center gap-x-3"><Switch id="catalog-visible" checked={editing.visible} onCheckedChange={(visible) => setEditing({ ...editing, visible })} /><Label htmlFor="catalog-visible">Показывать в каталоге</Label></div>
    {error && <Text size="small" className="text-ui-fg-error" role="alert">{error}</Text>}
  </div>

  return <>
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4"><div><Heading level="h2">Дерево каталога</Heading><Text size="small" className="text-ui-fg-subtle">Групп: {roots.length}. Всего пунктов: {nodes.length}. Раскройте группу для редактирования моделей.</Text></div><Button size="small" disabled={disabled} onClick={() => { setEditing({ id: crypto.randomUUID(), parent_id: null, label: "", href: "", visible: true }); setCreating(true); setError("") }}><Plus />Добавить</Button></div>
      <div className="px-6 py-3"><Input aria-label="Найти пункт каталога" placeholder="Найти модель или группу" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} /></div>
      <Table><Table.Header><Table.Row><SortHeader sort={sort} field="label" label="Название" /><SortHeader sort={sort} field="href" label="Категория" /><SortHeader sort={sort} field="visible" label="Видимость" /><Table.HeaderCell><span className="sr-only">Действия</span></Table.HeaderCell></Table.Row></Table.Header><Table.Body>{rows.slice(current * 20, current * 20 + 20).map(({ node, depth }) => {
        const hasChildren = nodes.some((entry) => entry.parent_id === node.id)
        const siblings = nodes.filter((entry) => entry.parent_id === node.parent_id)
        const index = siblings.findIndex((entry) => entry.id === node.id)
        return <Table.Row key={node.id}><Table.Cell><div className="flex items-center gap-2" style={{ paddingLeft: depth * 16 }}>{hasChildren ? <IconButton size="small" variant="transparent" aria-label={`${expanded.includes(node.id) ? "Свернуть" : "Раскрыть"}: ${node.label}`} aria-expanded={expanded.includes(node.id)} onClick={() => { setExpanded(expanded.includes(node.id) ? expanded.filter((id) => id !== node.id) : [...expanded, node.id]); setPage(0) }}><ArrowDown className={expanded.includes(node.id) ? "" : "-rotate-90"} /></IconButton> : <span className="w-7" />}<Text size="small" weight={hasChildren ? "plus" : "regular"}>{node.label}</Text></div></Table.Cell><Table.Cell><Text size="small" className="text-ui-fg-subtle">{node.href}</Text></Table.Cell><Table.Cell><Badge color={node.visible ? "green" : "grey"}>{node.visible ? "Виден" : "Скрыт"}</Badge></Table.Cell><Table.Cell><div className="flex justify-end gap-1"><IconButton size="small" variant="transparent" aria-label={`Выше: ${node.label}`} disabled={disabled || !!sort.order || index === 0} onClick={() => move(node, -1)}><ArrowDown className="rotate-180" /></IconButton><IconButton size="small" variant="transparent" aria-label={`Ниже: ${node.label}`} disabled={disabled || !!sort.order || index === siblings.length - 1} onClick={() => move(node, 1)}><ArrowDown /></IconButton><IconButton size="small" variant="transparent" aria-label={`Изменить: ${node.label}`} disabled={disabled} onClick={() => { setEditing({ ...node }); setCreating(false); setError("") }}><PencilSquare /></IconButton><IconButton size="small" variant="transparent" aria-label={`Удалить: ${node.label}`} disabled={disabled} onClick={() => remove(node)}><Trash /></IconButton></div></Table.Cell></Table.Row>
      })}</Table.Body></Table>
      {!rows.length && <Text className="px-6 py-6">{query ? "Ничего не найдено" : "Добавьте первую группу каталога"}</Text>}
      {sort.order && <div className="px-6 py-2"><Button type="button" size="small" variant="secondary" onClick={sort.reset}>Вернуть порядок дерева</Button></div>}
      <TablePagination offset={page * 20} count={rows.length} size={20} setOffset={(offset) => setPage(offset / 20)} />
      <Text size="small" className="text-ui-fg-subtle px-6 py-4">Каждый пункт связан с опубликованной товарной категорией. Порядок и видимость управляют деревом витрины; фильтры и SEO редактируются в CMS каталога.</Text>
    </Container>
    <Drawer open={!!editing && !creating} onOpenChange={(open) => { if (!open && !disabled) setEditing(null) }}><Drawer.Content><Drawer.Header><Drawer.Title>Пункт каталога</Drawer.Title><Drawer.Description className="sr-only">Название, родитель, адрес и видимость пункта дерева.</Drawer.Description></Drawer.Header><form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}><Drawer.Body className="overflow-auto">{formFields}</Drawer.Body><Drawer.Footer><Button type="button" size="small" variant="secondary" disabled={disabled} onClick={() => setEditing(null)}>Отмена</Button><Button size="small" type="submit" isLoading={disabled}>Сохранить</Button></Drawer.Footer></form></Drawer.Content></Drawer>
    <FocusModal open={creating} onOpenChange={(open) => { if (!open && !disabled) { setCreating(false); setEditing(null) } }}><FocusModal.Content><form onSubmit={submit} className="flex h-full flex-col"><FocusModal.Header><Button size="small" type="submit" isLoading={disabled}>Добавить пункт</Button></FocusModal.Header><FocusModal.Body className="mx-auto flex w-full max-w-xl flex-col gap-8 p-8"><FocusModal.Title>Новый пункт каталога</FocusModal.Title><FocusModal.Description className="sr-only">Создайте навигационный пункт и выберите его родительскую группу.</FocusModal.Description>{formFields}</FocusModal.Body></form></FocusModal.Content></FocusModal>
  </>
}


import { ArrowDown, PencilSquare, Plus, Trash } from "@medusajs/icons"
import { Badge, Button, Container, Drawer, FocusModal, Heading, IconButton, Input, Label, Select, Switch, Table, Text, usePrompt } from "@medusajs/ui"
import { FormEvent, useState } from "react"
import type { CatalogNode } from "../../modules/navigation/types"

type Props = { nodes: CatalogNode[]; disabled: boolean; onSave: (nodes: CatalogNode[]) => Promise<unknown> }

export const CatalogTreeEditor = ({ nodes, disabled, onSave }: Props) => {
  const prompt = usePrompt()
  const [expanded, setExpanded] = useState<string[]>([])
  const [editing, setEditing] = useState<CatalogNode | null>(null)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [error, setError] = useState("")
  const roots = nodes.filter((node) => node.parent_id === null)
  const rows: { node: CatalogNode; depth: number }[] = []
  const visit = (parent: string | null, depth: number) => {
    if (depth > 8) return
    for (const node of nodes.filter((entry) => entry.parent_id === parent)) {
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
    const next = { ...editing, label: editing.label.trim(), href: editing.href.trim() }
    void commit(creating ? [...nodes, next] : nodes.map((node) => node.id === next.id ? next : node))
  }
  const formFields = editing && <div className="flex flex-col gap-y-5">
    <div className="flex flex-col gap-y-2"><Label htmlFor="catalog-name">Название</Label><Input id="catalog-name" required maxLength={100} value={editing.label} onChange={(event) => setEditing({ ...editing, label: event.target.value })} /></div>
    <div className="flex flex-col gap-y-2"><Label htmlFor="catalog-parent">Группа</Label><Select value={editing.parent_id ?? "__root"} onValueChange={(parent) => setEditing({ ...editing, parent_id: parent === "__root" ? null : parent })}><Select.Trigger id="catalog-parent"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="__root">Верхний уровень</Select.Item>{roots.filter((root) => !descendants(editing.id).has(root.id)).map((root) => <Select.Item value={root.id} key={root.id}>{root.label}</Select.Item>)}</Select.Content></Select></div>
    <div className="flex flex-col gap-y-2"><Label htmlFor="catalog-href">Адрес будущей страницы</Label><Input id="catalog-href" required maxLength={500} placeholder="/collection/apple-iphone" value={editing.href} onChange={(event) => setEditing({ ...editing, href: event.target.value })} /><Text size="small" className="text-ui-fg-subtle">Адрес сохраняется для следующего этапа. Эта форма не создаёт страницу.</Text></div>
    <div className="flex items-center gap-x-3"><Switch id="catalog-visible" checked={editing.visible} onCheckedChange={(visible) => setEditing({ ...editing, visible })} /><Label htmlFor="catalog-visible">Показывать в каталоге</Label></div>
    {error && <Text size="small" className="text-ui-fg-error" role="alert">{error}</Text>}
  </div>

  return <>
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4"><div><Heading level="h2">Дерево каталога</Heading><Text size="small" className="text-ui-fg-subtle">Групп: {roots.length}. Всего пунктов: {nodes.length}. Раскройте группу для редактирования моделей.</Text></div><Button size="small" disabled={disabled} onClick={() => { setEditing({ id: crypto.randomUUID(), parent_id: null, label: "", href: "", visible: true }); setCreating(true); setError("") }}><Plus />Добавить</Button></div>
      <div className="px-6 py-3"><Input aria-label="Найти пункт каталога" placeholder="Найти модель или группу" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} /></div>
      <Table><Table.Header><Table.Row><Table.HeaderCell>Название</Table.HeaderCell><Table.HeaderCell>Будущая страница</Table.HeaderCell><Table.HeaderCell>Видимость</Table.HeaderCell><Table.HeaderCell><span className="sr-only">Действия</span></Table.HeaderCell></Table.Row></Table.Header><Table.Body>{rows.slice(current * 20, current * 20 + 20).map(({ node, depth }) => {
        const hasChildren = nodes.some((entry) => entry.parent_id === node.id)
        const siblings = nodes.filter((entry) => entry.parent_id === node.parent_id)
        const index = siblings.findIndex((entry) => entry.id === node.id)
        return <Table.Row key={node.id}><Table.Cell><div className="flex items-center gap-2" style={{ paddingLeft: depth * 16 }}>{hasChildren ? <IconButton size="small" variant="transparent" aria-label={`${expanded.includes(node.id) ? "Свернуть" : "Раскрыть"}: ${node.label}`} aria-expanded={expanded.includes(node.id)} onClick={() => { setExpanded(expanded.includes(node.id) ? expanded.filter((id) => id !== node.id) : [...expanded, node.id]); setPage(0) }}><ArrowDown className={expanded.includes(node.id) ? "" : "-rotate-90"} /></IconButton> : <span className="w-7" />}<Text size="small" weight={hasChildren ? "plus" : "regular"}>{node.label}</Text></div></Table.Cell><Table.Cell><Text size="small" className="text-ui-fg-subtle">{node.href}</Text></Table.Cell><Table.Cell><Badge color={node.visible ? "green" : "grey"}>{node.visible ? "Виден" : "Скрыт"}</Badge></Table.Cell><Table.Cell><div className="flex justify-end gap-1"><IconButton size="small" variant="transparent" aria-label={`Выше: ${node.label}`} disabled={disabled || index === 0} onClick={() => move(node, -1)}><ArrowDown className="rotate-180" /></IconButton><IconButton size="small" variant="transparent" aria-label={`Ниже: ${node.label}`} disabled={disabled || index === siblings.length - 1} onClick={() => move(node, 1)}><ArrowDown /></IconButton><IconButton size="small" variant="transparent" aria-label={`Изменить: ${node.label}`} disabled={disabled} onClick={() => { setEditing({ ...node }); setCreating(false); setError("") }}><PencilSquare /></IconButton><IconButton size="small" variant="transparent" aria-label={`Удалить: ${node.label}`} disabled={disabled} onClick={() => remove(node)}><Trash /></IconButton></div></Table.Cell></Table.Row>
      })}</Table.Body></Table>
      {!rows.length && <Text className="px-6 py-6">{query ? "Ничего не найдено" : "Добавьте первую группу каталога"}</Text>}
      {pages > 1 && <div className="flex items-center justify-between px-6 py-3"><Text size="small" className="text-ui-fg-subtle">Страница {current + 1} из {pages}</Text><div className="flex gap-2"><Button size="small" variant="secondary" disabled={current === 0} onClick={() => setPage(current - 1)}>Назад</Button><Button size="small" variant="secondary" disabled={current === pages - 1} onClick={() => setPage(current + 1)}>Далее</Button></div></div>}
      <Text size="small" className="text-ui-fg-subtle px-6 py-4">Сейчас дерево управляет только навигацией. Страницы, товарные категории и фильтры подключим отдельно.</Text>
    </Container>
    <Drawer open={!!editing && !creating} onOpenChange={(open) => { if (!open && !disabled) setEditing(null) }}><Drawer.Content><Drawer.Header><Drawer.Title>Пункт каталога</Drawer.Title></Drawer.Header><form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}><Drawer.Body className="overflow-auto">{formFields}</Drawer.Body><Drawer.Footer><Button size="small" variant="secondary" disabled={disabled} onClick={() => setEditing(null)}>Отмена</Button><Button size="small" type="submit" isLoading={disabled}>Сохранить</Button></Drawer.Footer></form></Drawer.Content></Drawer>
    <FocusModal open={creating} onOpenChange={(open) => { if (!open && !disabled) { setCreating(false); setEditing(null) } }}><FocusModal.Content><form onSubmit={submit} className="flex h-full flex-col"><FocusModal.Header><Button size="small" type="submit" isLoading={disabled}>Добавить пункт</Button></FocusModal.Header><FocusModal.Body className="mx-auto flex w-full max-w-xl flex-col gap-8 p-8"><Heading>Новый пункт каталога</Heading>{formFields}</FocusModal.Body></form></FocusModal.Content></FocusModal>
  </>
}

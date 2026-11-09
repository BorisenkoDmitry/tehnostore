import { EllipsisHorizontal } from "@medusajs/icons"
import { Badge, Button, Container, DropdownMenu, IconButton, Text, toast } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useId, useRef, useState, type DragEvent, type PointerEvent } from "react"
import type { GraphBody } from "../../../api/admin/catalog-constructor/validators"
import { hasCategoryShortcutCycle, shortcutKey, type CategoryShortcut } from "../../../lib/catalog-hierarchy"
import { sdk } from "../../lib/sdk"
import { CatalogPicker, PageControls, PICKER_DRAG, productStatus, type PlaceCards } from "./catalog-picker"
import type { MoveToCatalogTrash } from "./catalog-trash"
import { constructorKey, constructorPath, type CardRef, type Folder, type GraphData, type ProductCard } from "./types"
import { useCatalogViewport, type Point } from "./catalog-viewport"
import { canvasBranchPageSize as pageSize, canvasCardKey as keyOf, useCatalogCanvasCards } from "./catalog-canvas-cards"

const column = 272
const rowHeight = 146
const cardWidth = 242
const position = (col: number, row: number) => ({ x: 18 + col * column, y: 22 + row * rowHeight })

type Edge = { from: string; to: CardRef; shortcut?: boolean }
type GestureData =
  | { kind: "pan"; view: Point & { zoom: number } }
  | { kind: "node"; key: string; initial: Point; previous?: Point }
  | { kind: "connect"; from: string }
  | { kind: "reconnect"; edge: Edge }
type Gesture = GestureData & { pointer: number; start: Point; world: Point }
type Wire = Extract<GestureData, { kind: "connect" | "reconnect" }> & { point: Point; target?: CardRef }
type GraphCard = { id: string; x: number; y: number } & (
  { kind: "folder"; folder: Folder; title: string } |
  { kind: "product"; product: ProductCard; title: string } |
  { kind: "link"; title: string; href: string } |
  { kind: "page"; folder: Folder; title: string }
)

const equals = (left: string[], right: string[]) => left.length === right.length && left.every((id) => right.includes(id))
const edgeKey = (edge: Edge) => `${edge.from}:${keyOf(edge.to)}${edge.shortcut ? ":shortcut" : ""}`
const inputPoint = (card: Point) => ({ x: card.x - 7, y: card.y + 44 })
const outputPoint = (card: Point) => ({ x: card.x + cardWidth + 7, y: card.y + 44 })
const boundsOf = (card: Point) => ({ left: card.x - 10, top: card.y, right: card.x + cardWidth + 10, bottom: card.y + rowHeight })
const curve = (from: Point, to: Point) => {
  const bend = Math.max(24, Math.abs(to.x - from.x) * 0.48)
  return `M${from.x} ${from.y} C${from.x + bend} ${from.y} ${to.x - bend} ${to.y} ${to.x} ${to.y}`
}

export function CatalogGraph({ data, openFolder, openProduct, moveToTrash, focusFolder, focusProduct, clearFocus }: {
  data: GraphData
  openFolder: (folder?: Folder) => void
  openProduct: (id?: string) => void
  moveToTrash: MoveToCatalogTrash
  focusFolder?: string
  focusProduct?: ProductCard
  clearFocus: () => void
}) {
  const client = useQueryClient()
  const canvas = useCatalogViewport(data.profile.scope)
  const marker = useId()
  const gesture = useRef<Gesture | undefined>(undefined)
  const [wire, setWire] = useState<Wire>()
  const [gestureKind, setGestureKind] = useState<GestureData["kind"]>()
  const [origin, setOrigin] = useState<string>()
  const [categoryLink, setCategoryLink] = useState<CategoryShortcut>()
  const [edge, setEdge] = useState<Edge>()
  const [moving, setMoving] = useState<Edge>()
  const [located, setLocated] = useState<CardRef>()
  const {
    expanded, setExpanded, directProducts, setDirectProducts, setPlacedFolders, placedProducts, setPlacedProducts, setPlacedProductIds,
    history, setHistory, pending, targets, setTargets, setRemovedCards, forgetPlacement,
    folders, realNodes, moved, parentOf, savedShortcuts, activeShortcuts, extraChildren, children, branches, products, changedProducts, categoriesOf,
    visibleFolders, visibleProductBranches, visibleProducts, placedCategoryIds, productMembership,
  } = useCatalogCanvasCards(data, focusFolder, focusProduct)
  const changeCount = pending.folders.length + pending.products.length + (pending.shortcuts?.length ?? 0)
  const folderName = (id: string | null) => id ? folders.get(id)?.name ?? id : "Верхний уровень"

  const save = useMutation({
    mutationFn: (body: GraphBody) => sdk.client.fetch(constructorPath, { method: "POST", body }),
    onSuccess: async () => {
      setHistory([])
      setEdge(undefined)
      setOrigin(undefined)
      setCategoryLink(undefined)
      setMoving(undefined)
      setTargets([])
      const fresh = await Promise.all(Object.keys(placedProducts).map((id) => sdk.client.fetch<ProductCard>(`${constructorPath}/products/${id}`).catch(() => null)))
      setPlacedProducts(Object.fromEntries(fresh.flatMap((product) => product ? [[product.id, product]] : [])))
      clearFocus()
      await client.invalidateQueries({ queryKey: constructorKey })
      await client.invalidateQueries({ queryKey: ["texno-navigation"] })
      toast.success("Связи сохранены")
    },
    onError: (error: Error) => toast.error("Связи не сохранены", { description: error.message }),
  })

  const place: PlaceCards = ({ folders: selectedFolders, products: selectedProducts }) => {
    const reveal = new Set(selectedProducts.map(({ id }) => keyOf({ kind: "product", id })))
    const parents = new Set<string>()
    for (const { id } of selectedFolders) {
      reveal.add(keyOf({ kind: "folder", id }))
      for (let parent = parentOf(id); parent && parent !== id && !parents.has(parent); parent = parentOf(parent)) {
        parents.add(parent)
      }
    }
    setRemovedCards((previous) => previous.filter((key) => !reveal.has(key)))
    setPlacedFolders((previous) => [...new Set([...previous, ...selectedFolders.map((folder) => folder.id)])])
    setPlacedProducts((previous) => ({ ...previous, ...Object.fromEntries(selectedProducts.map((product) => [product.id, product])) }))
    if (selectedProducts.length) {
      const ids = selectedProducts.map((product) => product.id)
      setPlacedProductIds((previous) => [...new Set([...previous, ...ids])])
      setTargets(ids)
    }
    if (parents.size) setExpanded((previous) => ({ ...previous, ...Object.fromEntries([...parents].map((id) => [id, previous[id] ?? 0])) }))
  }

  const removeFromCanvas = (card: CardRef) => {
    setRemovedCards((previous) => [...new Set([...previous, keyOf(card)])])
    setTargets((previous) => previous.filter((id) => id !== card.id))
    setOrigin(undefined)
    setCategoryLink(undefined)
    setEdge(undefined)
    setMoving(undefined)
  }

  const trashCard = async (card: CardRef, title: string) => {
    if (!await moveToTrash(card, title)) return
    forgetPlacement(card)
    setOrigin(undefined)
    setCategoryLink(undefined)
    setEdge(undefined)
    setMoving(undefined)
  }

  const revealProductBranches = (ids: string[]) => {
    setDirectProducts((previous) => [...new Set([...previous, ...ids])])
    setExpanded((previous) => ({ ...previous, ...Object.fromEntries(ids.map((id) => [id, previous[id] ?? 0])) }))
  }

  useEffect(() => {
    if (!focusFolder && !focusProduct) return
    const folder = focusFolder ? folders.get(focusFolder) : undefined
    if (focusFolder && !folder) return
    const related = focusProduct?.categories.flatMap(({ id }) => folders.has(id) ? [folders.get(id)!] : []) ?? []
    place({ folders: folder ? [folder] : related, products: focusProduct ? [focusProduct] : [] })
    if (focusProduct) revealProductBranches(related.map(({ id }) => id))
    if (focusProduct) setLocated({ kind: "product", id: focusProduct.id })
    else if (folder) setLocated({ kind: "folder", id: folder.id })
    clearFocus()
  }, [focusFolder, focusProduct, data.categories])

  useEffect(() => {
    if (!located) return
    const card = cardMap.get(keyOf(located))
    if (card) {
      canvas.reveal(boundsOf(card))
      canvas.viewport.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
    }
  }, [located])

  const stageFolder = (id: string, parent: string | null) => {
    const folder = folders.get(id)
    if (!folder || save.isPending) return
    const seen = new Set([id])
    let current = parent
    while (current) {
      if (seen.has(current)) { toast.error("Связь создала бы цикл"); return }
      seen.add(current)
      current = parentOf(current)
    }
    const proposed = data.categories.map((folder) => ({ id: folder.id, parent_category_id: folder.id === id ? parent : parentOf(folder.id) }))
    if (hasCategoryShortcutCycle(proposed, [...activeShortcuts.values()])) { toast.error("Связь создала бы цикл"); return }
    const before = folder.parent_category_id ?? null
    const was_placed = realNodes.has(id)
    const next = pending.folders.filter((row) => row.id !== id)
    if (before !== parent || !was_placed) next.push({ id, before, parent, was_placed })
    setHistory((previous) => [...previous, { ...pending, folders: next }])
    if (parent) setExpanded((previous) => ({ ...previous, [parent]: previous[parent] ?? 0 }))
  }

  const stageShortcuts = (edits: (CategoryShortcut & { linked: boolean })[]) => {
    if (save.isPending) return
    const next = new Map((pending.shortcuts ?? []).map((link) => [shortcutKey(link), link]))
    const proposed = new Map(activeShortcuts)
    for (const link of edits) {
      const key = shortcutKey(link)
      const linked = link.linked && parentOf(link.category_id) !== link.parent_id
      if (linked) proposed.set(key, link)
      else proposed.delete(key)
      const before = savedShortcuts.has(key)
      if (before === linked) next.delete(key)
      else next.set(key, { ...link, before, linked })
    }
    if (hasCategoryShortcutCycle(data.categories.map(({ id }) => ({ id, parent_category_id: parentOf(id) })), [...proposed.values()])) {
      toast.error("Связь создала бы цикл")
      return
    }
    setHistory((previous) => [...previous, { ...pending, shortcuts: [...next.values()] }])
    setExpanded((previous) => ({
      ...previous, ...Object.fromEntries(edits.filter(({ linked }) => linked).map(({ parent_id }) => [parent_id, previous[parent_id] ?? 0])),
    }))
  }

  const stageProducts = (ids: string[], add: string | null, remove?: string) => {
    if (save.isPending) return
    const next = pending.products.filter((row) => !ids.includes(row.id))
    for (const id of ids) {
      const product = products.get(id)
      if (!product) continue
      const before = changedProducts.get(id)?.before ?? product.categories.map((category) => category.id)
      const categories = [...new Set([...categoriesOf(id).filter((category) => category !== remove), ...(add ? [add] : [])])]
      if (!equals(before, categories)) next.push({ id, before, categories })
    }
    const kept = ids.flatMap((id) => products.get(id) ? [[id, products.get(id)!] as const] : [])
    setPlacedProducts((previous) => ({ ...previous, ...Object.fromEntries(kept) }))
    setHistory((previous) => [...previous, { ...pending, products: next }])
    if (add) revealProductBranches([add])
  }

  const connect = (from: string, to: CardRef) => {
    if (to.kind === "folder") {
      if (parentOf(to.id) !== from && (parentOf(to.id) || realNodes.has(to.id) || moved.has(to.id))) {
        setCategoryLink({ parent_id: from, category_id: to.id })
      } else stageFolder(to.id, from)
    }
    else stageProducts([to.id], from)
    setOrigin(undefined)
  }
  const moveEdge = (selected: Edge, to: string) => {
    if (selected.shortcut) stageShortcuts([
      { parent_id: selected.from, category_id: selected.to.id, linked: false },
      { parent_id: to, category_id: selected.to.id, linked: true },
    ])
    else if (selected.to.kind === "folder") stageFolder(selected.to.id, to)
    else stageProducts([selected.to.id], to, selected.from)
    setEdge(undefined)
    setMoving(undefined)
  }
  const removeEdge = (selected: Edge) => {
    if (selected.shortcut) stageShortcuts([{ parent_id: selected.from, category_id: selected.to.id, linked: false }])
    else if (selected.to.kind === "folder") stageFolder(selected.to.id, null)
    else stageProducts([selected.to.id], null, selected.from)
    setEdge(undefined)
  }

  const cardMap = new Map<string, GraphCard>()
  const cardEdges: Edge[] = []
  const rows = new Map<number, number>()
  const add = (card: Omit<Extract<GraphCard, { kind: "folder" }>, "x" | "y"> | Omit<Extract<GraphCard, { kind: "product" }>, "x" | "y"> | Omit<Extract<GraphCard, { kind: "page" }>, "x" | "y"> | Omit<Extract<GraphCard, { kind: "link" }>, "x" | "y">, depth: number) => {
    const row = rows.get(depth) ?? 0
    rows.set(depth, row + 1)
    const key = `${card.kind}:${card.id}`
    cardMap.set(key, { ...card, ...(canvas.layout[key] ?? position(depth, row)) })
  }
  const visit = (id: string, depth: number) => {
    const folder = folders.get(id)
    if (!folder || !visibleFolders.has(id) || cardMap.has(`folder:${id}`)) return
    add({ kind: "folder", id, folder, title: realNodes.get(id)?.label ?? folder.name }, depth)
    const parent = parentOf(id)
    if (parent) cardEdges.push({ from: parent, to: { kind: "folder", id } })
    if (!(id in expanded)) return
    for (const child of children.get(id) ?? []) visit(child, depth + 1)
    for (const child of extraChildren.get(id) ?? []) visit(child, depth + 1)
    const branch = branches.get(id)
    if (!branch) return
    add({ kind: "page", id, folder, title: folder.name }, depth + 1)
  }
  for (const node of data.nodes) {
    if (node.category_shortcut) continue
    if (node.category_id && !parentOf(node.category_id)) visit(node.category_id, 0)
    if (!node.category_id && !node.parent_id) add({ kind: "link", id: node.id, title: node.label, href: node.href }, 0)
  }
  for (const id of children.get(null) ?? []) visit(id, 0)
  for (const [from, ids] of extraChildren) for (const id of ids) cardEdges.push({ from, to: { kind: "folder", id }, shortcut: true })
  const productColumn = Math.max(1, ...rows.keys()) + 1
  for (const id of visibleProducts) {
    const product = products.get(id)!
    add({ kind: "product", id, product, title: product.title }, productColumn)
    for (const from of categoriesOf(id)) if (visibleProductBranches.has(from)) cardEdges.push({ from, to: { kind: "product", id } })
  }
  const fit = () => {
    const all = [...cardMap.values()].map(boundsOf)
    canvas.fit(all.length ? {
      left: Math.min(...all.map((bound) => bound.left)), top: Math.min(...all.map((bound) => bound.top)),
      right: Math.max(...all.map((bound) => bound.right)), bottom: Math.max(...all.map((bound) => bound.bottom)),
    } : undefined)
  }
  const chosenProducts = targets.filter((id) => products.has(id))
  const nameOf = (ref: CardRef) => ref.kind === "folder" ? folderName(ref.id) : products.get(ref.id)?.title ?? ref.id
  const toggle = (id: string) => {
    if (!(id in expanded)) {
      setExpanded((previous) => ({ ...previous, [id]: 0 }))
      return
    }
    const closed = new Set<string>()
    const closeBranch = (folderId: string) => {
      if (closed.has(folderId)) return
      closed.add(folderId)
      for (const child of children.get(folderId) ?? []) closeBranch(child)
    }
    closeBranch(id)
    setExpanded((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => !closed.has(key))))
    setDirectProducts((previous) => previous.filter((key) => !closed.has(key)))
    setTargets([])
    setEdge(undefined)
    setMoving(undefined)
    setOrigin(undefined)
  }
  const toggleDirectProducts = (id: string) => {
    if (directProducts.includes(id)) {
      setDirectProducts((previous) => previous.filter((key) => key !== id))
      setTargets([])
      setEdge(undefined)
      setMoving(undefined)
      return
    }
    revealProductBranches([id])
  }
  const drop = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const picker = event.dataTransfer.getData(PICKER_DRAG)
    if (picker) {
      try { place(JSON.parse(picker)) }
      catch { toast.error("Не удалось перенести карточки") }
    }
  }
  const showRelations = (product: ProductCard) => {
    const related = categoriesOf(product.id).flatMap((id) => folders.has(id) ? [folders.get(id)!] : [])
    place({ folders: related, products: [product] })
    revealProductBranches(related.map(({ id }) => id))
  }

  const start = (event: PointerEvent, action: GestureData) => {
    if (gesture.current || !event.isPrimary || (event.button !== 0 && (event.button !== 1 || action.kind !== "pan"))) return
    event.preventDefault()
    event.stopPropagation()
    const screen = { x: event.clientX, y: event.clientY }
    const world = canvas.worldPoint(screen.x, screen.y)
    canvas.viewport.current?.setPointerCapture(event.pointerId)
    gesture.current = { ...action, pointer: event.pointerId, start: screen, world }
    setGestureKind(action.kind)
    if (action.kind === "connect" || action.kind === "reconnect") {
      setOrigin(undefined)
      setMoving(undefined)
      setWire({ ...action, point: world })
    }
  }
  const findTarget = (action: Extract<GestureData, { kind: "connect" | "reconnect" }>, event: PointerEvent): CardRef | undefined => {
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-catalog-node-kind]")
    if (!element || !canvas.viewport.current?.contains(element)) return
    const { catalogNodeKind: kind, catalogNodeId: id } = element.dataset
    if (!id || (kind !== "folder" && kind !== "product")) return
    if (action.kind === "connect" && kind === "folder" && id === action.from) return
    if (action.kind === "reconnect" && (kind !== "folder" || id === action.edge.from)) return
    return { kind, id }
  }
  const drag = (event: PointerEvent) => {
    const action = gesture.current
    if (!action || action.pointer !== event.pointerId) return
    const point = canvas.worldPoint(event.clientX, event.clientY)
    if (action.kind === "pan") canvas.updateView({ ...action.view, x: action.view.x + event.clientX - action.start.x, y: action.view.y + event.clientY - action.start.y }, false)
    if (action.kind === "node") canvas.updateNode(action.key, { x: action.initial.x + point.x - action.world.x, y: action.initial.y + point.y - action.world.y })
    if (action.kind === "connect" || action.kind === "reconnect") setWire({ ...action, point, target: findTarget(action, event) })
  }
  const finish = (event: PointerEvent, cancelled: boolean) => {
    const action = gesture.current
    if (!action || action.pointer !== event.pointerId) return
    gesture.current = undefined
    setGestureKind(undefined)
    setWire(undefined)
    if (cancelled) {
      if (action.kind === "node") canvas.updateNode(action.key, action.previous)
      if (action.kind === "pan") canvas.updateView(action.view, false)
      return
    }
    if (action.kind === "node" || action.kind === "pan") canvas.persist()
    if (action.kind === "connect" || action.kind === "reconnect") {
      const target = findTarget(action, event)
      if (!target) return
      if (action.kind === "connect") connect(action.from, target)
      else moveEdge(action.edge, target.id)
    }
  }
  const draggedFrom = wire?.kind === "connect" ? cardMap.get(`folder:${wire.from}`) : undefined
  const draggedTo = wire?.kind === "reconnect" ? cardMap.get(keyOf(wire.edge.to)) : undefined
  const candidate = wire?.target ? cardMap.get(keyOf(wire.target)) : undefined
  const wirePath = wire && (draggedFrom ? curve(outputPoint(draggedFrom), candidate ? inputPoint(candidate) : wire.point)
    : draggedTo ? curve(candidate ? outputPoint(candidate) : wire.point, inputPoint(draggedTo)) : undefined)

  return <div className="flex min-w-0 flex-col gap-4">
    <CatalogPicker data={data} openFolder={openFolder} openProduct={openProduct} place={place} folderIds={placedCategoryIds} productMembership={productMembership} />
    <Container className="min-w-0 p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div><Text size="small" weight="plus">Схема каталога</Text><Text size="small" className="text-ui-fg-subtle">Тяните карточку за заголовок, холст — за свободное место. Потяните точку справа, чтобы провести стрелку. Колесо меняет масштаб.</Text></div>
        <div className="flex flex-wrap gap-2">
          <Button size="small" variant="secondary" disabled={!history.length || save.isPending} onClick={() => { setHistory((previous) => previous.slice(0, -1)); setEdge(undefined) }}>Отменить шаг</Button>
          <Button size="small" variant="secondary" disabled={!history.length || save.isPending} onClick={() => { setHistory([]); setEdge(undefined); setMoving(undefined); setOrigin(undefined); setCategoryLink(undefined) }}>Сбросить</Button>
          <Button size="small" disabled={!changeCount} isLoading={save.isPending} onClick={() => save.mutate(pending)}>Сохранить связи ({changeCount})</Button>
        </div>
      </div>
      {categoryLink && <div className="flex flex-wrap items-center gap-2 border-b bg-ui-bg-subtle px-4 py-3" role="group" aria-label="Тип связи категорий">
        <Text size="small">Как подключить «{folderName(categoryLink.category_id)}» к «{folderName(categoryLink.parent_id)}»?</Text>
        <Button size="small" variant="secondary" onClick={() => { stageFolder(categoryLink.category_id, categoryLink.parent_id); setCategoryLink(undefined) }}>Переместить</Button>
        <Button size="small" onClick={() => { stageShortcuts([{ ...categoryLink, linked: true }]); setCategoryLink(undefined) }}>Показать в другой ветке</Button>
        <Button size="small" variant="transparent" onClick={() => setCategoryLink(undefined)}>Отмена</Button>
      </div>}
      {(origin || moving || edge || chosenProducts.length > 1) && <div className="flex flex-wrap items-center gap-2 border-b bg-ui-bg-subtle px-4 py-3" aria-live="polite">
        {origin && <><Text size="small">Источник стрелки — {folderName(origin)}. Выберите цель на схеме.</Text>{chosenProducts.length > 1 && <Button size="small" variant="secondary" onClick={() => { stageProducts(chosenProducts, origin); setOrigin(undefined); setTargets([]) }}>Связать {chosenProducts.length} товаров</Button>}</>}
        {!origin && chosenProducts.length > 1 && !moving && !edge && <Text size="small">Выбрано товаров: {chosenProducts.length}. Начните стрелку от нужной папки для групповой привязки.</Text>}
        {moving && <Text size="small">Выберите новую папку для «{nameOf(moving.to)}».</Text>}
        {edge && !moving && <><Text size="small">{folderName(edge.from)} → {nameOf(edge.to)}</Text><Button size="small" variant="secondary" onClick={() => { setMoving(edge); setOrigin(undefined) }}>Перенести связь</Button><Button size="small" variant="secondary" onClick={() => removeEdge(edge)}>Удалить стрелку</Button></>}
        <Button size="small" variant="transparent" onClick={() => { setOrigin(undefined); setEdge(undefined); setMoving(undefined); setTargets([]) }}>Закрыть выбор</Button>
      </div>}
      {changeCount > 0 && <details open className="border-b px-4 py-2">
        <summary className="cursor-pointer text-sm font-medium">Что изменится после сохранения</summary>
        <ul className="mt-2 max-h-40 overflow-auto text-sm text-ui-fg-subtle">
          {pending.folders.map((row) => <li key={row.id}>{folderName(row.id)} · {row.was_placed || row.before ? folderName(row.before) : "Вне схемы"} → {folderName(row.parent)}</li>)}
          {pending.products.map((row) => <li key={row.id}>{products.get(row.id)?.title ?? row.id} · {row.before.filter((id) => !row.categories.includes(id)).map((id) => `− ${folderName(id)}`).join(", ")} {row.categories.filter((id) => !row.before.includes(id)).map((id) => `+ ${folderName(id)}`).join(", ")}</li>)}
          {pending.shortcuts?.map((link) => <li key={shortcutKey(link)}>{link.linked ? "Добавить" : "Удалить"} дополнительную связь · {folderName(link.parent_id)} → {folderName(link.category_id)}</li>)}
        </ul>
      </details>}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2" aria-label="Масштаб холста">
        <Button type="button" size="small" variant="secondary" aria-label="Уменьшить масштаб" onClick={() => canvas.zoomAt(1 / 1.2)}>−</Button>
        <Text size="small" className="w-12 text-center tabular-nums" data-catalog-zoom>{Math.round(canvas.view.zoom * 100)}%</Text>
        <Button type="button" size="small" variant="secondary" aria-label="Увеличить масштаб" onClick={() => canvas.zoomAt(1.2)}>+</Button>
        <Button type="button" size="small" variant="secondary" onClick={fit}>Вписать</Button>
        <Button type="button" size="small" variant="transparent" onClick={canvas.reset}>Исходный вид</Button>
      </div>
      <div ref={canvas.viewport} data-catalog-canvas tabIndex={0} role="region" aria-label="Холст каталога"
        className={`relative h-[clamp(440px,65vh,850px)] overflow-hidden bg-ui-bg-subtle outline-none focus-visible:ring-2 focus-visible:ring-ui-border-interactive ${gestureKind === "pan" ? "cursor-grabbing" : "cursor-grab"}`}
        style={{
          touchAction: "none", userSelect: "none", backgroundImage: "radial-gradient(var(--border-base) 1px, transparent 1px)",
          backgroundSize: `${18 * canvas.view.zoom}px ${18 * canvas.view.zoom}px`, backgroundPosition: `${canvas.view.x}px ${canvas.view.y}px`,
        }}
        onDragOver={(event) => event.preventDefault()} onDrop={drop}
        onPointerDown={(event) => {
          const target = event.target as Element
          if (!event.currentTarget.contains(target)) return
          if (event.button === 1 || !target.closest("article,[data-catalog-edge],[data-catalog-rewire]")) start(event, { kind: "pan", view: canvas.current.current })
        }}
        onPointerMove={drag} onPointerUp={(event) => finish(event, false)} onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={(event) => finish(event, true)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          const shift = { ArrowLeft: [64, 0], ArrowRight: [-64, 0], ArrowUp: [0, 64], ArrowDown: [0, -64] }[event.key]
          if (shift) {
            event.preventDefault()
            const view = canvas.current.current
            canvas.updateView({ ...view, x: view.x + shift[0], y: view.y + shift[1] })
          } else if (["+", "=", "-", "0"].includes(event.key)) {
            event.preventDefault()
            if (event.key === "0") canvas.reset()
            else canvas.zoomAt(event.key === "-" ? 1 / 1.2 : 1.2)
          }
        }}>
        {!cardMap.size && <Text className="pointer-events-none p-6">Добавьте категорию из подборщика, чтобы начать схему.</Text>}
        <div data-catalog-scene className="absolute left-0 top-0 h-px w-px origin-top-left overflow-visible" style={{ transform: `translate(${canvas.view.x}px, ${canvas.view.y}px) scale(${canvas.view.zoom})` }}>
          <svg width={1} height={1} className="pointer-events-none absolute left-0 top-0 overflow-visible" aria-label="Стрелки каталога">
            <defs><marker id={marker} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 Z" fill="context-stroke" /></marker></defs>
            {cardEdges.map((link) => {
              const from = cardMap.get(`folder:${link.from}`)
              const to = cardMap.get(keyOf(link.to))
              if (!from || !to) return null
              const begin = outputPoint(from)
              const path = curve(begin, inputPoint(to))
              const active = !!edge && edgeKey(edge) === edgeKey(link)
              if (wire?.kind === "reconnect" && edgeKey(wire.edge) === edgeKey(link)) return null
              const edited = link.shortcut ? pending.shortcuts?.some((item) => item.parent_id === link.from && item.category_id === link.to.id)
                : link.to.kind === "folder" ? moved.has(link.to.id) : changedProducts.has(link.to.id)
              const label = `${link.shortcut ? "Дополнительная связь · " : ""}${folderName(link.from)} → ${nameOf(link.to)}`
              const choose = () => { setEdge(link); setMoving(undefined); setOrigin(undefined) }
              return <g key={edgeKey(link)}><path data-catalog-edge-path={edgeKey(link)} d={path} fill="none" className={active || edited ? "stroke-ui-fg-interactive" : "stroke-ui-fg-muted"} strokeWidth={active ? 3 : 2} strokeDasharray={link.shortcut ? "3 5" : edited ? "6 4" : undefined} markerEnd={`url(#${marker})`} /><path data-catalog-edge={edgeKey(link)} role="button" tabIndex={0} aria-label={label} d={path} fill="none" stroke="transparent" strokeWidth={18 / canvas.view.zoom} className="cursor-pointer focus:stroke-ui-border-interactive" style={{ pointerEvents: "stroke" }} onClick={choose} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose() } }}><title>{label}</title></path></g>
            })}
            {wirePath && <path data-catalog-wire d={wirePath} fill="none" className="stroke-ui-fg-interactive" strokeWidth={3} strokeDasharray="6 4" markerEnd={`url(#${marker})`} />}
          </svg>
          {[...cardMap.values()].map((card) => {
            const ref = card.kind === "folder" || card.kind === "product" ? { kind: card.kind, id: card.id } : undefined
            const branch = branches.get(card.id)
            return <article data-catalog-node-kind={ref?.kind} data-catalog-node-id={ref?.id} key={`${card.kind}:${card.id}`}
              className={`absolute cursor-default rounded-lg border bg-ui-bg-base p-2 shadow-sm ${origin === card.id || wire?.target?.id === card.id && wire.target.kind === card.kind ? "border-ui-border-interactive ring-2 ring-ui-border-interactive" : "border-ui-border-base"}`}
              style={{ left: card.x, top: card.y, width: cardWidth }}>
              {ref && <span data-catalog-input={keyOf(ref)} className="absolute -left-3.5 top-[37px] size-3.5 cursor-crosshair rounded-full border-2 border-ui-border-interactive bg-ui-bg-base" aria-hidden />}
              {card.kind === "folder" && <button type="button" data-catalog-output={card.id} className="absolute -right-[19px] top-[32px] size-6 cursor-crosshair rounded-full border-2 border-ui-border-interactive bg-ui-bg-base outline-none focus-visible:ring-2 focus-visible:ring-ui-border-interactive"
                aria-label={`Порт стрелки от ${card.title}`} title="Потяните стрелку" disabled={save.isPending}
                onPointerDown={(event) => start(event, { kind: "connect", from: card.id })}
                onClick={(event) => { if (!event.detail) { setOrigin(card.id); setMoving(undefined); setEdge(undefined) } }} />}
              {card.kind === "page" ? <>
                <Text size="xsmall" weight="plus">Товары · {card.title}</Text>
                {branch?.isPending && <Text size="xsmall" role="status">Загрузка…</Text>}
                {branch?.isError && <Button size="small" variant="secondary" onClick={() => branch.refetch()}>Повторить</Button>}
                {branch?.data && <PageControls size={pageSize} offset={expanded[card.id]} count={branch.data.count} setOffset={(offset) => setExpanded((previous) => ({ ...previous, [card.id]: offset }))} />}
              </> : <>
                <div data-catalog-drag={ref ? keyOf(ref) : undefined} className={`flex items-start gap-2 ${ref ? "cursor-grab active:cursor-grabbing" : ""}`}
                  onPointerDown={(event) => { if (ref) start(event, { kind: "node", key: keyOf(ref), initial: { x: card.x, y: card.y }, previous: canvas.positions.current[keyOf(ref)] }) }}>
                  {card.kind === "product" && card.product.thumbnail && <img src={card.product.thumbnail} alt="" className="size-8 shrink-0 rounded object-contain" />}
                  <div className="min-w-0"><Text size="small" weight="plus" className="truncate" title={card.title}>{card.title}</Text>
                    <Text size="xsmall" className="truncate text-ui-fg-subtle" title={card.kind === "product" ? categoriesOf(card.id).map(folderName).join(", ") : undefined}>
                      {card.kind === "folder" ? parentOf(card.id) ? folderName(parentOf(card.id)) : realNodes.has(card.id) || moved.has(card.id) ? "Верхний уровень" : "Без родителя · вне дерева" : card.kind === "product" ? categoriesOf(card.id).map(folderName).join(", ") || "Без категории" : card.href}
                    </Text>
                  </div>
                </div>
                {card.kind !== "link" && <div className="mt-1 flex flex-wrap items-center gap-1">
                  <Badge size="2xsmall" color={(card.kind === "folder" ? card.folder.published : card.product.status === "published") ? "green" : "grey"}>{card.kind === "folder" ? card.folder.published ? "Опубликована" : "Черновик" : productStatus(card.product.status)}</Badge>
                  <Button size="small" variant="transparent" onClick={() => card.kind === "folder" ? openFolder(card.folder) : openProduct(card.id)}>Открыть</Button>
                  {ref && <DropdownMenu>
                    <DropdownMenu.Trigger asChild><IconButton type="button" size="small" variant="transparent" aria-label={`Действия для ${card.title}`}><EllipsisHorizontal /></IconButton></DropdownMenu.Trigger>
                    <DropdownMenu.Content>
                      <DropdownMenu.Item onSelect={() => removeFromCanvas(ref)}>Убрать со схемы</DropdownMenu.Item>
                      <DropdownMenu.Item onSelect={() => changeCount ? toast.error("Сначала сохраните или сбросьте изменения связей") : trashCard(ref, card.title)}>Переместить в корзину</DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu>}
                </div>}
                {card.kind === "folder" && <div className="flex flex-wrap gap-1">
                  <Button size="small" variant="secondary" aria-label={`${card.id in expanded ? "Свернуть" : "Раскрыть"} ${card.title}`} aria-expanded={card.id in expanded} onClick={() => toggle(card.id)}>{card.id in expanded ? "Свернуть" : "Ветка"}</Button>
                  <Button size="small" variant="secondary" aria-label={`Начать стрелку от ${card.title}`} onClick={() => { setOrigin(card.id); setMoving(undefined); setEdge(undefined) }}>Стрелка</Button>
                  {card.id in expanded && (children.has(card.id) || extraChildren.has(card.id)) && <Button size="small" variant="transparent" aria-pressed={directProducts.includes(card.id)} onClick={() => toggleDirectProducts(card.id)}>Товары папки</Button>}
                  {!realNodes.has(card.id) && !moved.has(card.id) && !origin && !moving && <Button size="small" variant="transparent" onClick={() => stageFolder(card.id, null)}>В корень</Button>}
                </div>}
                {card.kind === "product" && !origin && categoriesOf(card.id).length > 0 && <Button size="small" variant="secondary" onClick={() => showRelations(card.product)}>Показать связи</Button>}
                {ref && origin && origin !== ref.id && <Button size="small" variant="secondary" onClick={() => connect(origin, ref)}>Соединить</Button>}
                {card.kind === "folder" && moving && card.id !== moving.from && <Button size="small" variant="secondary" onClick={() => moveEdge(moving, card.id)}>Перенести сюда</Button>}
              </>}
            </article>
          })}
          {edge && wire?.kind !== "reconnect" && cardMap.has(`folder:${edge.from}`) && cardMap.has(keyOf(edge.to)) && (() => {
            const from = outputPoint(cardMap.get(`folder:${edge.from}`)!)
            return <button type="button" data-catalog-rewire={edgeKey(edge)}
              aria-label={`Перетащить начало стрелки для ${nameOf(edge.to)}`} title="Перетащите этот конец на новую папку"
              className="absolute z-10 grid size-6 cursor-crosshair place-items-center rounded-full border-2 border-ui-border-interactive bg-ui-bg-highlight text-xs text-ui-fg-interactive outline-none focus-visible:ring-2 focus-visible:ring-ui-border-interactive"
              style={{ left: from.x + 7, top: from.y - 12 }} disabled={save.isPending}
              onPointerDown={(event) => start(event, { kind: "reconnect", edge })}
              onClick={(event) => { if (!event.detail) { setMoving(edge); setOrigin(undefined) } }}>↔</button>
          })()}
        </div>
      </div>
    </Container>
  </div>
}

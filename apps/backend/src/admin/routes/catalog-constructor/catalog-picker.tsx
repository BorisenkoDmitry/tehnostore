import { Badge, Button, Checkbox, Input, Label, Select, Table, Tabs, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { Fragment, useDeferredValue, useState, type DragEvent } from "react"
import type { ProductCanvasListBody } from "../../../api/admin/catalog-constructor/validators"
import { sdk } from "../../lib/sdk"
import { addedDate, dateValue, SortHeader, sortTableRows, tableOffset, TablePagination, useTableSort } from "../../components/admin-table"
import type { ProductCanvasMembership } from "./catalog-canvas-cards"
import type { MoveToCatalogTrash } from "./catalog-trash"
import { constructorKey, constructorPath, type Folder, type GraphData, type ProductCard, type ProductFamily, type ProductPage, type Stock, type VariantPage } from "./types"

export const PICKER_DRAG = "application/x-catalog-constructor-picker"
const pageSize = 12
export const productStatus = (status: string) => status === "published" ? "Опубликован" : status === "draft" ? "Черновик" : status === "proposed" ? "На рассмотрении" : "Отклонён"
export const stockLabel = ({ known, levels }: Stock) => known ? `Доступно: ${levels.reduce((total, level) => total + Math.max(0, level.stocked_quantity - level.reserved_quantity), 0)}` : "Не подтверждено"
export const priceLabel = (price: number | null, currency: string) => price === null ? "—" : new Intl.NumberFormat("ru", { style: "currency", currency: currency.toUpperCase() }).format(price)

export function PageControls({ offset, count, size = pageSize, setOffset }: { offset: number; count: number; size?: number; setOffset: (offset: number) => void }) {
  return <div className="flex items-center justify-end gap-2 p-3">
    <Text size="small" className="text-ui-fg-subtle">{count ? `${offset + 1}–${Math.min(offset + size, count)} из ${count}` : "0 результатов"}</Text>
    <Button size="small" variant="secondary" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - size))}>Назад</Button>
    <Button size="small" variant="secondary" disabled={offset + size >= count} onClick={() => setOffset(offset + size)}>Далее</Button>
  </div>
}

type Pick = { folders: Folder[]; products: ProductCard[] }
export type PlaceCards = (selection: Pick) => void
type Props = {
  data: GraphData
  openFolder: (folder?: Folder) => void
  openProduct: (id?: string, variant?: string) => void
}
const dragCards = (event: DragEvent, payload: Pick) => {
  event.dataTransfer.setData(PICKER_DRAG, JSON.stringify(payload))
  event.dataTransfer.effectAllowed = "copy"
}

type CanvasFilter = "all" | ProductCanvasListBody["canvas"]["mode"]

function CanvasFilterSelect({ value, onChange }: { value: CanvasFilter; onChange: (value: CanvasFilter) => void }) {
  return <Select value={value} onValueChange={(value) => onChange(value as CanvasFilter)}>
    <Select.Trigger aria-label="Положение на схеме" className="w-40"><Select.Value /></Select.Trigger>
    <Select.Content>
      <Select.Item value="all">Все карточки</Select.Item>
      <Select.Item value="on">На схеме</Select.Item>
      <Select.Item value="off">Не на схеме</Select.Item>
    </Select.Content>
  </Select>
}

function CanvasStatus({ present }: { present: boolean }) {
  return <Badge size="2xsmall" color={present ? "blue" : "grey"}>{present ? "На схеме" : "Не на схеме"}</Badge>
}

export function CatalogPicker({ data, openFolder, openProduct, place, folderIds, productMembership }: Props & {
  place: PlaceCards; folderIds: ReadonlySet<string>; productMembership: ProductCanvasMembership
}) {
  const [expanded, setExpanded] = useState(true)
  return <section className="rounded-lg border border-ui-border-base bg-ui-bg-base">
    <div className="flex items-center justify-between gap-2 px-4 py-2">
      <Text size="small" weight="plus">Подборщик карточек</Text>
      <Button variant="transparent" size="small" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Свернуть" : "Развернуть"}</Button>
    </div>
    <div hidden={!expanded}>
      <Tabs defaultValue="folders">
        <div className="px-4"><Tabs.List><Tabs.Trigger value="folders">Категории</Tabs.Trigger><Tabs.Trigger value="products">Товары</Tabs.Trigger></Tabs.List></div>
        <Tabs.Content value="folders"><FolderTable data={data} open={openFolder} place={place} folderIds={folderIds} /></Tabs.Content>
        <Tabs.Content value="products"><ProductTable data={data} open={openProduct} place={place} membership={productMembership} /></Tabs.Content>
      </Tabs>
    </div>
  </section>
}

export function FolderTable({ data, open, place, folderIds, moveToTrash }: { data: GraphData; open: Props["openFolder"]; place?: PlaceCards; folderIds: ReadonlySet<string>; moveToTrash?: MoveToCatalogTrash }) {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [canvasFilter, setCanvasFilter] = useState<CanvasFilter>("all")
  const [offset, setOffset] = useState(0)
  const sort = useTableSort("name", () => setOffset(0))
  const parents = new Map(data.categories.map((folder) => [folder.id, folder.name]))
  const term = search.trim().toLocaleLowerCase("ru")
  const matching = data.categories.filter((folder) =>
    (status === "all" || (status === "published") === folder.published) &&
    (canvasFilter === "all" || (canvasFilter === "on") === folderIds.has(folder.id)) &&
    `${folder.name} ${folder.handle}`.toLocaleLowerCase("ru").includes(term),
  )
  const folders = sortTableRows(matching, sort.order, {
    name: (folder) => folder.name,
    parent: (folder) => parents.get(folder.parent_category_id ?? ""),
    published: (folder) => folder.published,
    canvas: (folder) => folderIds.has(folder.id),
    created_at: (folder) => dateValue(folder.created_at),
  })
  const pageOffset = tableOffset(offset, folders.length, pageSize)
  return <>
    <div className="flex flex-wrap items-center gap-2 p-3">
      <Input aria-label="Найти категорию" placeholder="Название или адрес" value={search} className="w-64" onChange={(event) => { setSearch(event.target.value); setOffset(0) }} />
      <Select value={status} onValueChange={(value) => { setStatus(value); setOffset(0) }}><Select.Trigger aria-label="Статус категории" className="w-40"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="all">Все статусы</Select.Item><Select.Item value="published">Опубликованные</Select.Item><Select.Item value="draft">Черновики</Select.Item></Select.Content></Select>
      <CanvasFilterSelect value={canvasFilter} onChange={(value) => { setCanvasFilter(value); setOffset(0) }} />
      <Button className="ml-auto" size="small" onClick={() => open()}>Новая категория</Button>
    </div>
    <div className={place ? "max-h-48 overflow-auto" : "overflow-auto"}>
      <Table><Table.Header><Table.Row>
        <SortHeader sort={sort} field="name" label="Категория" />
        <SortHeader sort={sort} field="parent" label="Родитель" />
        <SortHeader sort={sort} field="published" label="Статус" />
        <SortHeader sort={sort} field="canvas" label="Схема" descendingFirst />
        <SortHeader sort={sort} field="created_at" label="Дата добавления" descendingFirst />
        <Table.HeaderCell>Действия</Table.HeaderCell>
      </Table.Row></Table.Header>
        <Table.Body>{folders.slice(pageOffset, pageOffset + pageSize).map((folder) => {
          const present = folderIds.has(folder.id)
          return <Table.Row key={folder.id} draggable={!!place && !present} onDragStart={(event) => dragCards(event, { folders: [folder], products: [] })}>
            <Table.Cell><Text size="small" weight="plus">{folder.name}</Text><Text size="xsmall" className="text-ui-fg-subtle">/{folder.handle}</Text></Table.Cell>
            <Table.Cell>{folder.parent_category_id ? parents.get(folder.parent_category_id) ?? folder.parent_category_id : "Без родителя"}</Table.Cell>
            <Table.Cell><Badge color={folder.published ? "green" : "grey"}>{folder.published ? "Опубликована" : "Черновик"}</Badge></Table.Cell>
            <Table.Cell><CanvasStatus present={present} /></Table.Cell>
            <Table.Cell className="whitespace-nowrap">{addedDate(folder.created_at)}</Table.Cell>
            <Table.Cell><div className="flex gap-2"><Button size="small" variant="transparent" onClick={() => open(folder)}>Открыть</Button>{place && !present && <Button size="small" variant="secondary" onClick={() => place({ folders: [folder], products: [] })}>На схему</Button>}{moveToTrash && <Button size="small" variant="transparent" onClick={() => moveToTrash({ kind: "folder", id: folder.id }, folder.name)}>В корзину</Button>}</div></Table.Cell>
          </Table.Row>
        })}</Table.Body>
      </Table>
    </div>
    <TablePagination offset={offset} count={folders.length} setOffset={setOffset} />
  </>
}

export function ProductTable({ data, open, place, membership, moveToTrash }: { data: GraphData; open: Props["openProduct"]; place?: PlaceCards; membership: ProductCanvasMembership; moveToTrash?: MoveToCatalogTrash }) {
  const [search, setSearch] = useState("")
  const q = useDeferredValue(search.trim())
  const [offset, setOffset] = useState(0)
  const sort = useTableSort("title", () => setOffset(0))
  const [category, setCategory] = useState("all")
  const [status, setStatus] = useState("all")
  const [canvasFilter, setCanvasFilter] = useState<CanvasFilter>("all")
  const [selected, setSelected] = useState<Record<string, ProductCard>>({})
  const [expanded, setExpanded] = useState<string>()
  const [loadFamilies, setLoadFamilies] = useState(false)
  const [familyFilter, setFamilyFilter] = useState<ProductFamily>()
  const selection = Object.values(selected).filter((product) => !membership.has(product))
  const categoryId = category === "all" ? undefined : category
  const familyOptions = useQuery({
    queryKey: [...constructorKey, "families", categoryId],
    queryFn: () => sdk.client.fetch<{ families: ProductFamily[] }>(`${constructorPath}/products/families`, { query: { category_id: categoryId } }),
    enabled: !place && loadFamilies,
  })
  const familyValue = (family: ProductFamily) => `${family.category_id}:${family.id}`
  const filters = {
    q, offset, limit: pageSize, order: sort.order, category_id: categoryId, status: status === "all" ? undefined : status,
    include_families: place ? undefined : "true", family_id: familyFilter?.id, family_category_id: familyFilter?.category_id,
  }
  const canvas = canvasFilter === "all" ? undefined : { mode: canvasFilter, ...membership.filter }
  const query = useQuery({
    queryKey: [...constructorKey, "products", filters, canvas],
    queryFn: ({ signal }) => canvas
      ? sdk.client.fetch<ProductPage>(`${constructorPath}/products/filter`, { method: "POST", body: { filters, canvas }, signal })
      : sdk.client.fetch<ProductPage>(`${constructorPath}/products`, { query: filters, signal }),
  })
  const result = query.data
  const families = new Map(result?.families?.flatMap((family) => family.members.map(({ id }) => [id, family] as const)))
  const placeSelection = () => { place?.({ folders: [], products: selection }); setSelected({}) }
  return <>
    <div className="flex flex-wrap items-center gap-2 p-3">
      <Input aria-label="Найти товар" placeholder="Название, адрес или SKU" value={search} className="w-64" onChange={(event) => { setSearch(event.target.value); setOffset(0) }} />
      <Select value={status} onValueChange={(value) => { setStatus(value); setOffset(0) }}><Select.Trigger aria-label="Статус товара" className="w-40"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="all">Все статусы</Select.Item><Select.Item value="published">Опубликованные</Select.Item><Select.Item value="draft">Черновики</Select.Item></Select.Content></Select>
      <Select value={category} onValueChange={(value) => { setCategory(value); setFamilyFilter(undefined); setOffset(0) }}><Select.Trigger aria-label="Категория товара" className="w-48"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="all">Все категории</Select.Item>{data.categories.map((folder) => <Select.Item key={folder.id} value={folder.id}>{folder.name}</Select.Item>)}</Select.Content></Select>
      <CanvasFilterSelect value={canvasFilter} onChange={(value) => { setCanvasFilter(value); setOffset(0) }} />
      {!place && <Select value={familyFilter ? familyValue(familyFilter) : "all"} onOpenChange={(opened) => { if (opened) setLoadFamilies(true) }} onValueChange={(value) => {
        setFamilyFilter(familyOptions.data?.families.find((family) => familyValue(family) === value))
        setOffset(0)
        setExpanded(undefined)
      }}>
        <Select.Trigger aria-label="Фильтр по семейству" className="w-56"><Select.Value /></Select.Trigger>
        <Select.Content>
          <Select.Item value="all">Все семейства</Select.Item>
          {familyOptions.isPending && <Select.Item value="loading" disabled>Загрузка семейств…</Select.Item>}
          {familyOptions.isError && <Select.Item value="error" disabled>Не удалось загрузить семейства</Select.Item>}
          {familyOptions.data?.families.map((family) => <Select.Item key={familyValue(family)} value={familyValue(family)}>{family.label} ({family.members.length})</Select.Item>)}
        </Select.Content>
      </Select>}
      {familyOptions.isError && <Button size="small" variant="secondary" onClick={() => familyOptions.refetch()}>Повторить загрузку семейств</Button>}
      <Button className="ml-auto" size="small" onClick={() => open()}>Новый товар</Button>
      {place && <Button size="small" variant="secondary" disabled={!selection.length} draggable={!!selection.length} onDragStart={(event) => dragCards(event, { folders: [], products: selection })} onClick={placeSelection}>На схему ({selection.length})</Button>}
    </div>
    {query.isPending && <Text role="status" className="p-4">Загрузка товаров…</Text>}
    {query.isError && <div className="p-4"><Text role="alert">{query.error.message}</Text><Button size="small" variant="secondary" onClick={() => query.refetch()}>Повторить</Button></div>}
    <div className={place ? "max-h-48 overflow-auto" : "overflow-auto"}>
      <Table><Table.Header><Table.Row>
        {place && <Table.HeaderCell>Выбор</Table.HeaderCell>}
        <SortHeader sort={sort} field="title" label="Товар" />
        <Table.HeaderCell>Категории</Table.HeaderCell>
        {!place && <Table.HeaderCell>Семейство</Table.HeaderCell>}
        <SortHeader sort={sort} field="status" label="Статус" />
        <Table.HeaderCell>Схема</Table.HeaderCell>
        <SortHeader sort={sort} field="created_at" label="Дата добавления" descendingFirst />
        <Table.HeaderCell>Действия</Table.HeaderCell>
      </Table.Row></Table.Header>
        <Table.Body>{result?.products.map((product) => {
          const family = families.get(product.id)
          const showMembers = expanded === product.id
          const membersId = `family-members-${product.id}`
          const present = membership.has(product)
          return <Fragment key={product.id}>
          <Table.Row draggable={!!place && !present} onDragStart={(event) => dragCards(event, { folders: [], products: selected[product.id] ? selection : [product] })}>
          {place && <Table.Cell><Checkbox id={`pick-${product.id}`} checked={!present && !!selected[product.id]} disabled={present || (!selected[product.id] && selection.length >= 100)} onCheckedChange={(checked) => setSelected((previous) => {
            const next = { ...previous }
            if (checked) next[product.id] = product
            else delete next[product.id]
            return next
          })} /><Label htmlFor={`pick-${product.id}`} className="sr-only">Выбрать {product.title}</Label></Table.Cell>}
          <Table.Cell><Text size="small" weight="plus">{product.title}</Text></Table.Cell>
          <Table.Cell>{product.categories.map((folder) => folder.name).join(", ") || "Без категории"}</Table.Cell>
          {!place && <Table.Cell>{family ? <Button size="small" variant="transparent" className="h-auto justify-start whitespace-normal px-0 text-left" aria-expanded={showMembers} aria-controls={showMembers ? membersId : undefined} onClick={() => setExpanded(showMembers ? undefined : product.id)}>
            {family.label} <Badge size="2xsmall">{family.members.length}</Badge>
          </Button> : <Text size="small" className="text-ui-fg-subtle">Без семейства</Text>}</Table.Cell>}
          <Table.Cell><Badge color={product.status === "published" ? "green" : "grey"}>{productStatus(product.status)}</Badge></Table.Cell>
          <Table.Cell><CanvasStatus present={present} /></Table.Cell>
          <Table.Cell className="whitespace-nowrap">{addedDate(product.created_at)}</Table.Cell>
          <Table.Cell><div className="flex gap-2">
            <Button size="small" variant="transparent" onClick={() => open(product.id)}>Открыть</Button>
            {place && !present && <Button size="small" variant="secondary" onClick={() => {
              place({ folders: [], products: [product] })
              setSelected(({ [product.id]: _, ...remaining }) => remaining)
            }}>На схему</Button>}
            {moveToTrash && <Button size="small" variant="transparent" onClick={() => moveToTrash({ kind: "product", id: product.id }, product.title)}>В корзину</Button>}
          </div></Table.Cell>
          </Table.Row>
          {family && showMembers && <Table.Row><td colSpan={7} className="bg-ui-bg-subtle px-6">
            <div id={membersId} className="space-y-2 py-2">
              <Text size="small" weight="plus">Товары семейства «{family.label}»</Text>
              <ul className="divide-y divide-ui-border-base">{family.members.map((member) => <li key={member.id} className="flex flex-wrap items-center gap-x-3 py-1">
                <Button size="small" variant="transparent" className="h-auto whitespace-normal px-0 text-left" onClick={() => open(member.id)}>{member.title}</Button>
                <Badge size="2xsmall" color={member.status === "published" ? "green" : "grey"}>{productStatus(member.status)}</Badge>
              </li>)}</ul>
            </div>
          </td></Table.Row>}
          </Fragment>
        })}</Table.Body>
      </Table>
    </div>
    {result && <TablePagination offset={offset} count={result.count} setOffset={setOffset} />}
  </>
}

export function VariantTable({ open }: { open: Props["openProduct"] }) {
  const [search, setSearch] = useState("")
  const q = useDeferredValue(search.trim())
  const [offset, setOffset] = useState(0)
  const sort = useTableSort("title", () => setOffset(0))
  const query = useQuery({
    queryKey: [...constructorKey, "variants", q, offset, sort.order],
    queryFn: ({ signal }) => sdk.client.fetch<VariantPage>(`${constructorPath}/variants`, { query: { q, offset, limit: pageSize, order: sort.order }, signal }),
  })
  return <>
    <div className="p-3"><Input aria-label="Найти вариант" placeholder="Название варианта или SKU" value={search} className="w-64" onChange={(event) => { setSearch(event.target.value); setOffset(0) }} /></div>
    {query.isPending && <Text role="status" className="p-4">Загрузка вариантов…</Text>}
    {query.isError && <div className="p-4"><Text role="alert">{query.error.message}</Text><Button variant="secondary" onClick={() => query.refetch()}>Повторить</Button></div>}
    <div className="overflow-auto"><Table><Table.Header><Table.Row>
      <SortHeader sort={sort} field="title" label="Вариант" /><SortHeader sort={sort} field="sku" label="SKU" />
      <Table.HeaderCell>Товар</Table.HeaderCell><Table.HeaderCell>Цена</Table.HeaderCell><Table.HeaderCell>Остаток</Table.HeaderCell>
      <SortHeader sort={sort} field="created_at" label="Дата добавления" descendingFirst /><Table.HeaderCell>Действия</Table.HeaderCell>
    </Table.Row></Table.Header>
      <Table.Body>{query.data?.variants.map((row) => <Table.Row key={row.id}><Table.Cell>{row.title}</Table.Cell><Table.Cell>{row.sku || "—"}</Table.Cell><Table.Cell>{row.product.title}</Table.Cell><Table.Cell>{priceLabel(row.price, query.data.currency)}</Table.Cell><Table.Cell>{stockLabel(row.stock)}</Table.Cell><Table.Cell className="whitespace-nowrap">{addedDate(row.created_at)}</Table.Cell><Table.Cell><Button size="small" variant="transparent" onClick={() => open(row.product.id, row.id)}>Открыть</Button></Table.Cell></Table.Row>)}</Table.Body></Table></div>
    {query.data && <TablePagination offset={offset} count={query.data.count} setOffset={setOffset} />}
  </>
}

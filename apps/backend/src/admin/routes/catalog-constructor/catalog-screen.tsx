import { Button, Container, FocusModal, Heading, Tabs, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { sdk } from "../../lib/sdk"
import { LEGACY_CATALOG_KEY, showLegacyCatalogAdmin } from "../../lib/catalog-admin-mode"
import type { CatalogDefinitionData } from "../../../lib/catalog-cms"
import { useCatalogCanvasPlacement } from "./catalog-canvas-cards"
import { CatalogGraph } from "./catalog-graph"
import { useCatalogTrash } from "./catalog-trash"
import { FolderTable, ProductTable, VariantTable } from "./catalog-picker"
import { DefinitionsTable, definitionKey, isVariationField } from "./catalog-fields"
import { FolderEditor } from "./folder-editor"
import { CatalogProfileEditor } from "../../components/catalog-profile-editor"
import { ProductEditor } from "./product-editor"
import { constructorKey, constructorPath, type Folder, type GraphData, type ProductCard } from "./types"

type Editor = { kind: "folder"; folder?: Folder } | { kind: "product"; id?: string; variant?: string }
const sectionTitles = { graph: "Конструктор каталога", products: "Товары", variants: "Варианты", folders: "Категории" }

function CatalogListSection({ data, section, openFolder, openProduct, moveToTrash }: {
  data: GraphData
  section: "products" | "folders"
  openFolder: (folder?: Folder) => void
  openProduct: (id?: string, variant?: string) => void
  moveToTrash: ReturnType<typeof useCatalogTrash>["moveToTrash"]
}) {
  const { placedCategoryIds, productMembership } = useCatalogCanvasPlacement(data)
  return <Container className="p-0">
    {section === "folders"
      ? <FolderTable data={data} open={openFolder} moveToTrash={moveToTrash} folderIds={placedCategoryIds} />
      : <ProductTable data={data} open={openProduct} moveToTrash={moveToTrash} membership={productMembership} />}
  </Container>
}

export function CatalogConstructorScreen({ section }: { section: keyof typeof sectionTitles }) {
  const { moveToTrash } = useCatalogTrash()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const requestedProduct = params.get("product")
  const locateProductId = section === "graph" ? params.get("locate-product") : null
  const focusFolder = section === "graph" ? params.get("locate-folder") ?? undefined : undefined
  const [editor, setEditor] = useState<Editor>()
  const [manageTypes, setManageTypes] = useState(false)
  const graph = useQuery({ queryKey: constructorKey, queryFn: () => sdk.client.fetch<GraphData>(constructorPath), staleTime: 15_000 })
  const definitions = useQuery({
    queryKey: definitionKey,
    queryFn: () => sdk.client.fetch<{ definitions: CatalogDefinitionData[] }>("/admin/catalog-cms/definitions"),
    staleTime: 30_000,
  })
  const focusProduct = useQuery({
    queryKey: [...constructorKey, "locate", locateProductId],
    queryFn: () => sdk.client.fetch<ProductCard>(`${constructorPath}/products/${locateProductId}`),
    enabled: !!locateProductId,
  })
  const close = () => {
    setEditor(undefined)
    if (requestedProduct) setParams({}, { replace: true })
  }
  const openFolder = (folder?: Folder) => setEditor({ kind: "folder", folder })
  const openProduct = (id?: string, variant?: string) => setEditor({ kind: "product", id, variant })
  const selected: Editor | undefined = editor ?? (requestedProduct ? { kind: "product", id: requestedProduct, variant: params.get("variant") ?? undefined } : undefined)
  const locate = (kind: "folder" | "product", id: string) => {
    setEditor(undefined)
    navigate(`/catalog-constructor?locate-${kind}=${encodeURIComponent(id)}`)
  }
  const clearFocus = () => setParams({}, { replace: true })
  const data = graph.data
  const fields = definitions.data?.definitions ?? []

  return <div className="flex min-w-0 flex-col gap-4">
    <Container className="min-w-0">
      <div className="flex flex-wrap justify-between gap-3">
        <div><Heading level="h1">{sectionTitles[section]}</Heading>{section === "graph" && <Text size="small" className="mt-1 text-ui-fg-subtle">Категории, товары и их связи на одной схеме.</Text>}</div>
        {section === "products" && <Button variant="secondary" size="small" onClick={() => setManageTypes(true)}>Типы товаров</Button>}
        {(section === "graph" || section === "folders" || section === "products") && <Button asChild variant="secondary" size="small"><Link to="/catalog-trash">Корзина</Link></Button>}
        {section === "graph" && <details className="self-start rounded border border-ui-border-base px-3 py-2">
          <summary className="cursor-pointer text-sm">Импорт и служебные разделы</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button asChild size="small" variant="secondary"><Link to="/insales-import">Импорт InSales</Link></Button>
            <Button asChild size="small" variant="secondary"><Link to="/products/import">Импорт Medusa</Link></Button>
            <Button asChild size="small" variant="secondary"><Link to="/products/export">Экспорт Medusa</Link></Button>
            {showLegacyCatalogAdmin() && <Button asChild size="small" variant="secondary"><Link to="/catalog-cms">Прежняя CMS</Link></Button>}
            <Button size="small" variant="transparent" onClick={() => {
              if (showLegacyCatalogAdmin()) localStorage.removeItem(LEGACY_CATALOG_KEY)
              else localStorage.setItem(LEGACY_CATALOG_KEY, "1")
              window.location.reload()
            }}>{showLegacyCatalogAdmin() ? "Скрыть прежние разделы" : "Показать прежние разделы"}</Button>
          </div>
        </details>}
      </div>
    </Container>
    {graph.isPending && <Container><Text role="status">Загрузка каталога…</Text></Container>}
    {graph.isError && <Container className="flex items-center gap-3"><Text role="alert">{graph.error.message}</Text><Button size="small" variant="secondary" onClick={() => graph.refetch()}>Повторить</Button></Container>}
    {locateProductId && focusProduct.isError && <Container><Text role="alert">{focusProduct.error.message}</Text><Button size="small" variant="secondary" onClick={clearFocus}>Закрыть</Button></Container>}
    {data && section === "graph" && <CatalogGraph data={data} openFolder={openFolder} openProduct={openProduct} moveToTrash={moveToTrash} focusFolder={focusFolder} focusProduct={locateProductId ? focusProduct.data : undefined} clearFocus={clearFocus} />}
    {data && (section === "products" || section === "folders") && <CatalogListSection data={data} section={section} openFolder={openFolder} openProduct={openProduct} moveToTrash={moveToTrash} />}
    {section === "variants" && <Tabs defaultValue="fields">
      <Tabs.List aria-label="Разделы вариантов">
        <Tabs.Trigger value="fields">Поля вариаций</Tabs.Trigger>
        <Tabs.Trigger value="combinations">Сочетания товаров</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="fields" className="mt-4 space-y-3">
        <Text size="small" className="text-ui-fg-subtle">Общая библиотека полей и допустимых значений для товаров.</Text>
        {definitions.isPending && <Container><Text role="status">Загрузка полей…</Text></Container>}
        {definitions.isError && <Container className="flex items-center gap-3"><Text role="alert">{definitions.error.message}</Text><Button size="small" variant="secondary" onClick={() => definitions.refetch()}>Повторить</Button></Container>}
        {definitions.data && <DefinitionsTable definitions={fields} variationField />}
      </Tabs.Content>
      <Tabs.Content value="combinations" className="mt-4 space-y-3">
        <Text size="small" className="text-ui-fg-subtle">Найдите позицию по названию или SKU и откройте её в карточке товара.</Text>
        {data && <Container className="p-0"><VariantTable open={openProduct} /></Container>}
      </Tabs.Content>
    </Tabs>}
    {selected && data && definitions.isError && <Container><Text role="alert">Справочник полей недоступен. {definitions.error.message}</Text><Button size="small" variant="secondary" onClick={() => definitions.refetch()}>Повторить</Button><Button size="small" variant="transparent" onClick={close}>Закрыть</Button></Container>}
    {selected?.kind === "folder" && data && definitions.data && <FolderEditor key={selected.folder?.id ?? "new"} folder={selected.folder} data={data} definitions={fields} close={close} locate={(id) => locate("folder", id)} />}
    {selected?.kind === "product" && data && definitions.data && <ProductEditor key={selected.id ?? "new"} id={selected.id} variant={selected.variant} data={data} definitions={fields} close={close} locate={(id) => locate("product", id)} />}
    {section === "products" && <FocusModal open={manageTypes} onOpenChange={setManageTypes}>
      <FocusModal.Content>
        <FocusModal.Header />
        <FocusModal.Body className="overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
            <FocusModal.Title>Типы товаров</FocusModal.Title>
            <FocusModal.Description>Создавайте типы и задавайте поля выбора для новых товаров.</FocusModal.Description>
            {definitions.isError ? <Button variant="secondary" onClick={() => definitions.refetch()}>Повторить загрузку полей</Button>
              : definitions.data ? <CatalogProfileEditor definitions={fields.filter(isVariationField)} typesOnly onSaved={() => setManageTypes(false)} /> : <Text role="status">Загрузка полей…</Text>}
          </div>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>}
  </div>
}

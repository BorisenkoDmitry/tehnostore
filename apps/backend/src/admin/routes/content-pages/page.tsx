import { defineRouteConfig } from "@medusajs/admin-sdk"
import { DocumentText } from "@medusajs/icons"
import { Badge, Button, Container, FocusModal, Heading, Input, Label, Select, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"
import { contentPreviewCountry } from "../../lib/content-preview-country"
import { addedDate, SortHeader, TablePagination, useTableSort } from "../../components/admin-table"
import { ContentTreeEditor } from "../../components/content-tree-editor"
import type { ContentBlock, ContentMetadata, ContentNode, ContentValue, PageSnapshot } from "../../../modules/content/types"

type Page = PageSnapshot & { created_at?: string; id: string; status: "draft" | "published"; published_at?: string; published_snapshot?: PageSnapshot }
type Draft = Omit<PageSnapshot, "revision"> & { id?: string; revision?: number }
const empty = (): Draft => ({ slug: "", title: "", body: [], blocks: [], metadata: { title: "", description: "", noindex: false } })
const node = (type: string): ContentNode => {
  if (type === "heading") return { type, level: 2, text: "" }
  if (type === "list") return { type, ordered: false, items: [""] }
  if (type === "table") return { type, headers: [""], rows: [[""]] }
  if (type === "image") return { type, url: "", alt: "" }
  if (type === "link") return { type, href: "", text: "" }
  if (type === "quote") return { type, text: "", author: "" }
  return { type: "paragraph", text: "" }
}

const Preview = ({ page }: { page: PageSnapshot }) => <article className="flex flex-col gap-4">
  <Heading level="h2">{page.title}</Heading>
  {page.body.map((item, index) => {
    if (item.type === "heading") return <Heading key={index} level={item.level === 2 ? "h2" : "h3"}>{item.text}</Heading>
    if (item.type === "paragraph") return <Text key={index} className="whitespace-pre-wrap">{item.text}</Text>
    if (item.type === "list") return item.ordered ? <ol key={index} className="list-decimal pl-6">{item.items.map((text, i) => <li key={i}>{text}</li>)}</ol> : <ul key={index} className="list-disc pl-6">{item.items.map((text, i) => <li key={i}>{text}</li>)}</ul>
    if (item.type === "table") return <Table key={index}><Table.Header><Table.Row>{item.headers.map((text, i) => <Table.HeaderCell key={i}>{text}</Table.HeaderCell>)}</Table.Row></Table.Header><Table.Body>{item.rows.map((row, i) => <Table.Row key={i}>{row.map((text, j) => <Table.Cell key={j}>{text}</Table.Cell>)}</Table.Row>)}</Table.Body></Table>
    if (item.type === "quote") return <blockquote key={index}>{item.text}{item.author && <cite>{item.author}</cite>}</blockquote>
    if (item.type === "image") return <figure key={index}><img src={item.url} alt={item.alt} className="max-h-80 max-w-full object-contain" /><figcaption>{item.alt}</figcaption></figure>
    return <Text key={index}>{item.text} ({item.href})</Text>
  })}
  {page.blocks.filter((block) => block.enabled).sort((a, b) => a.order - b.order).map((block) => <section key={block.id} className="rounded-lg border border-ui-border-base p-4"><Heading level="h3">{block.type}</Heading><ContentPreview value={block.data} /></section>)}
</article>

const ContentPreview = ({ value }: { value: ContentValue }) => {
  if (Array.isArray(value)) return <div className="flex flex-col gap-2">{value.map((item, index) => <ContentPreview key={index} value={item} />)}</div>
  if (value && typeof value === "object") return <div className="flex flex-col gap-2">{Object.entries(value).map(([key, item]) => <div key={key}><Text size="small" className="text-ui-fg-subtle">{key}</Text><ContentPreview value={item} /></div>)}</div>
  return <Text className="whitespace-pre-wrap">{String(value ?? "")}</Text>
}

const ContentPages = () => {
  const client = useQueryClient()
  const prompt = usePrompt()
  const [offset, setOffset] = useState(0)
  const sort = useTableSort("-created_at", () => setOffset(0))
  const [draft, setDraft] = useState<Draft | null>(null)
  const [preview, setPreview] = useState<PageSnapshot | null>(null)
  const [previewToken, setPreviewToken] = useState("")
  const storefrontUrl = import.meta.env.VITE_STOREFRONT_URL || (import.meta.env.DEV ? "http://localhost:8000" : "")
  const { data: catalogProfile } = useQuery({ queryKey: ["catalog-cms-profile"], queryFn: () => sdk.client.fetch<{ profile: { region_id: string } | null; regions: { id: string; countries?: { iso_2: string }[] }[] }>("/admin/catalog-cms/profile") })
  const previewCountry = contentPreviewCountry(catalogProfile)
  const [nodeType, setNodeType] = useState("paragraph")
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["content-pages", offset, sort.order], queryFn: ({ signal }) => sdk.client.fetch<{ pages: Page[]; count: number }>("/admin/content/pages", { query: { limit: 30, offset, order: sort.order }, signal }) })
  const save = useMutation({
    mutationFn: async ({ publish }: { publish: boolean }) => {
      if (!draft) return
      const { id, revision, ...body } = draft
      const { page } = await sdk.client.fetch<{ page: Page }>(id ? `/admin/content/pages/${id}` : "/admin/content/pages", { method: "POST", body: { ...body, expected_revision: revision } })
      if (publish) await sdk.client.fetch(`/admin/content/pages/${page.id}/publish`, { method: "POST" })
      return page
    },
    onSuccess: async (page, variables) => { await client.invalidateQueries({ queryKey: ["content-pages"] }); setDraft(null); toast.success(variables.publish ? "Страница опубликована" : "Черновик сохранён", { description: page?.slug ? `/page/${page.slug}` : undefined }) },
    onError: (error: Error) => toast.error("Не удалось сохранить", { description: error.message }),
  })
  const action = useMutation({
    mutationFn: ({ page, operation }: { page: Page; operation: "delete" | "publish" | "unpublish" }) => sdk.client.fetch(`/admin/content/pages/${page.id}${operation === "delete" ? "" : `/${operation}`}`, { method: operation === "delete" ? "DELETE" : "POST" }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["content-pages"] }); toast.success("Изменения сохранены") }, onError: (error: Error) => toast.error(error.message),
  })
  return <div className="flex flex-col gap-6"><Container>
    <div className="mb-5 flex items-center justify-between gap-4"><div><Heading level="h1">Страницы и блоки</Heading><Text size="small" className="text-ui-fg-subtle">Сохранение черновика не меняет опубликованную страницу. Публикация применяет весь документ.</Text></div><Button size="small" onClick={() => setDraft(empty())}>Создать страницу</Button></div>
    {isLoading ? <Text role="status">Загрузка…</Text> : error ? <div><Text role="alert">Не удалось загрузить страницы.</Text><Button onClick={() => refetch()}>Повторить</Button></div> : <Table><Table.Header><Table.Row><SortHeader sort={sort} field="title" label="Страница" /><SortHeader sort={sort} field="slug" label="Адрес" /><SortHeader sort={sort} field="status" label="Статус" /><SortHeader sort={sort} field="created_at" label="Дата добавления" descendingFirst /><Table.HeaderCell>Действия</Table.HeaderCell></Table.Row></Table.Header><Table.Body>{data?.pages.map((page) => <Table.Row key={page.id}><Table.Cell>{page.title}</Table.Cell><Table.Cell>/page/{page.slug}</Table.Cell><Table.Cell><Badge color={page.status === "published" ? "green" : "grey"}>{page.status === "published" ? `Опубликовано · v${page.published_snapshot?.revision ?? page.revision}` : "Черновик"}</Badge>{page.published_snapshot && page.published_snapshot.revision !== page.revision && <Text size="xsmall">Есть неопубликованные изменения</Text>}</Table.Cell><Table.Cell className="whitespace-nowrap">{addedDate(page.created_at)}</Table.Cell><Table.Cell><div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="small" onClick={() => setDraft({ id: page.id, slug: page.slug, title: page.title, body: page.body, blocks: page.blocks, metadata: { title: "", description: "", noindex: false, ...page.metadata }, revision: page.revision })}>Изменить</Button>
      <Button variant="transparent" size="small" onClick={async () => { try { const { page: preview, token } = await sdk.client.fetch<{ page: PageSnapshot; token: string }> (`/admin/content/pages/${page.id}/preview`); setPreview(preview); setPreviewToken(token) } catch (error) { toast.error((error as Error).message) } }}>Предпросмотр</Button>
      <Button variant="transparent" size="small" disabled={action.isPending} onClick={() => action.mutate({ page, operation: page.status === "published" ? "unpublish" : "publish" })}>{page.status === "published" ? "Снять с публикации" : "Опубликовать"}</Button>
      <Button variant="transparent" size="small" disabled={action.isPending} onClick={async () => { if (await prompt({ title: `Удалить «${page.title}»?`, description: "Страница перестанет открываться на витрине. Ссылки в меню нужно обновить отдельно.", confirmText: "Удалить", cancelText: "Отмена" })) action.mutate({ page, operation: "delete" }) }}>Удалить</Button>
    </div></Table.Cell></Table.Row>)}</Table.Body></Table>}
    {!isLoading && !data?.count && <Text className="py-6">Страниц пока нет.</Text>}
    {data && <TablePagination offset={offset} count={data.count} size={30} setOffset={setOffset} />}
  </Container>
  <FocusModal open={!!draft} onOpenChange={(open) => { if (!open && !save.isPending) setDraft(null) }}><FocusModal.Content><FocusModal.Header><div className="flex gap-2"><Button variant="secondary" type="button" disabled={save.isPending} onClick={() => setDraft(null)}>Отмена</Button><Button variant="secondary" type="button" isLoading={save.isPending} onClick={() => save.mutate({ publish: false })}>Сохранить черновик</Button><Button type="button" isLoading={save.isPending} onClick={() => save.mutate({ publish: true })}>Сохранить и опубликовать</Button></div></FocusModal.Header><FocusModal.Body className="overflow-auto"><div className="mx-auto flex max-w-3xl flex-col gap-6 px-8 py-10"><FocusModal.Title>{draft?.id ? "Редактирование страницы" : "Новая страница"}</FocusModal.Title><FocusModal.Description>Текст, медиа, порядок блоков и SEO. Контент проходит серверную проверку перед сохранением.</FocusModal.Description>{draft && <>
    <div className="flex flex-col gap-2"><Label htmlFor="content-title">Название</Label><Input id="content-title" value={draft.title} required maxLength={300} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></div>
    <div className="flex flex-col gap-2"><Label htmlFor="content-slug">Адрес страницы</Label><Input id="content-slug" value={draft.slug} required placeholder="about-us" onChange={(event) => setDraft({ ...draft, slug: event.target.value })} /><Text size="small" className="text-ui-fg-subtle">Латинские буквы, цифры и дефисы. После публикации адрес постоянный.</Text></div>
    <div className="rounded-lg border border-ui-border-base p-5"><Heading level="h2" className="mb-4">Содержимое</Heading>{draft.body.map((item, index) => <div key={index} className="mb-4 rounded-lg border border-ui-border-base p-4"><div className="mb-3 flex items-center justify-between"><Text weight="plus" size="small">{index + 1}. {item.type}</Text><div className="flex gap-1"><Button type="button" size="small" variant="transparent" disabled={index === 0} onClick={() => { const body = [...draft.body]; [body[index - 1], body[index]] = [body[index], body[index - 1]]; setDraft({ ...draft, body }) }}>Выше</Button><Button type="button" size="small" variant="transparent" disabled={index === draft.body.length - 1} onClick={() => { const body = [...draft.body]; [body[index + 1], body[index]] = [body[index], body[index + 1]]; setDraft({ ...draft, body }) }}>Ниже</Button><Button type="button" variant="transparent" size="small" onClick={() => setDraft({ ...draft, body: draft.body.filter((_, i) => i !== index) })}>Удалить</Button></div></div><ContentTreeEditor value={Object.fromEntries(Object.entries(item).filter(([key]) => key !== "type")) as ContentValue} name={item.type === "image" ? "image-node" : "node"} path={`body.${index}`} onChange={(value) => setDraft({ ...draft, body: draft.body.map((entry, i) => i === index ? { type: item.type, ...value as object } as ContentNode : entry) })} /></div>)}<div className="flex gap-3"><Select value={nodeType} onValueChange={setNodeType}><Select.Trigger className="w-56" aria-label="Тип содержимого"><Select.Value /></Select.Trigger><Select.Content>{[["paragraph", "Абзац"], ["heading", "Заголовок"], ["list", "Список"], ["table", "Таблица"], ["image", "Изображение"], ["quote", "Цитата"], ["link", "Ссылка"]].map(([key, label]) => <Select.Item key={key} value={key}>{label}</Select.Item>)}</Select.Content></Select><Button variant="secondary" type="button" onClick={() => setDraft({ ...draft, body: [...draft.body, node(nodeType)] })}>Добавить</Button></div></div>
    <div className="rounded-lg border border-ui-border-base p-5"><Heading level="h2" className="mb-4">Блоки страницы</Heading><ContentTreeEditor value={draft.blocks as unknown as ContentValue} name="blocks" path="blocks" onChange={(blocks) => setDraft({ ...draft, blocks: blocks as unknown as ContentBlock[] })} /><Button className="mt-3" variant="secondary" type="button" onClick={() => setDraft({ ...draft, blocks: [...draft.blocks, { id: crypto.randomUUID(), type: "text", enabled: true, order: draft.blocks.length, data: { title: "", text: "" } }] })}>Добавить текстовый блок</Button></div>
    <div className="rounded-lg border border-ui-border-base p-5"><Heading level="h2" className="mb-4">SEO</Heading><ContentTreeEditor value={draft.metadata as ContentValue} name="metadata" path="metadata" onChange={(metadata) => setDraft({ ...draft, metadata: metadata as ContentMetadata })} /></div>
  </>}</div></FocusModal.Body></FocusModal.Content></FocusModal>
  <FocusModal open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null) }}><FocusModal.Content><FocusModal.Header><div className="flex gap-2">{preview && previewToken && storefrontUrl && previewCountry && <Button variant="secondary" asChild><a href={`${storefrontUrl}/${previewCountry}/page/${preview.slug}?preview=${encodeURIComponent(previewToken)}`} target="_blank" rel="noreferrer">Открыть на витрине</a></Button>}<Button onClick={() => setPreview(null)}>Закрыть</Button></div></FocusModal.Header><FocusModal.Body className="overflow-auto"><div className="mx-auto max-w-3xl px-8 py-10"><FocusModal.Title>Предпросмотр черновика</FocusModal.Title><FocusModal.Description className="mb-8">Сохранённое содержимое. Для блоков показана структура данных; композиция витрины сохраняется в её шаблоне.</FocusModal.Description>{preview && <Preview page={preview} />}</div></FocusModal.Body></FocusModal.Content></FocusModal>
  </div>
}

export const config = defineRouteConfig({ label: "Страницы", icon: DocumentText })
export default ContentPages

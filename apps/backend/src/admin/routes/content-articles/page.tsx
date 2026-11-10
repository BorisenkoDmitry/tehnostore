import { defineRouteConfig } from "@medusajs/admin-sdk"
import { DocumentText } from "@medusajs/icons"
import { Badge, Button, Container, Drawer, FocusModal, Heading, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"
import { sdk } from "../../lib/sdk"
import { addedDate, SortHeader, TablePagination, useTableSort } from "../../components/admin-table"
import { ArticleForm } from "../../components/article-form"
import { ArticlePageSettings } from "../../components/article-page-settings"
import { emptyArticle, type Article } from "../../lib/article-types"

const EditorFrame = ({ id, busy, canSave, close, children }: { id?: string; busy: boolean; canSave: boolean; close: () => void; children: ReactNode }) => {
  const actions = <><Button size="small" variant="secondary" disabled={busy} onClick={close}>Отмена</Button><Button size="small" type="submit" form="article-form" isLoading={busy} disabled={busy || !canSave}>Сохранить черновик</Button></>
  const description = "Статья сохраняется в админке. Публикация на витрине пока недоступна."
  return id ? <Drawer open onOpenChange={(open) => { if (!open && !busy) close() }}><Drawer.Content className="w-full sm:max-w-3xl"><Drawer.Header><Drawer.Title>Редактирование статьи</Drawer.Title></Drawer.Header><Drawer.Body className="overflow-y-auto"><Drawer.Description className="mb-6">{description}</Drawer.Description>{children}</Drawer.Body><Drawer.Footer>{actions}</Drawer.Footer></Drawer.Content></Drawer>
    : <FocusModal open onOpenChange={(open) => { if (!open && !busy) close() }}><FocusModal.Content><FocusModal.Header><div className="flex gap-2">{actions}</div></FocusModal.Header><FocusModal.Body className="overflow-y-auto"><div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8"><div><FocusModal.Title>Новая статья</FocusModal.Title><FocusModal.Description className="mt-2">{description}</FocusModal.Description></div>{children}</div></FocusModal.Body></FocusModal.Content></FocusModal>
}

const ArticleEditor = ({ id, close }: { id?: string; close: () => void }) => {
  const [busy, setBusy] = useState(false)
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["content-article", id], queryFn: ({ signal }) => sdk.client.fetch<{ article: Article }>(`/admin/content/articles/${id}`, { signal }), enabled: !!id, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false })
  return <EditorFrame id={id} busy={busy} canSave={!id || (!!data && !error)} close={close}>{id && isLoading ? <Text role="status">Загрузка статьи…</Text> : id && error ? <div><Text role="alert">Не удалось загрузить статью.</Text><Button size="small" variant="secondary" onClick={() => refetch()}>Повторить</Button></div> : <ArticleForm initial={id ? data!.article : emptyArticle()} onBusy={setBusy} onSaved={close} />}</EditorFrame>
}

const ContentArticles = () => {
  const client = useQueryClient()
  const prompt = usePrompt()
  const [offset, setOffset] = useState(0)
  const sort = useTableSort("-created_at", () => setOffset(0))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editor, setEditor] = useState<{ id?: string } | null>(null)
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["content-articles", offset, sort.order], queryFn: ({ signal }) => sdk.client.fetch<{ articles: Article[]; count: number }>("/admin/content/articles", { query: { limit: 30, offset, order: sort.order }, signal }) })
  const remove = useMutation({
    mutationFn: (article: Article) => sdk.client.fetch(`/admin/content/articles/${article.id}`, { method: "DELETE", query: { expected_revision: article.revision } }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["content-articles"] }); toast.success("Статья удалена") },
    onError: (error: Error) => toast.error("Не удалось удалить статью", { description: error.message }),
  })
  return <Container className="p-0">
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4"><div><Heading level="h1">Статьи</Heading><Text size="small" className="text-ui-fg-subtle">Материалы и черновики статей. Сохранённые статьи пока доступны только в админке.</Text></div><div className="flex flex-wrap gap-2"><Button size="small" variant="secondary" onClick={() => setSettingsOpen(true)}>Настройки страницы</Button><Button size="small" onClick={() => setEditor({})}>Добавить статью</Button></div></div>
    {isLoading ? <Text role="status" className="px-6 py-4">Загрузка статей…</Text> : error ? <div className="px-6 py-4"><Text role="alert">Не удалось загрузить статьи.</Text><Button size="small" variant="secondary" onClick={() => refetch()}>Повторить</Button></div> : !data?.count ? <div className="border-t border-ui-border-base px-6 py-10"><Heading level="h2">Статей пока нет</Heading><Text size="small" className="text-ui-fg-subtle">Нажмите «Добавить статью», чтобы создать первый материал.</Text></div> : <div className="overflow-x-auto"><Table><Table.Header><Table.Row><SortHeader sort={sort} field="title" label="Заголовок" /><SortHeader sort={sort} field="slug" label="Адрес" /><Table.HeaderCell>Статус</Table.HeaderCell><SortHeader sort={sort} field="updated_at" label="Изменено" descendingFirst /><Table.HeaderCell>Действия</Table.HeaderCell></Table.Row></Table.Header><Table.Body>{data.articles.map((article) => <Table.Row key={article.id}><Table.Cell className="max-w-80"><div className="flex items-center gap-3">{article.cover_image && <img src={article.cover_image} alt="" className="h-12 w-16 shrink-0 rounded object-cover" />}<div className="min-w-0"><Text size="small" weight="plus" className="break-words">{article.title}</Text>{article.excerpt && <Text size="xsmall" className="line-clamp-2 break-words text-ui-fg-subtle">{article.excerpt}</Text>}</div></div></Table.Cell><Table.Cell className="max-w-60 break-all">{article.slug}</Table.Cell><Table.Cell><Badge color="grey">Черновик</Badge></Table.Cell><Table.Cell className="whitespace-nowrap">{addedDate(article.updated_at)}</Table.Cell><Table.Cell><div className="flex gap-2"><Button size="small" variant="secondary" disabled={remove.isPending} onClick={() => setEditor({ id: article.id })}>Изменить</Button><Button size="small" variant="transparent" disabled={remove.isPending} onClick={async () => { if (await prompt({ title: `Удалить «${article.title}»?`, description: "Статья будет удалена из списка материалов.", confirmText: "Удалить", cancelText: "Отмена" })) remove.mutate(article) }}>Удалить</Button></div></Table.Cell></Table.Row>)}</Table.Body></Table></div>}
    {data && !error && <TablePagination offset={offset} count={data.count} size={30} setOffset={setOffset} />}
    {settingsOpen && <ArticlePageSettings close={() => setSettingsOpen(false)} />}
    {editor && <ArticleEditor key={editor.id ?? "new"} id={editor.id} close={() => setEditor(null)} />}
  </Container>
}

export const config = defineRouteConfig({ label: "Статьи", icon: DocumentText })
export default ContentArticles

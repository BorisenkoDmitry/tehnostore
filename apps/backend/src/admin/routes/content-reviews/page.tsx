import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight } from "@medusajs/icons"
import { Badge, Button, Container, Drawer, Heading, Input, Label, Select, Table, Text, Textarea, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"
import { addedDate, SortHeader, TablePagination, useTableSort } from "../../components/admin-table"
import { ContentTreeEditor } from "../../components/content-tree-editor"
import type { ContentValue } from "../../../modules/content/types"

type Review = { created_at?: string; id?: string; kind: "shop" | "product"; product_id: string | null; author: string; rating: number; body: string; media: string[]; review_date: string; status: "pending" | "published" | "rejected"; position: number }
const statuses = { pending: "На модерации", published: "Опубликован", rejected: "Отклонён" }
const empty = (): Review => ({ kind: "shop", product_id: null, author: "", rating: 5, body: "", media: [], review_date: new Date().toISOString().slice(0, 10), status: "pending", position: 0 })
const ContentReviews = () => {
  const client = useQueryClient()
  const prompt = usePrompt()
  const [offset, setOffset] = useState(0)
  const sort = useTableSort("-created_at", () => setOffset(0))
  const [draft, setDraft] = useState<Review | null>(null)
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["content-reviews", offset, sort.order], queryFn: ({ signal }) => sdk.client.fetch<{ reviews: Review[]; count: number }>("/admin/content/reviews", { query: { limit: 30, offset, order: sort.order }, signal }) })
  const save = useMutation({
    mutationFn: ({ id, kind, product_id, author, rating, body, media, review_date, status, position }: Review) => sdk.client.fetch(id ? `/admin/content/reviews/${id}` : "/admin/content/reviews", { method: "POST", body: { kind, product_id, author, rating, body, media, review_date, status, position } }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["content-reviews"] }); setDraft(null); toast.success("Отзыв сохранён") }, onError: (error: Error) => toast.error("Не удалось сохранить отзыв", { description: error.message }),
  })
  const remove = useMutation({ mutationFn: (id: string) => sdk.client.fetch(`/admin/content/reviews/${id}`, { method: "DELETE" }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["content-reviews"] }); toast.success("Отзыв удалён") }, onError: (error: Error) => toast.error(error.message) })
  return <Container><div className="mb-6 flex items-start justify-between gap-4"><div><Heading level="h1">Отзывы</Heading><Text size="small" className="text-ui-fg-subtle">Отзывы магазина и товаров. На витрине видны только опубликованные записи.</Text></div><Button size="small" onClick={() => setDraft(empty())}>Добавить отзыв</Button></div>
    {isLoading ? <Text role="status">Загрузка…</Text> : error ? <div><Text role="alert">Не удалось загрузить отзывы.</Text><Button onClick={() => refetch()}>Повторить</Button></div> : <Table><Table.Header><Table.Row><SortHeader sort={sort} field="author" label="Автор" /><SortHeader sort={sort} field="review_date" label="Дата отзыва" descendingFirst /><SortHeader sort={sort} field="rating" label="Оценка" /><SortHeader sort={sort} field="body" label="Текст" /><SortHeader sort={sort} field="status" label="Статус" /><SortHeader sort={sort} field="created_at" label="Дата добавления" descendingFirst /><Table.HeaderCell>Действия</Table.HeaderCell></Table.Row></Table.Header><Table.Body>{data?.reviews.map((review) => <Table.Row key={review.id}><Table.Cell>{review.author}<Text size="small" className="text-ui-fg-subtle">{review.kind === "shop" ? "Магазин" : "Товар"}</Text></Table.Cell><Table.Cell className="whitespace-nowrap">{review.review_date}</Table.Cell><Table.Cell>{review.rating} / 5</Table.Cell><Table.Cell><Text size="small" className="max-w-md truncate">{review.body}</Text></Table.Cell><Table.Cell><Badge color={review.status === "published" ? "green" : review.status === "rejected" ? "red" : "grey"}>{statuses[review.status]}</Badge></Table.Cell><Table.Cell className="whitespace-nowrap">{addedDate(review.created_at)}</Table.Cell><Table.Cell><div className="flex flex-wrap gap-2"><Button size="small" variant="secondary" onClick={() => setDraft({ ...review })}>Изменить</Button>{review.status !== "published" && <Button size="small" variant="transparent" disabled={save.isPending} onClick={() => save.mutate({ ...review, status: "published" })}>Опубликовать</Button>}<Button size="small" variant="transparent" disabled={remove.isPending} onClick={async () => { if (await prompt({ title: "Удалить отзыв?", description: "Он перестанет показываться на витрине.", confirmText: "Удалить", cancelText: "Отмена" })) remove.mutate(review.id!) }}>Удалить</Button></div></Table.Cell></Table.Row>)}</Table.Body></Table>}
    {!isLoading && !data?.count && <Text className="py-6">Отзывов пока нет.</Text>}{data && <TablePagination offset={offset} count={data.count} size={30} setOffset={setOffset} />}
    <Drawer open={!!draft} onOpenChange={(open) => { if (!open && !save.isPending) setDraft(null) }}><Drawer.Content><Drawer.Header><Drawer.Title>{draft?.id ? "Редактирование отзыва" : "Новый отзыв"}</Drawer.Title><Drawer.Description>Укажите автора, оценку и подтверждённое содержимое. Публикация не создаёт фиктивных покупок.</Drawer.Description></Drawer.Header>{draft && <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); save.mutate(draft) }}><Drawer.Body className="flex flex-col gap-5 overflow-auto">
      <div><Label htmlFor="review-kind">Тип</Label><Select value={draft.kind} onValueChange={(kind) => setDraft({ ...draft, kind: kind as Review["kind"], product_id: null })}><Select.Trigger id="review-kind"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="shop">Магазин</Select.Item><Select.Item value="product">Товар</Select.Item></Select.Content></Select></div>
      {draft.kind === "product" && <div><Label>Товар</Label><ContentTreeEditor name="product_id" value={draft.product_id ?? ""} onChange={(value) => setDraft({ ...draft, product_id: String(value) || null })} /></div>}
      <div><Label htmlFor="review-author">Автор</Label><Input id="review-author" required maxLength={200} value={draft.author} onChange={(event) => setDraft({ ...draft, author: event.target.value })} /></div>
      <div><Label htmlFor="review-date">Дата</Label><Input id="review-date" type="date" required value={draft.review_date} onChange={(event) => setDraft({ ...draft, review_date: event.target.value })} /></div>
      <div><Label htmlFor="review-rating">Оценка от 1 до 5</Label><Input id="review-rating" type="number" min={1} max={5} required value={draft.rating} onChange={(event) => setDraft({ ...draft, rating: Number(event.target.value) })} /></div>
      <div><Label htmlFor="review-body">Текст</Label><Textarea id="review-body" rows={7} required value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} /></div>
      <div><Label>Фотографии</Label><ContentTreeEditor name="images" value={draft.media as ContentValue} onChange={(value) => setDraft({ ...draft, media: value as string[] })} /></div>
      <div><Label htmlFor="review-status">Статус</Label><Select value={draft.status} onValueChange={(status) => setDraft({ ...draft, status: status as Review["status"] })}><Select.Trigger id="review-status"><Select.Value /></Select.Trigger><Select.Content>{Object.entries(statuses).map(([key, label]) => <Select.Item key={key} value={key}>{label}</Select.Item>)}</Select.Content></Select></div>
      <div><Label htmlFor="review-position">Порядок</Label><Input id="review-position" type="number" min={0} required value={draft.position} onChange={(event) => setDraft({ ...draft, position: Number(event.target.value) })} /></div>
    </Drawer.Body><Drawer.Footer><Button type="button" variant="secondary" disabled={save.isPending} onClick={() => setDraft(null)}>Отмена</Button><Button type="submit" isLoading={save.isPending}>Сохранить</Button></Drawer.Footer></form>}</Drawer.Content></Drawer>
  </Container>
}
export const config = defineRouteConfig({ label: "Отзывы", icon: ChatBubbleLeftRight })
export default ContentReviews

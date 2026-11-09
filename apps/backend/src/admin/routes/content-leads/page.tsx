import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Envelope } from "@medusajs/icons"
import { Badge, Button, Container, Drawer, Heading, Input, Label, Select, Table, Text, Textarea, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { sdk } from "../../lib/sdk"
import { SortHeader, TablePagination, useTableSort } from "../../components/admin-table"

type Lead = { id: string; name: string; email: string; phone: string | null; message: string; status: "new" | "in_progress" | "closed"; notes: string; created_at: string; consent: boolean; source: string; type: "contact"; product_id: string | null; order_id: string | null }
const statuses = { new: "Новое", in_progress: "В работе", closed: "Закрыто" }
const ContentLeads = () => {
  const client = useQueryClient()
  const prompt = usePrompt()
  const [offset, setOffset] = useState(0)
  const sort = useTableSort("-created_at", () => setOffset(0))
  const [draft, setDraft] = useState<Lead | null>(null)
  const [search, setSearch] = useState("")
  const [q, setQ] = useState("")
  const [status, setStatus] = useState("all")
  const [type, setType] = useState("all")
  const [source, setSource] = useState("all")
  useEffect(() => { const timer = setTimeout(() => { setQ(search.trim()); setOffset(0) }, 300); return () => clearTimeout(timer) }, [search])
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["content-leads", offset, sort.order, q, status, type, source], queryFn: ({ signal }) => sdk.client.fetch<{ leads: Lead[]; count: number }>("/admin/content/leads", { query: { limit: 30, offset, order: sort.order, ...(q ? { q } : {}), ...(status !== "all" ? { status } : {}), ...(type !== "all" ? { type } : {}), ...(source !== "all" ? { source } : {}) }, signal }) })
  const save = useMutation({ mutationFn: (lead: Lead) => sdk.client.fetch(`/admin/content/leads/${lead.id}`, { method: "POST", body: { status: lead.status, notes: lead.notes } }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["content-leads"] }); setDraft(null); toast.success("Обращение обновлено") }, onError: (error: Error) => toast.error(error.message) })
  const remove = useMutation({ mutationFn: (id: string) => sdk.client.fetch(`/admin/content/leads/${id}`, { method: "DELETE" }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["content-leads"] }); setDraft(null); toast.success("Обращение удалено") }, onError: (error: Error) => toast.error(error.message) })
  return <Container><Heading level="h1">Обращения</Heading><Text size="small" className="mb-6 text-ui-fg-subtle">Сообщения контактной формы сохраняются здесь. Автоматическая отправка писем не подключена.</Text>
    <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><div><Label htmlFor="lead-search">Поиск</Label><Input id="lead-search" placeholder="Имя, email, телефон или текст" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={200} /></div>
      <div><Label htmlFor="lead-filter-status">Статус</Label><Select value={status} onValueChange={(value) => { setStatus(value); setOffset(0) }}><Select.Trigger id="lead-filter-status"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="all">Все статусы</Select.Item>{Object.entries(statuses).map(([key, label]) => <Select.Item key={key} value={key}>{label}</Select.Item>)}</Select.Content></Select></div>
      <div><Label htmlFor="lead-filter-type">Тип</Label><Select value={type} onValueChange={(value) => { setType(value); setOffset(0) }}><Select.Trigger id="lead-filter-type"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="all">Все типы</Select.Item><Select.Item value="contact">Обращение</Select.Item></Select.Content></Select></div>
      <div><Label htmlFor="lead-filter-source">Источник</Label><Select value={source} onValueChange={(value) => { setSource(value); setOffset(0) }}><Select.Trigger id="lead-filter-source"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="all">Все источники</Select.Item><Select.Item value="contacts">Страница контактов</Select.Item></Select.Content></Select></div>
    </div>
    {isLoading ? <Text role="status">Загрузка…</Text> : error ? <div><Text role="alert">Не удалось загрузить обращения.</Text><Button onClick={() => refetch()}>Повторить</Button></div> : <Table><Table.Header><Table.Row><SortHeader sort={sort} field="created_at" label="Дата" descendingFirst /><SortHeader sort={sort} field="source" label="Тип / источник" /><SortHeader sort={sort} field="name" label="Контакт" /><SortHeader sort={sort} field="message" label="Обращение" /><SortHeader sort={sort} field="status" label="Статус" /><Table.HeaderCell>Действия</Table.HeaderCell></Table.Row></Table.Header><Table.Body>{data?.leads.map((lead) => <Table.Row key={lead.id}><Table.Cell>{new Date(lead.created_at).toLocaleString("ru-RU")}</Table.Cell><Table.Cell><Text size="small">Обращение</Text><Text size="small" className="text-ui-fg-subtle">{lead.source === "contacts" ? "Страница контактов" : lead.source}</Text></Table.Cell><Table.Cell>{lead.name}<Text size="small" className="text-ui-fg-subtle">{lead.email}</Text></Table.Cell><Table.Cell><Text size="small" className="max-w-sm truncate">{lead.message}</Text></Table.Cell><Table.Cell><Badge color={lead.status === "closed" ? "green" : "grey"}>{statuses[lead.status]}</Badge></Table.Cell><Table.Cell><Button size="small" variant="secondary" onClick={() => setDraft({ ...lead })}>Открыть</Button></Table.Cell></Table.Row>)}</Table.Body></Table>}
    {!isLoading && !data?.count && <Text className="py-6">{q || status !== "all" || type !== "all" || source !== "all" ? "По заданным условиям обращений нет." : "Новых обращений пока нет."}</Text>}{data && <TablePagination offset={offset} count={data.count} size={30} setOffset={setOffset} />}
    <Drawer open={!!draft} onOpenChange={(open) => { if (!open && !save.isPending) setDraft(null) }}><Drawer.Content><Drawer.Header><Drawer.Title>Обращение покупателя</Drawer.Title><Drawer.Description>Контактные данные доступны только авторизованным сотрудникам.</Drawer.Description></Drawer.Header>{draft && <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); save.mutate(draft) }}><Drawer.Body className="flex flex-col gap-5 overflow-auto">
      <div><Text size="small" className="mb-2 text-ui-fg-subtle">Обращение · {draft.source === "contacts" ? "Страница контактов" : draft.source}</Text><Text weight="plus">{draft.name}</Text><Text>{draft.email}</Text>{draft.phone && <Text>{draft.phone}</Text>}<Text size="small" className="text-ui-fg-subtle">{new Date(draft.created_at).toLocaleString("ru-RU")} · согласие {draft.consent ? "получено" : "не получено"}</Text></div>
      <Text className="whitespace-pre-wrap">{draft.message}</Text>{(draft.product_id || draft.order_id) && <div>{draft.product_id && <a className="text-ui-fg-interactive" href={`/app/products/${encodeURIComponent(draft.product_id)}`}>Открыть товар</a>}{draft.order_id && <a className="ml-3 text-ui-fg-interactive" href={`/app/orders/${encodeURIComponent(draft.order_id)}`}>Открыть заказ</a>}</div>}<div><Label htmlFor="lead-status">Статус</Label><Select value={draft.status} onValueChange={(status) => setDraft({ ...draft, status: status as Lead["status"] })}><Select.Trigger id="lead-status"><Select.Value /></Select.Trigger><Select.Content>{Object.entries(statuses).map(([key, label]) => <Select.Item key={key} value={key}>{label}</Select.Item>)}</Select.Content></Select></div>
      <div><Label htmlFor="lead-notes">Внутренние заметки</Label><Textarea id="lead-notes" rows={5} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></div>
      <Button type="button" variant="danger" disabled={remove.isPending} onClick={async () => { if (await prompt({ title: "Удалить обращение?", description: "Обращение исчезнет из рабочего списка.", confirmText: "Удалить", cancelText: "Отмена" })) remove.mutate(draft.id) }}>Удалить обращение</Button>
    </Drawer.Body><Drawer.Footer><Button type="button" variant="secondary" onClick={() => setDraft(null)}>Закрыть</Button><Button type="submit" isLoading={save.isPending}>Сохранить</Button></Drawer.Footer></form>}</Drawer.Content></Drawer>
  </Container>
}
export const config = defineRouteConfig({ label: "Заявки с сайта", icon: Envelope })
export default ContentLeads

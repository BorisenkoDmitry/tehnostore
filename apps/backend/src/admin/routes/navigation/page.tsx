import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BarsThree, ArrowDown, PencilSquare, Plus, Trash } from "@medusajs/icons"
import { Badge, Button, Container, Drawer, FocusModal, Heading, IconButton, Input, Label, Select, Switch, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FormEvent, useState } from "react"
import { sdk } from "../../lib/sdk"
import { CatalogTreeEditor } from "../../components/catalog-tree-editor"
import { SortHeader, sortTableRows, tableOffset, TablePagination, useTableSort } from "../../components/admin-table"
import type { CatalogNode } from "../../../modules/navigation/types"
import { Link } from "react-router-dom"
import { showLegacyCatalogAdmin } from "../../lib/catalog-admin-mode"

type MenuItem = { id: string; label: string; href: string; kind: "link" | "catalog"; visible: boolean; children?: CatalogNode[] }
type Navigation = { items: MenuItem[]; phone: string; telegram_url: string; updated_at?: string }
type Response = { navigation: Navigation | null }

const NavigationPage = () => {
  const client = useQueryClient()
  const prompt = usePrompt()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["texno-navigation"],
    queryFn: () => sdk.client.fetch<Response>("/admin/navigation"),
  })
  const [editing, setEditing] = useState<MenuItem | null>(null)
  const [creating, setCreating] = useState(false)
  const [offset, setOffset] = useState(0)
  const sort = useTableSort("", () => setOffset(0))
  const [contacts, setContacts] = useState<Navigation | null>(null)
  const save = useMutation({
    mutationFn: ({ items, phone, telegram_url, updated_at }: Navigation) => sdk.client.fetch<Response>("/admin/navigation", { method: "POST", body: { items, phone, telegram_url, expected_updated_at: updated_at } }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["texno-navigation"] })
      setEditing(null)
      setCreating(false)
      setContacts(null)
      toast.success("Меню сохранено", { description: "Обновите страницу витрины, чтобы увидеть изменения." })
    },
    onError: (error: Error) => toast.error("Не удалось сохранить меню", { description: error.message }),
  })
  const navigation = data?.navigation
  const rows = sortTableRows(navigation?.items ?? [], sort.order, {
    label: (item) => item.label,
    destination: (item) => item.kind === "catalog" ? "Выдвижной каталог" : item.href,
    visible: (item) => item.visible,
  })
  const pageOffset = tableOffset(offset, rows.length, 12)
  const move = (index: number, offset: number) => {
    if (!navigation) return
    const items = [...navigation.items]
    ;[items[index], items[index + offset]] = [items[index + offset], items[index]]
    save.mutate({ ...navigation, items })
  }
  const remove = async (item: MenuItem) => {
    if (!navigation) return
    const confirmed = await prompt({ title: `Удалить «${item.label}»?`, description: "Удалится только пункт меню. Страницы и товары сохранятся.", confirmText: "Удалить", cancelText: "Отмена" })
    if (confirmed) save.mutate({ ...navigation, items: navigation.items.filter((entry) => entry.id !== item.id) })
  }
  const submitItem = (event: FormEvent) => {
    event.preventDefault()
    if (!editing || !navigation) return
    const item = { ...editing, href: editing.kind === "catalog" ? "" : editing.href.trim() }
    const items = creating ? [...navigation.items, item] : navigation.items.map((entry) => entry.id === item.id ? item : entry)
    save.mutate({ ...navigation, items })
  }
  const fields = editing && (
    <div className="flex flex-col gap-y-5">
      <div className="flex flex-col gap-y-2">
        <Label htmlFor="menu-label">Название</Label>
        <Input id="menu-label" value={editing.label} required maxLength={60} onChange={(event) => setEditing({ ...editing, label: event.target.value })} />
      </div>
      <div className="flex flex-col gap-y-2">
        <Label htmlFor="menu-kind">Действие</Label>
        <Select value={editing.kind} onValueChange={(value) => setEditing({ ...editing, kind: value as MenuItem["kind"] })}>
          <Select.Trigger id="menu-kind"><Select.Value /></Select.Trigger>
          <Select.Content><Select.Item value="link">Открыть ссылку</Select.Item><Select.Item value="catalog">Выдвинуть каталог</Select.Item></Select.Content>
        </Select>
      </div>
      {editing.kind === "link" && <div className="flex flex-col gap-y-2">
        <Label htmlFor="menu-href">Адрес</Label>
        <Input id="menu-href" value={editing.href} required maxLength={500} placeholder="/page/about-us" onChange={(event) => setEditing({ ...editing, href: event.target.value })} />
        <Text size="small" className="text-ui-fg-subtle">Путь внутри магазина или полная HTTPS-ссылка.</Text>
      </div>}
      <div className="flex items-center gap-x-3">
        <Switch id="menu-visible" checked={editing.visible} onCheckedChange={(visible) => setEditing({ ...editing, visible })} />
        <Label htmlFor="menu-visible">Показывать в меню</Label>
      </div>
    </div>
  )

  return <div className="flex flex-col gap-y-6">
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div><Heading level="h1">Меню витрины</Heading><Text size="small" className="text-ui-fg-subtle">{sort.order ? "Сортировка применяется к списку. Для перемещения верните порядок меню." : "Порядок здесь соответствует порядку в шапке магазина."}</Text></div>
        <Button size="small" disabled={!navigation || save.isPending || navigation.items.length >= 20} onClick={() => { setEditing({ id: crypto.randomUUID(), label: "", href: "", kind: "link", visible: true }); setCreating(true) }}><Plus />Добавить пункт</Button>
      </div>
      {isLoading ? <Text className="px-6 py-8" role="status">Загрузка меню…</Text> : isError ? <div className="px-6 py-8"><Text>Не удалось загрузить меню.</Text><Button size="small" variant="secondary" onClick={() => refetch()}>Повторить</Button></div> : !navigation ? <Text className="px-6 py-8">Меню ещё не инициализировано. Запустите начальное заполнение проекта.</Text> : <>
        <Table>
          <Table.Header><Table.Row><SortHeader sort={sort} field="label" label="Пункт" /><SortHeader sort={sort} field="destination" label="Действие / адрес" /><SortHeader sort={sort} field="visible" label="Видимость" /><Table.HeaderCell><span className="sr-only">Управление</span></Table.HeaderCell></Table.Row></Table.Header>
          <Table.Body>{rows.slice(pageOffset, pageOffset + 12).map((item) => {
            const index = navigation.items.findIndex((entry) => entry.id === item.id)
            return <Table.Row key={item.id}>
            <Table.Cell><Text size="small" weight="plus">{item.label}</Text></Table.Cell>
            <Table.Cell><Text size="small" className="text-ui-fg-subtle">{item.kind === "catalog" ? "Выдвижной каталог" : item.href}</Text></Table.Cell>
            <Table.Cell><Badge color={item.visible ? "green" : "grey"}>{item.visible ? "Виден" : "Скрыт"}</Badge></Table.Cell>
            <Table.Cell><div className="flex justify-end gap-x-1">
              <IconButton size="small" variant="transparent" aria-label={`Выше: ${item.label}`} disabled={!!sort.order || index === 0 || save.isPending} onClick={() => move(index, -1)}><ArrowDown className="rotate-180" /></IconButton>
              <IconButton size="small" variant="transparent" aria-label={`Ниже: ${item.label}`} disabled={!!sort.order || index === navigation.items.length - 1 || save.isPending} onClick={() => move(index, 1)}><ArrowDown /></IconButton>
              <IconButton size="small" variant="transparent" aria-label={`Изменить: ${item.label}`} disabled={save.isPending} onClick={() => { setEditing({ ...item }); setCreating(false) }}><PencilSquare /></IconButton>
              <IconButton size="small" variant="transparent" aria-label={`Удалить: ${item.label}`} disabled={save.isPending} onClick={() => remove(item)}><Trash /></IconButton>
            </div></Table.Cell>
          </Table.Row>})}</Table.Body>
        </Table>
        {sort.order && <div className="px-6 py-2"><Button type="button" size="small" variant="secondary" onClick={sort.reset}>Вернуть порядок меню</Button></div>}
        <TablePagination offset={offset} count={rows.length} size={12} setOffset={setOffset} />
        {!navigation.items.length && <Text className="px-6 py-8">Пунктов пока нет. Добавьте первый пункт меню.</Text>}
      </>}
    </Container>
    {navigation && navigation.items.some((item) => item.kind === "catalog") && (showLegacyCatalogAdmin()
      ? <CatalogTreeEditor nodes={navigation.items.find((item) => item.kind === "catalog")?.children ?? []} disabled={save.isPending} onSave={(children) => save.mutateAsync({ ...navigation, items: navigation.items.map((item) => item.kind === "catalog" ? { ...item, children } : item) })} />
      : <Container className="flex flex-wrap items-center justify-between gap-2"><div><Heading level="h2">Дерево каталога</Heading><Text size="small" className="text-ui-fg-subtle">Категории и порядок веток редактируются в конструкторе.</Text></div><Button asChild size="small" variant="secondary"><Link to="/catalog-constructor">Открыть конструктор</Link></Button></Container>)}
    {navigation && <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4"><div><Heading level="h2">Кнопка связи</Heading><Text size="small" className="text-ui-fg-subtle">Телефон и Telegram в фиксированной мультикнопке.</Text></div><Button size="small" variant="secondary" onClick={() => setContacts({ ...navigation })}>Изменить</Button></div>
      <div className="flex flex-col gap-2 px-6 py-4"><Text size="small">{navigation.phone}</Text><Text size="small" className="text-ui-fg-subtle">{navigation.telegram_url}</Text></div>
    </Container>}
    <Drawer open={!!editing && !creating} onOpenChange={(open) => { if (!open && !save.isPending) setEditing(null) }}>
      <Drawer.Content><Drawer.Header><Drawer.Title>Изменить пункт меню</Drawer.Title><Drawer.Description className="sr-only">Название, ссылка и видимость пункта навигации.</Drawer.Description></Drawer.Header><form onSubmit={submitItem} className="flex min-h-0 flex-1 flex-col"><Drawer.Body className="overflow-auto">{fields}</Drawer.Body><Drawer.Footer><Button type="button" size="small" variant="secondary" disabled={save.isPending} onClick={() => setEditing(null)}>Отмена</Button><Button type="submit" size="small" isLoading={save.isPending}>Сохранить</Button></Drawer.Footer></form></Drawer.Content>
    </Drawer>
    <FocusModal open={creating} onOpenChange={(open) => { if (!open && !save.isPending) { setCreating(false); setEditing(null) } }}>
      <FocusModal.Content><form onSubmit={submitItem} className="flex h-full flex-col"><FocusModal.Header><Button size="small" type="submit" isLoading={save.isPending}>Добавить</Button></FocusModal.Header><FocusModal.Body className="mx-auto flex w-full max-w-xl flex-col gap-y-8 p-8"><FocusModal.Title>Новый пункт меню</FocusModal.Title><FocusModal.Description className="sr-only">Добавьте название и безопасную ссылку для меню витрины.</FocusModal.Description>{fields}</FocusModal.Body></form></FocusModal.Content>
    </FocusModal>
    <Drawer open={!!contacts} onOpenChange={(open) => { if (!open && !save.isPending) setContacts(null) }}>
      <Drawer.Content><Drawer.Header><Drawer.Title>Контакты магазина</Drawer.Title><Drawer.Description className="sr-only">Телефон и Telegram кнопки связи.</Drawer.Description></Drawer.Header>{contacts && <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); save.mutate({ ...contacts, items: navigation?.items ?? contacts.items }) }}><Drawer.Body className="flex flex-col gap-y-5"><div className="flex flex-col gap-y-2"><Label htmlFor="contact-phone">Телефон</Label><Input id="contact-phone" type="tel" value={contacts.phone} onChange={(event) => setContacts({ ...contacts, phone: event.target.value })} /></div><div className="flex flex-col gap-y-2"><Label htmlFor="contact-telegram">Ссылка Telegram</Label><Input id="contact-telegram" type="url" value={contacts.telegram_url} onChange={(event) => setContacts({ ...contacts, telegram_url: event.target.value })} /></div></Drawer.Body><Drawer.Footer><Button type="button" size="small" variant="secondary" disabled={save.isPending} onClick={() => setContacts(null)}>Отмена</Button><Button size="small" type="submit" isLoading={save.isPending}>Сохранить</Button></Drawer.Footer></form>}</Drawer.Content>
    </Drawer>
  </div>
}

export const config = defineRouteConfig({ label: "Меню витрины", icon: BarsThree })

export default NavigationPage



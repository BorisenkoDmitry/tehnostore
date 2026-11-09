import { Button, Container, Heading, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"
import { addedDate, SortHeader, TablePagination, useTableSort } from "../../components/admin-table"
import { constructorKey, constructorPath, type CardRef } from "./types"

export type MoveToCatalogTrash = (card: CardRef, title: string) => Promise<boolean>
type TrashEntry = CardRef & { title: string; handle: string; created_at?: string }

export function useCatalogTrash() {
  const prompt = usePrompt()
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: (body: CardRef & { action: "trash" | "restore" }) => sdk.client.fetch(`${constructorPath}/trash`, { method: "POST", body }),
    onSuccess: async (_result, { action }) => {
      await Promise.all([client.invalidateQueries({ queryKey: constructorKey }), client.invalidateQueries({ queryKey: ["texno-navigation"] })])
      toast.success(action === "trash" ? "Карточка перемещена в корзину" : "Карточка восстановлена")
    },
    onError: (error: Error) => toast.error("Не удалось изменить корзину каталога", { description: error.message }),
  })
  const moveToTrash: MoveToCatalogTrash = async (card, title) => {
    if (mutation.isPending || !await prompt({
      title: `Переместить «${title}» в корзину?`,
      description: card.kind === "folder" ? "Категория скроется с витрины. Товары и подкатегории сохранятся в каталоге." : "Товар скроется с витрины. Его можно восстановить из корзины каталога.",
      confirmText: "В корзину", cancelText: "Отмена",
    })) return false
    try { await mutation.mutateAsync({ ...card, action: "trash" }); return true }
    catch { return false }
  }
  return { moveToTrash, restore: (card: CardRef) => mutation.mutate({ ...card, action: "restore" }), pending: mutation.isPending }
}

export function CatalogTrash() {
  const [offset, setOffset] = useState(0)
  const sort = useTableSort("title", () => setOffset(0))
  const pageSize = 20
  const { restore, pending } = useCatalogTrash()
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: [...constructorKey, "trash", offset, sort.order],
    queryFn: ({ signal }) => sdk.client.fetch<{ entries: TrashEntry[]; count: number }>(`${constructorPath}/trash`, {
      query: { offset, limit: pageSize, order: sort.order },
      signal,
    }),
  })
  return <Container className="space-y-4">
    <div><Heading level="h1">Корзина</Heading><Text size="small" className="mt-1 text-ui-fg-subtle">Восстановите товары или категории вместе с их связями и прежним статусом.</Text></div>
    {isPending && <Text role="status">Загрузка корзины…</Text>}
    {isError && <div className="flex items-center gap-3"><Text role="alert">Корзина недоступна.</Text><Button size="small" variant="secondary" onClick={() => refetch()}>Повторить</Button></div>}
    {data && <>
      {data.entries.length > 0 ? <Table>
        <Table.Header><Table.Row><SortHeader sort={sort} field="title" label="Карточка" /><Table.HeaderCell>Тип</Table.HeaderCell><SortHeader sort={sort} field="created_at" label="Дата добавления" descendingFirst /><Table.HeaderCell>Действия</Table.HeaderCell></Table.Row></Table.Header>
        <Table.Body>{data.entries.map((entry) => <Table.Row key={`${entry.kind}:${entry.id}`}>
          <Table.Cell>{entry.title}<Text size="xsmall" className="text-ui-fg-subtle">/{entry.handle}</Text></Table.Cell>
          <Table.Cell>{entry.kind === "product" ? "Товар" : "Категория"}</Table.Cell>
          <Table.Cell className="whitespace-nowrap">{addedDate(entry.created_at)}</Table.Cell>
          <Table.Cell><Button size="small" variant="secondary" disabled={pending} onClick={() => restore({ id: entry.id, kind: entry.kind })}>Восстановить</Button></Table.Cell>
        </Table.Row>)}</Table.Body>
      </Table> : <Text size="small">{data.count ? "На этой странице корзины нет карточек." : "В корзине пока нет товаров и категорий."}</Text>}
      <TablePagination offset={offset} count={data.count} size={pageSize} setOffset={setOffset} />
    </>}
  </Container>
}

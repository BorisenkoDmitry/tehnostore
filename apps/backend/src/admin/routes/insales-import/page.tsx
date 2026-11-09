import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowUpTray } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Label, Table, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"
import { addedDate, SortHeader, sortTableRows, tableOffset, TablePagination, useTableSort } from "../../components/admin-table"

type Entry = { source_product_id: string; product_id?: string; title?: string; action?: string; status?: string; error?: string; manual_override?: boolean }
type Job = { id: string; created_at?: string; filename: string; source_sha256: string; status: string; progress: { processed: number; total: number; entries?: Entry[] }; error?: string; backup_available?: boolean; rollback_policy?: string; report?: { summary?: Record<string, unknown>; changes?: Entry[]; mapping?: Record<string, string>; warnings?: { sourceProductId: string; code: string }[]; excluded?: { sourceProductId: string; title: string; reasons: string[] }[] } }

async function fileBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ""
  for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384))
  return btoa(binary)
}

const statusLabel: Record<string, string> = { preview: "Предпросмотр", queued: "В очереди", running: "Выполняется", completed: "Завершён", review: "Нужна проверка конфликтов", failed: "Ошибка", cancelled: "Отменён" }

const InsalesImportPage = () => {
  const client = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [jobsOffset, setJobsOffset] = useState(0)
  const [logOffset, setLogOffset] = useState(0)
  const [mappingOffset, setMappingOffset] = useState(0)
  const jobSort = useTableSort("-created_at", () => setJobsOffset(0))
  const logSort = useTableSort("", () => setLogOffset(0))
  const mappingSort = useTableSort("", () => setMappingOffset(0))
  const jobsQuery = useQuery({ queryKey: ["insales-jobs", jobSort.order, jobsOffset], queryFn: () => sdk.client.fetch<{ jobs: Job[]; count: number }>("/admin/insales-import", { query: { limit: 20, offset: jobsOffset, order: jobSort.order } }), refetchInterval: 5000 })
  const activeId = selectedId ?? jobsQuery.data?.jobs[0]?.id
  const detail = useQuery({ queryKey: ["insales-job", activeId], queryFn: () => sdk.client.fetch<{ job: Job }>(`/admin/insales-import/${activeId}`), enabled: Boolean(activeId), refetchInterval: 5000 })
  const invalidate = async () => { await client.invalidateQueries({ queryKey: ["insales-jobs"] }); await client.invalidateQueries({ queryKey: ["insales-job"] }) }
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Выберите исходную выгрузку")
      if (file.size > 20 * 1024 * 1024) throw new Error("Максимальный размер — 20 МБ")
      return sdk.client.fetch<{ job: Job }>("/admin/insales-import", { method: "POST", body: { filename: file.name, source_base64: await fileBase64(file) } })
    },
    onSuccess: async ({ job }) => { setSelectedId(job.id); await invalidate(); toast.success("Предпросмотр готов") },
    onError: (error: Error) => toast.error("Выгрузка не принята", { description: error.message }),
  })
  const action = useMutation({
    mutationFn: (operation: "queue" | "resume" | "cancel") => sdk.client.fetch(`/admin/insales-import/${activeId}`, { method: "POST", body: { action: operation } }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error("Операция не выполнена", { description: error.message }),
  })
  const job = detail.data?.job
  const changes = job?.report?.changes ?? []
  const log = sortTableRows(job?.progress.entries?.length ? job.progress.entries : changes.filter((entry) => entry.action !== "unchanged"), logSort.order, {
    id: (entry) => entry.source_product_id,
    action: (entry) => entry.status ?? entry.action,
    reason: (entry) => entry.error ?? entry.title,
  })
  const currentLogOffset = tableOffset(logOffset, log.length, 20)
  const mapping = sortTableRows(Object.entries(job?.report?.mapping ?? {}), mappingSort.order, {
    source: ([key]) => key,
    destination: ([, value]) => value,
  })
  const currentMappingOffset = tableOffset(mappingOffset, mapping.length, 20)
  return <div className="flex flex-col gap-y-6">
    <Container className="flex flex-col gap-y-4">
      <Heading>Импорт InSales</Heading>
      <Text className="text-ui-fg-subtle">Загрузите оригинальный CSV: UTF-16LE, разделитель TAB. Сначала проверяются структура, цены RUB и согласованные ветки каталога. Скрытые товары, услуги и неизвестные ветки не публикуются.</Text>
      <Label htmlFor="insales-file">Исходная выгрузка, до 20 МБ</Label>
      <Input id="insales-file" type="file" accept=".csv,.tsv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      <Button className="self-start" type="button" disabled={!file} isLoading={upload.isPending} onClick={() => upload.mutate()}>Проверить и показать изменения</Button>
      <Text size="small" className="text-ui-fg-subtle">Товар обновляется из источника, только если текущие данные совпадают с предыдущим снимком импорта. Правки администратора, подтверждённые и зарезервированные остатки сохраняются как конфликты для проверки в карточке товара. Оригинальный файл хранится приватно.</Text>
    </Container>
    <Container className="flex flex-col gap-y-4">
      <Heading level="h2">Задания</Heading>
      {jobsQuery.isLoading ? <Text>Загрузка…</Text> : jobsQuery.isError ? <Text role="alert">Не удалось загрузить задания. <Button type="button" variant="secondary" onClick={() => jobsQuery.refetch()}>Повторить</Button></Text> : <Table><Table.Header><Table.Row><SortHeader sort={jobSort} field="filename" label="Файл" /><SortHeader sort={jobSort} field="status" label="Статус" /><Table.HeaderCell>Обработано</Table.HeaderCell><SortHeader sort={jobSort} field="created_at" label="Дата добавления" descendingFirst /></Table.Row></Table.Header><Table.Body>{jobsQuery.data?.jobs.map((item) => <Table.Row key={item.id}><Table.Cell><Button type="button" variant="transparent" onClick={() => { setSelectedId(item.id); logSort.reset(); mappingSort.reset() }}>{item.filename}</Button></Table.Cell><Table.Cell>{statusLabel[item.status] ?? item.status}</Table.Cell><Table.Cell>{item.progress.processed} / {item.progress.total}</Table.Cell><Table.Cell className="whitespace-nowrap">{addedDate(item.created_at)}</Table.Cell></Table.Row>)}</Table.Body></Table>}
      {jobsQuery.data && <TablePagination offset={jobsOffset} count={jobsQuery.data.count} size={20} setOffset={setJobsOffset} />}
    </Container>
    {activeId && <Container className="flex flex-col gap-y-4">
      {detail.isLoading ? <Text>Загрузка предпросмотра…</Text> : detail.isError ? <Text role="alert">Не удалось открыть задание</Text> : job && <>
        <div className="flex flex-wrap items-center gap-3"><Heading level="h2">{job.filename}</Heading><Badge>{statusLabel[job.status]}</Badge></div>
        <Text size="small" className="break-all text-ui-fg-subtle">SHA256: {job.source_sha256}</Text>
        {job.error && <Text role="alert" className="text-ui-fg-error">{job.error}</Text>}
        <div className="flex flex-wrap gap-3">{job.status === "preview" && <Button type="button" isLoading={action.isPending} onClick={() => action.mutate("queue")}>Запустить импорт</Button>}{["failed", "review"].includes(job.status) && <Button type="button" isLoading={action.isPending} onClick={() => action.mutate("resume")}>Продолжить с журнала</Button>}{["preview", "queued", "failed", "review"].includes(job.status) && <Button type="button" variant="secondary" disabled={action.isPending} onClick={() => action.mutate("cancel")}>Отменить задание</Button>}</div>
        {["queued", "running"].includes(job.status) && <Text role="status">Фоновый обработчик запускается каждую минуту. Обработано {job.progress.processed} из {job.progress.total}. Страницу можно закрыть.</Text>}
        {job.backup_available && <Text>Резервный снимок товаров, характеристик и остатков сохранён до изменений.</Text>}
        <Heading level="h3">Результат проверки</Heading>
        <Text>Новых: {changes.filter((item) => item.action === "create").length}. Обновлений из источника: {changes.filter((item) => item.action === "update").length}. Без изменений: {changes.filter((item) => item.action === "unchanged").length}. Конфликтов: {changes.filter((item) => item.action === "conflict").length}.</Text>
        {job.report?.summary && <dl className="grid grid-cols-2 gap-2">{Object.entries(job.report.summary).filter(([, value]) => typeof value === "number").map(([key, value]) => <div key={key}><dt className="text-ui-fg-subtle text-sm">{key}</dt><dd>{String(value)}</dd></div>)}</dl>}
        <details>
          <summary className="cursor-pointer">Сопоставление полей</summary>
          <Table>
            <Table.Header><Table.Row>
              <SortHeader sort={mappingSort} field="source" label="Поле выгрузки" />
              <SortHeader sort={mappingSort} field="destination" label="Поле каталога" />
            </Table.Row></Table.Header>
            <Table.Body>{mapping.slice(currentMappingOffset, currentMappingOffset + 20).map(([key, value]) =>
              <Table.Row key={key}><Table.Cell>{key}</Table.Cell><Table.Cell>{value}</Table.Cell></Table.Row>
            )}</Table.Body>
          </Table>
          <TablePagination offset={mappingOffset} count={mapping.length} size={20} setOffset={setMappingOffset} />
        </details>
        <details><summary className="cursor-pointer">Конфликты и журнал обработки</summary><Table><Table.Header><Table.Row><SortHeader sort={logSort} field="id" label="ID источника" /><SortHeader sort={logSort} field="action" label="Действие" /><SortHeader sort={logSort} field="reason" label="Причина" /></Table.Row></Table.Header><Table.Body>{log.slice(currentLogOffset, currentLogOffset + 20).map((entry) => <Table.Row key={entry.source_product_id}><Table.Cell>{entry.product_id ? <a href={`/app/products/${entry.product_id}`} className="text-ui-fg-interactive">{entry.source_product_id}</a> : entry.source_product_id}</Table.Cell><Table.Cell>{entry.status ?? entry.action}</Table.Cell><Table.Cell>{entry.error ?? entry.title}</Table.Cell></Table.Row>)}</Table.Body></Table><TablePagination offset={logOffset} count={log.length} size={20} setOffset={setLogOffset} /></details>
        <details><summary className="cursor-pointer">Исключённые строки ({job.report?.excluded?.length ?? 0})</summary><ul className="list-disc pl-5">{job.report?.excluded?.map((entry) => <li key={entry.sourceProductId}>{entry.sourceProductId}: {entry.title} — {entry.reasons.join(", ")}</li>)}</ul></details>
        <details><summary className="cursor-pointer">Предупреждения ({job.report?.warnings?.length ?? 0})</summary><ul className="list-disc pl-5">{job.report?.warnings?.map((entry, index) => <li key={`${entry.sourceProductId}-${index}`}>{entry.sourceProductId}: {entry.code}</li>)}</ul></details>
        <Text size="small" className="text-ui-fg-subtle">При сбое откатывается текущий товар; завершённые строки остаются в журнале. Повтор пропускает завершённые строки. Отмена не удаляет импортированные товары. Восстановление всего магазина поверх новых заказов автоматически не выполняется.</Text>
      </>}
    </Container>}
  </div>
}

export const config = defineRouteConfig({ label: "Импорт InSales", icon: ArrowUpTray })
export default InsalesImportPage

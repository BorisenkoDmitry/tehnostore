import { Badge, Button, Container, Drawer, Input, Label, Select, Switch, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"
import type { CatalogDefinitionBody } from "../../../api/admin/catalog-cms/validators"
import type { CatalogDefinitionData } from "../../../lib/catalog-cms"
import { isLibraryDefinition } from "../../../lib/catalog-variation-library"
import { canonicalCatalogToken } from "../../../search/helpers/catalog-filter-values"
import { constructorKey } from "./types"
import { addedDate, dateValue, SortHeader, sortTableRows, tableOffset, TablePagination, useTableSort } from "../../components/admin-table"
import { ChoiceSwatch, ChoiceValuesEditor } from "./choice-values-editor"

const definitionPath = "/admin/catalog-cms/definitions"
export const definitionKey = ["catalog-definitions"] as const
export const variantPriceField = "__price"
export const legacyVariantColor = "variant_color"

export const isVariationField = isLibraryDefinition

const fieldTypes = { text: "Текст", number: "Число", boolean: "Да / Нет", money: "Денежное значение" }
const isNumericType = (type: string) => type === "number" || type === "money"
type DefinitionDraft = Omit<CatalogDefinitionBody, "choice_colors"> & { choice_colors?: Record<string, string> | null }

export function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-1"><Label htmlFor={id}>{label}</Label>{children}</div>
}

function freshDefinition(preset?: "color" | "size", variationField = false): CatalogDefinitionBody {
  return {
    code: preset ?? `field_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    label: preset === "color" ? "Цвет" : preset === "size" ? "Размер" : "",
    type: "text", unit: null, public: true, filterable: !!preset, position: 0, enabled: true,
    role: preset === "color" ? "color" : variationField ? "variant_axis" : "spec",
    filter_control: preset === "color" ? "swatch" : "checkbox",
  }
}

function DefinitionEditor({ initial, definitions, close, variationField = false }: {
  initial: DefinitionDraft
  definitions: CatalogDefinitionData[]
  close: () => void
  variationField?: boolean
}) {
  const [draft, setDraft] = useState(initial)
  const [choices, setChoices] = useState(initial.choice_values ?? [])
  const [colors, setColors] = useState(initial.choice_colors ?? {})
  const colorField = variationField && (draft.role === "color" || draft.label.trim().toLocaleLowerCase("ru") === "цвет")
  const client = useQueryClient()
  const prompt = usePrompt()
  const patch = (change: Partial<CatalogDefinitionBody>) => setDraft((current) => ({ ...current, ...change }))
  const invalidate = async () => {
    await Promise.all([client.invalidateQueries({ queryKey: definitionKey }), client.invalidateQueries({ queryKey: constructorKey })])
  }
  const save = useMutation({
    mutationFn: () => sdk.client.fetch(definitionPath, { method: "POST", body: {
      ...draft, choice_colors: undefined,
      ...(variationField ? { choice_values: choices } : {}),
      ...(colorField ? { role: "color", type: "text", filter_control: "swatch", choice_colors: colors } : {}),
    } }),
    onSuccess: async () => { await invalidate(); close(); toast.success("Поле сохранено") },
    onError: (error: Error) => toast.error("Не удалось сохранить поле", { description: error.message }),
  })
  const remove = useMutation({
    mutationFn: () => sdk.client.fetch(`${definitionPath}/${draft.id}`, { method: "DELETE" }),
    onSuccess: async () => { await invalidate(); close(); toast.success("Поле удалено") },
    onError: (error: Error) => toast.error("Не удалось удалить поле", { description: error.message }),
  })
  const label = canonicalCatalogToken(draft.label)
  const duplicate = (!draft.id || label !== canonicalCatalogToken(initial.label)) && definitions.find((definition) =>
    definition.id !== draft.id && isVariationField(definition) === variationField &&
    [definition.label, ...(definition.aliases ?? [])].some((name) => canonicalCatalogToken(name) === label)
  )
  const reservedPrice = variationField && label === "цена"
  return <Drawer open onOpenChange={(open) => { if (!open && !save.isPending && !remove.isPending) close() }}>
    <Drawer.Content>
      <Drawer.Header><Drawer.Title>{draft.id ? "Редактирование поля" : "Новое поле"}</Drawer.Title><Drawer.Description>{variationField ? "Поле выбора используется в сочетаниях товара." : "Значение характеристики отображается в карточке товара."}</Drawer.Description></Drawer.Header>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); if (!duplicate && !reservedPrice) save.mutate() }}>
        <Drawer.Body className="flex flex-col gap-4 overflow-auto">
          {variationField && !draft.id && <div className="flex flex-wrap gap-2">{(["color", "size"] as const).map((preset) => {
            const suggestion = freshDefinition(preset, true)
            return <Button key={preset} size="small" variant="secondary" disabled={definitions.some((definition) =>
              definition.code === preset || (isVariationField(definition) && canonicalCatalogToken(definition.label) === canonicalCatalogToken(suggestion.label))
            )} onClick={() => setDraft(suggestion)}>{suggestion.label}</Button>
          })}</div>}
          <Field id="field-label" label="Название"><Input id="field-label" value={draft.label} required maxLength={150} onChange={(event) => patch({ label: event.target.value })} /></Field>
          {duplicate && <Text role="alert" size="small">Поле «{duplicate.label}» уже есть в справочнике.</Text>}
          {reservedPrice && <Text role="alert" size="small">«Цена» уже есть в библиотеке и берётся из сочетания товара.</Text>}
          <Field id="field-code" label="Стабильный код"><Input id="field-code" value={draft.code} required readOnly={!!draft.id} pattern="[a-z][a-z0-9_]{0,99}" onChange={(event) => patch({ code: event.target.value })} /></Field>
          <Field id="field-type" label="Тип"><Select value={colorField ? "text" : draft.type} disabled={colorField} onValueChange={(value) => patch({
            type: value as CatalogDefinitionBody["type"],
            ...(value === "money" ? { unit: null } : {}),
            ...(!isNumericType(value) && draft.filter_control === "range" ? { filter_control: "checkbox" } : {}),
          })}>
            <Select.Trigger id="field-type"><Select.Value /></Select.Trigger>
            <Select.Content>{Object.entries(fieldTypes).filter(([type]) => type !== "money" || variationField).map(([type, label]) => <Select.Item key={type} value={type}>{label}</Select.Item>)}</Select.Content>
          </Select></Field>
          <Field id="field-unit" label={draft.type === "money" ? "Код валюты" : "Единица измерения"}><Input
            id="field-unit" maxLength={draft.type === "money" ? 3 : 30} pattern={draft.type === "money" ? "[A-Z]{3}" : undefined}
            placeholder={draft.type === "money" ? "По умолчанию валюта каталога" : undefined} value={draft.unit ?? ""}
            onChange={(event) => patch({ unit: (draft.type === "money" ? event.target.value.toUpperCase() : event.target.value) || null })}
          /></Field>
          {variationField && !colorField && <Field id="field-control" label="Вид фильтра"><Select value={draft.filter_control} onValueChange={(value) => patch({ filter_control: value as CatalogDefinitionBody["filter_control"] })}>
            <Select.Trigger id="field-control"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="checkbox">Текст</Select.Item><Select.Item value="range" disabled={!isNumericType(draft.type)}>Число</Select.Item></Select.Content>
          </Select></Field>}
          {variationField && <ChoiceValuesEditor values={choices} colorField={colorField} colors={colors} onValuesChange={setChoices} onColorsChange={setColors} />}
          <Field id="field-position" label="Порядок"><Input id="field-position" type="number" min={0} max={10000} value={draft.position} onChange={(event) => patch({ position: Number(event.target.value) })} /></Field>
          {([["enabled", "Доступно для назначения"], ["public", "Показывать покупателям"]] as const).map(([key, label]) =>
            <div className="flex items-center gap-2" key={key}><Switch id={`field-${key}`} checked={draft[key]} onCheckedChange={(value) => patch({ [key]: value })} /><Label htmlFor={`field-${key}`}>{label}</Label></div>,
          )}
        </Drawer.Body>
        <Drawer.Footer>
          <Button type="button" size="small" variant="secondary" onClick={close} disabled={save.isPending || remove.isPending}>Отмена</Button>
          {draft.id && <Button type="button" size="small" variant="danger" isLoading={remove.isPending} disabled={save.isPending} onClick={async () => {
            if (await prompt({ title: "Удалить поле?", description: "Удаление доступно для поля без назначений.", confirmText: "Удалить", cancelText: "Отмена" })) remove.mutate()
          }}>Удалить</Button>}
          <Button size="small" type="submit" disabled={!!duplicate || reservedPrice || remove.isPending} isLoading={save.isPending}>Сохранить поле</Button>
        </Drawer.Footer>
      </form>
    </Drawer.Content>
  </Drawer>
}

export function DefinitionsTable({ definitions, variationField = false }: { definitions: CatalogDefinitionData[]; variationField?: boolean }) {
  const [search, setSearch] = useState("")
  const [offset, setOffset] = useState(0)
  const sort = useTableSort("", () => setOffset(0))
  const [draft, setDraft] = useState<DefinitionDraft>()
  const matching = definitions.filter((definition) => definition.code !== legacyVariantColor &&
    isVariationField(definition) === variationField &&
    `${definition.label} ${definition.code}`.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru")),
  )
  const rows = sortTableRows(matching, sort.order, {
    label: (row) => row.label,
    type: (row) => fieldTypes[row.type],
    values: (row) => row.choice_values?.join(", "),
    public: (row) => row.enabled && row.public,
    created_at: (row) => dateValue(row.created_at),
  })
  const pageOffset = tableOffset(offset, rows.length, 12)
  return <div className="flex flex-col gap-4">
    <Container className="p-0">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <Input aria-label={variationField ? "Найти поле вариаций" : "Найти характеристику"} placeholder="Название или код" value={search} className="w-64" onChange={(event) => { setSearch(event.target.value); setOffset(0) }} />
        <Button className="ml-auto" size="small" onClick={() => setDraft(freshDefinition(undefined, variationField))}>Новое поле</Button>
      </div>
      <div className="overflow-auto"><Table>
        <Table.Header><Table.Row><SortHeader sort={sort} field="label" label="Поле" /><SortHeader sort={sort} field="type" label="Тип" />{variationField && <SortHeader sort={sort} field="values" label="Допустимые значения" />}<SortHeader sort={sort} field="public" label="На витрине" /><SortHeader sort={sort} field="created_at" label="Дата добавления" descendingFirst /><Table.HeaderCell>Действия</Table.HeaderCell></Table.Row></Table.Header>
        <Table.Body>{variationField && pageOffset === 0 && (!search.trim() || `цена ${variantPriceField}`.includes(search.trim().toLocaleLowerCase("ru"))) && <Table.Row>
          <Table.Cell>Цена</Table.Cell>
          <Table.Cell>Денежное значение</Table.Cell>
          <Table.Cell><Text size="small" className="text-ui-fg-subtle">Фактическая цена сочетания</Text></Table.Cell>
          <Table.Cell><Badge color="green">Видимо</Badge></Table.Cell>
          <Table.Cell>—</Table.Cell>
          <Table.Cell><Text size="small" className="text-ui-fg-subtle">Встроенное поле</Text></Table.Cell>
        </Table.Row>}
        {rows.slice(pageOffset, pageOffset + 12).map((row) => <Table.Row key={row.id}>
          <Table.Cell><Text size="small" weight="plus">{row.label}</Text><Text size="xsmall" className="text-ui-fg-subtle">{row.code}</Text></Table.Cell>
          <Table.Cell>{fieldTypes[row.type]}{row.unit && ` · ${row.unit}`}</Table.Cell>
          {variationField && <Table.Cell>{row.role === "color" && row.choice_values?.length ? <div className="flex flex-wrap items-center gap-1">
            {row.choice_values.slice(0, 8).map((name) => <ChoiceSwatch key={name} name={name} colors={row.choice_colors} />)}
            {row.choice_values.length > 8 && <Text size="xsmall" className="text-ui-fg-subtle">+{row.choice_values.length - 8}</Text>}
          </div> : <Text size="small" className="max-w-80 truncate" title={row.choice_values?.join(", ")}>{row.choice_values?.join(", ") || "Нет значений"}</Text>}</Table.Cell>}
          <Table.Cell><Badge color={row.enabled && row.public ? "green" : "grey"}>{row.enabled && row.public ? "Видимо" : "Скрыто"}</Badge></Table.Cell>
          <Table.Cell className="whitespace-nowrap">{addedDate(row.created_at)}</Table.Cell>
          <Table.Cell><Button size="small" variant="transparent" onClick={() => setDraft({
            id: row.id, code: row.code, label: row.label, type: row.type, unit: row.unit,
            public: row.public, filterable: row.filterable, position: row.position, enabled: row.enabled,
            role: row.role ?? "spec", filter_control: row.filter_control ?? "checkbox",
            choice_values: row.choice_values, choice_colors: row.choice_colors,
          })}>Изменить</Button></Table.Cell>
        </Table.Row>)}</Table.Body>
      </Table></div>
      <TablePagination offset={offset} count={rows.length} setOffset={setOffset} />
    </Container>
    {draft && <DefinitionEditor initial={draft} definitions={definitions} variationField={variationField} close={() => setDraft(undefined)} />}
  </div>
}

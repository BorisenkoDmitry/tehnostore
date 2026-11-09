import { Button, FocusModal, Input, Label, Select, Switch, Text, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useId, useState } from "react"
import { RichTextEditor } from "../../components/rich-text-editor"
import { sdk } from "../../lib/sdk"
import type { FolderBody } from "../../../api/admin/catalog-constructor/validators"
import type { CatalogDefinitionData } from "../../../lib/catalog-cms"
import { constructorSlug } from "../../../lib/catalog-slug"
import { constructorKey, constructorPath, type Folder, type GraphData } from "./types"
import { Field, legacyVariantColor } from "./catalog-fields"

export function FolderEditor({ folder, data, definitions, close, locate }: {
  folder?: Folder; data: GraphData; definitions: CatalogDefinitionData[]; close: () => void; locate: (id: string) => void
}) {
  const client = useQueryClient()
  const formId = useId()
  const node = data.nodes.find((entry) => entry.category_id === folder?.id && !entry.category_shortcut)
  const metadata = folder?.metadata ?? {}
  const hasProfileFilters = metadata.catalog_filters_from_profile === true
  const seo = metadata.catalog_seo as FolderBody["seo"] | undefined
  const [draft, setDraft] = useState<FolderBody & { filter_disabled_codes: string[] }>({
    id: folder?.id,
    revision: folder?.updated_at,
    name: folder?.name ?? "",
    published: folder?.published ?? false,
    kind: String(metadata.catalog_kind ?? data.profile.product_types.find((type) => type.enabled)?.code ?? ""),
    position: node ? data.nodes.filter((entry) => entry.parent_id === node.parent_id).findIndex((entry) => entry.id === node.id) : 0,
    filter_codes: Array.isArray(metadata.catalog_filter_codes) ? metadata.catalog_filter_codes as string[] : null,
    filter_disabled_codes: Array.isArray(metadata.catalog_filter_disabled_codes) ? metadata.catalog_filter_disabled_codes as string[] : [],
    keep_legacy_filters: !hasProfileFilters,
    seo: { title: seo?.title ?? "", description: seo?.description ?? "", text: seo?.text ?? "", text_html: seo?.text_html },
    menu_visible: node?.visible,
    menu_label: node?.label,
  })
  const [address, setAddress] = useState(folder?.handle ?? "")
  const [filtersEdited, setFiltersEdited] = useState(false)
  const patch = (change: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...change }))
  const save = useMutation({
    mutationFn: () => sdk.client.fetch<{ id: string }>(`${constructorPath}/folders`, { method: "POST", body: {
      ...draft, handle: address && address !== folder?.handle ? address : undefined,
    } }),
    onSuccess: async ({ id }) => {
      await Promise.all([client.invalidateQueries({ queryKey: constructorKey }), client.invalidateQueries({ queryKey: ["texno-navigation"] })])
      toast.success(folder ? "Категория сохранена" : "Черновик категории создан")
      if (!folder) locate(id)
      else close()
    },
    onError: (error: Error) => toast.error("Категория не сохранена", { description: error.message }),
  })
  const mode = draft.filter_codes !== null ? "custom" : draft.keep_legacy_filters ? "legacy" : "profile"
  const defaults = data.profile.product_types.find((type) => type.code === draft.kind)?.filter_codes ?? []
  const choices = useQuery({
    queryKey: [...constructorKey, "folder-filter-options", folder?.id],
    queryFn: () => sdk.client.fetch<{ codes: string[]; effective_enabled_codes?: string[] }>(`${constructorPath}/folders/${folder?.id}/filters`),
    enabled: !!folder,
  })
  const available = definitions.filter((definition) => definition.code !== legacyVariantColor && definition.enabled && definition.public &&
    choices.data?.codes.includes(definition.code))
  const draftEnabledCodes = (mode === "custom" ? draft.filter_codes! : mode === "profile" ? defaults : choices.data?.codes ?? [])
    .filter((code) => !draft.filter_disabled_codes.includes(code))
  const enabledCodes = (!filtersEdited ? choices.data?.effective_enabled_codes : undefined) ?? draftEnabledCodes
  const toggleFilter = (code: string, checked: boolean) => {
    setFiltersEdited(true)
    if (mode === "custom") {
      patch({
        filter_codes: checked ? [...new Set([...draft.filter_codes!, code])] : draft.filter_codes!.filter((item) => item !== code),
        filter_disabled_codes: draft.filter_disabled_codes.filter((item) => item !== code),
      })
      return
    }
    if (mode === "profile" && checked && !defaults.includes(code)) {
      patch({ filter_codes: [...new Set([...enabledCodes, code])], filter_disabled_codes: [] })
      return
    }
    patch({
      filter_disabled_codes: checked ? draft.filter_disabled_codes.filter((item) => item !== code) : [...new Set([...draft.filter_disabled_codes, code])],
    })
  }
  const parent = data.categories.find((item) => item.id === folder?.parent_category_id)
  const publicationParent = !parent || parent.public
  const slugBase = constructorSlug(draft.name) || "category"
  const usedHandles = new Set(data.categories.filter((entry) => entry.id !== folder?.id).map((entry) => entry.handle))
  let suggestion = slugBase
  for (let number = 2; usedHandles.has(suggestion); number++) suggestion = `${slugBase}-${number}`
  return <FocusModal open onOpenChange={(open) => { if (!open && !save.isPending) close() }}>
    <FocusModal.Content>
      <FocusModal.Header>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="secondary" size="small" disabled={save.isPending} onClick={close}>Отмена</Button>
          <Button type="submit" form={formId} size="small" isLoading={save.isPending}>{folder ? "Сохранить" : "Создать черновик"}</Button>
        </div>
      </FocusModal.Header>
      <FocusModal.Body className="overflow-y-auto">
        <form id={formId} className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
          <div className="space-y-1">
            <FocusModal.Title>{folder ? folder.name : "Новая категория"}</FocusModal.Title>
            <FocusModal.Description>Основные данные, порядок в меню и фильтры витрины.</FocusModal.Description>
          </div>
          <Field id="folder-name" label="Название"><Input id="folder-name" required maxLength={100} value={draft.name} onChange={(event) => patch({ name: event.target.value })} /></Field>
          <Field id="folder-handle" label="Адрес"><Input id="folder-handle" value={address} placeholder={draft.name.trim() ? suggestion : "Из названия при сохранении"} maxLength={200} onChange={(event) => setAddress(event.target.value)} /><Text size="xsmall" className="text-ui-fg-subtle">При совпадении автоматически созданного адреса добавится номер.</Text></Field>
          <Field id="folder-kind" label="Тип ассортимента"><Select value={draft.kind} onValueChange={(kind) => { patch({ kind }); setFiltersEdited(true) }}><Select.Trigger id="folder-kind"><Select.Value /></Select.Trigger><Select.Content>{data.profile.product_types.filter((type) => type.enabled).map((type) => <Select.Item key={type.code} value={type.code}>{type.label}</Select.Item>)}</Select.Content></Select></Field>
          <div className="flex items-center justify-between gap-2 rounded border border-ui-border-base p-2">
            <Text size="small">Родитель · {parent?.name ?? "Без родителя"}</Text>
            {folder && <Button size="small" type="button" variant="secondary" onClick={() => locate(folder.id)}>На схеме</Button>}
          </div>
          {node && <>
            <Field id="folder-order" label="Позиция среди соседей (с нуля)"><Input id="folder-order" type="number" min={0} max={10000} value={draft.position} onChange={(event) => patch({ position: Number(event.target.value) })} /></Field>
            <Field id="folder-menu-label" label="Подпись в меню"><Input id="folder-menu-label" value={draft.menu_label} required maxLength={100} onChange={(event) => patch({ menu_label: event.target.value })} /></Field>
            <div className="flex items-center gap-2"><Switch id="folder-menu-visible" checked={draft.menu_visible} onCheckedChange={(menu_visible) => patch({ menu_visible })} /><Label htmlFor="folder-menu-visible">Показывать в меню витрины</Label></div>
            <div className="flex items-center gap-2"><Switch id="folder-published" checked={draft.published} disabled={!publicationParent && !draft.published} onCheckedChange={(published) => patch({ published })} /><Label htmlFor="folder-published">Опубликовать категорию</Label></div>
            {!publicationParent && <Text size="xsmall" className="text-ui-fg-subtle">Ветка появится на витрине после публикации родителей.</Text>}
          </>}
          {!node && <Text size="small" className="text-ui-fg-subtle">Чтобы опубликовать категорию, сначала разместите её на схеме и сохраните связи.</Text>}
          <section className="flex shrink-0 flex-col gap-2">
            <Text size="small" weight="plus">Фильтры витрины</Text>
            <Text size="xsmall" className="text-ui-fg-subtle">Значения собираются из вариаций опубликованных товаров. Здесь можно включать и выключать показ полей в категории.</Text>
            {folder && choices.isPending && <Text size="small" role="status">Загрузка фильтров…</Text>}
            {choices.isError ? <Button type="button" size="small" variant="secondary" onClick={() => choices.refetch()}>Повторить загрузку фильтров</Button>
              : available.length ? <fieldset className="grid min-w-0 gap-2 rounded border border-ui-border-base p-3">
                <legend className="sr-only">Поля фильтров категории</legend>
                {available.map((item) => <div className="flex items-center gap-2" key={item.code}>
                  <Switch id={`folder-filter-${item.code}`} checked={enabledCodes.includes(item.code)} onCheckedChange={(checked) => toggleFilter(item.code, checked)} />
                  <Label htmlFor={`folder-filter-${item.code}`}>{item.label}</Label>
                </div>)}
              </fieldset> : (!folder || choices.data) && <Text size="small" className="text-ui-fg-subtle">У опубликованных товаров категории пока нет полей вариаций.</Text>}
          </section>
          <Field id="folder-seo-title" label="SEO-заголовок"><Input id="folder-seo-title" maxLength={150} value={draft.seo.title} onChange={(event) => patch({ seo: { ...draft.seo, title: event.target.value } })} /></Field>
          <Field id="folder-seo-description" label="SEO-описание"><Textarea id="folder-seo-description" rows={3} maxLength={500} value={draft.seo.description} onChange={(event) => patch({ seo: { ...draft.seo, description: event.target.value } })} /></Field>
          <RichTextEditor label="Текст под товарами" html={seo?.text_html} text={seo?.text} onChange={(text_html, text) =>
            setDraft((current) => ({ ...current, seo: { ...current.seo, text, text_html } }))} />
        </form>
      </FocusModal.Body>
    </FocusModal.Content>
  </FocusModal>
}

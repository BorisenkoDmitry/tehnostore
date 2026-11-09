import { ChevronDown } from "@medusajs/icons"
import { Badge, Button, Drawer, DropdownMenu, FocusModal, Input, Select, Tabs, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { editableAttributes, type EditableAttribute } from "../../components/catalog-attributes-editor"
import { RichTextEditor } from "../../components/rich-text-editor"
import { sdk } from "../../lib/sdk"
import type { ConstructorProductBody } from "../../../api/admin/catalog-constructor/validators"
import type { CatalogDefinitionData } from "../../../lib/catalog-cms"
import { constructorSlug } from "../../../lib/catalog-slug"
import { isProductSpecificationCode, productSpecificationPrefix } from "../../../lib/product-specification"
import { constructorKey, constructorPath, type GraphData, type ProductDetail, type ProductFamily, type Variant } from "./types"
import { Field, isVariationField, variantPriceField } from "./catalog-fields"
import { productStatus, stockLabel } from "./catalog-picker"
import { ChoiceSwatch } from "./choice-values-editor"

type VariantDraft = ConstructorProductBody["variants"][number] & { key: string }
const newVariant = (): VariantDraft => ({ key: crypto.randomUUID(), title: "Основной", sku: null, old_price: null, attributes: [], choices: {} })

function VariationValue({ definition, value, label, change }: {
  definition?: CatalogDefinitionData; value: string; label: string; change: (value: string) => void
}) {
  const options = definition?.enabled ? definition.choice_values ?? [] : []
  return <Select value={value} onValueChange={change} disabled={!options.length}>
    <Select.Trigger aria-label={label} title={value || undefined} className="text-left [&>span]:truncate">
      <Select.Value placeholder={options.length ? "Выберите значение" : "Нет значений"} />
    </Select.Trigger>
    <Select.Content>
      {value && !options.includes(value) && <Select.Item value={value} disabled>{value}</Select.Item>}
      {options.map((option) => <Select.Item key={option} value={option}>
        {definition?.role === "color" ? <span className="inline-flex items-center gap-2"><ChoiceSwatch name={option} colors={definition.choice_colors} />{option}</span> : option}
      </Select.Item>)}
    </Select.Content>
  </Select>
}

function MediaEditor({ images, change, uploading }: { images: string[]; change: (urls: string[]) => void; uploading: (active: boolean) => void }) {
  const [url, setUrl] = useState("")
  const [pending, setPending] = useState(false)
  const add = (urls: string[]) => change([...new Set([...images, ...urls])])
  return <div className="flex flex-col gap-2">
    <Text size="small" weight="plus">Фотографии</Text>
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label="Адрес существующей фотографии" placeholder="https://… или путь к файлу магазина" className="max-w-96" value={url} onChange={(event) => setUrl(event.target.value)} />
      <Button type="button" size="small" variant="secondary" disabled={!url.trim() || pending} onClick={() => { add([url.trim()]); setUrl("") }}>Добавить по адресу</Button>
      <label className="cursor-pointer rounded border border-ui-border-base px-2 py-1.5 text-sm">
        {pending ? "Загрузка…" : "Загрузить фото"}
        <input aria-label="Загрузить фото товара" className="sr-only" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/avif" disabled={pending} onChange={async (event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ""
          if (!files.length) return
          if (images.length + files.length > 100 || files.some((file) => !["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].includes(file.type) || file.size > 10_000_000)) {
            toast.error("Выберите поддерживаемые изображения до 10 МБ каждое")
            return
          }
          setPending(true)
          uploading(true)
          try { const result = await sdk.admin.upload.create({ files }); add(result.files.map((file) => file.url)) }
          catch (error) { toast.error("Не удалось загрузить фото", { description: (error as Error).message }) }
          finally { setPending(false); uploading(false) }
        }} />
      </label>
    </div>
    {!!images.length && <ul className="flex flex-wrap gap-2">{images.map((image, index) => <li key={image} className="flex w-28 flex-col gap-1 rounded border border-ui-border-base p-2">
      <img src={image} alt={`Фото ${index + 1}`} className="h-20 w-full object-contain" />
      {index === 0 ? <Badge size="2xsmall" className="self-start">Основное</Badge> : <Button type="button" size="small" variant="secondary" disabled={pending} onClick={() => change([image, ...images.filter((item) => item !== image)])}>Сделать первым</Button>}
      <Button type="button" size="small" variant="transparent" aria-label={`Убрать фото ${index + 1}`} disabled={pending} onClick={() => change(images.filter((item) => item !== image))}>Убрать</Button>
    </li>)}</ul>}
  </div>
}

function AttributeRows({ attributes, definitions, change, prefix }: {
  attributes: EditableAttribute[]; definitions: CatalogDefinitionData[]
  change: (rows: EditableAttribute[]) => void; prefix: string
}) {
  const patch = (code: string, row: Partial<EditableAttribute>) => change(attributes.map((item) => item.code === code ? { ...item, ...row } : item))
  return <div className="flex flex-col gap-2">
    {attributes.map((item) => {
      const definition = definitions.find((row) => row.code === item.code)
      const label = `${definition?.label ?? item.code}${definition?.unit ? ` (${definition.unit})` : ""}`
      const local = isProductSpecificationCode(item.code)
      return <div key={item.code} className="flex flex-wrap items-end gap-2">
        {local && <div className="min-w-48 flex-1">
          <Field id={`spec-name-${item.code}`} label="Название характеристики"><Input id={`spec-name-${item.code}`} value={item.label ?? ""} maxLength={150}
            onChange={(event) => patch(item.code, { label: event.target.value })} /></Field>
        </div>}
        <div className="min-w-52 flex-1">
          <Field id={`${prefix}-${item.code}`} label={local ? "Значение характеристики" : label}>
            <Input id={`${prefix}-${item.code}`} aria-label={local ? undefined : `${prefix} · ${label}`} value={item.values.join("|")}
              onChange={(event) => patch(item.code, { values: event.target.value.split("|") })} />
          </Field>
        </div>
        <Button type="button" size="small" variant="transparent" onClick={() => change(attributes.filter((row) => row.code !== item.code))}>Убрать</Button>
      </div>
    })}
    {attributes.length > 0 && <Text size="xsmall" className="text-ui-fg-subtle">Несколько значений разделяйте знаком |.</Text>}
  </div>
}

function ConfirmStock({ variant, locations, close, after }: { variant: Variant; locations: ProductDetail["locations"]; close: () => void; after: () => Promise<void> }) {
  const [location, setLocation] = useState(locations[0]?.id ?? "")
  const [quantity, setQuantity] = useState(variant.stock.levels.find((level) => level.location_id === location)?.stocked_quantity ?? 0)
  const [reason, setReason] = useState("")
  const confirm = useMutation({
    mutationFn: () => sdk.client.fetch(`/admin/catalog-cms/stock/${variant.id}`, { method: "POST", body: { location_id: location, quantity, reason } }),
    onSuccess: async () => { await after(); close(); toast.success("Остаток подтверждён") },
    onError: (error: Error) => toast.error("Остаток не сохранён", { description: error.message }),
  })
  return <Drawer open onOpenChange={(open) => { if (!open && !confirm.isPending) close() }}>
    <Drawer.Content><Drawer.Header><Drawer.Title>Подтвердить остаток</Drawer.Title><Drawer.Description>{variant.title}</Drawer.Description></Drawer.Header>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); confirm.mutate() }}>
        <Drawer.Body className="flex flex-col gap-4">
          <Field label="Склад" id="variant-stock-location"><Select value={location} onValueChange={(value) => { setLocation(value); setQuantity(variant.stock.levels.find((level) => level.location_id === value)?.stocked_quantity ?? 0) }}>
            <Select.Trigger id="variant-stock-location"><Select.Value placeholder="Выберите склад" /></Select.Trigger><Select.Content>{locations.map((row) => <Select.Item key={row.id} value={row.id}>{row.name}</Select.Item>)}</Select.Content>
          </Select></Field>
          <Field id="variant-stock-quantity" label="Фактическое количество"><Input id="variant-stock-quantity" type="number" min={0} max={1000000} required value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></Field>
          <Field id="variant-stock-reason" label="Основание проверки"><Input id="variant-stock-reason" required minLength={5} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
        </Drawer.Body>
        <Drawer.Footer><Button type="button" variant="secondary" onClick={close}>Отмена</Button><Button type="submit" disabled={!location} isLoading={confirm.isPending}>Подтвердить</Button></Drawer.Footer>
      </form>
    </Drawer.Content>
  </Drawer>
}

function ProductForm({ detail, data, definitions, initialVariant, close, locate, onBusy }: {
  detail?: ProductDetail; data: GraphData; definitions: CatalogDefinitionData[]; initialVariant?: string
  close: () => void; locate: (id: string) => void; onBusy: (busy: boolean) => void
}) {
  const client = useQueryClient()
  const [tab, setTab] = useState(initialVariant ? "variants" : "basic")
  const [initial, setInitial] = useState(detail)
  const [title, setTitle] = useState(detail?.title ?? "")
  const [handle, setHandle] = useState(detail?.handle ?? "")
  const [kind, setKind] = useState(detail?.kind ?? data.profile.product_types.find((type) => type.enabled)?.code ?? "")
  const [brand, setBrand] = useState(detail?.brand ?? "")
  const [family, setFamily] = useState<string>()
  const [newFamilyName, setNewFamilyName] = useState("")
  const parentCategories = new Set(data.categories.map((category) => category.parent_category_id))
  const modelCategories = data.categories.filter((category) =>
    !parentCategories.has(category.id) && (!category.metadata?.catalog_kind || category.metadata.catalog_kind === kind))
  const attachedModels = modelCategories.filter((category) => detail?.categories.some(({ id }) => id === category.id))
  const [familyCategory, setFamilyCategory] = useState(attachedModels.length === 1 ? attachedModels[0].id : "")
  const familyQuery = useQuery({
    queryKey: [...constructorKey, "families", familyCategory],
    queryFn: () => sdk.client.fetch<{ families: ProductFamily[] }>(`${constructorPath}/products/families`, { query: { category_id: familyCategory } }),
    enabled: !!familyCategory,
  })
  const familyOptions = familyQuery.data?.families.filter((option) => option.kind === kind) ?? []
  const automaticFamily = detail?.imported && !detail.family_id
    ? familyOptions.find((option) => option.inferred && option.members.some(({ id }) => id === detail.id))
    : undefined
  const assignedFamily = detail?.family_id && familyOptions.find((option) => option.members.some(({ id }) => id === detail.id))
  const selectedFamily = family ?? (assignedFamily || undefined)?.id ?? detail?.family_id ?? automaticFamily?.id ?? "none"
  const creatingFamily = selectedFamily === "new"
  const familyId = family === undefined && detail?.family_id ? detail.family_id
    : selectedFamily === "none" || creatingFamily || selectedFamily === automaticFamily?.id ? null : selectedFamily
  const familyChanged = creatingFamily || familyId !== (detail?.family_id ?? null)
  const [seo, setSeo] = useState(detail?.seo ?? { title: "", description: "" })
  const [images, setImages] = useState<string[] | undefined>()
  const [description, setDescription] = useState<string>()
  const [attributes, setAttributes] = useState(editableAttributes(detail?.attributes))
  const [variantSpec, setVariantSpec] = useState(detail?.variant_spec_fields ?? [])
  const templateAxes = (type: string) => (data.profile.product_types.find((entry) => entry.code === type)?.variant_axes ?? [])
    .filter((code) => definitions.some((field) => field.code === code && isVariationField(field) && field.enabled && field.public))
  const [axes, setAxes] = useState(detail ? detail.axes.map(({ code }) => code) : templateAxes(kind))
  const [variants, setVariants] = useState<VariantDraft[]>(detail?.variants.map((variant) => ({
    id: variant.id, key: variant.id, title: variant.title, sku: variant.sku,
    price: variant.price ?? undefined, old_price: variant.old_price, attributes: editableAttributes(variant.attributes), choices: variant.choices,
  })) ?? [newVariant()])
  const [activeVariant, setActiveVariant] = useState(initialVariant)
  const [showVariantDetails, setShowVariantDetails] = useState(!!initialVariant)
  const [stock, setStock] = useState<Variant>()
  const [uploading, setUploading] = useState(false)
  const baseAxes = detail?.axes.map((axis) => axis.code) ?? []
  const fields = new Map(definitions.map((field) => [field.code, field]))
  const fieldLabel = (code: string) => code === variantPriceField ? "Цена" : fields.get(code)?.label ?? code
  const active = variants.find((row) => row.key === activeVariant) ?? variants[0]
  const activeStock = initial?.variants.find((row) => row.id === active.id)
  const patchVariant = (key: string, patch: Partial<VariantDraft>) => setVariants((previous) => previous.map((row) => row.key === key ? { ...row, ...patch } : row))
  const availableAxes = definitions.filter((definition) =>
    isVariationField(definition) && definition.enabled && definition.public && definition.choice_values?.length && !axes.includes(definition.code),
  )
  const valuesByAxis = new Map(axes.map((code) => [code, [...new Set(variants.flatMap((row) => row.choices?.[code] ? [row.choices[code]] : []))]]))
  const emptyNewTemplate = !detail && variants.length === 1 && axes.every((code) => !variants[0].choices?.[code]?.trim())
  const displayableVariantFields = [
    ...axes.filter((code) => valuesByAxis.get(code)?.length),
    ...(variants.some((row) => row.price !== undefined) ? [variantPriceField] : []),
  ]
  const shownVariantFields = displayableVariantFields.filter((code) => variantSpec.includes(code))
  const changeKind = (next: string) => {
    setKind(next)
    setFamilyCategory("")
    setFamily("none")
    if (emptyNewTemplate) setAxes(templateAxes(next))
  }
  const removeAxis = (code: string) => {
    setAxes((previous) => previous.filter((item) => item !== code))
    setVariants((previous) => previous.map((row) => ({
      ...row, choices: Object.fromEntries(Object.entries(row.choices ?? {}).filter(([key]) => key !== code)),
    })))
    setVariantSpec((previous) => previous.filter((item) => item !== code))
  }
  const refreshStock = async () => {
    if (!detail) return
    const refreshed = await sdk.client.fetch<ProductDetail>(`${constructorPath}/products/${detail.id}`)
    setInitial(refreshed)
    client.setQueryData([...constructorKey, "product", detail.id], refreshed)
    await client.invalidateQueries({ queryKey: [...constructorKey, "variants"] })
  }
  const save = useMutation({
    mutationFn: (visible: boolean) => {
      const normalizeRows = (rows: EditableAttribute[]) => rows.map((row) => ({ ...row, values: row.values.map((value) => value.trim()) }))
      const savedAxes = emptyNewTemplate && !visible ? [] : axes
      const axesChanged = savedAxes.length !== baseAxes.length || savedAxes.some((code, index) => code !== baseAxes[index])
      const baseSpec = initial?.variant_spec_fields ?? []
      const specChanged = variantSpec.length !== baseSpec.length || variantSpec.some((code) => !baseSpec.includes(code))
      const body: ConstructorProductBody = {
        id: detail?.id, revision: initial?.revision, visible, kind, brand, title,
        handle: handle && handle !== detail?.handle ? handle : undefined,
        images: images && JSON.stringify(images) !== JSON.stringify(detail?.images ?? []) ? images : undefined,
        description_html: description !== (detail?.description_html ?? "") ? description : undefined,
        family_id: familyId, seo,
        family_category_id: familyChanged && (creatingFamily || familyId) ? familyCategory : undefined,
        new_family_name: creatingFamily ? newFamilyName.trim() : undefined,
        attributes: normalizeRows(attributes),
        axes: axesChanged || !detail ? savedAxes.map((code) => ({ code })) : undefined,
        variant_spec_fields: specChanged ? shownVariantFields.filter((code) => code === variantPriceField || savedAxes.includes(code)) : undefined,
        variants: variants.map(({ key: _key, ...row }) => {
          const before = initial?.variants.find((variant) => variant.id === row.id)
          const choices = Object.fromEntries(Object.entries(row.choices ?? {}).filter(([code, value]) => savedAxes.includes(code) && before?.choices[code] !== value))
          return {
            ...row,
            sku: before?.sku === row.sku ? undefined : row.sku,
            price: (before?.price ?? undefined) === row.price ? undefined : row.price,
            attributes: normalizeRows(row.attributes),
            choices,
          }
        }),
      }
      onBusy(true)
      return sdk.client.fetch<{ id: string }>(`${constructorPath}/products`, { method: "POST", body })
    },
    onSuccess: async ({ id }, visible) => {
      await client.invalidateQueries({ queryKey: constructorKey })
      toast.success(visible ? "Товар опубликован" : "Черновик сохранён")
      if (!detail) locate(id)
      else close()
    },
    onError: (error: Error) => toast.error("Товар не сохранён", { description: error.message }),
    onSettled: () => onBusy(false),
  })
  const canPublish = !!detail && detail.categories.some((category) => data.categories.some((folder) => folder.id === category.id && folder.public && (!folder.metadata?.catalog_kind || folder.metadata.catalog_kind === kind)))
  const valid = !!title.trim() && !!kind && !uploading && variants.every((row) => {
    const previous = detail?.variants.find((variant) => variant.id === row.id)
    return row.title.trim() && (emptyNewTemplate || axes.every((code) => row.choices?.[code]?.trim() || (previous && baseAxes.includes(code) && row.choices?.[code] === undefined && previous.choices[code] === undefined)))
  })
  const requestSave = (visible: boolean) => {
    if (!valid) { toast.error("Проверьте название и значения всех вариантов"); return }
    if (familyChanged && (creatingFamily || familyId) && (!familyCategory || !brand.trim() || (creatingFamily && !newFamilyName.trim()))) {
      setTab("basic")
      toast.error("Укажите категорию, бренд и название семейства")
      return
    }
    if (attributes.some((row) => isProductSpecificationCode(row.code) && (!row.label?.trim() || row.values.some((value) => !value.trim())))) {
      setTab("attributes")
      toast.error("Укажите название и значение новой характеристики")
      return
    }
    const combination = (row: Pick<VariantDraft, "choices">) => JSON.stringify(axes.map((code) => row.choices?.[code] ?? null))
    const combinations = variants.map(combination)
    if (axes.length && variants.some((row, index) => {
      const previous = detail?.variants.find((item) => item.id === row.id)
      return (!previous || combinations[index] !== combination(previous)) && combinations.some((key, other) => index !== other && key === combinations[index])
    })) {
      setTab("variants")
      toast.error("Каждое сочетание значений должно быть уникальным")
      return
    }
    if (variants.some((row) => row.price === undefined && initial?.variants.some((before) => before.id === row.id && before.price !== null))) {
      setTab("variants")
      toast.error("Укажите цену сочетания")
      return
    }
    save.mutate(visible)
  }
  return <>
    <FocusModal.Header>
      <div className="ml-auto flex flex-wrap gap-2">
        {detail?.visible && <Button type="button" size="small" variant="secondary" disabled={uploading || save.isPending} onClick={() => requestSave(false)}>Снять с публикации</Button>}
        {!detail?.visible && canPublish && <Button type="button" size="small" variant="secondary" disabled={uploading || save.isPending} onClick={() => requestSave(true)}>Опубликовать</Button>}
        <Button type="button" size="small" disabled={uploading} isLoading={save.isPending} onClick={() => requestSave(detail?.visible ?? false)}>{detail?.visible ? "Сохранить" : "Сохранить черновик"}</Button>
      </div>
    </FocusModal.Header>
    <FocusModal.Body className="overflow-auto">
      <div className={`mx-auto flex flex-col gap-5 p-6 ${tab === "variants" ? "max-w-4xl" : "max-w-6xl"}`}>
        <div className="flex flex-wrap items-center gap-2"><FocusModal.Title>{detail?.title ?? "Новый товар"}</FocusModal.Title><Badge color={detail?.visible ? "green" : "grey"}>{productStatus(detail?.status ?? "draft")}</Badge></div>
        <FocusModal.Description className="text-ui-fg-subtle">{canPublish || detail?.visible ? "Карточка, характеристики и реальные сочетания вариантов." : "Для публикации сохраните товар и проведите стрелку от опубликованной категории совместимого типа."}</FocusModal.Description>
        <Tabs value={tab} onValueChange={setTab}>
          <Tabs.List><Tabs.Trigger value="basic">Основное</Tabs.Trigger><Tabs.Trigger value="attributes">Характеристики</Tabs.Trigger><Tabs.Trigger value="variants">Варианты</Tabs.Trigger></Tabs.List>
          <Tabs.Content value="basic" forceMount className="data-[state=inactive]:hidden">
            <div className="mt-4 flex flex-col gap-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="md:col-span-2"><Field id="product-title" label="Название"><Input id="product-title" required maxLength={250} value={title} onChange={(event) => setTitle(event.target.value)} /></Field></div>
                <Field id="product-sku" label="Основной SKU"><Input id="product-sku" maxLength={250} value={variants[0].sku ?? ""} onChange={(event) => patchVariant(variants[0].key, { sku: event.target.value || null })} /></Field>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Field id="product-handle" label="Адрес"><Input id="product-handle" value={handle} placeholder={constructorSlug(title) || "Из названия"} maxLength={200} onChange={(event) => setHandle(event.target.value)} /></Field>
                <Field id="product-kind" label="Тип товара"><Select value={kind} onValueChange={changeKind}><Select.Trigger id="product-kind"><Select.Value /></Select.Trigger><Select.Content>{data.profile.product_types.filter((row) => row.enabled).map((row) => <Select.Item key={row.code} value={row.code}>{row.label}</Select.Item>)}</Select.Content></Select></Field>
                <Field id="product-brand" label="Бренд"><Input id="product-brand" value={brand} maxLength={100} onChange={(event) => setBrand(event.target.value)} /></Field>
              </div>
              <div className="flex flex-wrap items-center gap-2"><Text size="small">Категории · {detail?.categories.map((category) => category.name).join(", ") || "Без категории"}</Text>{detail && <Button type="button" size="small" variant="secondary" onClick={() => locate(detail.id)}>Связи на схеме</Button>}</div>
              <MediaEditor images={images ?? detail?.images ?? []} change={setImages} uploading={setUploading} />
              <RichTextEditor label="Описание товара" html={detail?.description_html ?? ""} onChange={setDescription} />
              <section className="grid gap-3 rounded border border-ui-border-base p-3" aria-label="Семейство товара">
                <Text size="small" weight="plus">Семейство товара</Text>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field id="product-family-category" label="Категория семейства">
                    <Select value={familyCategory} onValueChange={(value) => { setFamilyCategory(value); setFamily("none") }}>
                      <Select.Trigger id="product-family-category"><Select.Value placeholder="Выберите категорию модели" /></Select.Trigger>
                      <Select.Content>{(attachedModels.length ? attachedModels : modelCategories).map((category) =>
                        <Select.Item key={category.id} value={category.id}>{category.name}</Select.Item>)}</Select.Content>
                    </Select>
                  </Field>
                  <Field id="product-family" label="Семейство">
                    <Select value={selectedFamily} onValueChange={(value) => {
                      setFamily(value)
                      const option = familyOptions.find((entry) => entry.id === value)
                      if (option && !brand.trim()) setBrand(option.brand)
                    }} disabled={!familyCategory || familyQuery.isPending || familyQuery.isError}>
                      <Select.Trigger id="product-family"><Select.Value /></Select.Trigger>
                      <Select.Content>
                        <Select.Item value="none">{detail?.imported ? "Автоматически по модели" : "Без семейства"}</Select.Item>
                        {detail?.family_id && !familyOptions.some((option) => option.id === detail.family_id) && <Select.Item value={detail.family_id}>{detail.family_id}</Select.Item>}
                        {familyOptions.map((option) => <Select.Item key={option.id} value={option.id}>{option.label} ({option.members.length})</Select.Item>)}
                        <Select.Item value="new">Создать семейство</Select.Item>
                      </Select.Content>
                    </Select>
                  </Field>
                </div>
                {familyCategory && familyQuery.isPending && <Text role="status" size="small">Загрузка семейств…</Text>}
                {familyQuery.isError && <div className="flex items-center gap-2"><Text role="alert" size="small">Не удалось загрузить семейства.</Text><Button type="button" size="small" variant="secondary" onClick={() => familyQuery.refetch()}>Повторить</Button></div>}
                {creatingFamily && <Field id="new-product-family" label="Название нового семейства"><Input id="new-product-family" value={newFamilyName} maxLength={87} onChange={(event) => setNewFamilyName(event.target.value)} /></Field>}
              </section>
              <details className="rounded border border-ui-border-base p-3"><summary className="cursor-pointer text-sm font-medium">SEO</summary><div className="mt-3 grid gap-3">
                <Field id="product-seo-title" label="SEO-заголовок"><Input id="product-seo-title" maxLength={150} value={seo.title} onChange={(event) => setSeo({ ...seo, title: event.target.value })} /></Field>
                <Field id="product-seo-description" label="SEO-описание"><Input id="product-seo-description" maxLength={500} value={seo.description} onChange={(event) => setSeo({ ...seo, description: event.target.value })} /></Field>
              </div></details>
            </div>
          </Tabs.Content>
          <Tabs.Content value="attributes">
            <div className="mt-4 flex flex-col gap-3">
              {displayableVariantFields.length > 0 && <fieldset className="flex flex-col gap-2 rounded border border-ui-border-base p-3">
                <legend className="px-1 text-sm font-medium">Характеристики из выбранной вариации</legend>
                <div className="flex flex-wrap items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenu.Trigger asChild><Button type="button" size="small" variant="secondary">Выбрать поля <ChevronDown /></Button></DropdownMenu.Trigger>
                    <DropdownMenu.Content align="start">
                      {displayableVariantFields.map((code) => <DropdownMenu.CheckboxItem
                        key={code}
                        checked={variantSpec.includes(code)}
                        onCheckedChange={(checked) => setVariantSpec((previous) => checked ? [...new Set([...previous, code])] : previous.filter((item) => item !== code))}
                        onSelect={(event) => event.preventDefault()}
                      >{fieldLabel(code)}</DropdownMenu.CheckboxItem>)}
                    </DropdownMenu.Content>
                  </DropdownMenu>
                  {shownVariantFields.map((code) => <Badge key={code}>{fieldLabel(code)}</Badge>)}
                </div>
              </fieldset>}
              <AttributeRows attributes={attributes} definitions={definitions} prefix="Товар" change={setAttributes} />
              <Button type="button" size="small" variant="secondary" className="self-start" disabled={attributes.length >= 150} onClick={() => {
                setAttributes((previous) => [...previous, { code: productSpecificationPrefix + crypto.randomUUID().replace(/-/g, ""), label: "", values: [""] }])
              }}>Добавить характеристику</Button>
            </div>
          </Tabs.Content>
          <Tabs.Content value="variants">
            <div className="mt-4 flex flex-col gap-4">
              {variants.length > 1 && <div className="max-w-lg">
                <Field id="product-combination" label="Сочетание">
                  <Select value={active.key} onValueChange={setActiveVariant}>
                    <Select.Trigger id="product-combination"><Select.Value /></Select.Trigger>
                    <Select.Content>{variants.map((row, index) => {
                      const values = axes.flatMap((code) => row.choices?.[code] ? [row.choices[code]] : [])
                      return <Select.Item key={row.key} value={row.key}>{values.join(" · ") || row.title || `Сочетание ${index + 1}`}</Select.Item>
                    })}</Select.Content>
                  </Select>
                </Field>
              </div>}
              <section className="flex flex-col gap-3 rounded-md border border-ui-border-base p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Text weight="plus">Поля вариаций</Text>
                  {availableAxes.length > 0 && <div className="w-full sm:w-64">
                    <Select value="" onValueChange={(code) => setAxes((previous) => [...new Set([...previous, code])])}>
                      <Select.Trigger aria-label="Добавить из библиотеки"><Select.Value placeholder="Добавить из библиотеки" /></Select.Trigger>
                      <Select.Content>{availableAxes.map((row) => <Select.Item key={row.code} value={row.code}>{row.label}</Select.Item>)}</Select.Content>
                    </Select>
                  </div>}
                </div>
                {axes.length ? <ul className="flex flex-col gap-2">
                  {axes.map((code) => <li key={code} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-ui-border-base px-3 py-2">
                    <Text size="small" weight="plus" className="min-w-40 flex-1">{fieldLabel(code)}</Text>
                    <div className="w-full sm:w-64">
                      <VariationValue definition={fields.get(code)} value={active.choices?.[code] ?? ""} label={fieldLabel(code)}
                        change={(value) => patchVariant(active.key, { choices: { ...active.choices, [code]: value } })} />
                    </div>
                    <Button type="button" size="small" variant="transparent" aria-label={`Отвязать поле ${fieldLabel(code)}`} onClick={() => removeAxis(code)}>Отвязать</Button>
                  </li>)}
                </ul> : <Text size="small" className="text-ui-fg-subtle">Выберите поле из библиотеки, чтобы прикрепить его к товару.</Text>}
              </section>
              <section className="flex flex-wrap items-end gap-4 rounded-md border border-ui-border-base p-4">
                <Field id="active-variant-price" label={`Цена · ${data.profile.currency_code.toUpperCase()}`}>
                  <Input id="active-variant-price" aria-label="Цена варианта" type="number" min={0} step="any" value={active.price ?? ""}
                    onChange={(event) => patchVariant(active.key, { price: event.target.value === "" ? undefined : Number(event.target.value) })} />
                </Field>
                <div className="flex min-h-8 flex-wrap items-center gap-2">
                  <Text size="small" weight="plus">Остаток</Text>
                  <Text size="small">{activeStock ? stockLabel(activeStock.stock) : "Не подтверждено"}</Text>
                  {activeStock && <Button type="button" size="small" variant="transparent" onClick={() => setStock(activeStock)}>Подтвердить</Button>}
                </div>
              </section>
              <Button className="self-start" type="button" size="small" variant="secondary" aria-expanded={showVariantDetails} onClick={() => setShowVariantDetails(!showVariantDetails)}>Настроить сочетание</Button>
              {showVariantDetails && <div className="flex flex-col gap-3 rounded border border-ui-border-base p-3">
                <Text size="small" weight="plus">Настройки сочетания</Text>
                <div className="grid gap-2 md:grid-cols-2">
                  <Field id="variant-title" label="Название сочетания"><Input id="variant-title" maxLength={250} value={active.title} onChange={(event) => patchVariant(active.key, { title: event.target.value })} /></Field>
                  {active.key !== variants[0].key && <Field id="variant-sku" label="SKU"><Input id="variant-sku" maxLength={250} value={active.sku ?? ""} onChange={(event) => patchVariant(active.key, { sku: event.target.value || null })} /></Field>}
                  <Field id="variant-compare" label="Цена до скидки"><Input id="variant-compare" type="number" min={0} step="any" value={active.old_price ?? ""} onChange={(event) => patchVariant(active.key, { old_price: event.target.value === "" ? null : Number(event.target.value) })} /></Field>
                </div>
                <AttributeRows attributes={active.attributes.filter((row) => !axes.includes(row.code))} definitions={definitions} prefix="Вариант" change={(rows) => patchVariant(active.key, { attributes: [...active.attributes.filter((row) => axes.includes(row.code)), ...rows] })} />
              </div>}
            </div>
          </Tabs.Content>
        </Tabs>
      </div>
    </FocusModal.Body>
    {stock && <ConfirmStock variant={stock} locations={initial?.locations ?? []} close={() => setStock(undefined)} after={refreshStock} />}
  </>
}

export function ProductEditor({ id, variant, data, definitions, close, locate }: {
  id?: string; variant?: string; data: GraphData; definitions: CatalogDefinitionData[]; close: () => void; locate: (id: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const query = useQuery({
    queryKey: [...constructorKey, "product", id],
    queryFn: () => sdk.client.fetch<ProductDetail>(`${constructorPath}/products/${id}`),
    enabled: !!id,
  })
  return <FocusModal open onOpenChange={(open) => { if (!open && !busy) close() }}>
    <FocusModal.Content>
      {id && !query.data ? <><FocusModal.Header /><FocusModal.Body className="p-6">
        <FocusModal.Title>Товар</FocusModal.Title><FocusModal.Description>{query.isError ? query.error.message : "Загрузка товара…"}</FocusModal.Description>
        {query.isError && <Button type="button" variant="secondary" onClick={() => query.refetch()}>Повторить</Button>}
      </FocusModal.Body></> : <ProductForm detail={query.data} data={data} definitions={definitions} initialVariant={variant} close={close} locate={locate} onBusy={setBusy} />}
    </FocusModal.Content>
  </FocusModal>
}

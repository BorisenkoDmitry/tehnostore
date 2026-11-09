import { Button, Container, Heading, Input, Label, Select, Switch, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../lib/sdk"
import type { CatalogProfileBody } from "../../api/admin/catalog-cms/validators"
import type { CatalogDefinitionData } from "../../lib/catalog-cms"

type Response = { profile: (CatalogProfileBody & { id: string }) | null; regions: { id: string; name: string; currency_code: string }[] }

export const CatalogProfileEditor = ({ definitions, typesOnly = false, onSaved }: { definitions: CatalogDefinitionData[]; typesOnly?: boolean; onSaved?: () => void }) => {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ["catalog-profile"], queryFn: () => sdk.client.fetch<Response>("/admin/catalog-cms/profile") })
  const [draft, setDraft] = useState<CatalogProfileBody | null>(null)
  const save = useMutation({ mutationFn: (body: CatalogProfileBody) => sdk.client.fetch("/admin/catalog-cms/profile", { method: "POST", body }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["catalog-profile"] }); await client.invalidateQueries({ queryKey: ["catalog-cms-product"] }); await client.invalidateQueries({ queryKey: ["catalog-categories"] }); await client.invalidateQueries({ queryKey: ["catalog-constructor"] }); setDraft(null); toast.success(typesOnly ? "Типы товаров сохранены" : "Профиль магазина сохранён"); onSaved?.() }, onError: (error: Error) => toast.error("Не удалось сохранить", { description: error.message }) })
  if (query.isLoading) return <Container><Text>Загрузка профиля…</Text></Container>
  if (query.isError || !query.data) return <Container><Text role="alert">Не удалось загрузить профиль</Text><Button onClick={() => query.refetch()}>Повторить</Button></Container>
  const form = draft ?? (query.data.profile ? { scope: query.data.profile.scope, region_id: query.data.profile.region_id, product_types: query.data.profile.product_types } : { scope: "", region_id: query.data.regions[0]?.id ?? "", product_types: [] })
  const update = (patch: Partial<CatalogProfileBody>) => setDraft({ ...form, ...patch })
  const typeUpdate = (index: number, patch: Partial<CatalogProfileBody["product_types"][number]>) => update({ product_types: form.product_types.map((type, position) => position === index ? { ...type, ...patch } : type) })
  const moveType = (index: number, delta: number) => {
    const types = [...form.product_types]
    ;[types[index], types[index + delta]] = [types[index + delta], types[index]]
    update({ product_types: types })
  }
  return <Container className="flex flex-col gap-4">{!typesOnly && <><Heading level="h2">Профиль установки магазина</Heading><Text size="small" className="text-ui-fg-subtle">Валюта каталога берётся из выбранного региона Medusa.</Text></>}<form onSubmit={(event) => { event.preventDefault(); save.mutate(form) }} className="flex flex-col gap-5">
    {!typesOnly && <>
    <div><Label htmlFor="profile-scope">Пространство каталога</Label><Input id="profile-scope" required readOnly={!!query.data.profile} value={form.scope} pattern="[a-z][a-z0-9_-]{0,79}" onChange={(event) => update({ scope: event.target.value })} /><Text size="small" className="text-ui-fg-subtle">Стабильный код установки; после начальной настройки сохраняется для совместимости данных.</Text></div>
    <div><Label htmlFor="profile-region">Регион Medusa и валюта</Label><Select value={form.region_id} onValueChange={(region_id) => update({ region_id })}><Select.Trigger id="profile-region"><Select.Value /></Select.Trigger><Select.Content>{query.data.regions.map((region) => <Select.Item key={region.id} value={region.id}>{region.name} · {region.currency_code.toUpperCase()}</Select.Item>)}</Select.Content></Select></div>
    </>}
    <div className="flex items-center justify-between">{!typesOnly && <Heading level="h3">Типы товаров</Heading>}<Button type="button" variant="secondary" onClick={() => update({ product_types: [...form.product_types, { code: "", label: "", enabled: true, variant_axes: [], filter_codes: [] }] })}>Добавить тип</Button></div>
    {form.product_types.map((type, index) => <fieldset key={index} className="flex flex-col gap-4 rounded border border-ui-border-base p-4"><legend className="px-1 txt-small-plus">{type.label || "Новый тип"}</legend><div className="grid gap-3 md:grid-cols-2"><div><Label htmlFor={`type-code-${index}`}>Код типа</Label><Input id={`type-code-${index}`} required readOnly={query.data.profile?.product_types.some((saved) => saved.code === type.code)} pattern="[a-z][a-z0-9_-]{0,79}" value={type.code} onChange={(event) => typeUpdate(index, { code: event.target.value })} /></div><div><Label htmlFor={`type-label-${index}`}>Название типа</Label><Input id={`type-label-${index}`} required value={type.label} onChange={(event) => typeUpdate(index, { label: event.target.value })} /></div></div><div className="flex items-center gap-3"><Switch id={`type-enabled-${index}`} checked={type.enabled} onCheckedChange={(enabled) => typeUpdate(index, { enabled })} /><Label htmlFor={`type-enabled-${index}`}>Доступен для публикации</Label></div>
      <fieldset><legend className="txt-small-plus">Шаблон вариаций</legend><Text size="small" className="text-ui-fg-subtle">Поля добавятся в форму нового товара этого типа. Значения и сочетания задаются в самом товаре.</Text><div className="mt-2 grid max-h-48 gap-2 overflow-auto md:grid-cols-2">{definitions.filter((definition) => definition.enabled && definition.public).map((definition) => <Label key={definition.code} className="flex min-h-8 items-center gap-2"><input type="checkbox" checked={type.variant_axes.includes(definition.code)} disabled={!type.variant_axes.includes(definition.code) && type.variant_axes.length >= 10} onChange={(event) => typeUpdate(index, { variant_axes: event.target.checked ? [...type.variant_axes, definition.code] : type.variant_axes.filter((code) => code !== definition.code) })} />{definition.label}</Label>)}</div></fieldset>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" size="small" variant="secondary" disabled={index === 0} onClick={() => moveType(index, -1)}>Выше</Button><Button type="button" size="small" variant="secondary" disabled={index === form.product_types.length - 1} onClick={() => moveType(index, 1)}>Ниже</Button><Button type="button" size="small" variant="danger" onClick={() => update({ product_types: form.product_types.filter((_, position) => position !== index) })}>Убрать тип</Button></div>
    </fieldset>)}
    <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={save.isPending} onClick={() => setDraft(null)}>Отмена</Button><Button type="submit" isLoading={save.isPending}>{typesOnly ? "Сохранить типы" : "Сохранить профиль"}</Button></div>
  </form></Container>
}

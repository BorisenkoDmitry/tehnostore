import { Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { ContentValue } from "../../modules/content/types"
import { sdk } from "../lib/sdk"
import { ContentTreeEditor, contentFieldLabel } from "./content-tree-editor"

type SettingsData = Record<string, ContentValue>
type Settings = { data: SettingsData; revision: number; published_at: string | null }
type SettingsDraft = { data: SettingsData; revision?: number }

const storeDefaults: SettingsData = {
  brand: { name: "", logo_url: "", logo_alt: "", catalog_image: "", catalog_tagline: "" },
  contacts: { phone: "", email: "", address: "", departments: [] },
  company: { name: "", inn: "", kpp: "", ogrn: "", address: "" },
  social: [],
  legal: { offer_slug: "", privacy_slug: "", terms_slug: "", personal_data_slug: "" },
}
const footerDefaults: SettingsData = {
  footer: { text: "", columns: [] },
  footer_display: { logo_src: "", logo_alt: "", payment_logos: [] },
}
const footerFields = new Set(Object.keys(footerDefaults))
const isStoreField = (key: string) => !footerFields.has(key)
const settingsKey = ["content-settings"]

export function ContentSettingsEditor({ section }: { section: "store" | "footer" }) {
  const client = useQueryClient()
  const [draft, setDraft] = useState<SettingsDraft | null>(null)
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: settingsKey,
    queryFn: () => sdk.client.fetch<{ settings: Settings | null }>("/admin/content/settings"),
  })
  const settings = data?.settings
  const isFooter = section === "footer"
  const visibleData = draft?.data ?? settings?.data ?? {}
  const sections = Object.entries(visibleData).filter(([key]) => footerFields.has(key) === isFooter && !key.endsWith("_import_version"))
  const refresh = () => client.invalidateQueries({ queryKey: settingsKey })

  const publish = useMutation({
    mutationFn: () => sdk.client.fetch("/admin/content/settings/publish", { method: "POST" }),
    onSuccess: () => toast.success("Настройки опубликованы"),
    onError: (error: Error) => toast.error("Не удалось опубликовать настройки", { description: error.message }),
    onSettled: refresh,
  })
  const save = useMutation({
    mutationFn: ({ draft }: { draft: SettingsDraft; publishAfterSave: boolean }) =>
      sdk.client.fetch("/admin/content/settings", { method: "POST", body: { data: draft.data, expected_revision: draft.revision } }),
    onSuccess: async (_, { publishAfterSave }) => {
      setDraft(null)
      if (publishAfterSave) publish.mutate()
      else {
        await refresh()
        toast.success("Черновик сохранён")
      }
    },
    onError: (error: Error) => toast.error("Не удалось сохранить настройки", { description: error.message }),
  })
  const startEditing = () => {
    const savedData = settings?.data
    const data = { ...(isFooter ? footerDefaults : storeDefaults), ...savedData }
    if (!isFooter) {
      data.brand = { ...storeDefaults.brand as SettingsData, ...savedData?.brand as SettingsData }
    }
    setDraft({ data, revision: settings?.revision })
  }

  return <Container>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <Heading level="h1">{isFooter ? "Подвал" : "Данные магазина"}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {isFooter ? "Ссылки, текст и оформление подвала витрины." : "Контакты, реквизиты, социальные сети и юридические страницы."}
        </Text>
        <Text size="small" className="text-ui-fg-subtle">Публикация применяет общий черновик данных магазина и подвала.</Text>
      </div>
      {!draft && <div className="flex flex-wrap gap-2">
        <Button size="small" variant="secondary" disabled={isLoading || !!error || publish.isPending} onClick={startEditing}>Изменить</Button>
        {settings && <Button size="small" isLoading={publish.isPending} onClick={() => publish.mutate()}>Опубликовать черновик</Button>}
      </div>}
    </div>
    {isLoading ? <Text role="status">Загрузка…</Text> : error ? <div>
      <Text role="alert">Не удалось загрузить настройки.</Text>
      <Button size="small" onClick={() => refetch()}>Повторить</Button>
    </div> : <div className="flex flex-col gap-4">
      {!draft && <Text size="small">Версия {settings?.revision ?? 0} · {settings?.published_at ? `Публикация ${new Date(settings.published_at).toLocaleString("ru-RU")}` : "Ещё не опубликовано"}</Text>}
      {draft && !isFooter
        ? <ContentTreeEditor name="settings" value={draft.data} isFieldVisible={isStoreField} disabled={save.isPending}
            onChange={(value) => setDraft({ ...draft, data: value as SettingsData })} />
        : sections.map(([key, value]) => <details key={key} open={!!draft} className="rounded-lg border border-ui-border-base p-4">
            <summary className="cursor-pointer font-medium">{contentFieldLabel(key)}</summary>
            <div className="mt-4">
              <ContentTreeEditor name={key} path={key} value={value} disabled={!draft || save.isPending}
                onChange={(next) => draft && setDraft({ ...draft, data: { ...draft.data, [key]: next } })} />
            </div>
          </details>)}
      {draft && <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-ui-border-base bg-ui-bg-base py-4">
        <Button variant="secondary" disabled={save.isPending} onClick={() => setDraft(null)}>Отмена</Button>
        <Button variant="secondary" isLoading={save.isPending && !save.variables?.publishAfterSave} disabled={save.isPending} onClick={() => save.mutate({ draft, publishAfterSave: false })}>Сохранить черновик</Button>
        <Button isLoading={save.isPending && !!save.variables?.publishAfterSave} disabled={save.isPending} onClick={() => save.mutate({ draft, publishAfterSave: true })}>Сохранить и опубликовать</Button>
      </div>}
    </div>}
  </Container>
}

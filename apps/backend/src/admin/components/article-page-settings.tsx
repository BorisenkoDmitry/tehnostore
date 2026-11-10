import { Button, Drawer, Heading, Input, Label, Switch, Text, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { sdk } from "../lib/sdk"
import { ArticleIndexSettingsInput, type ArticleIndexSettingsInputType } from "../../modules/content/article-validation"
import { ImageField } from "./article-fields"

type Settings = Omit<ArticleIndexSettingsInputType, "expected_revision"> & { revision: number }
const SettingsForm = ({ initial, onSaved, onBusy }: { initial: Settings; onSaved: () => void; onBusy: (busy: boolean) => void }) => {
  const { revision, ...data } = initial
  const [draft, setDraft] = useState(data)
  const [uploads, setUploads] = useState(0)
  const [message, setMessage] = useState("")
  const client = useQueryClient()
  const save = useMutation({
    mutationFn: async () => {
      const parsed = ArticleIndexSettingsInput.safeParse({ ...draft, expected_revision: revision })
      if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join("; "))
      return sdk.client.fetch("/admin/content/article-settings", { method: "POST", body: parsed.data })
    },
    onMutate: () => setMessage(""),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["article-page-settings"] }); toast.success("Настройки страницы статей сохранены"); onSaved() },
    onError: (error: Error) => setMessage(error.message),
  })
  useEffect(() => onBusy(save.isPending || uploads > 0), [onBusy, save.isPending, uploads])
  return <form id="article-settings-form" noValidate className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); if (!save.isPending && !uploads) save.mutate() }}>
    {message && <Text role="alert" className="text-ui-fg-error">{message}</Text>}
    <fieldset disabled={save.isPending} className="flex min-w-0 flex-col gap-6">
      <section className="flex flex-col gap-4"><Heading level="h2">Страница со всеми карточками</Heading>
        <div className="flex flex-col gap-2"><Label htmlFor="articles-page-title">Заголовок страницы</Label><Input id="articles-page-title" maxLength={300} aria-required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="articles-page-intro">Вводный текст</Label><Textarea id="articles-page-intro" rows={4} maxLength={5000} placeholder="Кратко расскажите, какие материалы здесь собраны" value={draft.intro} onChange={(event) => setDraft({ ...draft, intro: event.target.value })} /></div>
      </section>
      <section className="flex flex-col gap-4 border-t border-ui-border-base pt-6"><Heading level="h2">SEO страницы</Heading>
        <div className="flex flex-col gap-2"><Label htmlFor="articles-page-meta-title">SEO-заголовок</Label><Input id="articles-page-meta-title" maxLength={300} placeholder="Например: Статьи и советы — Техностор" value={draft.meta_title} onChange={(event) => setDraft({ ...draft, meta_title: event.target.value })} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="articles-page-meta-description">SEO-описание</Label><Textarea id="articles-page-meta-description" rows={3} maxLength={3000} value={draft.meta_description} onChange={(event) => setDraft({ ...draft, meta_description: event.target.value })} /></div>
        <div className="rounded-lg border border-ui-border-base p-4"><Text size="xsmall" className="text-ui-fg-subtle">Предпросмотр в поиске</Text><Text weight="plus" className="mt-2 text-ui-fg-interactive">{draft.meta_title || draft.title || "Статьи"}</Text><Text size="small" className="mt-1 text-ui-fg-subtle">{draft.meta_description || draft.intro || "Здесь появится описание страницы."}</Text></div>
        <ImageField id="articles-page-social-image" label="Изображение для соцсетей" value={draft.social_image} disabled={save.isPending} onUpload={(delta) => setUploads((count) => count + delta)} onChange={(social_image) => setDraft({ ...draft, social_image })} />
        <div className="flex flex-col gap-2"><Label htmlFor="articles-page-canonical">Канонический URL</Label><Input id="articles-page-canonical" placeholder="https://…/articles" value={draft.canonical} onChange={(event) => setDraft({ ...draft, canonical: event.target.value })} /><Text size="xsmall" className="text-ui-fg-subtle">Необязательно. Укажите, если основным должен быть другой адрес страницы.</Text></div>
        <div className="flex items-center gap-3"><Switch id="articles-page-noindex" checked={draft.noindex} onCheckedChange={(noindex) => setDraft({ ...draft, noindex })} /><Label htmlFor="articles-page-noindex">Не индексировать страницу</Label></div>
      </section>
    </fieldset>
  </form>
}

export const ArticlePageSettings = ({ close }: { close: () => void }) => {
  const [busy, setBusy] = useState(false)
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["article-page-settings"], queryFn: ({ signal }) => sdk.client.fetch<{ settings: Settings }>("/admin/content/article-settings", { signal }), gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false })
  return <Drawer open onOpenChange={(open) => { if (!open && !busy) close() }}><Drawer.Content className="w-full sm:max-w-2xl"><Drawer.Header><Drawer.Title>Настройки страницы «Статьи»</Drawer.Title></Drawer.Header><Drawer.Body className="overflow-y-auto"><Drawer.Description className="mb-6">Заголовок, вступление и SEO общей страницы с карточками. Настройки сохраняются в админке и будут использованы при подключении витрины.</Drawer.Description>
    {isLoading ? <Text role="status">Загрузка настроек…</Text> : error ? <div><Text role="alert">Не удалось загрузить настройки.</Text><Button size="small" variant="secondary" onClick={() => refetch()}>Повторить</Button></div> : data && <SettingsForm initial={data.settings} onBusy={setBusy} onSaved={close} />}
  </Drawer.Body><Drawer.Footer><Button size="small" variant="secondary" disabled={busy} onClick={close}>Отмена</Button><Button size="small" form="article-settings-form" type="submit" isLoading={busy} disabled={busy || !data || !!error}>Сохранить настройки</Button></Drawer.Footer></Drawer.Content></Drawer>
}

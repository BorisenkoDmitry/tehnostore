import { Heading, Input, Label, Tabs, Text, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { sdk } from "../lib/sdk"
import { articleDocument } from "../lib/article-document"
import type { ArticleDraft } from "../lib/article-types"
import { ContentArticleInput } from "../../modules/content/article-validation"
import { ArticleImageUrl } from "../../modules/content/article-document"
import { ArticleSeoFields, ImageField } from "./article-fields"

const ArticleBlockEditor = lazy(() => import("./article-block-editor.js"))

export const ArticleForm = ({ initial, onSaved, onBusy }: { initial: ArticleDraft; onSaved: () => void; onBusy: (busy: boolean) => void }) => {
  const initialDocument = useMemo(() => articleDocument(initial.body), [initial.body])
  const [draft, setDraft] = useState<ArticleDraft>(() => ({ id: initial.id, revision: initial.revision, title: initial.title, slug: initial.slug, excerpt: initial.excerpt ?? "", cover_image: initial.cover_image ?? "", cover_alt: initial.cover_alt ?? "", body: initialDocument, metadata: { noindex: true, ...initial.metadata } }))
  const [tab, setTab] = useState("card")
  const [uploads, setUploads] = useState(0)
  const [message, setMessage] = useState("")
  const client = useQueryClient()
  const save = useMutation({
    mutationFn: async () => {
      const { id, revision, ...data } = draft
      const parsed = ContentArticleInput.safeParse({ ...data, expected_revision: revision })
      if (!parsed.success) {
        setTab(parsed.error.issues.some((issue) => issue.path[0] === "body") ? "article" : "card")
        throw new Error(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "))
      }
      return sdk.client.fetch(id ? `/admin/content/articles/${id}` : "/admin/content/articles", { method: "POST", body: parsed.data })
    },
    onMutate: () => setMessage(""),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["content-articles"] }); toast.success("Карточка и статья сохранены"); onSaved() },
    onError: (error: Error) => { setMessage(error.message); toast.error("Не удалось сохранить статью", { description: error.message }) },
  })
  useEffect(() => onBusy(save.isPending || uploads > 0), [onBusy, save.isPending, uploads])
  const upload = (delta: 1 | -1) => setUploads((count) => count + delta)
  return <form id="article-form" noValidate className="flex min-w-0 flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (!save.isPending && !uploads) save.mutate() }}>
    {message && <Text role="alert" className="text-ui-fg-error">{message}</Text>}
    {uploads > 0 && <Text role="status" size="small">Загрузка изображений… Дождитесь завершения перед сохранением.</Text>}
    <Tabs value={tab} onValueChange={setTab}>
      <Tabs.List className="mb-6"><Tabs.Trigger value="card">Карточка</Tabs.Trigger><Tabs.Trigger value="article">Статья</Tabs.Trigger></Tabs.List>
      <Tabs.Content value="card" forceMount className="data-[state=inactive]:hidden">
        <fieldset disabled={save.isPending} className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-2"><Label htmlFor="article-title">Заголовок</Label><Input id="article-title" aria-required maxLength={300} value={draft.title} placeholder="Например: Как выбрать смартфон" onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="article-slug">Адрес статьи (slug)</Label><Input id="article-slug" aria-required maxLength={150} placeholder="kak-vybrat-smartfon" value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} /><Text size="xsmall" className="break-all text-ui-fg-subtle">Ссылка карточки формируется автоматически: /articles/{draft.slug || "adres-stati"}. Латинские буквы, цифры и дефисы.</Text></div>
          <div className="flex flex-col gap-2"><Label htmlFor="article-excerpt">Краткое описание</Label><Textarea id="article-excerpt" rows={4} maxLength={1000} value={draft.excerpt} placeholder="О чём материал и почему его стоит прочитать" onChange={(event) => setDraft({ ...draft, excerpt: event.target.value })} /><Text size="xsmall" className="text-ui-fg-subtle">Текст карточки в общем списке статей. {draft.excerpt.length}/1000</Text></div>
          <ImageField id="article-cover" label="Обложка карточки" value={draft.cover_image} onChange={(cover_image) => setDraft({ ...draft, cover_image })} disabled={save.isPending} onUpload={upload} />
          <div className="flex flex-col gap-2"><Label htmlFor="article-cover-alt">Описание обложки</Label><Input id="article-cover-alt" maxLength={300} value={draft.cover_alt} onChange={(event) => setDraft({ ...draft, cover_alt: event.target.value })} /></div>
          <section className="flex flex-col gap-3"><Heading level="h2">Предпросмотр карточки</Heading><div className="max-w-sm overflow-hidden rounded-lg border border-ui-border-base">
            {draft.cover_image && ArticleImageUrl.safeParse(draft.cover_image).success ? <img src={draft.cover_image} alt={draft.cover_alt} className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center bg-ui-bg-subtle"><Text size="small" className="text-ui-fg-subtle">Обложка статьи</Text></div>}
            <div className="flex flex-col gap-3 p-4"><Heading level="h3" className="break-words">{draft.title || "Заголовок статьи"}</Heading><Text size="small" className="whitespace-pre-wrap break-words text-ui-fg-subtle">{draft.excerpt || "Краткое описание появится здесь."}</Text><Text size="small" weight="plus" className="text-ui-fg-interactive">Читать статью</Text></div>
          </div><Text size="xsmall" className="text-ui-fg-subtle">Так карточка будет связана с полным материалом. Публичная страница появится на следующем этапе.</Text></section>
          <details className="border-t border-ui-border-base pt-5"><summary className="cursor-pointer text-sm font-medium">SEO статьи</summary><div className="mt-4"><ArticleSeoFields value={draft.metadata} onChange={(metadata) => setDraft({ ...draft, metadata })} disabled={save.isPending} onUpload={upload} /></div></details>
        </fieldset>
      </Tabs.Content>
      <Tabs.Content value="article" forceMount className="data-[state=inactive]:hidden">
        <div className="mb-4 flex flex-col gap-2"><Heading level="h2" className="break-words">{draft.title || "Содержимое статьи"}</Heading><Text size="small" className="text-ui-fg-subtle">Пишите прямо в редакторе. Нажмите / для добавления заголовка, списка или изображения. Перетаскивайте блоки за маркер слева.</Text></div>
        <div className="rounded-lg border border-ui-border-base bg-ui-bg-base"><Suspense fallback={<Text role="status" className="p-6">Загрузка редактора…</Text>}><ArticleBlockEditor initial={initialDocument} disabled={save.isPending} onUpload={upload} onChange={(body) => setDraft((current) => ({ ...current, body }))} /></Suspense></div>
      </Tabs.Content>
    </Tabs>
  </form>
}

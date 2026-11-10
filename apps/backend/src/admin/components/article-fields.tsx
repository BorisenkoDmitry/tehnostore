import { Button, Input, Label, Switch, Text, Textarea, toast } from "@medusajs/ui"
import { useRef, useState } from "react"
import { sdk } from "../lib/sdk"
import type { ContentMetadata } from "../../modules/content/types"

export const ImageField = ({ id, label, value, onChange, disabled, onUpload }: { id: string; label: string; value: string; onChange: (url: string) => void; disabled?: boolean; onUpload: (delta: 1 | -1) => void }) => {
  const [loading, setLoading] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const latestChange = useRef(onChange)
  latestChange.current = onChange
  return <div className="flex flex-col gap-2"><Label htmlFor={id}>{label}</Label>
    <div className="flex flex-wrap gap-2"><Input id={id} className="min-w-0 flex-1" value={value} placeholder="Загрузите изображение или вставьте HTTPS-ссылку" disabled={disabled || loading} onChange={(event) => onChange(event.target.value)} /><Button type="button" size="small" variant="secondary" isLoading={loading} disabled={disabled || loading} onClick={() => input.current?.click()}>Загрузить</Button>{value && <Button type="button" size="small" variant="transparent" disabled={disabled || loading} onClick={() => onChange("")}>Убрать</Button>}</div>
    <input ref={input} type="file" aria-label={`Загрузить: ${label}`} className="sr-only" accept="image/jpeg,image/png,image/webp,image/avif" disabled={disabled || loading} onChange={async (event) => {
      const file = event.target.files?.[0]
      if (!file) return
      if (file.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) { toast.error("Выберите JPG, PNG, WebP или AVIF размером до 10 МБ"); event.target.value = ""; return }
      setLoading(true); onUpload(1)
      try { const { files } = await sdk.admin.upload.create({ files: [file] }); if (!files[0]?.url) throw new Error("Сервер не вернул изображение"); latestChange.current(files[0].url) }
      catch (error) { toast.error("Не удалось загрузить изображение", { description: (error as Error).message }) }
      finally { setLoading(false); onUpload(-1); if (input.current) input.current.value = "" }
    }} />
    <Text size="xsmall" className="text-ui-fg-subtle">JPG, PNG, WebP или AVIF, до 10 МБ.</Text>
  </div>
}

export const ArticleSeoFields = ({ value, onChange, disabled, onUpload }: { value: ContentMetadata; onChange: (value: ContentMetadata) => void; disabled: boolean; onUpload: (delta: 1 | -1) => void }) => <div className="flex flex-col gap-4">
  <div className="flex flex-col gap-2"><Label htmlFor="article-seo-title">SEO-заголовок</Label><Input id="article-seo-title" maxLength={300} placeholder="По умолчанию — заголовок статьи" value={value.title ?? ""} disabled={disabled} onChange={(event) => onChange({ ...value, title: event.target.value })} /></div>
  <div className="flex flex-col gap-2"><Label htmlFor="article-seo-description">SEO-описание</Label><Textarea id="article-seo-description" rows={3} maxLength={3000} value={value.description ?? ""} disabled={disabled} onChange={(event) => onChange({ ...value, description: event.target.value })} /></div>
  <ImageField id="article-seo-image" label="Изображение для соцсетей" value={value.image ?? ""} disabled={disabled} onUpload={onUpload} onChange={(url) => onChange({ ...value, image: url || undefined })} />
  <div className="flex flex-col gap-2"><Label htmlFor="article-canonical">Канонический URL</Label><Input id="article-canonical" placeholder="https://…" value={value.canonical ?? ""} disabled={disabled} onChange={(event) => onChange({ ...value, canonical: event.target.value || undefined })} /></div>
  <div className="flex items-center gap-3"><Switch id="article-noindex" checked={value.noindex ?? true} disabled={disabled} onCheckedChange={(noindex) => onChange({ ...value, noindex })} /><Label htmlFor="article-noindex">Не индексировать статью</Label></div>
  <Text size="small" className="text-ui-fg-subtle">Настройки будут применяться при подключении публикации на витрине.</Text>
</div>

import { Button, Input, Label, Select, Switch, Text, Textarea, toast } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { sdk } from "../lib/sdk"
import type { ContentValue } from "../../modules/content/types"

const labels: Record<string, string> = {
  brand: "Название и логотип магазина", logo_url: "Логотип", logo_alt: "Описание логотипа", catalog_image: "Изображение каталога в мобильном меню", catalog_tagline: "Подпись каталога в мобильном меню",
  blocks: "Блок", level: "Уровень заголовка", ordered: "Нумерованный список", artwork: "Изображения", src: "Изображение", width: "Ширина", height: "Высота",
  contacts: "Контакты", company: "Компания и реквизиты", social: "Социальные сети", footer: "Подвал", legal: "Юридические страницы", home: "Главная",
  title: "Заголовок", text: "Текст", description: "Описание", label: "Название", body: "Текст", phone: "Телефон", phoneUri: "Телефон для звонка", email: "Электронная почта", name: "Название", url: "Ссылка", href: "Адрес", alt: "Описание изображения", image: "Изображение", mobileImage: "Мобильное изображение", button: "Текст кнопки", enabled: "Включено", order: "Порядок", items: "Элементы", columns: "Колонки", copyright: "Авторские права", telegram: "Telegram", whatsapp: "WhatsApp", payment_logos: "Логотипы оплаты", page_slug: "Страница", category_id: "Категория", product_id: "Товар", product_ids: "Товары", offer_slug: "Оферта", privacy_slug: "Конфиденциальность", terms_slug: "Условия использования", personal_data_slug: "Согласие на обработку данных", noindex: "Не индексировать", canonical: "Канонический URL", metadata: "SEO", paragraphs: "Абзацы", heading: "Заголовок", content: "Содержимое", rows: "Строки", headers: "Заголовки столбцов", author: "Автор", rating: "Оценка", department: "Отдел", weekdays: "Будни", weekend: "Выходные", extension: "Добавочный номер",
  footer_display: "Оформление подвала", question: "Вопрос", answer: "Ответ", detail: "Подпись", link_label: "Текст ссылки", payment_slug: "Способы оплаты", legal_name: "Юридическое наименование", legal_address: "Юридический адрес", postal_address: "Почтовый адрес", inn: "ИНН", kpp: "КПП", ogrn: "ОГРН", bank: "Банк", bik: "БИК", account: "Расчётный счёт", correspondent_account: "Корреспондентский счёт",
}
const pretty = (key: string) => labels[key] ?? (/^text_\d+$/.test(key) ? "Текст" : /^media_\d+_alt$/.test(key) ? "Описание изображения" : /^media_\d+_srcset$/.test(key) ? "Адаптивное изображение" : /^media_\d+_src$/.test(key) ? "Изображение" : key === "product_handles" ? "Товары подборки" : key === "product_handle" ? "Товар" : key === "sourceHref" ? "Ссылка категории" : key === "slides" ? "Слайды" : key === "sections" ? "Разделы" : key === "icon" ? "Значок" : key === "type" ? "Шаблон блока" : key === "data" ? "Содержимое блока" : key.replace(/_/g, " "))
export const contentFieldLabel = pretty
const clone = (value: ContentValue): ContentValue => {
  if (typeof value === "string") return ""
  if (typeof value === "number") return 0
  if (typeof value === "boolean") return value
  if (Array.isArray(value)) return value.length ? [clone(value[0])] : []
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "id" ? crypto.randomUUID() : ["type", "icon", "width", "height"].includes(key) ? item : clone(item)]))
  return ""
}
const templates: Record<string, ContentValue> = {
  social: { label: "", url: "", enabled: true }, columns: { title: "", items: [] },
  items: { label: "", page_slug: "", category_id: "", href: "", enabled: true },
  payment_logos: { label: "", image: "" }, departments: { name: "", extension: "", weekdays: "", weekend: "" },
  blocks: { id: "", type: "text", enabled: true, order: 0, data: { title: "", text: "" } },
}

const ReferenceField = ({ name, value, onChange, disabled }: { name: string; value: string; onChange: (value: string) => void; disabled?: boolean }) => {
  const [search, setSearch] = useState("")
  const page = name === "page_slug" || name.endsWith("_slug")
  const category = name === "category_id"
  const handle = name === "product_handle"
  const { data, isLoading, isError } = useQuery({
    queryKey: ["content-reference", page ? "pages" : category ? "categories" : handle ? "product-handles" : "products", search, value],
    queryFn: async () => {
      if (page) {
        const { pages } = await sdk.client.fetch<{ pages: { slug: string; title: string }[] }>("/admin/content/pages", { query: { limit: 100 } })
        return pages.map((item) => ({ id: item.slug, title: item.title }))
      }
      if (category) {
        const { product_categories } = await sdk.admin.productCategory.list({ limit: 1000, fields: "id,name" })
        return product_categories.map((item) => ({ id: item.id, title: item.name }))
      }
      const { products } = await sdk.admin.product.list({ limit: 50, q: search || undefined, fields: "id,title,handle" })
      const items = products.map((item) => ({ id: handle ? item.handle! : item.id, title: item.title }))
      if (value && !items.some((item) => item.id === value)) {
        const selected = handle ? (await sdk.admin.product.list({ handle: value, limit: 1, fields: "id,title,handle" })).products[0] : (await sdk.admin.product.retrieve(value, { fields: "id,title,handle" })).product
        if (selected) items.unshift({ id: handle ? selected.handle! : selected.id, title: selected.title })
      }
      return items
    },
  })
  return <div className="flex flex-col gap-2">
    {!page && !category && <Input aria-label="Поиск товара" placeholder="Найти товар по названию" value={search} onChange={(event) => setSearch(event.target.value)} />}
    <Select value={value || "__none"} onValueChange={(item) => onChange(item === "__none" ? "" : item)} disabled={isLoading || disabled}>
      <Select.Trigger aria-label={pretty(name)}><Select.Value placeholder={isLoading ? "Загрузка…" : "Выберите"} /></Select.Trigger>
      <Select.Content><Select.Item value="__none">Не выбрано</Select.Item>{value && !data?.some((item) => item.id === value) && <Select.Item value={value}>{value}</Select.Item>}{data?.map((item) => <Select.Item key={item.id} value={item.id}>{item.title}</Select.Item>)}</Select.Content>
    </Select>
    {isError && <Text size="small" role="alert">Не удалось загрузить варианты.</Text>}
  </div>
}

export const ContentTreeEditor = ({ value, onChange, name = "content", path = "content", disabled = false, isFieldVisible }: {
  value: ContentValue
  onChange: (value: ContentValue) => void
  name?: string
  path?: string
  disabled?: boolean
  isFieldVisible?: (key: string) => boolean
}) => {
  const [field, setField] = useState("")
  const [kind, setKind] = useState("text")
  const [uploading, setUploading] = useState(false)
  const arrayTemplate = useRef(Array.isArray(value) && value.length ? value[0] : undefined)
  const updateArray = (items: ContentValue[]) => onChange(name === "blocks" ? items.map((item, order) => item && typeof item === "object" && !Array.isArray(item) ? { ...item, order } : item) : items)
  if (Array.isArray(value)) return <div className="flex flex-col gap-3">
    {value.map((item, index) => <div className="rounded-lg border border-ui-border-base p-3" key={index}>
      <div className="mb-3 flex items-center justify-between gap-2"><Text size="small" weight="plus">{pretty(name)} {index + 1}</Text><div className="flex gap-1">
        <Button type="button" size="small" variant="transparent" disabled={disabled || index === 0} onClick={() => { const next = [...value]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; updateArray(next) }}>Выше</Button>
        <Button type="button" size="small" variant="transparent" disabled={disabled || index === value.length - 1} onClick={() => { const next = [...value]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; updateArray(next) }}>Ниже</Button>
        <Button type="button" size="small" variant="transparent" disabled={disabled} onClick={() => updateArray(value.filter((_, position) => index !== position))}>Удалить</Button>
      </div></div>
      <ContentTreeEditor value={item} name={name === "product_ids" ? "product_id" : name === "product_handles" ? "product_handle" : name} path={`${path}.${index}`} disabled={disabled} onChange={(next) => updateArray(value.map((entry, position) => index === position ? next : entry))} />
    </div>)}
    <Button type="button" variant="secondary" size="small" disabled={disabled} onClick={() => {
      const template = arrayTemplate.current ?? (name === "payment_logos" && path.includes("footer_display") ? { src: "", alt: "", width: 44, height: 24 } : templates[name] ?? "")
      const item = clone(template)
      if (item && typeof item === "object" && !Array.isArray(item) && "id" in item) item.id = crypto.randomUUID()
      updateArray([...value, item])
    }}>Добавить элемент</Button>
  </div>
  if (value && typeof value === "object") return <div className="flex flex-col gap-4">
    {Object.entries(value).filter(([key]) => (isFieldVisible?.(key) ?? true) && key !== "id" && key !== "sourceHref" && !(key === "type" && ["layout-copy", "hero", "benefits", "popular", "accessories", "story", "reviews", "questions"].includes(String(value.id))) && !(key === "order" && "type" in value && "data" in value) && !(key === "enabled" && value.type === "layout-copy") && !key.endsWith("_import_version")).map(([key, item]) => <div key={key} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2"><Label htmlFor={`${path}.${key}`}>{/^text_\d+$/.test(key) && typeof item === "string" ? `Текст: ${item.slice(0, 60)}${item.length > 60 ? "…" : ""}` : pretty(key)}</Label>{!Array.isArray(item) && item && typeof item === "object" && <Text size="xsmall" className="text-ui-fg-muted">Группа</Text>}</div>
      <ContentTreeEditor name={key === "url" && name === "image-node" ? "image" : key} path={`${path}.${key}`} disabled={disabled} value={item} onChange={(next) => onChange({ ...value, [key]: next })} />
    </div>)}
    {!("category_id" in value) && ("sourceHref" in value || ("mobileImage" in value && "button" in value)) && <div className="flex flex-col gap-2"><Label>Категория перехода</Label><ReferenceField name="category_id" value="" onChange={(category_id) => onChange({ ...value, category_id })} disabled={disabled} /><Text size="small" className="text-ui-fg-subtle">Выбор заменяет прежнюю категорию перехода. До выбора действует существующая ссылка.</Text></div>}
    <details className="rounded-lg border border-ui-border-base p-3"><summary className="cursor-pointer text-sm text-ui-fg-subtle">Добавить поле</summary><div className="mt-3 flex flex-wrap gap-2">
      <Input aria-label="Код нового поля" className="flex-1" placeholder="Код поля (например subtitle)" value={field} onChange={(event) => setField(event.target.value)} disabled={disabled} />
      <Select value={kind} onValueChange={setKind}><Select.Trigger className="w-40" aria-label="Тип нового поля"><Select.Value /></Select.Trigger><Select.Content>{[["text", "Текст"], ["number", "Число"], ["boolean", "Да / нет"], ["array", "Список"], ["object", "Группа"]].map(([id, label]) => <Select.Item key={id} value={id}>{label}</Select.Item>)}</Select.Content></Select>
      <Button type="button" size="small" disabled={disabled || !/^[a-z][a-zA-Z0-9_]*$/.test(field) || field in value || isFieldVisible?.(field) === false} onClick={() => { onChange({ ...value, [field]: kind === "number" ? 0 : kind === "boolean" ? true : kind === "array" ? [] : kind === "object" ? {} : "" }); setField("") }}>Добавить</Button>
    </div></details>
  </div>
  if (typeof value === "boolean") return <Switch id={path} checked={value} disabled={disabled} onCheckedChange={onChange} />
  if (typeof value === "number") return <Input id={path} type="number" step="any" value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
  if (name === "page_slug" || name.endsWith("_slug") || name === "category_id" || name === "product_id" || name === "product_handle") return <ReferenceField name={name} value={String(value ?? "")} onChange={onChange} disabled={disabled} />
  if (name === "icon") return <Select value={String(value || "bag")} onValueChange={onChange} disabled={disabled}><Select.Trigger id={path} aria-label="Значок"><Select.Value /></Select.Trigger><Select.Content>{[["bag", "Покупки"], ["truck", "Доставка"], ["shield", "Гарантия"], ["wallet", "Кошелёк"], ["pin", "Местоположение"], ["phone", "Телефон"], ["card", "Оплата"], ["check", "Проверка"], ["return", "Возврат"]].map(([key, label]) => <Select.Item key={key} value={key}>{label}</Select.Item>)}</Select.Content></Select>
  if (name === "type") return <Select value={String(value || "text")} onValueChange={onChange} disabled={disabled}><Select.Trigger id={path} aria-label="Шаблон блока"><Select.Value /></Select.Trigger><Select.Content>{[["text", "Текстовый блок"], ["layout-copy", "Текст и изображения страницы"], ["hero", "Главный экран"], ["benefits", "Преимущества"], ["popular", "Подборка товаров"], ["accessories", "Категории аксессуаров"], ["story", "О магазине"], ["reviews", "Отзывы"], ["questions", "Вопросы и ответы"]].map(([key, label]) => <Select.Item key={key} value={key}>{label}</Select.Item>)}</Select.Content></Select>
  const isImage = name === "src" || /image|logo|artwork|_src(?:set)?$/i.test(name)
  return <div className="flex flex-col gap-2">
    <Textarea id={path} rows={String(value ?? "").length > 150 || /text|paragraph|description|body/i.test(name) ? 4 : 2} disabled={disabled} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />
    {isImage && <div className="flex items-center gap-3"><Input aria-label={`Загрузить ${pretty(name)}`} type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={disabled || uploading} onChange={async (event) => {
      const file = event.target.files?.[0]
      if (!file) return
      if (file.size > 10 * 1024 * 1024) { toast.error("Изображение должно быть не больше 10 МБ"); return }
      setUploading(true)
      try { const { files } = await sdk.admin.upload.create({ files: [file] }); if (files[0]?.url) onChange(files[0].url) }
      catch (error) { toast.error("Не удалось загрузить изображение", { description: (error as Error).message }) }
      finally { setUploading(false); event.target.value = "" }
    }} />{uploading && <Text size="small" role="status">Загрузка…</Text>}</div>}
  </div>
}

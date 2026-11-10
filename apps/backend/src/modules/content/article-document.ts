import { z } from "@medusajs/framework/zod"
import { safeContentUrl } from "./validation"

const color = z.enum(["default", "gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"])
const alignment = z.enum(["left", "center", "right", "justify"])
export const ArticleImageUrl = z.string().max(2000).refine((url) => safeContentUrl(url) && !/^(mailto:|tel:)/i.test(url), "Укажите безопасную ссылку на изображение")
const styles = z.object({ bold: z.boolean().optional(), italic: z.boolean().optional(), underline: z.boolean().optional(), strike: z.boolean().optional(), code: z.boolean().optional(), textColor: color.optional(), backgroundColor: color.optional() }).strict()
const styledText = z.object({ type: z.literal("text"), text: z.string().max(100000), styles: styles.default({}) }).strict()
const inline = z.union([styledText, z.object({ type: z.literal("link"), href: z.string().max(2000).refine(safeContentUrl), content: z.array(styledText).max(1000) }).strict()])
const textContent = z.array(inline).max(3000)
export type ArticleInline = z.infer<typeof inline>
const props = z.object({
  backgroundColor: color.optional(), textColor: color.optional(), textAlignment: alignment.optional(),
  level: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(), isToggleable: z.boolean().optional(),
  checked: z.boolean().optional(), start: z.number().int().positive().max(100000).optional(),
  name: z.string().max(1000).optional(), url: z.union([ArticleImageUrl, z.literal("")]).optional(), caption: z.string().max(3000).optional(),
  showPreview: z.boolean().optional(), previewWidth: z.number().finite().positive().max(10000).optional(),
}).strict()
const cell = z.object({ type: z.literal("tableCell"), props: z.object({ backgroundColor: color.optional(), textColor: color.optional(), textAlignment: alignment.optional(), colspan: z.number().int().min(1).max(30).optional(), rowspan: z.number().int().min(1).max(500).optional() }).strict(), content: textContent }).strict()
const table = z.object({ type: z.literal("tableContent"), columnWidths: z.array(z.number().positive().max(10000).nullable().optional()).max(30).optional(), headerRows: z.number().int().min(0).max(500).optional(), headerCols: z.number().int().min(0).max(30).optional(), rows: z.array(z.object({ cells: z.array(z.union([cell, textContent])).max(30) }).strict()).max(500) }).strict()
export type ArticleBlock = { id: string; type: "paragraph" | "heading" | "bulletListItem" | "numberedListItem" | "checkListItem" | "quote" | "image" | "table"; props: z.infer<typeof props>; content?: ArticleInline[] | z.infer<typeof table>; children: ArticleBlock[] }
const block: z.ZodType<ArticleBlock> = z.lazy(() => z.object({
  id: z.string().min(1).max(100), type: z.enum(["paragraph", "heading", "bulletListItem", "numberedListItem", "checkListItem", "quote", "image", "table"]),
  props: props.default({}), content: z.union([textContent, table]).optional(), children: z.array(block).max(1000).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.type === "image" && value.content !== undefined) ctx.addIssue({ code: "custom", message: "У изображения не должно быть текстовых узлов" })
  if (value.type !== "table" && value.content && !Array.isArray(value.content)) ctx.addIssue({ code: "custom", message: "Неверное содержимое текстового блока" })
  if (value.type === "table" && (!value.content || Array.isArray(value.content))) ctx.addIssue({ code: "custom", message: "Неверное содержимое таблицы" })
}))

// Reject excessive nesting before the recursive validator traverses user input.
const boundedDocument = z.unknown().superRefine((raw, ctx) => {
  const stack = [{ value: raw, depth: 0 }]
  let count = 0
  while (stack.length) {
    const { value, depth } = stack.pop()!
    if (++count > 100000 || depth > 35) { ctx.addIssue({ code: "custom", message: "Материал слишком большой или содержит слишком много вложенных блоков" }); return }
    if (Array.isArray(value)) value.forEach((item) => stack.push({ value: item, depth: depth + 1 }))
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => {
      if (["__proto__", "constructor", "prototype"].includes(key)) ctx.addIssue({ code: "custom", message: "Недопустимое поле документа" })
      stack.push({ value: item, depth: depth + 1 })
    })
  }
})
export const ArticleDocumentSchema = boundedDocument.pipe(z.object({ version: z.literal(1), blocks: z.array(block).max(1000) }).strict()).superRefine((value, ctx) => {
  const ids = new Set<string>()
  let count = 0
  const collect = (blocks: ArticleBlock[]) => blocks.forEach((item) => { count++; if (ids.has(item.id)) ctx.addIssue({ code: "custom", message: "ID блоков должны быть уникальными" }); ids.add(item.id); collect(item.children) })
  collect(value.blocks)
  if (count > 1000) ctx.addIssue({ code: "custom", message: "Не больше 1000 блоков в статье" })
})
export type ArticleDocument = z.infer<typeof ArticleDocumentSchema>

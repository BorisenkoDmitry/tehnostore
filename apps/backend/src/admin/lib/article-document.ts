import type { ContentNode } from "../../modules/content/types"
import type { ArticleBlock, ArticleDocument, ArticleInline } from "../../modules/content/article-document"

const text = (value: string): ArticleInline[] => value ? [{ type: "text", text: value, styles: {} }] : []
const block = (type: ArticleBlock["type"], value = "", props: ArticleBlock["props"] = {}): ArticleBlock => ({ id: crypto.randomUUID(), type, props, content: type === "image" ? undefined : text(value), children: [] })

// Existing article bodies are converted in memory and saved only on explicit Save.
export function articleDocument(body: ContentNode[] | ArticleDocument): ArticleDocument {
  if (!Array.isArray(body)) return body
  const blocks = body.flatMap((node): ArticleBlock[] => {
    if (node.type === "heading") return [block("heading", node.text, { level: node.level })]
    if (node.type === "paragraph") return [block("paragraph", node.text)]
    if (node.type === "list") return node.items.map((item) => block(node.ordered ? "numberedListItem" : "bulletListItem", item))
    if (node.type === "quote") return [block("quote", [node.text, node.author].filter(Boolean).join("\n"))]
    if (node.type === "image") return [block("image", "", { url: node.url, caption: node.alt, name: "", showPreview: true })]
    if (node.type === "link") return [{ ...block("paragraph"), content: [{ type: "link", href: node.href, content: [{ type: "text", text: node.text, styles: {} }] }] }]
    return [{ ...block("table"), content: { type: "tableContent", headerRows: node.headers.length ? 1 : 0, rows: [...(node.headers.length ? [node.headers] : []), ...node.rows].map((row) => ({ cells: row.map((item) => ({ type: "tableCell", props: {}, content: text(item) })) })) } }]
  })
  return { version: 1, blocks }
}

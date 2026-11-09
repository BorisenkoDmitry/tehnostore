import { parseFragment, type DefaultTreeAdapterMap } from "parse5"
import { descriptionText } from "./insales"
import { safeDescriptionHref } from "./description-link"

export type DescriptionNode = { text: string } | {
  tag: string
  children: DescriptionNode[]
  href?: string
}

const allowed = new Set(["p", "div", "h3", "h4", "h5", "h6", "ul", "ol", "li", "strong", "em", "u", "s", "br", "blockquote", "table", "caption", "thead", "tbody", "tfoot", "tr", "th", "td", "a", "sub", "sup"])
const dropped = new Set(["script", "style", "iframe", "object", "embed", "template", "svg", "math", "form", "input", "button", "textarea", "select", "link", "meta", "noscript"])

/** The parser repairs malformed source HTML and decodes entities. Only a tiny
 * allowlisted tree leaves the server: never raw HTML, event handlers or styles. */
export function descriptionTree(html: string): DescriptionNode[] {
  const fragment = parseFragment(html)
  const convert = (node: DefaultTreeAdapterMap["childNode"]): DescriptionNode[] => {
    if (node.nodeName === "#text") return [{ text: (node as DefaultTreeAdapterMap["textNode"]).value }]
    if (!("tagName" in node) || dropped.has(node.tagName) || node.namespaceURI !== "http://www.w3.org/1999/xhtml") return []
    const children = (node.childNodes ?? []).flatMap(convert)
    const aliases: Record<string, string> = { b: "strong", i: "em", strike: "s" }
    const tag = /^h[1-6]$/.test(node.tagName) ? `h${Math.max(3, Math.min(6, Number(node.tagName[1]) + 1))}` : (aliases[node.tagName] ?? node.tagName)
    if (!allowed.has(tag)) return children
    const href = tag === "a" ? safeDescriptionHref(node.attrs.find((attribute) => attribute.name === "href")?.value ?? "") : undefined
    if (tag === "a" && !href) return children
    return [{ tag, children, ...(href ? { href } : {}) }]
  }
  return fragment.childNodes.flatMap(convert)
}

export function sourceDescription(source: Record<string, unknown> | undefined): DescriptionNode[] | undefined {
  if (!source) return undefined
  const originals = Array.isArray(source.original_description_html) ? source.original_description_html.filter((value): value is string => typeof value === "string" && Boolean(value.trim())) : []
  const rows = Array.isArray(source.rows) ? source.rows.filter((row): row is Record<string, unknown> => !!row && typeof row === "object") : []
  const main = originals.length ? originals : rows.map((row) => row["Описание"]).filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
  const additional = rows.map((row) => row["Дополнительное описание"]).filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
  const blocks = [...new Set(main), ...new Set(additional)]
  return blocks.length ? blocks.flatMap(descriptionTree) : undefined
}

export function descriptionHtml(nodes: DescriptionNode[]): string {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  return nodes.map((node) => {
    if ("text" in node) return escape(node.text)
    if (node.tag === "br") return "<br>"
    const tag = /^h[3-6]$/.test(node.tag) ? `h${Number(node.tag[1]) - 1}` : node.tag
    return `<${tag}${node.href ? ` href="${escape(node.href)}"` : ""}>${descriptionHtml(node.children)}</${tag}>`
  }).join("")
}

type CategorySeo = { title: string; description: string; text: string; text_html?: string }

export function categorySeoWithDescription(seo: CategorySeo, previous: unknown): CategorySeo {
  const old = previous as Partial<CategorySeo> | undefined
  const html = seo.text_html ?? (old?.text === seo.text ? old?.text_html : undefined)
  return typeof html === "string" ? { ...seo, text_html: descriptionHtml(descriptionTree(html)) } : seo
}

export function publicCategorySeo(value: unknown) {
  if (!value || typeof value !== "object") return null
  const seo = value as Partial<CategorySeo>
  return {
    title: seo.title, description: seo.description, text: seo.text,
    ...(typeof seo.text_html === "string" ? { content: descriptionTree(seo.text_html) } : {}),
  }
}

/** Retain the imported rich layout until the merchant edits the native
 * description. The import snapshot is provenance, never an override of CMS edits. */
export function productDescription(source: Record<string, unknown> | undefined, current: string | null | undefined, rich?: unknown): DescriptionNode[] {
  if (typeof rich === "string" && descriptionText(rich) === current) return descriptionTree(rich)
  const rows = Array.isArray(source?.rows)
    ? source.rows.filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    : []
  const original = Array.isArray(source?.original_description_html)
    ? source.original_description_html.find((value): value is string => typeof value === "string" && Boolean(value.trim()))
    : undefined
  const main = original ?? rows.map((row) => row["Описание"]).find((value): value is string => typeof value === "string" && Boolean(value.trim()))
  const additional = typeof rows[0]?.["Дополнительное описание"] === "string" ? rows[0]["Дополнительное описание"] : ""
  const baseline = [main ? descriptionText(main) : "", descriptionText(additional)].filter(Boolean).join("\n\n")
  if (main && current === baseline) return sourceDescription(source) ?? []
  // Medusa's native description field is plain text. Do not interpret merchant
  // input as markup, even when it contains HTML-looking text.
  return (current ?? "").split(/\n\s*\n|\n/).filter((paragraph) => paragraph.trim()).map((paragraph) => ({
    tag: "p",
    children: [{ text: paragraph }],
  }))
}

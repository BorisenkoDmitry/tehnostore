import { createElement } from "react"
import type { ProductDescriptionNode } from "@lib/data/catalog-product"

const tags = new Set(["p", "div", "h3", "h4", "h5", "h6", "ul", "ol", "li", "strong", "em", "u", "s", "br", "blockquote", "table", "caption", "thead", "tbody", "tfoot", "tr", "th", "td", "a", "sub", "sup"])

export default function RichText({ nodes }: { nodes: ProductDescriptionNode[] }) {
  return <>{nodes.map((node, index) => {
    if ("text" in node) return node.text
    if (!tags.has(node.tag)) return null
    const props = node.tag === "a" ? { key: index, href: node.href, rel: "noopener noreferrer" } : { key: index }
    return node.tag === "br" ? createElement("br", { key: index }) : createElement(node.tag, props, <RichText nodes={node.children} />)
  })}</>
}

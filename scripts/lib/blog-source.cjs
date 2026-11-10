const path = require("node:path")
const { createRequire } = require("node:module")
const { createHash } = require("node:crypto")
const { parse, serialize } = createRequire(path.resolve(__dirname, "../../apps/backend/package.json"))("parse5")

const attr = (node, name) => node?.attrs?.find((item) => item.name === name)?.value || ""
const children = (node) => node?.childNodes || []
const hasClass = (node, name) => attr(node, "class").split(/\s+/).includes(name)
function all(node, predicate) {
  const result = []
  function walk(item) { if (predicate(item)) result.push(item); children(item).forEach(walk) }
  walk(node)
  return result
}
const first = (node, predicate) => all(node, predicate)[0]
function text(node) {
  if (node.nodeName === "#text") return node.value
  if (["script", "style", "noscript", "template"].includes(node.tagName)) return ""
  return children(node).map(text).join(node.tagName === "br" ? "\n" : "")
}
const clean = (value) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
function url(value, base, image = false) {
  if (!value || /[\u0000-\u0020\\]/.test(value)) return ""
  try {
    const result = new URL(value, base)
    if ((result.protocol !== "https:" && !(result.protocol === "http:" && ["localhost", "127.0.0.1"].includes(result.hostname))) && (image || !["mailto:", "tel:"].includes(result.protocol))) return ""
    if (result.username || result.password) return ""
    return result.href
  } catch { return "" }
}
function metadata(root, base) {
  const metas = all(root, (node) => node.tagName === "meta")
  const read = (name) => attr(metas.find((node) => [attr(node, "name").toLowerCase(), attr(node, "property").toLowerCase()].includes(name)), "content")
  const canonical = first(root, (node) => node.tagName === "link" && attr(node, "rel").split(/\s+/).includes("canonical"))
  return { title: clean(text(first(root, (node) => node.tagName === "title") || {})), description: read("description"), canonical: url(attr(canonical, "href"), base), robots: read("robots"), og_title: read("og:title"), og_description: read("og:description"), og_image: url(read("og:image"), base, true), twitter_image: url(read("twitter:image"), base, true), published_time: read("article:published_time"), modified_time: read("article:modified_time") }
}
function image(node, base) {
  return { url: url(attr(node, "src") || attr(node, "data-src"), base, true), alt: attr(node, "alt"), title: attr(node, "title"), srcset: attr(node, "srcset"), width: attr(node, "width"), height: attr(node, "height") }
}
function listing(html, base) {
  const root = parse(html)
  const cards = all(root, (node) => hasClass(node, "blog-card")).map((node, index) => {
    const titleNode = first(node, (item) => hasClass(item, "title"))
    const anchor = first(titleNode || node, (item) => item.tagName === "a" && attr(item, "href"))
    const cover = first(node, (item) => item.tagName === "img")
    return { position: index + 1, url: url(attr(anchor, "href"), base), title: clean(text(titleNode || anchor || {})), excerpt: clean(text(first(node, (item) => hasClass(item, "announce")) || {})), date: clean(text(first(node, (item) => hasClass(item, "date")) || {})), cover: cover ? image(cover, base) : null }
  })
  const pages = all(root, (node) => node.tagName === "a" && attr(node, "href")).flatMap((node) => {
    try { const target = new URL(attr(node, "href"), base); const page = Number(target.searchParams.get("page")); return target.origin === new URL(base).origin && target.pathname === "/blogs/blog" && Number.isInteger(page) && page > 0 ? [page] : [] } catch { return [] }
  })
  return { title: clean(text(first(root, (node) => node.tagName === "h1") || {})), metadata: metadata(root, base), cards, last_page: Math.max(1, ...pages) }
}

function article(html, base) {
  const root = parse(html)
  const container = first(root, (node) => hasClass(node, "article"))
  const body = first(container || root, (node) => hasClass(node, "editor"))
  if (!body) throw Error("Article body selector not found")
  const issues = []
  let serial = 0
  const id = () => createHash("sha256").update(`${base}:${++serial}`).digest("hex").slice(0, 24)
  const make = (type, content = [], props = {}, nested = []) => ({ id: id(), type, props, ...(type === "image" ? {} : { content }), children: nested })
  function rich(nodes, styles = {}) {
    const output = []
    for (const node of nodes) {
      if (node.nodeName === "#text") { if (node.value) output.push({ type: "text", text: node.value.replace(/\u00a0/g, " "), styles: { ...styles } }); continue }
      if (["script", "style", "noscript", "template", "img", "ul", "ol", "table"].includes(node.tagName)) continue
      if (node.tagName === "br") { output.push({ type: "text", text: "\n", styles: { ...styles } }); continue }
      const mark = ({ strong: "bold", b: "bold", em: "italic", i: "italic", u: "underline", s: "strike", del: "strike", code: "code" })[node.tagName]
      const nested = rich(children(node), mark ? { ...styles, [mark]: true } : styles)
      if (node.tagName === "a") {
        const href = url(attr(node, "href"), base)
        const plain = nested.flatMap((item) => item.type === "link" ? item.content : [item])
        if (href) output.push({ type: "link", href, content: plain })
        else { output.push(...plain); issues.push({ type: "unsafe-link", href: attr(node, "href") }) }
      } else output.push(...nested)
    }
    return output
  }
  function blocks(nodes) {
    const output = []
    for (const node of nodes) {
      if (node.nodeName === "#text") { if (clean(node.value)) output.push(make("paragraph", rich([node]))); continue }
      const tag = node.tagName
      if (["script", "style", "noscript", "template"].includes(tag)) { issues.push({ type: "removed-active-element", tag }); continue }
      if (tag === "img") {
        const media = image(node, base)
        if (media.url) output.push(make("image", [], { url: media.url, caption: media.alt || media.title, name: "", showPreview: true }))
        else issues.push({ type: "unsafe-image", src: attr(node, "src") })
        continue
      }
      if (/^h[1-6]$/.test(tag)) { output.push(make("heading", rich(children(node)), { level: Math.max(2, Math.min(4, Number(tag[1]))) })); continue }
      if (tag === "ul" || tag === "ol") {
        const items = children(node).filter((item) => item.tagName === "li")
        for (const item of items) {
          const nested = children(item).filter((child) => child.tagName === "ul" || child.tagName === "ol")
          const content = rich(children(item).filter((child) => !nested.includes(child)))
          output.push(make(tag === "ol" ? "numberedListItem" : "bulletListItem", content, {}, blocks(nested)))
        }
        continue
      }
      if (tag === "blockquote") { output.push(make("quote", rich(children(node)))); const media = all(node, (item) => item.tagName === "img"); output.push(...blocks(media)); continue }
      if (tag === "table") {
        const rows = all(node, (item) => item.tagName === "tr").map((row) => ({ cells: children(row).filter((item) => ["th", "td"].includes(item.tagName)).map((cell) => ({ type: "tableCell", props: {}, content: rich(children(cell)) })) })).filter((row) => row.cells.length)
        if (rows.length) output.push(make("table", { type: "tableContent", headerRows: all(node, (item) => item.tagName === "th").length ? 1 : 0, rows }))
        continue
      }
      if (["iframe", "video", "audio", "object", "embed", "svg"].includes(tag)) { issues.push({ type: "unsupported-embed", tag, src: attr(node, "src") }); continue }
      if (["div", "section", "article", "main", "figure", "center"].includes(tag)) { output.push(...blocks(children(node))); continue }
      if (tag === "hr") { issues.push({ type: "divider-not-imported" }); continue }
      const nestedBlocks = children(node).some((item) => ["p", "div", "h2", "h3", "h4", "ul", "ol", "table", "figure"].includes(item.tagName))
      if (nestedBlocks) { output.push(...blocks(children(node))); continue }
      const content = rich(children(node))
      if (content.some((item) => item.type === "link" || clean(item.text || ""))) output.push(make("paragraph", content))
      output.push(...blocks(all(node, (item) => item.tagName === "img")))
    }
    return output
  }
  const document = { version: 1, blocks: blocks(children(body)) }
  const hero = first(container || root, (node) => hasClass(node, "article-hero"))
  const heroMatch = attr(hero, "style").match(/background-image\s*:\s*url\(['"]?([^)'"\s]+)['"]?\)/i)
  const bodyText = children(body).map((node) => clean(text(node))).filter(Boolean).join("\n\n")
  return { title: clean(text(first(container || root, (node) => node.tagName === "h1") || {})), date: clean(text(first(hero || container || root, (node) => hasClass(node, "date")) || {})), hero_image: heroMatch ? url(heroMatch[1], base, true) : "", metadata: metadata(root, base), body_html: serialize(body), body_text: bodyText, headings: all(body, (node) => /^h[1-6]$/.test(node.tagName)).map((node) => ({ level: Number(node.tagName[1]), text: clean(text(node)) })), images: all(body, (node) => node.tagName === "img").map((node) => image(node, base)), links: all(body, (node) => node.tagName === "a").map((node) => ({ text: clean(text(node)), url: url(attr(node, "href"), base), original_href: attr(node, "href") })), document, issues }
}

module.exports = { listing, article }

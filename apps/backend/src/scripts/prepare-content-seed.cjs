/* One-time source-to-CMS migration. Run before editing the source templates.
 * The source snapshots and InSales export are never modified. */
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")
const storefront = "/server/apps/storefront/src"
const output = path.join(__dirname, "data/content-seed.json")
if (fs.existsSync(output)) throw new Error("Content seed already exists; preserve its stable keys")
const read = (relative) => fs.readFileSync(path.join(storefront, relative), "utf8")
function constant(relative, name) {
  const file = ts.createSourceFile(relative, read(relative), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let expression
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) expression = node.initializer.getText(file); ts.forEachChild(node, visit) }
  visit(file)
  if (!expression) throw new Error(`Missing ${name}`)
  const javascript = ts.transpileModule(`module.exports = ${expression}`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const target = { exports: {} }
  new Function("module", javascript)(target)
  return target.exports
}
function jsxText(text) {
  const lines = text.split(/\r\n|\n|\r/)
  let last = 0
  lines.forEach((line, index) => { if (/[^ \t]/.test(line)) last = index })
  return lines.map((line, index) => {
    let value = line.replace(/\t/g, " ")
    if (index !== 0) value = value.replace(/^ +/, "")
    if (index !== lines.length - 1) value = value.replace(/ +$/, "")
    return value && index !== last ? `${value} ` : value
  }).join("")
}
const pages = []
const titles = { "about-us": "О компании", delivery: "Доставка и оплата", warranty: "Гарантия и возврат", contacts: "Контакты", faq: "Вопрос-ответ" }
const templates = { "about-us": "about", delivery: "delivery", warranty: "warranty", contacts: "contacts", faq: "faq" }
for (const [slug, template] of Object.entries(templates)) {
  const relative = `modules/information/templates/${template}/index.tsx`
  const filePath = path.join(storefront, relative)
  const source = read(relative)
  const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits = [], data = {}
  let count = 0
  function visit(node) {
    if (ts.isJsxText(node)) {
      const text = jsxText(node.text)
      if (text.trim() && !/^[\/→←]+$/.test(text.trim())) {
        const key = `text_${String(++count).padStart(3, "0")}`
        data[key] = text
        edits.push({ start: node.pos, end: node.end, value: `{copy.${key}}` })
      }
    }
    if (ts.isJsxAttribute(node) && ["src", "alt", "srcSet"].includes(node.name.getText(ast)) && node.initializer && ts.isStringLiteral(node.initializer) && node.initializer.text) {
      const key = `media_${String(++count).padStart(3, "0")}_${node.name.getText(ast).toLowerCase()}`
      data[key] = node.initializer.text
      edits.push({ start: node.initializer.getStart(ast), end: node.initializer.end, value: `{copy.${key}}` })
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  let result = source
  edits.sort((a, b) => b.start - a.start).forEach((edit) => { result = result.slice(0, edit.start) + edit.value + result.slice(edit.end) })
  const signature = new RegExp(`export default (async )?function \\w+\\(\\) \\{`)
  result = result.replace(signature, (match) => match.replace("function", "function").replace(/^export default (?:async )?function (\w+)\(\) \{/, "export default async function $1() {\n  const page = await getContentPage(\"" + slug + "\")\n  const copy = getPageBlock<Record<string, string>>(page, \"layout-copy\") ?? {}"))
  result = 'import { getContentPage, getPageBlock } from "@lib/data/content"\n' + result
  fs.writeFileSync(filePath, result)
  const blocks = [{ id: "layout-copy", type: "layout-copy", enabled: true, order: 0, data }]
  if (template === "about") blocks.push({ id: "benefits", type: "benefits", enabled: true, order: 1, data: { items: constant(relative, "benefits") } })
  if (template === "faq") blocks.push({ id: "questions", type: "questions", enabled: true, order: 1, data: { items: constant("modules/information/data/faq.ts", "faqItems") } })
  pages.push({ slug, title: titles[slug], body: [], blocks, metadata: {} })
}
const homeSource = JSON.parse(read("modules/home/data/source-preview.json"))
pages.push({ slug: "home", title: "TEXNO STORE — смартфоны и аксессуары", body: [], metadata: { title: "TEXNO STORE — смартфоны и аксессуары", description: "Смартфоны и аксессуары в TEXNO STORE. Каталог техники, информация о доставке, гарантии и контакты магазина." }, blocks: [
  { id: "hero", type: "hero", enabled: true, order: 0, data: { slides: constant("modules/home/components/hero/slides.ts", "heroSlides") } },
  { id: "benefits", type: "benefits", enabled: true, order: 1, data: { items: constant("modules/home/components/store-benefits/index.tsx", "benefits") } },
  { id: "popular", type: "popular", enabled: true, order: 2, data: { title: "Популярные товары", link_label: "Смотреть все", product_handles: homeSource.products.filter((item) => item.popular).map((item) => `texno-example-${item.id}`) } },
  { id: "accessories", type: "accessories", enabled: true, order: 3, data: { title: "Для вашего смартфона", items: homeSource.categories } },
  { id: "story", type: "story", enabled: true, order: 4, data: { sections: homeSource.story, artwork: constant("modules/home/data/story-artwork.ts", "storyArtwork") } },
  { id: "reviews", type: "reviews", enabled: true, order: 5, data: { title: "Отзывы покупателей", link_label: "Все отзывы" } },
] })
pages.push({ slug: "reviews", title: "Отзывы покупателей", body: [], blocks: [], metadata: { title: "Отзывы покупателей — TEXNO STORE" } })
const seed = { pages, settings: { contacts: constant("modules/information/data/contacts.ts", "contacts"), company: { ...constant("modules/information/data/company.ts", "company"), published_date: "2025-02-21" } } }
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify(seed, null, 2) + "\n")
console.log(JSON.stringify({ pages: pages.length, copyFields: pages.reduce((sum, page) => sum + Object.keys(page.blocks.find((block) => block.id === "layout-copy")?.data ?? {}).length, 0), output }))

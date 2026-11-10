const fs = require("node:fs")
const path = require("node:path")
const { createHash } = require("node:crypto")
const { listing, article } = require("./lib/blog-source.cjs")
const origin = "https://texno.store"
const outputIndex = process.argv.indexOf("--output")
const output = path.resolve(outputIndex >= 0 ? process.argv[outputIndex + 1] : path.join(__dirname, "../.local/blog-source"))
fs.mkdirSync(path.join(output, "raw/index"), { recursive: true })
fs.mkdirSync(path.join(output, "raw/articles"), { recursive: true })
const report = { started_at: new Date().toISOString(), source: origin + "/blogs/blog", pages: [], errors: [] }
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function fetchHtml(url, file) {
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8")
  let error
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const target = new URL(url)
      if (target.origin !== origin || !target.pathname.startsWith("/blogs/blog")) throw Error("Source URL outside the requested blog")
      await pause(300)
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(45000), headers: { "user-agent": "TexnoStoreContentMigration/1.0", accept: "text/html" } })
      if (!response.ok) throw Error(`HTTP ${response.status}`)
      const html = await response.text()
      if (!html.includes("<html") || !/charset\s*=\s*["']?utf-8/i.test(html)) throw Error("Unexpected document or encoding")
      fs.writeFileSync(file, html)
      return html
    } catch (failure) { error = failure; await pause((attempt + 1) * 1000) }
  }
  throw error
}
async function pool(items, worker) {
  let cursor = 0
  await Promise.all(Array.from({ length: 2 }, async () => { while (cursor < items.length) { const index = cursor++; await worker(items[index], index) } }))
}
async function main() {
  const firstHtml = await fetchHtml(report.source, path.join(output, "raw/index/01.html"))
  const firstPage = listing(firstHtml, report.source)
  if (firstPage.last_page !== 13) throw Error(`Pagination changed: expected 13 pages, found ${firstPage.last_page}`)
  const pages = new Array(13)
  pages[0] = firstPage
  await pool(Array.from({ length: 12 }, (_, index) => index + 2), async (page) => {
    const url = `${report.source}?page=${page}`
    const html = await fetchHtml(url, path.join(output, `raw/index/${String(page).padStart(2, "0")}.html`))
    pages[page - 1] = listing(html, url)
    console.log(JSON.stringify({ index_page: page, cards: pages[page - 1].cards.length }))
  })
  const cards = new Map()
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index]
    if (!page.cards.length) throw Error(`No cards on page ${index + 1}`)
    report.pages.push({ page: index + 1, count: page.cards.length, url: index ? `${report.source}?page=${index + 1}` : report.source })
    for (const card of page.cards) {
      if (!card.title || !card.url.startsWith(origin + "/blogs/blog/")) throw Error(`Malformed card on page ${index + 1}`)
      if (cards.has(card.url)) { cards.get(card.url).source_pages.push(index + 1); continue }
      cards.set(card.url, { ...card, source_pages: [index + 1] })
    }
  }
  const articles = new Array(cards.size)
  let completed = 0
  await pool([...cards.values()], async (card, index) => {
    try {
      const slug = new URL(card.url).pathname.split("/").pop()
      const filename = createHash("sha256").update(card.url).digest("hex").slice(0, 20) + ".html"
      const html = await fetchHtml(card.url, path.join(output, "raw/articles", filename))
      const source = article(html, card.url)
      if (!source.title || source.body_text.length < 50 || !source.document.blocks.length) throw Error("Article title/body missing")
      const { document, ...sourceRecord } = source
      articles[index] = { source_url: card.url, source_slug: slug, source_pages: card.source_pages, card, article: sourceRecord, raw_html_file: "raw/articles/" + filename, source_sha256: createHash("sha256").update(html).digest("hex"), import_candidate: { title: source.title, slug, excerpt: card.excerpt, cover_image: card.cover?.url || source.hero_image || source.metadata.og_image, cover_alt: card.cover?.alt || source.title, body: document, metadata: { title: source.metadata.title, description: source.metadata.description, ...(source.metadata.og_image ? { image: source.metadata.og_image } : {}), noindex: true } } }
      completed++
      if (completed % 10 === 0 || completed === cards.size) console.log(JSON.stringify({ articles_collected: completed, total: cards.size }))
    } catch (error) { report.errors.push({ source_url: card.url, message: error.message }) }
  })
  const collected = articles.filter(Boolean)
  const media = [...new Set(collected.flatMap((item) => [item.card.cover?.url, item.article.hero_image, item.article.metadata.og_image, ...item.article.images.map((image) => image.url)]).filter(Boolean))]
  report.finished_at = new Date().toISOString()
  report.summary = { index_pages: pages.length, cards: [...cards.values()].length, articles: collected.length, unique_image_urls: media.length, body_images: collected.reduce((sum, item) => sum + item.article.images.length, 0), articles_with_conversion_notes: collected.filter((item) => item.article.issues.length).length, duplicate_card_urls: [...cards.values()].filter((item) => item.source_pages.length > 1).length, errors: report.errors.length }
  const data = { collected_at: report.finished_at, source: report.source, index_metadata: firstPage.metadata, articles: collected }
  fs.writeFileSync(path.join(output, "blog-export.json"), JSON.stringify(data, null, 2) + "\n")
  fs.writeFileSync(path.join(output, "image-urls.json"), JSON.stringify(media, null, 2) + "\n")
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify(report.summary))
  if (report.errors.length || collected.length !== cards.size) process.exitCode = 1
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })

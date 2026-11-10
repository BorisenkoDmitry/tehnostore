const fs = require("node:fs")
const path = require("node:path")
const { createRequire } = require("node:module")
const backend = createRequire(path.resolve(__dirname, "../apps/backend/package.json"))
const { ContentArticleInput } = backend("./src/modules/content/article-validation.ts")
const flag = process.argv.indexOf("--source")
const source = path.resolve(flag >= 0 ? process.argv[flag + 1] : path.join(__dirname, "../.local/blog-source"))
const data = JSON.parse(fs.readFileSync(path.join(source, "blog-export.json"), "utf8"))
function inlineText(content) {
  if (!Array.isArray(content)) return ""
  return content.map((item) => item.type === "link" ? inlineText(item.content) : item.text || "").join("")
}
function documentText(blocks) {
  return blocks.map((block) => {
    const content = Array.isArray(block.content) ? inlineText(block.content) : block.content?.type === "tableContent" ? block.content.rows.map((row) => row.cells.map((cell) => inlineText(Array.isArray(cell) ? cell : cell.content)).join("")).join("") : ""
    return content + documentText(block.children || [])
  }).join("")
}
const compact = (text) => text.replace(/\s+/g, "")
const textDifferences = data.articles.filter((entry) => compact(entry.article.body_text) !== compact(documentText(entry.import_candidate.body.blocks))).map((entry) => entry.source_url)
function documentImages(blocks) { return blocks.flatMap((block) => [...(block.type === "image" && block.props.url ? [block.props.url] : []), ...documentImages(block.children || [])]) }
const imageDifferences = data.articles.filter((entry) => JSON.stringify(entry.article.images.map((image) => image.url).filter(Boolean).sort()) !== JSON.stringify(documentImages(entry.import_candidate.body.blocks).sort())).map((entry) => entry.source_url)
const issues = data.articles.flatMap((entry) => {
  const result = ContentArticleInput.safeParse(entry.import_candidate)
  return result.success ? [] : [{ source_url: entry.source_url, issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })) }]
})
const counts = {
  total: data.articles.length,
  valid: data.articles.length - issues.length,
  invalid: issues.length,
  cards_with_covers: data.articles.filter((entry) => entry.card.cover?.url).length,
  cards_with_excerpts: data.articles.filter((entry) => entry.card.excerpt).length,
  articles_with_dates: data.articles.filter((entry) => entry.article.date).length,
  articles_with_seo_description: data.articles.filter((entry) => entry.article.metadata.description).length,
  articles_with_matching_converted_text: data.articles.length - textDifferences.length,
  converted_text_differences: textDifferences,
  articles_with_matching_converted_images: data.articles.length - imageDifferences.length,
  converted_image_differences: imageDifferences,
  issues,
}
fs.writeFileSync(path.join(source, "validation.json"), JSON.stringify(counts, null, 2) + "\n")
console.log(JSON.stringify({ ...counts, issues: issues.slice(0, 8) }))
process.exitCode = issues.length ? 1 : 0

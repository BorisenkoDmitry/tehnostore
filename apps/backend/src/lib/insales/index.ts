import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

export type SourceRow = Record<string, string>
export type NavigationNode = { id: string; parent_id: string | null; label: string; href: string; visible: boolean }
export type AttributeValue = { value: string; normalized: string; numericValue: number | null; unit: string | null }
export type InsalesAttribute = {
  key: string
  label: string
  rawValues: string[]
  values: AttributeValue[]
  dataType: "text" | "number" | "boolean"
  public: boolean
  filterable: boolean
}
export type InsalesVariant = {
  sourceVariantId: string
  sku: string
  originalSku: string
  color: string | null
  price: number
  oldPrice: number | null
  currencyCode: "rub"
  stock: number | null
  weight: number | null
  imageUrls: string[]
  privateRaw: SourceRow
}
export type InsalesProduct = {
  sourceProductId: string
  title: string
  handle: string
  sourceHandle: string
  sourceUrl: string
  description: string
  additionalDescription: string
  imageUrls: string[]
  categoryHandles: string[]
  kind: "phone" | "accessory"
  brand: string | null
  attributes: InsalesAttribute[]
  variants: InsalesVariant[]
  privateRaw: { rows: SourceRow[]; csvRecords: number[] }
}
export type ExcludedProduct = { sourceProductId: string; sourceVariantIds: string[]; title: string; reasons: string[]; csvRecords: number[] }
export type PlanWarning = { sourceProductId: string; sourceVariantId?: string; code: string; detail?: string }

export function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ").trim()
}

export function attributeKey(label: string): string {
  return `attr_${createHash("sha256").update(normalize(label)).digest("hex").slice(0, 12)}`
}

/** Strict RFC-style quoting, with TAB delimiter and embedded CR/LF support. */
export function parseTsv(text: string): SourceRow[] {
  const records: string[][] = []
  let record: string[] = []
  let cell = ""
  let quoted = false
  let closedQuote = false
  const input = text.replace(/^\uFEFF/, "")
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++ }
      else if (char === '"') { quoted = false; closedQuote = true }
      else cell += char
      continue
    }
    if (char === '"' && !cell && !closedQuote) { quoted = true; continue }
    if (char === "\t" || char === "\n" || char === "\r") {
      record.push(cell)
      cell = ""
      closedQuote = false
      if (char !== "\t") {
        if (char === "\r" && input[i + 1] === "\n") i++
        if (record.some((value) => value !== "")) records.push(record)
        record = []
      }
    } else {
      if (closedQuote || char === '"') throw new Error(`Malformed TSV quoting at character ${i}`)
      cell += char
    }
  }
  if (quoted) throw new Error("Unterminated TSV quote")
  if (cell || record.length) { record.push(cell); records.push(record) }
  const headers = records.shift()
  if (!headers || new Set(headers).size !== headers.length) throw new Error("Missing or duplicate TSV headers")
  const required = ["ID товара", "ID варианта", "Описание", "Видимость на витрине", "Размещение на сайте", "Цена продажи"]
  for (const key of required) if (!headers.includes(key)) throw new Error(`Missing source column: ${key}`)
  return records.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV record ${index + 1}: ${values.length} columns; expected ${headers.length}`)
    return Object.fromEntries(headers.map((header, i) => [header, values[i]]))
  })
}

/** Output is text, never trusted HTML. Render through normal text nodes only. */
export function descriptionText(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/<\s*(?:br\b[^>]*|\/(?:p|div|li|h[1-6]|tr))\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&(?:amp|quot|apos|lt|gt);/gi, (entity) => ({ "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" }[entity.toLowerCase()] || entity))
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (entity, code: string) => {
      const number = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code)
      return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : entity
    })
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

/** No network access; only approved public CDN image URLs may leave the parser. */
export function safeImageUrls(raw: string): string[] {
  return [...new Set(raw.split(/\s+|##/).filter(Boolean).flatMap((input) => {
    try {
      const url = new URL(input)
      if (url.protocol !== "https:" || url.hostname !== "cdn.insales-shop.ru" || url.username || url.password || url.port || !url.pathname.startsWith("/images/")) return []
      return [url.href]
    } catch { return [] }
  }))]
}

export function decimal(raw: string): number | null {
  const text = raw.trim().replace(/\u00a0/g, "").replace(/ /g, "").replace(",", ".")
  if (!text) return null
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new Error(`Invalid decimal: ${raw}`)
  const value = Number(text)
  if (!Number.isFinite(value)) throw new Error(`Invalid decimal: ${raw}`)
  return value
}

function typedValue(value: string): AttributeValue {
  const match = value.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*(ГБ|Гб|GB|МБ|Мб|MB|мАч|mAh|г|кг|мм|см|м|дюйм\.?|МГц|ГГц|Вт|В|ч|час(?:а|ов)?|мин|млн пикс\.?)?$/i)
  const unitMap: Record<string, string> = { "гб": "GB", gb: "GB", "мб": "MB", mb: "MB", "мач": "mAh", mah: "mAh", "дюйм": "in", "дюйм.": "in", "час": "h", "часа": "h", "часов": "h", "ч": "h" }
  return { value, normalized: normalize(value), numericValue: match ? Number(match[1].replace(",", ".")) : null, unit: match?.[2] ? (unitMap[match[2].toLowerCase()] || match[2]) : null }
}

export function extractAttributes(rows: SourceRow[]): InsalesAttribute[] {
  // These prefixed fields contain customer characteristics, not private importer
  // control data. Original source keys/values remain intact in privateRaw.rows.
  const publicAliases: Record<string, string> = {
    "__Гарантия": "Гарантия",
    "__Производство": "Производство",
    "__Аксессуар для": "Совместимость с устройством",
    "__Тип аксессуара": "Тип аксессуара",
  }
  return Object.keys(rows[0]).filter((key) => key.startsWith("Параметр: ")).flatMap((column) => {
    const sourceLabel = column.slice("Параметр: ".length)
    const label = publicAliases[sourceLabel] || sourceLabel
    const rawValues = [...new Set(rows.map((row) => row[column]).filter((value) => value.trim()))]
    if (!rawValues.length) return []
    const values = [...new Set(rawValues.flatMap((raw) => raw.split("##").map((value) => value.trim()).filter(Boolean)))].map(typedValue)
    const internal = sourceLabel.startsWith("__") && !publicAliases[sourceLabel]
    return [{ key: attributeKey(label), label, rawValues, values, dataType: values.every((value) => value.numericValue !== null) ? "number" as const : values.every((value) => /^(да|нет|есть|отсутствует)$/i.test(value.value)) ? "boolean" as const : "text" as const, public: !internal, filterable: !internal }]
  })
}

export function buildInsalesPlan(rows: SourceRow[], navigation: NavigationNode[], sourceSha256 = "") {
  const nodes = navigation.filter((node) => node.visible && node.href.startsWith("/collection/"))
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const parentChain = (node: NavigationNode): NavigationNode[] => {
    const chain = [node]
    const visited = new Set([node.id])
    let parentId = node.parent_id
    while (parentId) {
      if (visited.has(parentId)) throw new Error("Navigation cycle")
      visited.add(parentId)
      const parent = byId.get(parentId)
      if (!parent) throw new Error(`Missing navigation ancestor: ${parentId}`)
      chain.unshift(parent)
      parentId = parent.parent_id
    }
    return chain
  }
  const leaves = nodes.filter((node) => node.parent_id && (node.parent_id === "aksessuary" || ["apple-iphone", "samsung", "xiaomi", "honor"].includes(node.parent_id))).map((node) => ({ node, chain: parentChain(node), expectedPath: normalize(`Каталог/${parentChain(node).map((entry) => entry.label).join("/")}`), collection: node.href.slice("/collection/".length) }))
  if (leaves.length !== 101) throw new Error(`Allowlist changed: expected 91 phone models + 10 accessory branches, found ${leaves.length}; review required`)
  const groups = new Map<string, { row: SourceRow; record: number }[]>()
  const variantsSeen = new Set<string>()
  rows.forEach((row, index) => {
    if (!/^\d+$/.test(row["ID товара"]) || !/^\d+$/.test(row["ID варианта"])) throw new Error(`Invalid source ID at record ${index + 1}`)
    if (variantsSeen.has(row["ID варианта"])) throw new Error(`Duplicate source variant ID: ${row["ID варианта"]}`)
    variantsSeen.add(row["ID варианта"])
    const list = groups.get(row["ID товара"]) || []
    list.push({ row, record: index + 1 })
    groups.set(row["ID товара"], list)
  })
  const products: InsalesProduct[] = []
  const excluded: ExcludedProduct[] = []
  const warnings: PlanWarning[] = []
  for (const [sourceProductId, entries] of groups) {
    const sourceRows = entries.map(({ row }) => row)
    const row = sourceRows[0]
    const reasons: string[] = []
    const statuses = new Set(sourceRows.map((entry) => normalize(entry["Видимость на витрине"])))
    if (statuses.size !== 1) reasons.push("conflicting_visibility")
    if (!statuses.has("выставлен")) reasons.push("hidden")
    const titles = new Set(sourceRows.map((entry) => entry["Название товара или услуги"].trim()).filter(Boolean))
    if (titles.size !== 1) reasons.push("conflicting_or_missing_title")
    const title = row["Название товара или услуги"].trim()
    if (normalize(title) === "отзывы" || sourceRows.some((entry) => /услуг/i.test(entry["Параметр: Тип"] || "") || normalize(entry["Параметр: __Доп.услуга"] || "") === "да")) reasons.push("service_or_reviews")
    const descriptions = [...new Set(sourceRows.map((entry) => entry["Описание"].trim()).filter(Boolean))]
    if (!descriptions.length || !descriptions.some((entry) => descriptionText(entry))) reasons.push("missing_own_description")
    if (descriptions.length > 1) reasons.push("conflicting_product_descriptions")
    const paths = [...new Set(sourceRows.flatMap((entry) => entry["Размещение на сайте"].split("##").map(normalize)).filter(Boolean))]
    const collections = new Set(sourceRows.flatMap((entry) => {
      try { return [new URL(entry["URL"]).pathname.match(/^\/collection\/([^/]+)\/product\//)?.[1]].filter(Boolean) } catch { return [] }
    }))
    // Compare full ancestor paths. '/' may itself be part of a menu label.
    const matched = leaves.filter(({ expectedPath, collection }) => paths.some((path) => path === expectedPath || path.startsWith(`${expectedPath}/`)) || collections.has(collection))
    if (!matched.length) reasons.push("outside_approved_menu_leaves")
    const phoneMatches = matched.filter(({ chain }) => chain[0].id !== "aksessuary")
    const accessoryMatches = matched.filter(({ chain }) => chain[0].id === "aksessuary")
    if (phoneMatches.length > 1 || (phoneMatches.length && accessoryMatches.length)) reasons.push("ambiguous_product_category")
    const variants: InsalesVariant[] = []
    for (const variantRow of sourceRows) {
      const sourceVariantId = variantRow["ID варианта"]
      try {
        if (variantRow["Валюта склада"].trim().toUpperCase() !== "RUR") throw new Error("Unsupported currency")
        const price = decimal(variantRow["Цена продажи"])
        if (price === null || price <= 0) throw new Error("Missing/nonpositive price")
        const sourceOldPrice = decimal(variantRow["Старая цена"])
        const stock = decimal(variantRow["Остаток"])
        if (stock !== null && (!Number.isInteger(stock) || stock < 0)) throw new Error("Invalid inventory quantity")
        const color = variantRow["Свойство: Цвет"].trim() || null
        const declaredColors = (variantRow["Параметр: Цвет"] || "").split("##").map(normalize)
        if (color && !declaredColors.includes(normalize(color)) && variantRow["Параметр: Цвет"].trim()) warnings.push({ sourceProductId, sourceVariantId, code: "variant_product_color_difference" })
        if (stock === null) warnings.push({ sourceProductId, sourceVariantId, code: "unknown_stock_no_availability_claim" })
        if (sourceOldPrice !== null && sourceOldPrice <= price) warnings.push({ sourceProductId, sourceVariantId, code: "old_price_not_above_current_preserved_private" })
        const imageUrls = safeImageUrls(variantRow["Изображения варианта"])
        variants.push({ sourceVariantId, sku: `insales-${sourceVariantId}`, originalSku: variantRow["Артикул"], color, price, oldPrice: sourceOldPrice !== null && sourceOldPrice > price ? sourceOldPrice : null, currencyCode: "rub", stock, weight: decimal(variantRow["Вес"]), imageUrls, privateRaw: variantRow })
      } catch (error) {
        reasons.push("invalid_commercial_data")
        warnings.push({ sourceProductId, sourceVariantId, code: "invalid_commercial_data", detail: error instanceof Error ? error.message : String(error) })
      }
    }
    if (reasons.length) {
      excluded.push({ sourceProductId, sourceVariantIds: sourceRows.map((entry) => entry["ID варианта"]), title, reasons: [...new Set(reasons)], csvRecords: entries.map((entry) => entry.record) })
      continue
    }
    const categoryHandles = [...new Set(matched.flatMap(({ chain }) => chain.map((node) => node.id)))]
    const imageUrls = [...new Set(sourceRows.flatMap((entry) => safeImageUrls(entry["Изображения"]))) ]
    const originalImageCount = sourceRows.flatMap((entry) => entry["Изображения"].split(/\s+|##/).filter(Boolean)).length
    if (originalImageCount && !imageUrls.length) warnings.push({ sourceProductId, code: "all_source_images_rejected" })
    if (!imageUrls.length) warnings.push({ sourceProductId, code: "no_product_images" })
    const brand = row["Параметр: Бренд"]?.trim() || row["Параметр: __Бренд"]?.trim() || (phoneMatches.length ? phoneMatches[0].chain[0].label : null)
    products.push({ sourceProductId, title, handle: `insales-${sourceProductId}`, sourceHandle: row["Название товара в URL"], sourceUrl: row["URL"], description: descriptionText(descriptions[0]), additionalDescription: descriptionText(row["Дополнительное описание"]), imageUrls, categoryHandles, kind: phoneMatches.length ? "phone" : "accessory", brand, attributes: extractAttributes(sourceRows), variants, privateRaw: { rows: sourceRows, csvRecords: entries.map((entry) => entry.record) } })
  }
  products.sort((a, b) => a.sourceProductId.localeCompare(b.sourceProductId))
  const includedIds = new Set(products.map((product) => product.sourceProductId))
  const excludedReasonCounts: Record<string, number> = {}
  excluded.forEach((product) => product.reasons.forEach((reason) => { excludedReasonCounts[reason] = (excludedReasonCounts[reason] || 0) + 1 }))
  const primaryExclusionCounts: Record<string, number> = {}
  const exclusionPriority = ["hidden", "service_or_reviews", "outside_approved_menu_leaves", "missing_own_description", "conflicting_visibility", "conflicting_or_missing_title", "conflicting_product_descriptions", "ambiguous_product_category", "invalid_commercial_data"]
  excluded.forEach((product) => {
    const primaryReason = exclusionPriority.find((reason) => product.reasons.includes(reason)) || product.reasons[0]
    primaryExclusionCounts[primaryReason] = (primaryExclusionCounts[primaryReason] || 0) + 1
  })
  const includedWarnings = warnings.filter((warning) => includedIds.has(warning.sourceProductId))
  const summary = {
    sourceRows: rows.length, sourceProducts: groups.size, sourceVariants: variantsSeen.size,
    importedProducts: products.length, importedVariants: products.reduce((count, product) => count + product.variants.length, 0),
    phones: products.filter((product) => product.kind === "phone").length, accessories: products.filter((product) => product.kind === "accessory").length,
    productAttributes: products.reduce((count, product) => count + product.attributes.length, 0),
    attributeValues: products.reduce((count, product) => count + product.attributes.reduce((sum, attribute) => sum + attribute.values.length, 0), 0),
    publicProductAttributes: products.reduce((count, product) => count + product.attributes.filter((attribute) => attribute.public).length, 0),
    publicAttributeValues: products.reduce((count, product) => count + product.attributes.filter((attribute) => attribute.public).reduce((sum, attribute) => sum + attribute.values.length, 0), 0),
    explicitVariantColors: products.reduce((count, product) => count + product.variants.filter((variant) => variant.color).length, 0),
    parameterColumns: Object.keys(rows[0] || {}).filter((key) => key.startsWith("Параметр: ")).length,
    populatedParameterColumns: new Set(products.flatMap((product) => product.attributes.map((attribute) => attribute.key))).size,
    categoryHandles: [...new Set(products.flatMap((product) => product.categoryHandles))].sort(),
    excludedProducts: excluded.length, primaryExclusionCounts, excludedReasonCounts,
    warnings: includedWarnings.reduce<Record<string, number>>((counts, warning) => { counts[warning.code] = (counts[warning.code] || 0) + 1; return counts }, {}),
  }
  return { sourceSha256, products, excluded, summary, warnings: includedWarnings }
}

export function loadInsalesPlan(input: { sourcePath: string; navigationPath: string; comparisonPath?: string }) {
  const bytes = readFileSync(input.sourcePath)
  if (bytes[0] !== 0xff || bytes[1] !== 0xfe) throw new Error("Expected UTF-16LE BOM; source unchanged")
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex")
  if (input.comparisonPath) {
    const comparison = JSON.parse(readFileSync(input.comparisonPath, "utf8").replace(/^\uFEFF/, ""))
    if (comparison.source_sha256 !== sourceSha256) throw new Error("CSV differs from reviewed comparison; eligibility must be reviewed")
  }
  const rows = parseTsv(bytes.toString("utf16le"))
  const navigation = JSON.parse(readFileSync(input.navigationPath, "utf8").replace(/^\uFEFF/, "")) as NavigationNode[]
  return buildInsalesPlan(rows, navigation, sourceSha256)
}

/** Reports intentionally omit private raw source, cost and alternative price fields. */
export function publicDryRunReport(plan: ReturnType<typeof buildInsalesPlan>) {
  return { sourceSha256: plan.sourceSha256, policy: "visible commercial products with own description; exact current menu phone-model/accessory-branch allowlist; stable separate source product IDs", summary: plan.summary, included: plan.products.map((product) => ({ sourceProductId: product.sourceProductId, sourceVariantIds: product.variants.map((variant) => variant.sourceVariantId), kind: product.kind, categoryHandles: product.categoryHandles, attributeCount: product.attributes.length })), excluded: plan.excluded, warnings: plan.warnings }
}
